#!/usr/bin/env node
/**
 * Import Google Form CSV exports into submission-tracker.json and approved crowd events.
 *
 * Usage:
 *   node scripts/import-crowd-submissions.mjs [--tracker-only]
 *   node scripts/import-crowd-submissions.mjs --csv path/to/responses.csv
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isEmptySheetRow,
  loadPendingRoadKeys,
  matchRowToRoadKey,
  normalizeNamingDate,
  normalizeStatus,
  parseCsv,
} from './lib/crowd-submission-core.mjs'
import { finalizeCrowdEvent, normalizeStreetName } from './lib/street-naming-core.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const DEFAULT_CSV = path.join(projectRoot, 'data', 'crowdsubmissions', 'responses.csv')
const BATCH_CSV = path.join(projectRoot, 'data', 'crowdsubmissions', 'batch-approved.csv')
const TRACKER_OUT = path.join(projectRoot, 'public', 'data', 'master', 'submission-tracker.json')
const RECENT_OUT = path.join(projectRoot, 'public', 'data', 'master', 'recently-verified.json')
const APPROVED_EVENTS_OUT = path.join(
  projectRoot,
  'data',
  'crowdsubmissions',
  'street-events-approved.json',
)

function parseArgs(argv) {
  const opts = { trackerOnly: false, csvPath: DEFAULT_CSV }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--tracker-only') opts.trackerOnly = true
    else if (arg === '--csv' && argv[i + 1]) {
      opts.csvPath = path.resolve(argv[++i])
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/import-crowd-submissions.mjs [options]

Options:
  --tracker-only   Update submission-tracker.json only (no approved events file)
  --csv <path>     CSV path (default: data/crowdsubmissions/responses.csv)
`)
      process.exit(0)
    }
  }
  return opts
}

async function readCsvFile(filePath) {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

async function loadAllRows(opts) {
  const rows = []
  const primary = await readCsvFile(opts.csvPath)
  if (primary) rows.push(...parseCsv(primary))

  if (!opts.trackerOnly) {
    const batch = await readCsvFile(BATCH_CSV)
    if (batch) rows.push(...parseCsv(batch))
  }
  return rows
}

function buildApprovedEvent(row, roadKey, pendingMap) {
  const publicationDate = normalizeNamingDate(row.naming_date)
  if (!publicationDate) return null

  const road = pendingMap.get(roadKey)
  const en = normalizeStreetName(row.english_name) || road?.english_name || null
  const zh = String(row.chinese_name ?? road?.chinese_name ?? '').trim() || null
  const submissionId =
    String(row.submission_id ?? '').trim() || `${roadKey}|${publicationDate}`
  const gazetteUrl = String(row.gazette_url ?? '').trim()

  return finalizeCrowdEvent({
    submission_id: submissionId,
    street_code: road?.street_code ?? (String(row.street_code ?? '').trim() || null),
    publication_date: publicationDate,
    street_name_en: en,
    street_name_zh: zh,
    notice_no: row.gazette_notice_label,
    gazette_notice_label: row.gazette_notice_label,
    gazette_url: gazetteUrl || 'https://egazette.gld.gov.hk/',
    government_notice_url_en: gazetteUrl || null,
    remarks: row.remarks,
    reviewed_at: new Date().toISOString().slice(0, 10),
    is_declaration_event: true,
  })
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const rows = await loadAllRows(opts)

  if (!rows.length) {
    console.warn(`No CSV rows found at ${opts.csvPath}`)
    if (opts.trackerOnly) {
      const empty = {
        generated_at: new Date().toISOString(),
        stats: { submitted: 0, approved: 0, rejected: 0, batch_uploads: 0 },
        by_road_key: {},
      }
      await mkdir(path.dirname(TRACKER_OUT), { recursive: true })
      await writeFile(TRACKER_OUT, `${JSON.stringify(empty, null, 2)}\n`)
    }
    return
  }

  const pendingMap = await loadPendingRoadKeys(projectRoot)
  const byRoadKey = {}
  const approvedEvents = []
  const duplicateWarnings = []
  const seenPending = new Map()

  let submitted = 0
  let approved = 0
  let rejected = 0

  for (const row of rows) {
    if (isEmptySheetRow(row)) continue

    const status = normalizeStatus(row.status)
    if (status === 'rejected') {
      rejected += 1
      continue
    }

    const roadKey = matchRowToRoadKey(row, pendingMap)
    if (!roadKey) {
      console.warn('Unmatched row:', row.english_name, row.chinese_name, row.street_code)
      continue
    }

    if (status === 'pending') {
      if (seenPending.has(roadKey)) {
        duplicateWarnings.push(roadKey)
      }
      seenPending.set(roadKey, true)
      submitted += 1
      const submittedAt =
        normalizeNamingDate(row.timestamp) ||
        row.timestamp ||
        new Date().toISOString().slice(0, 10)
      byRoadKey[roadKey] = {
        status: 'submitted',
        submitted_at: String(submittedAt).slice(0, 10),
      }
    } else if (status === 'approved') {
      approved += 1
      byRoadKey[roadKey] = {
        status: 'approved',
        approved_at: new Date().toISOString().slice(0, 10),
      }
      if (!opts.trackerOnly) {
        const event = buildApprovedEvent(row, roadKey, pendingMap)
        if (event) approvedEvents.push(event)
        else console.warn(`Approved row missing valid date for ${roadKey}`)
      }
    }
  }

  if (duplicateWarnings.length) {
    console.warn('Duplicate pending submissions for road_key:', [...new Set(duplicateWarnings)].join(', '))
  }

  const tracker = {
    generated_at: new Date().toISOString(),
    stats: {
      submitted,
      approved,
      rejected,
      batch_uploads: 0,
    },
    by_road_key: byRoadKey,
  }

  await mkdir(path.dirname(TRACKER_OUT), { recursive: true })
  await writeFile(TRACKER_OUT, `${JSON.stringify(tracker, null, 2)}\n`)
  console.log(`Wrote ${TRACKER_OUT}`)
  console.log(`  submitted: ${submitted}, approved: ${approved}, rejected: ${rejected}`)

  const recentlyVerified = {
    generated_at: new Date().toISOString(),
    streets: approvedEvents
      .slice(-20)
      .reverse()
      .map((event) => ({
        street_name_en: event.street_name_en,
        street_name_zh: event.street_name_zh,
        naming_date: event.publication_date,
        approved_at: event.reviewed_at,
      })),
  }
  await writeFile(RECENT_OUT, `${JSON.stringify(recentlyVerified, null, 2)}\n`)

  if (!opts.trackerOnly) {
    await mkdir(path.dirname(APPROVED_EVENTS_OUT), { recursive: true })
    await writeFile(APPROVED_EVENTS_OUT, `${JSON.stringify(approvedEvents, null, 2)}\n`)
    console.log(`Wrote ${APPROVED_EVENTS_OUT} (${approvedEvents.length} events)`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
