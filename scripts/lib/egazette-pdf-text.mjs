import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

const pdfjsDistPath = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')))
const PDFJS_OPTIONS = {
  useSystemFonts: true,
  cMapUrl: `${pdfjsDistPath}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${pdfjsDistPath}/standard_fonts/`,
}

export const EGAZETTE_PATHS = {
  dataRoot: path.join(projectRoot, 'data', 'egazette'),
  pdfEn: path.join(projectRoot, 'data', 'egazette', 'raw-pdfs', 'en'),
  pdfZh: path.join(projectRoot, 'data', 'egazette', 'raw-pdfs', 'zh'),
  manifest: path.join(projectRoot, 'data', 'egazette', 'manifests', 'notices.json'),
  extractions: path.join(projectRoot, 'data', 'egazette', 'extractions'),
  parsedProgress: path.join(projectRoot, 'data', 'egazette', 'progress', 'parsed.csv'),
}

export function noticeKey(notice) {
  return `${notice.year}-${notice.volume}-${notice.gno}-${notice.notice_no}-${notice.extra ?? 0}`
}

export function noticeKeyFromFilename(filename) {
  const base = path.basename(filename, '.pdf')
  const match = base.match(/^(\d+)-(\d+)-(\d+)-(\d+)-(en|zh)$/)
  if (!match) return null
  const [, year, volume, gno, noticeNo] = match
  return `${year}-${volume}-${gno}-${noticeNo}-0`
}

export function pdfPathsForNoticeKey(noticeKeyValue) {
  const match = noticeKeyValue.match(/^(\d+)-(\d+)-(\d+)-(\d+)-(\d+)$/)
  if (!match) return null
  const [, year, volume, gno, noticeNo] = match
  const stem = `${year}-${volume}-${gno}-${noticeNo}`
  return {
    en: path.join(EGAZETTE_PATHS.pdfEn, `${stem}-en.pdf`),
    zh: path.join(EGAZETTE_PATHS.pdfZh, `${stem}-zh.pdf`),
  }
}

export async function extractTextFromPdf(filePath) {
  const data = new Uint8Array(await readFile(filePath))
  const doc = await getDocument({ data, ...PDFJS_OPTIONS }).promise
  const parts = []
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    parts.push(content.items.map((item) => item.str).join(' '))
  }
  return {
    text: parts.join('\n').replace(/\s+/g, ' ').trim(),
    page_count: doc.numPages,
  }
}

export async function extractNoticeText(noticeKeyValue, options = {}) {
  const paths = pdfPathsForNoticeKey(noticeKeyValue)
  if (!paths) throw new Error(`Invalid notice key: ${noticeKeyValue}`)

  const result = {
    notice_key: noticeKeyValue,
    text_en: '',
    text_zh: '',
    page_count_en: 0,
    page_count_zh: 0,
    extraction_method: 'pdfjs',
    extracted_at: new Date().toISOString(),
    errors: [],
  }

  for (const lang of ['en', 'zh']) {
    const filePath = paths[lang]
    try {
      await access(filePath)
      const { text, page_count } = await extractTextFromPdf(filePath)
      if (lang === 'en') {
        result.text_en = text
        result.page_count_en = page_count
      } else {
        result.text_zh = text
        result.page_count_zh = page_count
      }
    } catch (error) {
      result.errors.push({ lang, message: error.message, filePath })
      if (options.playwrightFallback) {
        const fallbackText = await extractTextViaPlaywright(noticeKeyValue, lang, options)
        if (fallbackText) {
          if (lang === 'en') result.text_en = fallbackText
          else result.text_zh = fallbackText
          result.extraction_method = 'playwright_textlayer'
        }
      }
    }
  }

  return result
}

async function extractTextViaPlaywright(noticeKeyValue, lang, options) {
  const manifest = options.manifest ?? (await loadManifest())
  const notice = manifest.find((n) => noticeKey(n) === noticeKeyValue)
  if (!notice) return ''

  const { chromium } = await import('playwright')
  const storageState = options.storageState ?? path.join(EGAZETTE_PATHS.dataRoot, 'session', 'storageState.json')
  let browser
  try {
    await access(storageState)
    browser = await chromium.launch({ headless: true, channel: 'chrome' })
    const context = await browser.newContext({ storageState })
    const page = await context.newPage()
    const url = lang === 'en' ? notice.englishPdfUrl : notice.chinesePdfUrl
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForSelector('.textLayer', { timeout: 30000 }).catch(() => null)
    const text = await page.evaluate(() => {
      const layers = [...document.querySelectorAll('.textLayer')]
      return layers.map((el) => el.textContent ?? '').join('\n').replace(/\s+/g, ' ').trim()
    })
    await context.close()
    return text
  } catch {
    return ''
  } finally {
    if (browser) await browser.close()
  }
}

export async function loadManifest() {
  const raw = await readFile(EGAZETTE_PATHS.manifest, 'utf8')
  const data = JSON.parse(raw)
  return data.notices ?? data
}

export function extractionCachePath(noticeKeyValue) {
  return path.join(EGAZETTE_PATHS.extractions, `${noticeKeyValue}.json`)
}

export async function loadCachedExtraction(noticeKeyValue) {
  try {
    const raw = await readFile(extractionCachePath(noticeKeyValue), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function saveCachedExtraction(extraction) {
  await mkdir(EGAZETTE_PATHS.extractions, { recursive: true })
  await writeFile(extractionCachePath(extraction.notice_key), `${JSON.stringify(extraction, null, 2)}\n`)
}

export async function loadParsedProgress() {
  const done = new Set()
  try {
    const raw = await readFile(EGAZETTE_PATHS.parsedProgress, 'utf8')
    for (const line of raw.split('\n')) {
      const key = line.trim()
      if (key && !key.startsWith('notice_key')) done.add(key)
    }
  } catch {
    // no progress file yet
  }
  return done
}

export async function appendParsedProgress(noticeKeyValue) {
  await mkdir(path.dirname(EGAZETTE_PATHS.parsedProgress), { recursive: true })
  let header = ''
  try {
    await access(EGAZETTE_PATHS.parsedProgress)
  } catch {
    header = 'notice_key\n'
  }
  await writeFile(EGAZETTE_PATHS.parsedProgress, `${header}${noticeKeyValue}\n`, { flag: header ? 'w' : 'a' })
}
