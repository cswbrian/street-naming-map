#!/usr/bin/env node
/**
 * Backfill street-centreline-map.json from street_code fields on events.
 *
 * Usage:
 *   node scripts/migrate-street-code-to-map.mjs
 *   npm run migrate:street-code-to-map
 */

import { loadMasterEvents } from './lib/master-street-events.mjs'
import {
  loadCentrelineMap,
  saveCentrelineMap,
  validateCentrelineMap,
  upsertCentrelineLinks,
  collectAssignedEventIds,
} from './lib/street-centreline-map.mjs'

async function main() {
  const [events, existingMap] = await Promise.all([
    loadMasterEvents(),
    loadCentrelineMap({ allowMissing: true }),
  ])

  const byCode = new Map()
  for (const event of events) {
    const code = String(event.street_code ?? '').trim()
    if (!code) continue
    if (!byCode.has(code)) byCode.set(code, [])
    byCode.get(code).push(event)
  }

  const alreadyAssigned = collectAssignedEventIds(existingMap)
  const newLinks = []

  for (const [code, group] of byCode.entries()) {
    const eventIds = group.map((e) => e.event_id).filter(Boolean)
    const unassigned = eventIds.filter((id) => !alreadyAssigned.has(id))
    if (!unassigned.length && existingMap.links.some((l) => l.street_code === code)) continue

    const timelineId = `code:${code}`
    const existing = existingMap.links.find((l) => l.timeline_id === timelineId)
    newLinks.push({
      timeline_id: timelineId,
      street_code: code,
      event_ids: existing
        ? [...new Set([...existing.event_ids, ...eventIds])]
        : eventIds,
      status: 'active',
      method: existing?.method ?? 'migrated_from_event_street_code',
      linked_at: new Date().toISOString().slice(0, 10),
      linked_by: 'migrate-street-code-to-map',
      note: existing?.note ?? null,
    })
  }

  const merged = upsertCentrelineLinks(existingMap, newLinks)
  const validation = validateCentrelineMap(merged)
  if (!validation.valid) {
    console.error('Validation failed:', validation.errors)
    process.exit(1)
  }

  await saveCentrelineMap(merged)

  console.log(
    JSON.stringify(
      {
        events_with_street_code: [...byCode.values()].reduce((n, g) => n + g.length, 0),
        timeline_links: merged.links.length,
        active_links: merged.links.filter((l) => l.status === 'active').length,
        warnings: validation.warnings.length,
      },
      null,
      2,
    ),
  )
  if (validation.warnings.length) {
    console.log('\nWarnings:', validation.warnings.slice(0, 5))
  }
  console.log('\nWrote data/master/street-centreline-map.json')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
