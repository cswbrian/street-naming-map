#!/usr/bin/env node
/**
 * Assign permanent page_id values to centreline map links and create unlinked rows
 * for name-only timelines. Re-runs report:street-timelines when done.
 *
 * Usage:
 *   node scripts/backfill-street-page-ids.mjs
 *   npm run backfill:street-page-ids
 */

import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMasterEvents } from './lib/master-street-events.mjs'
import {
  loadCentrelineMap,
  saveCentrelineMap,
  validateCentrelineMap,
  collectAssignedEventIds,
} from './lib/street-centreline-map.mjs'
import {
  aggregateByCentrelineMap,
  normalizeNamingDateExclusions,
} from './lib/street-naming-core.mjs'
import {
  buildStreetPageId,
  buildTimelineIdForPage,
  isValidPageId,
} from './lib/street-page-id.mjs'
import { readFile } from 'node:fs/promises'
import { projectRoot } from './lib/data-paths.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NAMING_DATE_EXCLUSIONS = path.join(projectRoot, 'data', 'naming-date-exclusions.json')

async function loadNamingDateExclusions() {
  try {
    const raw = JSON.parse(await readFile(NAMING_DATE_EXCLUSIONS, 'utf8'))
    return normalizeNamingDateExclusions(raw)
  } catch {
    return normalizeNamingDateExclusions({})
  }
}

function eventIdsFromAggregate(aggregate) {
  return (aggregate.event_history ?? [])
    .map((event) => String(event.event_id ?? '').trim())
    .filter(Boolean)
}

function findLinkForAggregate(aggregate, links) {
  const eventIds = new Set(eventIdsFromAggregate(aggregate))
  const code = String(aggregate.street_code ?? '').trim()

  for (const link of links) {
    const overlap = (link.event_ids ?? []).some((id) => eventIds.has(String(id).trim()))
    if (overlap) return link
    if (code && String(link.street_code ?? '').trim() === code) return link
    if (code && link.timeline_id === `code:${code}`) return link
  }
  return null
}

function namesFromEvents(eventIds, eventById) {
  for (const rawId of eventIds ?? []) {
    const event = eventById.get(String(rawId).trim())
    if (!event) continue
    const en = String(event.street_name_en ?? '').trim()
    const zh = String(event.street_name_zh ?? '').trim()
    if (en || zh) return { en, zh }
  }
  return { en: null, zh: null }
}

function dedupeEventIdsAcrossLinks(links) {
  const seen = new Map()
  let removed = 0
  for (const link of links) {
    const nextIds = []
    for (const rawId of link.event_ids ?? []) {
      const eventId = String(rawId).trim()
      if (!eventId) continue
      if (seen.has(eventId)) {
        removed += 1
        continue
      }
      seen.set(eventId, link.timeline_id)
      nextIds.push(eventId)
    }
    link.event_ids = nextIds
  }
  return removed
}

async function main() {
  const [events, map, exclusions] = await Promise.all([
    loadMasterEvents(),
    loadCentrelineMap({ allowMissing: true }),
    loadNamingDateExclusions(),
  ])

  const eventById = new Map(
    events.map((event) => [String(event.event_id ?? '').trim(), event]).filter(([id]) => id),
  )

  const usedPageIds = new Set(
    (map.links ?? [])
      .map((link) => String(link.page_id ?? '').trim())
      .filter((id) => isValidPageId(id)),
  )

  const links = [...(map.links ?? [])]
  let assigned = 0
  let created = 0

  for (const link of links) {
    if (link.page_id && isValidPageId(link.page_id)) continue
    const names = namesFromEvents(link.event_ids, eventById)
    const pageId = buildStreetPageId(
      {
        streetCode: link.street_code,
        streetNameEn: names.en,
        streetNameZh: names.zh,
        districtHint: link.district_hint,
        eventIds: link.event_ids,
      },
      usedPageIds,
    )
    link.page_id = pageId
    assigned += 1
  }

  const aggregates = aggregateByCentrelineMap(events, map, { namingDateExclusions: exclusions })
  const assignedEventIds = collectAssignedEventIds({ links })

  for (const aggregate of aggregates) {
    const eventIds = eventIdsFromAggregate(aggregate)
    const allAssigned = eventIds.every((id) => assignedEventIds.has(id))
    if (allAssigned) continue

    const existing = findLinkForAggregate(aggregate, links)
    if (existing) {
      if (!existing.page_id) {
        existing.page_id = buildStreetPageId(
          {
            streetCode: aggregate.street_code,
            streetNameEn: aggregate.street_name_en,
            streetNameZh: aggregate.street_name_zh,
            districtHint: existing.district_hint,
            eventIds,
          },
          usedPageIds,
        )
        assigned += 1
      }
      const mergedIds = [...new Set([...(existing.event_ids ?? []), ...eventIds])]
      existing.event_ids = mergedIds
      if (aggregate.street_code && !existing.street_code) {
        existing.street_code = aggregate.street_code
      }
      continue
    }

    const pageId = buildStreetPageId(
      {
        streetCode: aggregate.street_code,
        streetNameEn: aggregate.street_name_en,
        streetNameZh: aggregate.street_name_zh,
        districtHint: null,
        eventIds,
      },
      usedPageIds,
    )

    links.push({
      timeline_id: buildTimelineIdForPage(pageId),
      page_id: pageId,
      street_code: aggregate.street_code || null,
      event_ids: eventIds,
      status: aggregate.street_code ? 'active' : 'unlinked',
      method: aggregate.street_code ? 'event_street_code_only' : 'name_aggregate_only',
      district_hint: null,
      note: 'backfill-street-page-ids',
      linked_at: new Date().toISOString().slice(0, 10),
      linked_by: 'backfill-street-page-ids',
    })
    created += 1
    for (const id of eventIds) assignedEventIds.add(id)
  }

  const nextMap = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    links: links.toSorted((a, b) => String(a.page_id).localeCompare(String(b.page_id))),
  }

  const deduped = dedupeEventIdsAcrossLinks(nextMap.links)
  if (deduped) {
    console.log(`Removed ${deduped} duplicate event_id assignment(s) across links.`)
  }

  const validation = validateCentrelineMap(nextMap)
  if (!validation.valid) {
    console.error('Validation failed:', validation.errors)
    process.exit(1)
  }

  await saveCentrelineMap(nextMap)
  console.log(`Assigned page_id on ${assigned} link(s); created ${created} new link row(s).`)

  execSync('npm run report:street-timelines', {
    cwd: projectRoot,
    stdio: 'inherit',
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
