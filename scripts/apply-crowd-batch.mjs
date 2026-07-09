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
  autoMatchBatchStreets,
  loadPendingRoadKeys,
  matchRowToRoadKey,
  normalizeNamingDate,
  printBatchMatchTable,
} from './lib/crowd-submission-core.mjs'
import {
  buildCrowdEventsFromStreetEntry,
  finalizeCrowdEvent,
  makeStreetKey,
  normalizeStreetName,
  slugifyForEventId,
} from './lib/street-naming-core.mjs'
import {
  loadCentrelineMap,
  saveCentrelineMap,
  upsertCentrelineLinks,
  validateCentrelineMap,
  enrichCentrelineLinkHints,
} from './lib/street-centreline-map.mjs'
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

Applies gazette events (no street_code required). Linkers use street-centreline-map.json.

Options:
  --match       Auto-set link_street_code when EN+ZH (or unique EN/ZH) matches geojson
                (default for gazette_only batches)
  --no-match    Skip auto centreline match; events only (no map dates)

Batch JSON:
  gazette_only: true (default) — do not require geojson match or street_code on events
  allow_street_code_link: true — MAINTAINER LEGACY ONLY (writes street_code on events; ignored by map join)
  link_street_code on a street — attach events to street-centreline-map.json (map naming dates)`)
    process.exit(0)
  }
  const noMatch = argv.includes('--no-match')
  const matchFlag = argv.includes('--match')
  if (argv.includes('--stdin')) return { stdin: true, file: null, autoMatch: !noMatch, matchFlag }
  const file = argv.find((a) => !a.startsWith('-'))
  if (!file) {
    console.error('Missing batch JSON path. Use --stdin or pass a file path.')
    process.exit(1)
  }
  return {
    stdin: false,
    file: path.resolve(file),
    autoMatch: !noMatch,
    matchFlag,
  }
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

/** Names from batch row only — no geojson lookup (gazette parser path). */
function namesFromStreetEntry(street, index = 0) {
  if (typeof street === 'string') {
    return {
      english_name: null,
      chinese_name: street.trim(),
      district_raw_en: null,
      district_raw_zh: null,
      link_street_code: null,
    }
  }
  return {
    english_name:
      normalizeStreetName(street.english_name ?? street.en ?? street.street_name_en) || null,
    chinese_name: String(
      street.chinese_name ?? street.zh ?? street.name ?? street.street_name_zh ?? '',
    ).trim() || null,
    district_raw_en: street.district_raw_en ?? street.district_en ?? null,
    district_raw_zh: street.district_raw_zh ?? street.district_zh ?? null,
    link_street_code: String(street.link_street_code ?? '').trim() || null,
  }
}

function resolveLinkStreetCode(street, allowStreetCodeLink) {
  const explicit = String(street?.link_street_code ?? '').trim()
  if (explicit) return explicit
  if (!allowStreetCodeLink || typeof street !== 'object') return null
  return String(street.street_code ?? street.code ?? '').trim() || null
}

function buildSimpleDeclareEvent(street, publicationDate, notice, batchDefaults, index) {
  const names = namesFromStreetEntry(street, index)
  const slug = slugifyForEventId(names.english_name, names.chinese_name) || `street-${index + 1}`
  return finalizeCrowdEvent({
    submission_id: `${batchDefaults.batch_id}-${slug}`,
    publication_date: publicationDate,
    change_kind: 'declare',
    street_name_en: names.english_name,
    street_name_zh: names.chinese_name,
    district_raw_en: names.district_raw_en,
    district_raw_zh: names.district_raw_zh,
    gazette_only: batchDefaults.gazette_only !== false,
    gazette_notice_label: notice.notice_label,
    government_notice_url_en: notice.url_en,
    government_notice_url_zh: notice.url_zh,
    evidence_kind: 'gazette_primary',
    source: batchDefaults.source,
    reviewed_at: batchDefaults.reviewed_at,
  })
}

async function applyCentrelineLinksFromBatch(linkHints, eventById = new Map()) {
  if (!linkHints.length) return 0
  const map = await loadCentrelineMap({ allowMissing: true })
  const resolveNames = (hint) => {
    for (const rawId of hint.event_ids ?? []) {
      const event = eventById.get(String(rawId).trim())
      if (!event) continue
      const en = String(event.street_name_en ?? '').trim()
      const zh = String(event.street_name_zh ?? '').trim()
      if (en || zh) return { en, zh }
    }
    return { en: null, zh: null }
  }
  const enriched = enrichCentrelineLinkHints(linkHints, map, resolveNames)
  const merged = upsertCentrelineLinks(map, enriched)
  const validation = validateCentrelineMap(merged)
  if (!validation.valid) {
    throw new Error(`Centreline map validation failed: ${JSON.stringify(validation.errors)}`)
  }
  await saveCentrelineMap(merged)
  return linkHints.length
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

  const streetsInput = batch.streets ?? batch.road_names ?? []
  if (!Array.isArray(streetsInput) || !streetsInput.length) {
    throw new Error('Batch must include a non-empty streets array')
  }

  const hasHistory = streetsInput.some(
    (street) => typeof street === 'object' && Array.isArray(street.history) && street.history.length,
  )
  if (!notice.url_en && !hasHistory) {
    throw new Error('Batch must include gazette_url or PDF paths with egazette-style filenames')
  }

  const gazetteOnly = batch.gazette_only !== false
  const allowStreetCodeLink =
    batch.allow_street_code_link === true || batch.link_to_map === true
  const shouldAutoMatch =
    (opts.autoMatch || opts.matchFlag || batch.auto_match === true) &&
    gazetteOnly &&
    !allowStreetCodeLink

  let streets = streetsInput

  if (shouldAutoMatch) {
    const pendingForMatch = await loadPendingRoadKeys(projectRoot)
    const { streets: matched, results } = autoMatchBatchStreets(streets, pendingForMatch)
    streets = matched
    printBatchMatchTable(results)
  }

  const pendingMap =
    gazetteOnly && !allowStreetCodeLink ? null : await loadPendingRoadKeys(projectRoot)
  const resolveOpts = { allowNameOnly: batch.allow_name_only === true }
  const copiedPdfs = await copyBatchPdfs(batch, notice.batch_id)
  const displayDate = formatDisplayDate(publicationDate)
  const batchDefaults = {
    batch_id: notice.batch_id,
    gazette_notice_label: notice.notice_label,
    gazette_url_en: notice.url_en,
    gazette_url_zh: notice.url_zh,
    reviewed_at: new Date().toISOString().slice(0, 10),
    source: batch.source === 'hkgro' ? 'hkgro' : 'crowdsubmitted',
    gazette_only: gazetteOnly,
    allow_street_code_link: allowStreetCodeLink,
    link_to_map: allowStreetCodeLink,
  }

  const historyEvents = []
  const csvRows = []
  const linkHints = []

  for (const [index, street] of streets.entries()) {
    const names = namesFromStreetEntry(street, index)

    if (typeof street === 'object' && Array.isArray(street.history) && street.history.length) {
      const display = gazetteOnly
        ? { en: names.english_name, zh: names.chinese_name }
        : (() => {
            const resolved = resolveStreet(street, pendingMap, resolveOpts)
            return { en: resolved.english_name, zh: resolved.chinese_name }
          })()

      const built = buildCrowdEventsFromStreetEntry(street, {
        ...batchDefaults,
        display_names: display,
      })
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

      const linkCode = resolveLinkStreetCode(street, allowStreetCodeLink)
      if (linkCode && gazetteOnly) {
        linkHints.push({
          timeline_id: `code:${linkCode}`,
          street_code: linkCode,
          event_ids: built.map((e) => e.event_id),
          status: 'active',
          method: 'batch_link_street_code',
          district_hint: names.district_raw_zh ?? names.district_raw_en ?? null,
          linked_at: batchDefaults.reviewed_at,
          linked_by: 'apply-crowd-batch',
        })
      }
      continue
    }

    if (gazetteOnly) {
      const event = buildSimpleDeclareEvent(street, publicationDate, notice, batchDefaults, index)
      if (!event.government_notice_url_en && notice.url_en) {
        event.government_notice_url_en = notice.url_en
        event.government_notice_url_zh = notice.url_zh ?? null
      }
      historyEvents.push(event)
      const linkCode = resolveLinkStreetCode(street, allowStreetCodeLink)
      if (linkCode) {
        linkHints.push({
          timeline_id: `code:${linkCode}`,
          street_code: linkCode,
          event_ids: [event.event_id],
          status: 'active',
          method: 'batch_link_street_code',
          district_hint: names.district_raw_zh ?? names.district_raw_en ?? null,
          linked_at: batchDefaults.reviewed_at,
          linked_by: 'apply-crowd-batch',
        })
      }
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

  if (linkHints.length) {
    const eventById = new Map(
      historyEvents.map((event) => [String(event.event_id ?? '').trim(), event]).filter(([id]) => id),
    )
    const linked = await applyCentrelineLinksFromBatch(linkHints, eventById)
    console.log(`Updated ${linked} centreline map link(s) in street-centreline-map.json`)
  } else if (gazetteOnly && historyEvents.length) {
    console.log(
      '\nLinker queue: events are not on the map until linked. Run: npm run report:unmapped-events',
    )
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
    execSync(
      'npm run rebuild:naming && npm run report:pending-years && npm run report:street-timelines && npm run report:unmapped-events',
      { cwd: projectRoot, stdio: 'inherit' },
    )
    if (gazetteOnly && linkHints.length === 0) {
      console.log(
        '\nDone. Gazette events saved. Map shows naming only after a linker adds street-centreline-map.json rows.',
      )
    } else {
      console.log('\nDone. Rebuild complete — check 最近核實 for linked streets.')
    }
  } else {
    console.log('\nBatch history appended (SKIP_MERGE=1).')
  }
  console.log('Next: git add public/data data/master && commit && push')
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
