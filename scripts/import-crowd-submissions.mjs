#!/usr/bin/env node
/**
 * Import Google Form CSV exports into crowd street-events.json (form-sourced events).
 *
 * Usage:
 *   node scripts/import-crowd-submissions.mjs
 *   node scripts/import-crowd-submissions.mjs --csv path/to/responses.csv
 */

import { readFile } from 'node:fs/promises'
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
import {
  loadMasterEvents,
  saveMasterEvents,
  upsertMasterEvents,
} from './lib/master-street-events.mjs'
import { finalizeCrowdEvent, normalizeStreetName } from './lib/street-naming-core.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const DEFAULT_CSV = path.join(projectRoot, 'data', 'crowdsubmissions', 'responses.csv')
const BATCH_CSV = path.join(projectRoot, 'data', 'crowdsubmissions', 'batch-approved.csv')

function parseArgs(argv) {
  const opts = { csvPath: DEFAULT_CSV }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--csv' && argv[i + 1]) {
      opts.csvPath = path.resolve(argv[++i])
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/import-crowd-submissions.mjs [options]

Options:
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

  const batch = await readCsvFile(BATCH_CSV)
  if (batch) rows.push(...parseCsv(batch))
  return rows
}

function buildApprovedEvent(row, roadKey, pendingMap) {
  const publicationDate = normalizeNamingDate(row.naming_date)
  if (!publicationDate) return null

  const pending = pendingMap.get(roadKey)
  const streetCode = String(row.street_code ?? pending?.street_code ?? '').trim() || null
  const streetNameEn =
    normalizeStreetName(row.english_name) ||
    normalizeStreetName(pending?.english_name) ||
    null
  const streetNameZh = String(row.chinese_name ?? pending?.chinese_name ?? '').trim() || null

  return finalizeCrowdEvent({
    source: 'crowdsubmitted',
    street_code: streetCode,
    publication_date: publicationDate,
    street_name_en: streetNameEn,
    street_name_zh: streetNameZh,
    government_notice_label_en: row.gazette_notice_label ?? row.notice_label ?? null,
    government_notice_url_en: row.gazette_url ?? null,
    submitter_remarks: row.remarks ?? '',
    submission_id: row.submission_id ?? roadKey,
    evidence_kind: 'gazette_primary',
    reviewed_at: new Date().toISOString().slice(0, 10),
    is_declaration_event: true,
  })
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const rows = await loadAllRows(opts)

  if (!rows.length) {
    console.warn(`No CSV rows found at ${opts.csvPath}`)
    return
  }

  const pendingMap = await loadPendingRoadKeys(projectRoot)
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
    } else if (status === 'approved') {
      approved += 1
      const event = buildApprovedEvent(row, roadKey, pendingMap)
      if (event) approvedEvents.push(event)
      else console.warn(`Approved row missing valid date for ${roadKey}`)
    }
  }

  if (duplicateWarnings.length) {
    console.warn('Duplicate pending submissions for road_key:', [...new Set(duplicateWarnings)].join(', '))
  }

  console.log(`  submitted: ${submitted}, approved: ${approved}, rejected: ${rejected}`)

  const events = await loadMasterEvents()
  const withoutForm = events.filter((event) => event.crowd_origin !== 'form')
  const tagged = approvedEvents.map((event) => ({ ...event, crowd_origin: 'form' }))
  const next = upsertMasterEvents(withoutForm, tagged)
  await saveMasterEvents(next)
  console.log(
    `Updated data/master/street-events.json (${next.length} total events, ${approvedEvents.length} form events)`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
