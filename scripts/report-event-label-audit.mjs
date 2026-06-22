#!/usr/bin/env node
/**
 * Flag master events whose history[] fields may produce wrong UI type labels.
 *
 * Usage:
 *   node scripts/report-event-label-audit.mjs
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { projectRoot } from './lib/data-paths.mjs'
import { loadMasterEvents } from './lib/master-street-events.mjs'
import { loadCentrelineMap } from './lib/street-centreline-map.mjs'
import {
  aggregateByCentrelineMap,
  normalizeNamingDateExclusions,
} from './lib/street-naming-core.mjs'
import { getTimelineEventTypeKey } from '../src/lib/mapSurfaceDisplay.js'
import { isMentionEvidenceKind } from '../src/lib/evidenceKindBadge.js'

const NAMING_DATE_EXCLUSIONS = path.join(projectRoot, 'data', 'naming-date-exclusions.json')

async function loadNamingDateExclusions() {
  try {
    const raw = JSON.parse(await readFile(NAMING_DATE_EXCLUSIONS, 'utf8'))
    return normalizeNamingDateExclusions(raw)
  } catch {
    return normalizeNamingDateExclusions({})
  }
}

function auditMasterEvent(event) {
  const flags = []
  const kind = String(event.evidence_kind ?? '').trim()
  const role = String(event.event_role ?? '').trim()

  if (isMentionEvidenceKind(kind) && role !== 'former_name') {
    // Earliest attestation of today's map name may use current_name + is_declaration_event: false.
    if (role === 'current_name' && event.is_declaration_event === false) {
      return flags
    }
    flags.push({
      flag: role === 'current_name' ? 'mention_on_current_name' : 'mention_wrong_role',
      event_id: event.event_id,
      street_name_en: event.street_name_en,
      street_name_zh: event.street_name_zh,
      evidence_kind: kind,
      event_role: role,
      change_kind: event.change_kind,
    })
  }

  return flags
}

function auditTimeline(nameHistory, meta) {
  const flags = []
  if (!Array.isArray(nameHistory) || !nameHistory.length) return flags

  const ordered = [...nameHistory]
  const renameCurrent = ordered.filter(
    (entry) =>
      String(entry.change_kind ?? '').trim() === 'rename' &&
      String(entry.event_role ?? '').trim() === 'current_name',
  )

  if (renameCurrent.length === 1 && ordered.length === 1) {
    const key = getTimelineEventTypeKey(renameCurrent[0], ordered)
    if (key !== 'declare') {
      flags.push({
        flag: 'sole_rename_not_declare',
        ...meta,
        ui_key: key,
      })
    }
  }

  return flags
}

async function main() {
  const [events, map, exclusions] = await Promise.all([
    loadMasterEvents(),
    loadCentrelineMap({ allowMissing: true }),
    loadNamingDateExclusions(),
  ])

  const eventFlags = events.flatMap(auditMasterEvent)
  const aggregates = aggregateByCentrelineMap(events, map, { namingDateExclusions: exclusions })
  const timelineFlags = aggregates.flatMap((agg) =>
    auditTimeline(agg.name_history, {
      timeline_id: agg.street_code ? `code:${agg.street_code}` : agg.street_key,
      street_code: agg.street_code ?? null,
      street_name_en: agg.street_name_en,
      street_name_zh: agg.street_name_zh,
    }),
  )

  const byFlag = {}
  for (const row of [...eventFlags, ...timelineFlags]) {
    byFlag[row.flag] = (byFlag[row.flag] ?? 0) + 1
  }

  console.log('Event label audit')
  console.log('=================')
  console.log(`Master events scanned: ${events.length}`)
  console.log(`Timelines scanned: ${aggregates.length}`)
  console.log('')
  console.log('Counts by flag:')
  for (const [flag, count] of Object.entries(byFlag).toSorted()) {
    console.log(`  ${flag}: ${count}`)
  }

  if (eventFlags.length) {
    console.log('\nEvent-level flags (first 20):')
    for (const row of eventFlags.slice(0, 20)) {
      console.log(
        `  ${row.flag}  ${row.event_id}  ${row.street_name_en ?? row.street_name_zh ?? '?'}  role=${row.event_role}  evidence=${row.evidence_kind}`,
      )
    }
    if (eventFlags.length > 20) console.log(`  … and ${eventFlags.length - 20} more`)
  }

  if (timelineFlags.length) {
    console.log('\nTimeline-level flags:')
    for (const row of timelineFlags) {
      console.log(`  ${row.flag}  ${row.timeline_id}  ui_key=${row.ui_key}`)
    }
  }

  if (!eventFlags.length && !timelineFlags.length) {
    console.log('\nNo label mis-tags found.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
