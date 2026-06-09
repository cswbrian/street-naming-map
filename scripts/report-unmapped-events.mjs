#!/usr/bin/env node
/**
 * List street events not assigned to any centreline map link.
 *
 * Usage:
 *   node scripts/report-unmapped-events.mjs
 *   npm run report:unmapped-events
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadMasterEvents } from './lib/master-street-events.mjs'
import {
  loadCentrelineMap,
  collectAssignedEventIds,
} from './lib/street-centreline-map.mjs'
import { pipelinePaths, PUBLIC_MASTER_DIR } from './lib/data-paths.mjs'
import { normalizeStreetName } from './lib/street-naming-core.mjs'

const OUTPUT_JSON = path.join(PUBLIC_MASTER_DIR, 'unmapped-events.json')
const OUTPUT_CSV = path.join(PUBLIC_MASTER_DIR, 'unmapped-events.csv')

function toCsvRow(values) {
  return values
    .map((value) => {
      const text = String(value ?? '')
      if (text.includes('"') || text.includes(',') || text.includes('\n')) {
        return `"${text.replaceAll('"', '""')}"`
      }
      return text
    })
    .join(',')
}

async function main() {
  const [events, map] = await Promise.all([
    loadMasterEvents(),
    loadCentrelineMap({ allowMissing: true }),
  ])

  const assigned = collectAssignedEventIds(map)
  const unmapped = events.filter((e) => !assigned.has(e.event_id))

  const bySource = {}
  for (const e of unmapped) {
    const src = e.source ?? 'unknown'
    bySource[src] = (bySource[src] || 0) + 1
  }

  const rows = unmapped
    .map((e) => ({
      event_id: e.event_id,
      source: e.source ?? null,
      publication_date: e.publication_date ?? null,
      change_kind: e.change_kind ?? null,
      street_name_en: e.street_name_en ?? null,
      street_name_zh: e.street_name_zh ?? null,
      district_raw_en: e.district_raw_en ?? null,
      district_raw_zh: e.district_raw_zh ?? null,
      notice_no: e.notice_no ?? null,
      legacy_street_code: e.street_code ?? null,
      name_key: `${normalizeStreetName(e.street_name_en)}|${String(e.street_name_zh ?? '').trim()}`,
    }))
    .toSorted((a, b) => String(a.publication_date).localeCompare(String(b.publication_date)))

  const payload = {
    generated_at: new Date().toISOString(),
    source_files: {
      events: pipelinePaths.streetEvents,
      centreline_map: pipelinePaths.streetCentrelineMap,
    },
    totals: {
      master_events: events.length,
      mapped_event_ids: assigned.size,
      unmapped_events: rows.length,
      by_source: bySource,
    },
    events: rows,
  }

  await mkdir(PUBLIC_MASTER_DIR, { recursive: true })
  await writeFile(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`)

  const csvLines = [
    toCsvRow([
      'event_id',
      'source',
      'publication_date',
      'change_kind',
      'street_name_en',
      'street_name_zh',
      'district_raw_en',
      'notice_no',
      'legacy_street_code',
    ]),
    ...rows.map((r) =>
      toCsvRow([
        r.event_id,
        r.source,
        r.publication_date,
        r.change_kind,
        r.street_name_en,
        r.street_name_zh,
        r.district_raw_en,
        r.notice_no,
        r.legacy_street_code,
      ]),
    ),
  ]
  await writeFile(OUTPUT_CSV, `${csvLines.join('\n')}\n`)

  console.log(JSON.stringify(payload.totals, null, 2))
  console.log(`\nWrote: ${OUTPUT_JSON}`)
  console.log(`Wrote: ${OUTPUT_CSV}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
