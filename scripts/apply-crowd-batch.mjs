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
import {
  appendMasterEvents,
  patchMasterEventsByDate,
} from './lib/master-street-events.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const BATCH_CSV = path.join(projectRoot, 'data', 'crowdsubmissions', 'batch-approved.csv')
const BATCH_INBOX = path.join(projectRoot, 'data', 'crowdsubmissions', 'batch-inbox')

const CSV_HEADER =
  'street_code,english_name,chinese_name,naming_date,gazette notice label,gazette url,status,submission_id,remarks'

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: node scripts/apply-crowd-batch.mjs <batch.json>
       node scripts/apply-crowd-batch.mjs --stdin

Applies community-verified naming dates and runs npm run rebuild:naming + report:pending-years.`)
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
    // Default crowdsubmitted; batch.source === 'hkgro' only from parse-hkgro-gazettes
    source: batch.source === 'hkgro' ? 'hkgro' : 'crowdsubmitted',
  }

  const historyEvents = []
  const csvRows = []

  for (const [index, street] of streets.entries()) {
    if (typeof street === 'object' && Array.isArray(street.history) && street.history.length) {
      const resolved = resolveStreet(street, pendingMap, resolveOpts)
      const built = buildCrowdEventsFromStreetEntry(
        { ...street, street_code: resolved.street_code },
        {
          ...batchDefaults,
          display_names: {
            en: resolved.english_name,
            zh: resolved.chinese_name,
          },
        },
      )
      for (const event of built) {
        if (event.evidence_kind === 'gazette_inferred' && Array.isArray(event.derived_from)) {
          event.derived_from = event.derived_from.map((ref) => ({
            ...ref,
            notice_label: ref.notice_label ?? notice.notice_label,
            publication_date: ref.publication_date ?? publicationDate,
            government_notice_url_en:
              ref.government_notice_url_en ?? notice.url_en ?? null,
            government_notice_url_zh:
              ref.government_notice_url_zh ?? notice.url_zh ?? null,
          }))
        } else if (!event.government_notice_url_en && notice.url_en) {
          event.government_notice_url_en = notice.url_en
          event.government_notice_url_zh = notice.url_zh ?? null
        }
      }
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
    const added = await appendMasterEvents(historyEvents)
    console.log(`Upserted ${added} event(s) into data/master/street-events.json`)
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
    const patched = await patchMasterEventsByDate(publicationDate, (event) => {
      if (notice.url_en) event.government_notice_url_en = notice.url_en
      if (notice.url_zh) event.government_notice_url_zh = notice.url_zh
      if (notice.notice_stem) event.notice_stem = notice.notice_stem
    })
    if (patched) console.log(`Patched ${patched} event(s) with hosted gazette URLs`)
  }

  if (process.env.SKIP_MERGE !== '1') {
    execSync('npm run rebuild:naming', { cwd: projectRoot, stdio: 'inherit' })
    execSync('npm run report:pending-years', { cwd: projectRoot, stdio: 'inherit' })
    console.log('\nDone. Streets updated with gazette evidence (來源) and appear in 最近核實.')
  } else {
    console.log('\nBatch history appended (SKIP_MERGE=1).')
  }
  console.log('Next: git add public/data data/master && commit && push')
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
