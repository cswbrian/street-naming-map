#!/usr/bin/env node
/**
 * Apply a community-verified street naming batch from JSON.
 *
 * Usage:
 *   node scripts/apply-crowd-batch.mjs path/to/batch.json
 *   node scripts/apply-crowd-batch.mjs --stdin < batch.json
 *
 * See data/crowdsubmissions/batch-template.json for input shape.
 */

import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import {
  loadPendingRoadKeys,
  matchRowToRoadKey,
  normalizeNamingDate,
} from './lib/crowd-submission-core.mjs'
import {
  buildCrowdEventsFromStreetEntry,
  finalizeCrowdEvent,
  makeStreetKey,
  normalizeStreetName,
} from './lib/street-naming-core.mjs'
import {
  buildSelfHostedPdfUrlsFromStem,
  parseEgazetteArchiveFilename,
} from './lib/egazette-pdf-urls.mjs'
import { publishCrowdGazettePdfs } from './publish-crowd-gazette-pdfs.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const BATCH_CSV = path.join(projectRoot, 'data', 'crowdsubmissions', 'batch-approved.csv')
const APPROVED_EVENTS = path.join(
  projectRoot,
  'data',
  'crowdsubmissions',
  'street-events-approved.json',
)
const NAME_HISTORY_EVENTS = path.join(
  projectRoot,
  'data',
  'crowdsubmissions',
  'street-name-history.json',
)
const BATCH_INBOX = path.join(projectRoot, 'data', 'crowdsubmissions', 'batch-inbox')

const CSV_HEADER =
  'street_code,english_name,chinese_name,naming_date,gazette notice label,gazette url,status,submission_id,remarks'

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: node scripts/apply-crowd-batch.mjs <batch.json>
       node scripts/apply-crowd-batch.mjs --stdin

Applies community-verified naming dates and runs npm run merge:crowd + report:pending-years.`)
    process.exit(0)
  }
  if (argv.includes('--stdin')) return { stdin: true, file: null }
  const file = argv.find((a) => !a.startsWith('-'))
  if (!file) {
    console.error('Missing batch JSON path. Use --stdin or pass a file path.')
    process.exit(1)
  }
  return { stdin: false, file: path.resolve(file) }
}

function resolveNoticeMeta(batch) {
  const fromPdf =
    parseEgazetteArchiveFilename(batch.pdf_en) ??
    parseEgazetteArchiveFilename(batch.pdf_zh) ??
    parseEgazetteArchiveFilename(batch.pdf_paths?.en) ??
    parseEgazetteArchiveFilename(batch.pdf_paths?.zh)

  const noticeLabel = String(
    batch.gazette_notice_label ?? batch.notice_label ?? fromPdf?.notice_label ?? '',
  ).trim()
  const legacyNo = noticeLabel.match(/(?:No\.?|第)\s*(\d+)/i)?.[1]
  const noticeNo =
    noticeLabel.replace(/^G\.?\s*N\.?\s*/i, '').trim() || legacyNo || fromPdf?.notice_no
  const batchId =
    batch.batch_id ?? (noticeNo ? `${fromPdf?.year ?? 'unknown'}-gn${noticeNo}` : 'batch')
  const hosted = fromPdf?.stem ? buildSelfHostedPdfUrlsFromStem(fromPdf.stem) : { en: null, zh: null }

  return {
    notice_label: noticeLabel || (noticeNo ? `G.N.${noticeNo}` : ''),
    notice_no: noticeNo,
    notice_stem: fromPdf?.stem ?? null,
    url_en:
      batch.gazette_url_en ??
      batch.gazette_url ??
      batch.government_notice_url_en ??
      hosted.en ??
      null,
    url_zh: batch.gazette_url_zh ?? batch.government_notice_url_zh ?? hosted.zh ?? null,
    batch_id: batchId,
  }
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function formatDisplayDate(isoDate) {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

async function loadBatchInput(opts) {
  const raw = opts.stdin
    ? await new Promise((resolve, reject) => {
        let data = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (chunk) => {
          data += chunk
        })
        process.stdin.on('end', () => resolve(data))
        process.stdin.on('error', reject)
      })
    : await readFile(opts.file, 'utf8')
  return JSON.parse(raw)
}

async function copyBatchPdfs(batch, batchId) {
  const pairs = [
    ['pdf_en', batch.pdf_paths?.en],
    ['pdf_zh', batch.pdf_paths?.zh],
  ]
  const copied = []
  const destDir = path.join(BATCH_INBOX, batchId)
  await mkdir(destDir, { recursive: true })

  for (const [key, value] of pairs) {
    const src = String(batch[key] ?? value ?? '').trim()
    if (!src) continue
    try {
      await access(src)
    } catch {
      console.warn(`Skipping missing PDF: ${src}`)
      continue
    }
    const dest = path.join(destDir, path.basename(src))
    await copyFile(src, dest)
    copied.push(dest)
  }
  return copied
}

function resolveStreet(batchStreet, pendingMap, options = {}) {
  const row = {
    street_code: batchStreet.street_code ?? batchStreet.code ?? '',
    english_name: batchStreet.english_name ?? batchStreet.en ?? '',
    chinese_name: batchStreet.chinese_name ?? batchStreet.zh ?? batchStreet.name ?? '',
  }
  const allowNameOnly = options.allowNameOnly ?? batchStreet.allow_name_only ?? false
  const roadKey = matchRowToRoadKey(row, pendingMap)
  if (!roadKey && allowNameOnly && (row.english_name || row.chinese_name)) {
    return {
      roadKey: `${normalizeStreetName(row.english_name)}|${row.chinese_name}`.replace(/\|+$/, '|'),
      street_code: row.street_code || '',
      english_name: normalizeStreetName(row.english_name) || row.english_name,
      chinese_name: row.chinese_name || '',
    }
  }
  if (!roadKey) {
    throw new Error(
      `Could not match street: ${row.chinese_name || row.english_name || row.street_code}`,
    )
  }

  let road = pendingMap.get(roadKey)
  if (!road) {
    const streetKey = makeStreetKey(row.english_name, row.chinese_name)
    for (const [key, candidate] of pendingMap.entries()) {
      if (!key.startsWith('code:')) continue
      if (makeStreetKey(candidate.english_name, candidate.chinese_name) === streetKey) {
        road = candidate
        break
      }
    }
  }
  if (!road && allowNameOnly && (row.english_name || row.chinese_name)) {
    return {
      roadKey: roadKey || `${normalizeStreetName(row.english_name)}|${row.chinese_name}`,
      street_code: row.street_code || '',
      english_name: normalizeStreetName(row.english_name) || row.english_name,
      chinese_name: row.chinese_name || '',
    }
  }
  if (!road) {
    throw new Error(
      `Could not match street: ${row.chinese_name || row.english_name || row.street_code}`,
    )
  }

  return {
    roadKey: road.road_key ?? `code:${road.street_code}`,
    street_code: road.street_code ?? row.street_code,
    english_name:
      normalizeStreetName(row.english_name) ||
      normalizeStreetName(road.english_name) ||
      road.english_name ||
      row.english_name,
    chinese_name: row.chinese_name || road.chinese_name || '',
  }
}

async function appendBatchCsvRows(rows) {
  let existing = ''
  try {
    existing = await readFile(BATCH_CSV, 'utf8')
  } catch {
    existing = ''
  }

  const lines = existing.trim() ? existing.trim().split(/\r?\n/) : []
  if (!lines.length) lines.push(CSV_HEADER)

  const existingIds = new Set(
    lines
      .slice(1)
      .map((line) => line.split(',').pop()?.trim())
      .filter(Boolean),
  )

  for (const row of rows) {
    if (existingIds.has(row.submission_id)) {
      console.warn(`Skipping duplicate submission_id: ${row.submission_id}`)
      continue
    }
    lines.push(
      [
        csvEscape(row.street_code),
        csvEscape(row.english_name),
        csvEscape(row.chinese_name),
        csvEscape(row.naming_date),
        csvEscape(row.notice_label),
        csvEscape(row.gazette_url),
        'approved',
        csvEscape(row.submission_id),
        csvEscape(row.remarks),
      ].join(','),
    )
  }

  await mkdir(path.dirname(BATCH_CSV), { recursive: true })
  await writeFile(BATCH_CSV, `${lines.join('\n')}\n`)
}

async function appendNameHistoryEvents(events) {
  let existing = []
  try {
    existing = JSON.parse(await readFile(NAME_HISTORY_EVENTS, 'utf8'))
  } catch {
    existing = []
  }
  if (!Array.isArray(existing)) existing = []

  const seen = new Set(existing.map((event) => event.event_id))
  const merged = [...existing]
  for (const event of events) {
    if (seen.has(event.event_id)) {
      console.warn(`Skipping duplicate history event_id: ${event.event_id}`)
      continue
    }
    merged.push(event)
    seen.add(event.event_id)
  }

  await mkdir(path.dirname(NAME_HISTORY_EVENTS), { recursive: true })
  await writeFile(NAME_HISTORY_EVENTS, `${JSON.stringify(merged, null, 2)}\n`)
  return merged.length - existing.length
}

async function patchCrowdEventUrls(notice, publicationDate) {
  const events = JSON.parse(await readFile(APPROVED_EVENTS, 'utf8'))
  let patched = 0
  for (const event of events) {
    if (event.publication_date !== publicationDate) continue
    if (notice.url_en) event.government_notice_url_en = notice.url_en
    if (notice.url_zh) event.government_notice_url_zh = notice.url_zh
    if (notice.notice_stem) event.notice_stem = notice.notice_stem
    patched += 1
  }
  if (patched) {
    await writeFile(APPROVED_EVENTS, `${JSON.stringify(events, null, 2)}\n`)
  }
  return patched
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const batch = await loadBatchInput(opts)
  const publicationDate = normalizeNamingDate(
    batch.publication_date ?? batch.naming_date ?? batch.date,
  )
  if (!publicationDate) {
    throw new Error('Batch must include publication_date / naming_date / date')
  }

  const notice = resolveNoticeMeta(batch)
  if (!notice.notice_label) {
    throw new Error('Batch must include gazette_notice_label or parseable PDF filenames')
  }

  const streets = batch.streets ?? batch.road_names ?? []
  if (!Array.isArray(streets) || !streets.length) {
    throw new Error('Batch must include a non-empty streets array')
  }

  const hasHistory = streets.some(
    (street) => typeof street === 'object' && Array.isArray(street.history) && street.history.length,
  )
  if (!notice.url_en && !hasHistory) {
    throw new Error('Batch must include gazette_url or PDF paths with egazette-style filenames')
  }

  const pendingMap = await loadPendingRoadKeys(projectRoot)
  const resolveOpts = { allowNameOnly: batch.allow_name_only === true }
  const copiedPdfs = await copyBatchPdfs(batch, notice.batch_id)
  const displayDate = formatDisplayDate(publicationDate)
  const batchDefaults = {
    batch_id: notice.batch_id,
    gazette_notice_label: notice.notice_label,
    gazette_url_en: notice.url_en,
    gazette_url_zh: notice.url_zh,
    reviewed_at: new Date().toISOString().slice(0, 10),
    source: batch.source ?? null,
  }

  const historyEvents = []
  const csvRows = []

  for (const [index, street] of streets.entries()) {
    if (typeof street === 'object' && Array.isArray(street.history) && street.history.length) {
      const resolved = resolveStreet(street, pendingMap, resolveOpts)
      const built = buildCrowdEventsFromStreetEntry(
        { ...street, street_code: resolved.street_code },
        batchDefaults,
      )
      historyEvents.push(...built)
      continue
    }

    const resolved =
      typeof street === 'string'
        ? resolveStreet({ chinese_name: street }, pendingMap, resolveOpts)
        : resolveStreet(street, pendingMap, resolveOpts)
    const suffix = resolved.street_code || String(index + 1)
    csvRows.push({
      street_code: resolved.street_code,
      english_name: resolved.english_name,
      chinese_name: resolved.chinese_name,
      naming_date: displayDate,
      notice_label: notice.notice_label,
      gazette_url: notice.url_en ?? '',
      submission_id: `${notice.batch_id}-${suffix}`,
      remarks: batch.remarks ?? '',
    })
  }

  if (historyEvents.length) {
    const added = await appendNameHistoryEvents(historyEvents)
    console.log(`Appended ${added} name-history event(s) to ${NAME_HISTORY_EVENTS}`)
    const trackerPath = path.join(projectRoot, 'public', 'data', 'master', 'submission-tracker.json')
    try {
      const tracker = JSON.parse(await readFile(trackerPath, 'utf8'))
      const today = new Date().toISOString().slice(0, 10)
      for (const street of streets) {
        if (typeof street !== 'object' || !Array.isArray(street.history) || !street.history.length) continue
        const resolved = resolveStreet(street, pendingMap, resolveOpts)
        const roadKey = resolved.roadKey ?? `code:${resolved.street_code}`
        tracker.by_road_key = tracker.by_road_key ?? {}
        tracker.by_road_key[roadKey] = { status: 'approved', approved_at: today }
      }
      tracker.generated_at = new Date().toISOString()
      await writeFile(trackerPath, `${JSON.stringify(tracker, null, 2)}\n`)
      console.log('Updated submission-tracker for name-history streets')
    } catch (error) {
      console.warn('Could not update submission-tracker:', error.message)
    }
  }

  if (csvRows.length) {
    await appendBatchCsvRows(csvRows)
    console.log(`Appended ${csvRows.length} row(s) to ${BATCH_CSV}`)
  }
  if (copiedPdfs.length) {
    console.log(`Copied PDFs: ${copiedPdfs.join(', ')}`)
    const published = await publishCrowdGazettePdfs()
    console.log(`Published ${published.copied} PDF(s) to public/egazette/`)
  }

  if (process.env.SKIP_IMPORT !== '1') {
    execSync('npm run import:crowdsubmissions', { cwd: projectRoot, stdio: 'inherit' })
    const patched = await patchCrowdEventUrls(notice, publicationDate)
    if (patched) console.log(`Patched ${patched} event(s) with hosted gazette URLs`)
  }

  if (process.env.SKIP_MERGE !== '1') {
    execSync('npm run merge:crowd', { cwd: projectRoot, stdio: 'inherit' })
    execSync('npm run report:pending-years', { cwd: projectRoot, stdio: 'inherit' })
    console.log('\nDone. Streets now show 社群 (crowdsubmitted) and appear in 最近核實.')
  } else {
    console.log('\nBatch history appended (SKIP_MERGE=1).')
  }
  console.log('Next: git add public/data data/crowdsubmissions && commit && push')
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
