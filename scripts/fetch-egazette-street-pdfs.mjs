#!/usr/bin/env node
/**
 * Human-assisted eGazette street-naming PDF harvester.
 * Bootstrap: manual cookie + Turnstile on terms-acceptance, then automated harvest/download.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, access, appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const BASE_URL = 'https://egazette.gld.gov.hk'
const DEFAULT_KEYWORD = '地政總署街道命名'
const ALL_PERIODS = ['2026-2022', '2021-2017', '2016-2012', '2011或之前']
/** Default harvest scope: pre-2017 street-naming (user has LandsD data from 2016+). */
const DEFAULT_PERIODS = ['2016-2012', '2011或之前']
const PERIOD_EN = { '2011或之前': '2011 or before' }
const CDP_DEBUG_PORT = 9333

const CHROME_EXECUTABLES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'],
  win32: [
    String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
    String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
  ],
}

const PATHS = {
  dataRoot: path.join(projectRoot, 'data', 'egazette'),
  session: path.join(projectRoot, 'data', 'egazette', 'session', 'storageState.json'),
  browserProfile: path.join(projectRoot, 'data', 'egazette', 'session', 'browser-profile'),
  manifest: path.join(projectRoot, 'data', 'egazette', 'manifests', 'notices.json'),
  progressDir: path.join(projectRoot, 'data', 'egazette', 'progress'),
  checkpoint: path.join(projectRoot, 'data', 'egazette', 'progress', 'checkpoint.json'),
  attempts: path.join(projectRoot, 'data', 'egazette', 'progress', 'attempts.csv'),
  completed: path.join(projectRoot, 'data', 'egazette', 'progress', 'completed.csv'),
  failures: path.join(projectRoot, 'data', 'egazette', 'progress', 'failures.csv'),
  summary: path.join(projectRoot, 'data', 'egazette', 'progress', 'run-summary.json'),
  pdfEn: path.join(projectRoot, 'data', 'egazette', 'raw-pdfs', 'en'),
  pdfZh: path.join(projectRoot, 'data', 'egazette', 'raw-pdfs', 'zh'),
}

const ATTEMPT_COLUMNS = [
  'run_id',
  'notice_key',
  'year',
  'volume',
  'gno',
  'notice_no',
  'lang',
  'category',
  'title',
  'pdf_canonical_url',
  'pdf_object_path',
  'file_path',
  'sha256',
  'status',
  'error',
  'ts',
]

const args = parseArgs(process.argv.slice(2))

function parseArgs(argv) {
  const opts = {
    locale: 'zh',
    keyword: DEFAULT_KEYWORD,
    perPage: 50,
    dryRun: false,
    bootstrapOnly: false,
    harvestOnly: false,
    downloadOnly: false,
    includeAllPeriod: false,
    resume: true,
    headless: false,
    storageState: PATHS.session,
    maxPagesPerPeriod: 0,
    downloadLimit: 0,
    selfTest: false,
    browserChannel: 'chrome',
    bootstrapPlaywright: false,
    periods: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--bootstrap-only') opts.bootstrapOnly = true
    else if (arg === '--harvest-only') opts.harvestOnly = true
    else if (arg === '--download-only') opts.downloadOnly = true
    else if (arg === '--include-all-period') opts.includeAllPeriod = true
    else if (arg === '--no-resume') opts.resume = false
    else if (arg === '--headless') opts.headless = true
    else if (arg === '--locale' && argv[i + 1]) opts.locale = argv[++i]
    else if (arg === '--keyword' && argv[i + 1]) opts.keyword = argv[++i]
    else if (arg === '--per-page' && argv[i + 1]) opts.perPage = Number(argv[++i])
    else if (arg === '--storage-state' && argv[i + 1]) opts.storageState = path.resolve(argv[++i])
    else if (arg === '--max-pages' && argv[i + 1]) opts.maxPagesPerPeriod = Number(argv[++i])
    else if (arg === '--download-limit' && argv[i + 1]) opts.downloadLimit = Number(argv[++i])
    else if (arg === '--browser-channel' && argv[i + 1]) {
      opts.browserChannel = argv[++i]
    }
    else if (arg === '--bootstrap-playwright') opts.bootstrapPlaywright = true
    else if (arg === '--periods' && argv[i + 1]) {
      opts.periods = argv[++i].split(',').map((p) => p.trim()).filter(Boolean)
    }
    else if (arg === '--all-periods') opts.periods = [...ALL_PERIODS]
    else if (arg === '--self-test') opts.selfTest = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }
  return opts
}

function printHelp() {
  console.log(`Usage: node scripts/fetch-egazette-street-pdfs.mjs [options]

Options:
  --bootstrap-only       Only run manual session bootstrap and save storage state
  --harvest-only         Harvest notice manifest only (no PDF download)
  --download-only        Download PDFs from existing manifest
  --dry-run              Harvest without downloading PDFs
  --include-all-period   Also crawl p=all via Livewire next-page (deduped)
  --locale zh|en         Site locale (default: zh)
  --keyword <text>       Search keyword (default: 地政總署街道命名)
  --per-page <n>         Results per page for period crawl (default: 50)
  --storage-state <path> Path to Playwright storage state JSON
  --max-pages <n>        Cap pages per period (0 = no cap)
  --download-limit <n>   Cap PDF downloads per run (0 = no cap)
  --no-resume            Ignore checkpoint and start fresh
  --headless             Run browser headless (not for bootstrap; Turnstile will fail)
  --browser-channel <c>  Bootstrap Chrome binary: chrome (default) or msedge
  --bootstrap-playwright Use Playwright-controlled browser (Turnstile often blocks clicks)
  --periods <list>       Comma-separated periods (default: 2016-2012,2011或之前)
  --all-periods          Harvest all four period buckets (2026-2022 through 2011或之前)
  --self-test            Run offline parser/resume checks (no browser/network)
`)
}

function getPeriods(opts) {
  return opts.periods?.length ? opts.periods : DEFAULT_PERIODS
}

const TURNSTILE_TROUBLESHOOTING = `
Turnstile error 600010 or unclickable widgets = automation detected.

Default bootstrap opens real Chrome (remote debugging) so you can click normally.
If clicks still fail:
  1) Close all Chrome windows from a previous bootstrap, then re-run:
       npm run fetch:egazette:bootstrap
  2) Or use Playwright codegen with system Chrome:
       npm run fetch:egazette:bootstrap:chrome
  3) Disable VPN/ad blockers for egazette.gld.gov.hk and challenges.cloudflare.com

Do NOT use --headless or --bootstrap-playwright for bootstrap.
`

function getBootstrapEntryUrl(locale) {
  const intended = encodeURIComponent(`${BASE_URL}/${locale}/search-gazette/gazette`)
  return `${BASE_URL}/${locale}/terms-acceptance?intended=${intended}`
}

async function applyStealthScripts(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
}

function attachTurnstileConsoleWatcher(page) {
  page.on('console', (msg) => {
    const text = msg.text()
    if (/Turnstile|600010|600\d{3}/i.test(text)) {
      console.warn(TURNSTILE_TROUBLESHOOTING)
    }
  })
  page.on('pageerror', (error) => {
    const text = error.message ?? String(error)
    if (/Turnstile|600010|600\d{3}/i.test(text)) {
      console.warn(TURNSTILE_TROUBLESHOOTING)
    }
  })
}

async function findChromeExecutable(preferredChannel = 'chrome') {
  const platform = process.platform
  const candidates = []
  if (preferredChannel === 'msedge') {
    candidates.push(
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
      String.raw`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
    )
  }
  candidates.push(...(CHROME_EXECUTABLES[platform] ?? []))

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // try next
    }
  }

  throw new Error(
    'Google Chrome not found. Install Chrome, or run: npm run fetch:egazette:bootstrap:chrome',
  )
}

async function waitForCdpReady(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) return
    } catch {
      // Chrome still starting
    }
    await sleep(400)
  }
  throw new Error(`Chrome remote debugging on port ${port} did not become ready.`)
}

async function waitUntilTermsPassed(context, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      const url = page.url()
      if (
        url &&
        url.includes('egazette.gld.gov.hk') &&
        !url.includes('terms-acceptance')
      ) {
        return page
      }
    }
    await sleep(1000)
  }
  throw new Error(
    'Bootstrap timed out. Complete cookies, terms checkbox, Turnstile, then click 繼續.',
  )
}

async function bootstrapSessionViaCdp(opts) {
  await mkdir(path.dirname(opts.storageState), { recursive: true })
  await mkdir(PATHS.browserProfile, { recursive: true })

  const entryUrl = getBootstrapEntryUrl(opts.locale)
  const chromePath = await findChromeExecutable(opts.browserChannel)
  const port = CDP_DEBUG_PORT

  console.log('\n=== Session bootstrap (manual, real Chrome) ===')
  console.log(`Chrome: ${chromePath}`)
  console.log(`Profile: ${PATHS.browserProfile}`)
  console.log('\nA normal Chrome window will open. Click directly in that window:')
  console.log('  1) Accept cookies (if shown)')
  console.log('  2) Check 我已閱讀並接受…')
  console.log('  3) Complete Turnstile (驗證您是人類)')
  console.log('  4) Click 繼續\n')
  console.log('If the page is unclickable, close this Chrome window and re-run bootstrap.\n')

  const chromeProcess = spawn(
    chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${PATHS.browserProfile}`,
      '--no-first-run',
      '--no-default-browser-check',
      entryUrl,
    ],
    { detached: true, stdio: 'ignore' },
  )
  chromeProcess.unref()

  await waitForCdpReady(port)

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  try {
    const context = browser.contexts()[0]
    if (!context) {
      throw new Error('Connected to Chrome but found no browser context.')
    }

    const page = await waitUntilTermsPassed(context, 600_000)
    console.log('Passed terms page:', page.url())

    try {
      await page.waitForResponse(
        (res) => res.url().includes('create-anonymous-session') && res.status() === 200,
        { timeout: 15_000 },
      )
    } catch {
      // session may already exist
    }

    await context.storageState({ path: opts.storageState })
    console.log(`Saved storage state: ${opts.storageState}`)
    console.log('You can close the Chrome window now.')
  } finally {
    browser.close()
  }
}

async function launchBootstrapContext(opts) {
  await mkdir(PATHS.browserProfile, { recursive: true })
  const channels = []
  if (opts.browserChannel && opts.browserChannel !== 'chromium') {
    channels.push(opts.browserChannel)
  }
  for (const fallback of ['chrome', 'msedge', 'chromium']) {
    if (!channels.includes(fallback)) channels.push(fallback)
  }

  const contextOptions = {
    headless: false,
    locale: 'zh-HK',
    timezoneId: 'Asia/Hong_Kong',
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  }

  let lastError = null
  for (const channel of channels) {
    try {
      const launchOpts = {
        ...contextOptions,
        ...(channel === 'chromium' ? {} : { channel }),
      }
      const context = await chromium.launchPersistentContext(PATHS.browserProfile, launchOpts)
      await applyStealthScripts(context)
      console.log(`Bootstrap browser: ${channel === 'chromium' ? 'Playwright Chromium' : channel}`)
      return { context, channel }
    } catch (error) {
      lastError = error
      console.warn(`Could not launch "${channel}": ${error instanceof Error ? error.message : error}`)
    }
  }

  throw new Error(
    `No bootstrap browser available. Install Google Chrome, or run:\n  npm run fetch:egazette:bootstrap:chrome\n\nLast error: ${lastError instanceof Error ? lastError.message : lastError}`,
  )
}

async function launchAutomationBrowser(opts) {
  const launchOpts = {
    headless: opts.headless,
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  }
  if (opts.browserChannel && opts.browserChannel !== 'chromium') {
    launchOpts.channel = opts.browserChannel
  }
  return chromium.launch(launchOpts)
}

/** Reuse bootstrap Chrome profile so session cookies match the manual login. */
async function openAutomationContext(opts) {
  await mkdir(PATHS.browserProfile, { recursive: true })
  const profileOpts = {
    headless: opts.headless,
    channel: opts.browserChannel === 'chromium' ? undefined : opts.browserChannel || 'chrome',
    locale: 'zh-HK',
    timezoneId: 'Asia/Hong_Kong',
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  }
  try {
    const context = await chromium.launchPersistentContext(PATHS.browserProfile, profileOpts)
    return { context, browser: null, usesProfile: true }
  } catch (error) {
    console.warn(
      `Could not open Chrome profile (${error instanceof Error ? error.message : error}); falling back to storageState.`,
    )
    const browser = await launchAutomationBrowser(opts)
    const context = await browser.newContext({ storageState: opts.storageState })
    return { context, browser, usesProfile: false }
  }
}

function splitCsvLine(line) {
  const cols = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cols.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cols.push(cur)
  return cols
}

function runSelfTest() {
  const fixture = `
    <a href="https://egazette.gld.gov.hk/pdf?type=egn&amp;year=2026&amp;volume=30&amp;gno=17&amp;notice_no=2370&amp;extra=0">EN</a>
    <a href="https://egazette.gld.gov.hk/pdf?type=cgn&amp;year=2026&amp;volume=30&amp;gno=17&amp;notice_no=2370&amp;extra=0">ZH</a>
    wire:snapshot="{&quot;data&quot;:{&quot;notices&quot;:[[{&quot;id&quot;:1,&quot;notice_no&quot;:&quot;2370&quot;,&quot;year&quot;:2026,&quot;volume&quot;:30,&quot;gno&quot;:17,&quot;extra&quot;:0,&quot;table_name&quot;:&quot;mg&quot;,&quot;c_title&quot;:&quot;街道命名&quot;,&quot;e_title&quot;:&quot;Street Name&quot;}]],&quot;paginationData&quot;:[{&quot;last_page&quot;:2,&quot;current_page&quot;:1}]}}"
  `
  const { notices, pagination } = extractNoticesFromHtml(fixture)
  const key = '2026-30-17-2370-0'
  if (notices.length !== 1 || noticeKey(notices[0]) !== key) {
    throw new Error(`extractNoticesFromHtml failed: got ${notices.length} notices`)
  }
  if (!notices[0].englishPdfUrl?.includes('type=egn') || !notices[0].chinesePdfUrl?.includes('type=cgn')) {
    throw new Error('PDF canonical URLs missing from fixture parse')
  }
  if (pagination?.last_page !== 2) {
    throw new Error(`pagination parse failed: ${JSON.stringify(pagination)}`)
  }

  const canonical = buildPdfCanonicalUrl('en', notices[0])
  if (!canonical.includes('notice_no=2370')) {
    throw new Error(`buildPdfCanonicalUrl failed: ${canonical}`)
  }

  const csvLine = toCsvRow([
    'run',
    key,
    2026,
    30,
    17,
    '2370',
    'en',
    'Government Notice',
    '街道命名',
    canonical,
    '/os/gazette/20263017/egn202630172370.pdf',
    '/tmp/x.pdf',
    'abc',
    'completed',
    '',
    nowIso(),
  ])
  const cols = splitCsvLine(csvLine)
  if (cols[1] !== key || cols[6] !== 'en') {
    throw new Error(`CSV roundtrip failed: ${cols.join('|')}`)
  }

  if (extractLastPage('"last_page":1,"current_page":1,"last_page":14') !== 14) {
    throw new Error('extractLastPage should use max last_page across snapshots')
  }
  if (!shouldAdvancePeriodPage(1, 1, 50, 50, '', 'a|b')) {
    throw new Error('shouldAdvancePeriodPage should continue on full page when last_page=1')
  }
  if (shouldAdvancePeriodPage(2, 2, 10, 50, 'a', 'a')) {
    throw new Error('shouldAdvancePeriodPage should stop on duplicate signature')
  }

  console.log('Self-test passed: notice extraction, pagination, CSV resume keys.')
}

const toCsvRow = (values) =>
  values
    .map((value) => {
      const text = String(value ?? '')
      if (text.includes('"') || text.includes(',') || text.includes('\n')) {
        return `"${text.replaceAll('"', '""')}"`
      }
      return text
    })
    .join(',')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const nowIso = () => new Date().toISOString()

function noticeKey(notice) {
  return `${notice.year}-${notice.volume}-${notice.gno}-${notice.notice_no}-${notice.extra ?? 0}`
}

function buildSearchUrl(locale, params) {
  const q = new URLSearchParams(params)
  return `${BASE_URL}/${locale}/search-gazette/gazette?${q.toString()}`
}

function formatGnoForUrl(gno) {
  const n = Number(gno)
  if (Number.isNaN(n)) return String(gno)
  return n < 10 ? String(n).padStart(2, '0') : String(n)
}

function buildPdfCanonicalUrl(lang, notice) {
  const type = lang === 'en' ? 'egn' : 'cgn'
  const q = new URLSearchParams({
    type,
    year: String(notice.year),
    volume: String(notice.volume),
    gno: formatGnoForUrl(notice.gno),
    notice_no: String(notice.notice_no),
    extra: String(notice.extra ?? 0),
  })
  return `${BASE_URL}/pdf?${q.toString()}`
}

function getPdfCanonicalUrl(lang, notice) {
  const stored = lang === 'en' ? notice.englishPdfUrl : notice.chinesePdfUrl
  if (stored?.includes('/pdf?')) return stored
  return buildPdfCanonicalUrl(lang, notice)
}

function isSessionBlockedPage(url, html = '') {
  if (url.includes('terms-acceptance')) return 'terms-acceptance'
  if (url.includes('important-notices')) return 'important-notices'
  if (/404\s*\|\s*NOT FOUND/i.test(html) || /<title>404/i.test(html)) return '404'
  return null
}

function isPdfBytes(body) {
  return body?.length >= 4 && body.subarray(0, 4).toString('utf8') === '%PDF'
}

/** /pdf?type=... redirects to pdfjs viewer; real bytes are at presigned /os/gazette/...pdf */
async function resolvePresignedPdfUrl(page, canonicalUrl) {
  const gazetteResponsePromise = page
    .waitForResponse(
      (res) =>
        res.status() === 200 &&
        res.url().includes('/os/gazette/') &&
        res.url().includes('.pdf'),
      { timeout: 60_000 },
    )
    .catch(() => null)

  await page.goto(canonicalUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })

  const htmlAfterNav = await page.content()
  const blocked = isSessionBlockedPage(page.url(), htmlAfterNav)
  if (blocked) {
    throw new Error(
      `PDF navigation blocked (${blocked}). Session expired — re-run: npm run fetch:egazette:bootstrap`,
    )
  }

  try {
    await page.waitForURL(/\/pdfjs\/web\/viewer\.html/i, { timeout: 45_000 })
  } catch {
    // already on viewer or slow redirect
  }

  const currentUrl = page.url()
  if (isSessionBlockedPage(currentUrl, await page.content())) {
    throw new Error('PDF viewer not reached (session expired). Re-run bootstrap.')
  }
  if (currentUrl.includes('viewer.html')) {
    const fileParam = new URL(currentUrl).searchParams.get('file')
    if (fileParam) return decodeURIComponent(fileParam)
  }

  const intercepted = await gazetteResponsePromise
  if (intercepted?.url()) return intercepted.url()

  const html = await page.content()
  const viewerMatch = html.match(/viewer\.html\?file=([^"'<>]+)/i)
  if (viewerMatch?.[1]) {
    return decodeURIComponent(viewerMatch[1].replaceAll('&amp;', '&'))
  }

  const directMatch = html.match(/https:\/\/egazette\.gld\.gov\.hk\/os\/gazette\/[^"'<>]+\.pdf[^"'<>]*/i)
  if (directMatch?.[0]) {
    return decodeHtmlEntities(directMatch[0])
  }

  throw new Error(
    `Could not resolve presigned PDF URL from viewer (current URL: ${currentUrl})`,
  )
}

async function fetchPdfBytes(page, presignedUrl) {
  const response = await page.request.get(presignedUrl, { timeout: 60_000 })
  if (!response.ok()) {
    throw new Error(`Presigned PDF GET failed: HTTP ${response.status()}`)
  }
  const body = await response.body()
  if (!isPdfBytes(body)) {
    const ct = response.headers()['content-type'] ?? 'unknown'
    throw new Error(
      `Response is not a PDF (${body?.length ?? 0} bytes, content-type: ${ct})`,
    )
  }
  return { body, objectPath: new URL(presignedUrl).pathname }
}

function decodeHtmlEntities(text) {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

function extractNoticesFromHtml(html) {
  const notices = new Map()
  let pagination = null

  const addNotice = (raw) => {
    if (!raw?.notice_no || !raw?.year || !raw?.volume || !raw?.gno) return
    if (raw.table_name && raw.table_name !== 'mg') return
    const title = raw.c_title || raw.e_title || raw.title || ''
    if (title && title !== '街道命名' && title !== 'Street Name') return

    const notice = {
      id: raw.id ?? null,
      year: Number(raw.year),
      volume: Number(raw.volume),
      gno: Number(raw.gno),
      notice_no: String(raw.notice_no),
      extra: Number(raw.extra ?? 0),
      c_title: raw.c_title ?? '街道命名',
      e_title: raw.e_title ?? 'Street Name',
      table_name: raw.table_name ?? 'mg',
      category: 'Government Notice',
      dateno: raw.dateno ?? null,
      englishPdfUrl: raw.englishPdfUrl ? decodeHtmlEntities(raw.englishPdfUrl) : null,
      chinesePdfUrl: raw.chinesePdfUrl ? decodeHtmlEntities(raw.chinesePdfUrl) : null,
    }
    notices.set(noticeKey(notice), notice)
  }

  const snapshotRegex = /wire:snapshot="([^"]+)"/g
  let match
  while ((match = snapshotRegex.exec(html)) !== null) {
    const encoded = match[1]
    try {
      const decoded = decodeHtmlEntities(encoded.replaceAll('&quot;', '"'))
      const snapshot = JSON.parse(decoded)
      const data = snapshot?.data
      let snapshotNoticeCount = 0
      if (Array.isArray(data?.notices)) {
        for (const group of data.notices) {
          if (Array.isArray(group)) {
            for (const item of group) {
              addNotice(item)
              snapshotNoticeCount += 1
            }
          }
        }
      }
      // Only read pagination from the gazette-results snapshot (avoids unrelated last_page=1).
      if (snapshotNoticeCount > 0) {
        if (data?.paginationData) {
          const pg = Array.isArray(data.paginationData) ? data.paginationData[0] : data.paginationData
          if (pg?.last_page) pagination = pg
        } else if (data?.last_page || data?.totalPage) {
          pagination = {
            last_page: data.last_page ?? data.totalPage,
            current_page: data.currentPage ?? data.page,
            per_page: data.perPage ?? data.per_page,
          }
        }
      }
    } catch {
      // ignore malformed snapshots
    }
  }

  const pdfRegex =
    /href="https:\/\/egazette\.gld\.gov\.hk\/pdf\?type=(egn|cgn)(?:&amp;|&)year=(\d+)(?:&amp;|&)volume=(\d+)(?:&amp;|&)gno=(\d+)(?:&amp;|&)notice_no=(\d+)(?:&amp;|&)extra=(\d+)"/g
  while ((match = pdfRegex.exec(html)) !== null) {
    const [, type, year, volume, gno, notice_no, extra] = match
    const key = `${year}-${volume}-${gno}-${notice_no}-${extra}`
    const existing = notices.get(key) ?? {
      year: Number(year),
      volume: Number(volume),
      gno: Number(gno),
      notice_no,
      extra: Number(extra),
      c_title: '街道命名',
      e_title: 'Street Name',
      table_name: 'mg',
      category: 'Government Notice',
    }
    if (type === 'egn') {
      existing.englishPdfUrl = `${BASE_URL}/pdf?type=egn&year=${year}&volume=${volume}&gno=${gno}&notice_no=${notice_no}&extra=${extra}`
    }
    if (type === 'cgn') {
      existing.chinesePdfUrl = `${BASE_URL}/pdf?type=cgn&year=${year}&volume=${volume}&gno=${gno}&notice_no=${notice_no}&extra=${extra}`
    }
    notices.set(key, existing)
  }

  return { notices: [...notices.values()], pagination }
}

function extractLastPage(html, fallback = 1) {
  let maxPage = fallback
  for (const m of html.matchAll(/"last_page":(\d+)/g)) {
    maxPage = Math.max(maxPage, Number(m[1]))
  }
  for (const m of html.matchAll(/"totalPage":(\d+)/g)) {
    maxPage = Math.max(maxPage, Number(m[1]))
  }
  const m3 = html.match(/頁\s*\d+\s*共\s*(\d+)/)
  if (m3) maxPage = Math.max(maxPage, Number(m3[1]))
  const m4 = html.match(/Page\s*\d+\s*of\s*(\d+)/i)
  if (m4) maxPage = Math.max(maxPage, Number(m4[1]))
  return maxPage
}

function shouldAdvancePeriodPage(pageNum, lastPage, noticeCount, perPage, prevSignature, signature) {
  if (!noticeCount) return false
  if (signature && signature === prevSignature) return false
  if (pageNum < lastPage) return true
  // Full page but parser reported last_page=1 — keep going until empty or duplicate.
  if (noticeCount >= perPage && lastPage <= 1) return true
  return false
}

function signatureForNotices(notices) {
  return notices
    .map((n) => noticeKey(n))
    .sort()
    .join('|')
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function ensureProgressFiles(runId) {
  await mkdir(PATHS.progressDir, { recursive: true })
  for (const filePath of [PATHS.attempts, PATHS.completed, PATHS.failures]) {
    if (!(await fileExists(filePath))) {
      await writeFile(filePath, `${toCsvRow(ATTEMPT_COLUMNS)}\n`, 'utf8')
    }
  }
  return runId
}

async function appendCsv(filePath, row) {
  await appendFile(filePath, `${toCsvRow(row)}\n`, 'utf8')
}

async function loadCheckpoint() {
  if (!(await fileExists(PATHS.checkpoint))) return null
  return JSON.parse(await readFile(PATHS.checkpoint, 'utf8'))
}

async function saveCheckpoint(checkpoint) {
  await mkdir(PATHS.progressDir, { recursive: true })
  await writeFile(PATHS.checkpoint, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8')
}

async function loadManifest() {
  if (!(await fileExists(PATHS.manifest))) return []
  const data = JSON.parse(await readFile(PATHS.manifest, 'utf8'))
  return Array.isArray(data?.notices) ? data.notices : []
}

async function saveManifest(notices, meta = {}) {
  await mkdir(path.dirname(PATHS.manifest), { recursive: true })
  await writeFile(
    PATHS.manifest,
    `${JSON.stringify({ generated_at: nowIso(), count: notices.length, ...meta, notices }, null, 2)}\n`,
    'utf8',
  )
}

async function bootstrapSession(context, opts) {
  await mkdir(path.dirname(opts.storageState), { recursive: true })
  const entryUrl = getBootstrapEntryUrl(opts.locale)
  const page = context.pages()[0] ?? (await context.newPage())
  attachTurnstileConsoleWatcher(page)

  console.log('\n=== Session bootstrap (manual) ===')
  console.log(`Opening: ${entryUrl}`)
  console.log('Use the opened Chrome window (not headless).')
  console.log('1) Accept cookies')
  console.log('2) Check terms checkbox')
  console.log('3) Complete Cloudflare Turnstile (wait for green check)')
  console.log('4) Click Continue (繼續)\n')
  if (opts.browserChannel === 'chromium') {
    console.warn(
      'Using Playwright Chromium — Turnstile often fails with error 600010. Prefer system Chrome (default).\n',
    )
  }

  await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })

  try {
    await page.waitForURL((url) => !url.href.includes('terms-acceptance'), { timeout: 600_000 })
  } catch {
    const turnstileFailed = await page
      .locator('text=/Turnstile|600010|challenge/i')
      .first()
      .isVisible()
      .catch(() => false)
    if (turnstileFailed) console.warn(TURNSTILE_TROUBLESHOOTING)
    throw new Error(
      'Bootstrap timed out on terms-acceptance. Turnstile may have failed (600010). See troubleshooting above.',
    )
  }

  console.log('Passed terms page:', page.url())

  try {
    await page.waitForResponse(
      (res) => res.url().includes('create-anonymous-session') && res.status() === 200,
      { timeout: 15_000 },
    )
  } catch {
    // session may already exist
  }

  await context.storageState({ path: opts.storageState })
  console.log(`Saved storage state: ${opts.storageState}`)
  return context
}

async function createContext(browser, opts) {
  if (!(await fileExists(opts.storageState))) {
    throw new Error(
      `Missing storage state at ${opts.storageState}. Run with --bootstrap-only first.`,
    )
  }
  return browser.newContext({ storageState: opts.storageState })
}

async function assertSessionHealthy(page, locale, periods = DEFAULT_PERIODS) {
  const testUrl = buildSearchUrl(locale, {
    p: periods[0],
    c: '1',
    kw: DEFAULT_KEYWORD,
    page: '1',
    per_page: '5',
    orderBy: '1',
    cov: '1,2',
  })
  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page
    .waitForResponse((res) => res.url().includes('/livewire/update'), { timeout: 20_000 })
    .catch(() => null)
  await sleep(500)

  const html = await page.content()
  const blocked = isSessionBlockedPage(page.url(), html)
  if (blocked) {
    throw new Error(
      `Session invalid (${blocked} at ${page.url()}). Re-run: npm run fetch:egazette:bootstrap`,
    )
  }

  const { notices } = extractNoticesFromHtml(html)
  if (!notices.length && !html.includes('/pdf?type=')) {
    throw new Error(
      `Search page loaded but no notices found (${page.url()}). Re-run bootstrap or check keyword/period.`,
    )
  }
}

async function harvestPeriodPages(page, opts, checkpoint, noticeMap) {
  const periods = getPeriods(opts)
  const harvestState = checkpoint?.harvest ?? { period_index: 0, page: 1 }
  const startPeriodIndex = harvestState.period_index ?? 0
  const startPage = harvestState.page ?? 1

  console.log(`Harvesting periods: ${periods.join(', ')}`)

  for (let pi = startPeriodIndex; pi < periods.length; pi += 1) {
    const period = periods[pi]
    const periodParam = opts.locale === 'en' && PERIOD_EN[period] ? PERIOD_EN[period] : period

    let pageNum = pi === startPeriodIndex ? startPage : 1
    let lastPage = 1
    let prevSignature = ''

    console.log(`\n[period] ${period}`)

    while (true) {
      if (opts.maxPagesPerPeriod > 0 && pageNum > opts.maxPagesPerPeriod) break

      const url = buildSearchUrl(opts.locale, {
        p: periodParam,
        c: '1',
        kw: opts.keyword,
        page: String(pageNum),
        per_page: String(opts.perPage),
        orderBy: '1',
        cov: '1,2',
      })

      console.log(`  page ${pageNum}/${lastPage > 1 ? lastPage : '?'}: ${url}`)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      if (page.url().includes('terms-acceptance')) {
        throw new Error('Session expired during period harvest.')
      }
      await page
        .waitForResponse((res) => res.url().includes('/livewire/update'), { timeout: 20_000 })
        .catch(() => null)
      await sleep(600)

      const html = await page.content()
      const { notices, pagination } = extractNoticesFromHtml(html)
      const parsedLastPage = pagination?.last_page ?? extractLastPage(html, 1)
      lastPage = Math.max(lastPage, parsedLastPage)
      const signature = signatureForNotices(notices)

      console.log(
        `    found ${notices.length} notices (page ${pageNum}, last_page=${lastPage}, parsed=${parsedLastPage})`,
      )

      for (const notice of notices) {
        noticeMap.set(noticeKey(notice), notice)
      }

      if (opts.resume) {
        await saveCheckpoint({
          ...checkpoint,
          phase: 'harvest',
          harvest: { mode: 'period', period_index: pi, page: pageNum, last_page: lastPage },
          notice_count: noticeMap.size,
          updated_at: nowIso(),
        })
      }

      if (
        !shouldAdvancePeriodPage(
          pageNum,
          lastPage,
          notices.length,
          opts.perPage,
          prevSignature,
          signature,
        )
      ) {
        if (signature && signature === prevSignature) {
          console.warn(`    page signature unchanged at page ${pageNum}; period done.`)
        }
        break
      }
      prevSignature = signature
      pageNum += 1
      await sleep(800)
    }

    console.log(`  [period] ${period} done (${noticeMap.size} notices total so far)`)
  }
}

async function harvestAllPeriodLivewire(page, opts, checkpoint, noticeMap) {
  console.log('\n[p=all] Livewire pagination harvest')
  const url = buildSearchUrl(opts.locale, {
    p: 'all',
    c: '1',
    kw: opts.keyword,
    page: '1',
    per_page: '5',
    orderBy: '1',
    cov: '1,2',
  })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })

  let currentPage = 1
  let totalPage = extractLastPage(await page.content(), 1)
  let prevSignature = ''

  while (currentPage <= totalPage) {
    await page.waitForTimeout(1200)
    const html = await page.content()
    const { notices } = extractNoticesFromHtml(html)
    totalPage = extractLastPage(html, totalPage)
    const signature = signatureForNotices(notices)

    console.log(`  livewire page ${currentPage}/${totalPage}: ${notices.length} notices`)
    for (const notice of notices) {
      noticeMap.set(noticeKey(notice), notice)
    }

    if (opts.resume) {
      await saveCheckpoint({
        ...checkpoint,
        phase: 'harvest',
        harvest: { mode: 'all', current_page: currentPage, total_page: totalPage },
        notice_count: noticeMap.size,
        updated_at: nowIso(),
      })
    }

    if (currentPage >= totalPage) break
    if (signature && signature === prevSignature) {
      console.warn('  livewire page signature unchanged; stopping p=all harvest.')
      break
    }
    prevSignature = signature

    const nextBtn = page.locator('button.table-next-btn:not([disabled])').first()
    if (!(await nextBtn.count())) break
    await nextBtn.click()
    currentPage += 1
    await page.waitForTimeout(1500)
  }
}

async function downloadPdfForNotice(page, notice, lang, opts, runId, completedSet) {
  const downloadKey = `${noticeKey(notice)}-${lang}`
  if (completedSet.has(downloadKey)) {
    return { skipped: true, reason: 'already_completed' }
  }

  const canonicalUrl = getPdfCanonicalUrl(lang, notice)
  const outDir = lang === 'en' ? PATHS.pdfEn : PATHS.pdfZh
  const fileName = `${notice.year}-${notice.volume}-${notice.gno}-${notice.notice_no}-${lang}.pdf`
  const filePath = path.join(outDir, fileName)
  const rowBase = [
    runId,
    noticeKey(notice),
    notice.year,
    notice.volume,
    notice.gno,
    notice.notice_no,
    lang,
    notice.category,
    notice.c_title,
    canonicalUrl,
    '',
    filePath,
    '',
    'attempt',
    '',
    nowIso(),
  ]

  if (opts.dryRun) {
    const dryRow = [...rowBase]
    dryRow[13] = 'dry_run'
    dryRow[14] = ''
    dryRow[15] = nowIso()
    await appendCsv(PATHS.attempts, dryRow)
    return { skipped: true, reason: 'dry_run' }
  }

  await mkdir(outDir, { recursive: true })

  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const presignedUrl = await resolvePresignedPdfUrl(page, canonicalUrl)
      const { body, objectPath } = await fetchPdfBytes(page, presignedUrl)

      const sha256 = createHash('sha256').update(body).digest('hex')
      await writeFile(filePath, body)

      const doneRow = [
        runId,
        noticeKey(notice),
        notice.year,
        notice.volume,
        notice.gno,
        notice.notice_no,
        lang,
        notice.category,
        notice.c_title,
        canonicalUrl,
        objectPath,
        filePath,
        sha256,
        'completed',
        '',
        nowIso(),
      ]
      await appendCsv(PATHS.attempts, doneRow)
      await appendCsv(PATHS.completed, doneRow)
      completedSet.add(downloadKey)
      return { ok: true, filePath, sha256 }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await sleep(1000 * attempt)
    }
  }

  const failRow = [
    ...rowBase.slice(0, 13),
    '',
    'failed',
    lastError,
    nowIso(),
  ]
  await appendCsv(PATHS.attempts, failRow)
  await appendCsv(PATHS.failures, failRow)
  return { ok: false, error: lastError }
}

async function loadCompletedSet() {
  const set = new Set()
  if (!(await fileExists(PATHS.completed))) return set
  const text = await readFile(PATHS.completed, 'utf8')
  const lines = text.trim().split('\n').slice(1)
  for (const line of lines) {
    const cols = splitCsvLine(line)
    const key = cols[1]
    const lang = cols[6]
    if (key && lang) set.add(`${key}-${lang}`)
  }
  return set
}

async function main() {
  if (args.selfTest) {
    runSelfTest()
    return
  }

  const runId = `egazette-${Date.now()}`
  await mkdir(PATHS.dataRoot, { recursive: true })
  await mkdir(PATHS.pdfEn, { recursive: true })
  await mkdir(PATHS.pdfZh, { recursive: true })

  if (args.bootstrapOnly && args.headless) {
    console.warn('Ignoring --headless for bootstrap (Turnstile requires a visible browser).')
    args.headless = false
  }

  let automation = null

  try {
    if (args.bootstrapOnly || !(await fileExists(args.storageState))) {
      if (args.bootstrapPlaywright) {
        const { context } = await launchBootstrapContext(args)
        try {
          await bootstrapSession(context, args)
        } finally {
          await context.close()
        }
      } else {
        await bootstrapSessionViaCdp(args)
      }
      if (args.bootstrapOnly) return
    }

    let checkpoint = args.resume ? await loadCheckpoint() : null
    if (!checkpoint) {
      checkpoint = { run_id: runId, started_at: nowIso(), phase: 'init' }
    }
    checkpoint.run_id = runId
    await ensureProgressFiles(runId)

    if (!args.downloadOnly) {
      automation = await openAutomationContext(args)
      const { context } = automation
      const page = await context.newPage()
      const periods = getPeriods(args)
      await assertSessionHealthy(page, args.locale, periods)

      const noticeMap = new Map()
      if (args.resume) {
        const existing = await loadManifest()
        for (const n of existing) noticeMap.set(noticeKey(n), n)
      }

      await harvestPeriodPages(page, args, checkpoint, noticeMap)
      if (args.includeAllPeriod) {
        await harvestAllPeriodLivewire(page, args, checkpoint, noticeMap)
      }

      const notices = [...noticeMap.values()].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year
        if (a.volume !== b.volume) return b.volume - a.volume
        return Number(b.notice_no) - Number(a.notice_no)
      })

      await saveManifest(notices, {
        keyword: args.keyword,
        locale: args.locale,
        periods,
        include_all_period: args.includeAllPeriod,
      })
      checkpoint.phase = 'harvest_done'
      checkpoint.notice_count = notices.length
      checkpoint.updated_at = nowIso()
      await saveCheckpoint(checkpoint)
      console.log(`\nHarvest complete: ${notices.length} unique notices -> ${PATHS.manifest}`)
      if (args.harvestOnly || args.dryRun) {
        // continue to download unless harvest-only
        if (args.harvestOnly) return
      }
    }

    if (!args.harvestOnly) {
      const notices = await loadManifest()
      if (!notices.length) {
        throw new Error(`No notices in manifest (${PATHS.manifest}). Run harvest first.`)
      }

      if (!automation) automation = await openAutomationContext(args)
      const { context } = automation
      const page = await context.newPage()
      const periods = getPeriods(args)
      await assertSessionHealthy(page, args.locale, periods)

      const completedSet = await loadCompletedSet()
      let downloaded = 0
      let failed = 0
      let skipped = 0

      console.log(`\n=== Downloading PDFs for ${notices.length} notices ===`)

      for (const notice of notices) {
        for (const lang of ['en', 'zh']) {
          if (args.downloadLimit > 0 && downloaded >= args.downloadLimit) break
          const result = await downloadPdfForNotice(page, notice, lang, args, runId, completedSet)
          if (result.skipped) skipped += 1
          else if (result.ok) {
            downloaded += 1
            console.log(`  ok ${noticeKey(notice)}-${lang}`)
          } else {
            failed += 1
            console.warn(`  fail ${noticeKey(notice)}-${lang}: ${result.error}`)
          }
          await sleep(500)
        }
        if (args.downloadLimit > 0 && downloaded >= args.downloadLimit) break
      }

      const summary = {
        run_id: runId,
        finished_at: nowIso(),
        notice_count: notices.length,
        downloaded,
        failed,
        skipped,
        dry_run: args.dryRun,
      }
      await writeFile(PATHS.summary, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
      checkpoint.phase = 'done'
      checkpoint.summary = summary
      await saveCheckpoint(checkpoint)
      console.log('\nRun summary:', summary)
    }
  } finally {
    if (automation?.context) await automation.context.close()
    if (automation?.browser) await automation.browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
