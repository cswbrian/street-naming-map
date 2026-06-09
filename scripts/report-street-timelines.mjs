#!/usr/bin/env node
/**
 * Generate street timeline inventory (events + centreline link status).
 *
 * Usage:
 *   node scripts/report-street-timelines.mjs
 *   npm run report:street-timelines
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { loadMasterEvents } from './lib/master-street-events.mjs'
import { loadCentrelineMap } from './lib/street-centreline-map.mjs'
import {
  aggregateByCentrelineMap,
  normalizeNamingDateExclusions,
} from './lib/street-naming-core.mjs'
import { publicPaths, projectRoot } from './lib/data-paths.mjs'

const OUTPUT = publicPaths.streetTimelines
const NAMING_DATE_EXCLUSIONS = path.join(projectRoot, 'data', 'naming-date-exclusions.json')

async function loadNamingDateExclusions() {
  try {
    const raw = JSON.parse(await readFile(NAMING_DATE_EXCLUSIONS, 'utf8'))
    return normalizeNamingDateExclusions(raw)
  } catch {
    return normalizeNamingDateExclusions({})
  }
}

async function main() {
  const [events, map, exclusions] = await Promise.all([
    loadMasterEvents(),
    loadCentrelineMap({ allowMissing: true }),
    loadNamingDateExclusions(),
  ])

  const aggregates = aggregateByCentrelineMap(events, map, { namingDateExclusions: exclusions })
  const linkByTimeline = new Map((map.links ?? []).map((l) => [l.timeline_id, l]))
  const linkByCode = new Map(
    (map.links ?? [])
      .filter((l) => l.street_code)
      .map((l) => [String(l.street_code).trim(), l]),
  )

  const timelines = aggregates.map((agg) => {
    const code = String(agg.street_code ?? '').trim()
    const link =
      (code && linkByCode.get(code)) ??
      [...linkByTimeline.values()].find((l) =>
        (l.event_ids ?? []).some((id) => agg.event_history?.some((e) => e.event_id === id)),
      ) ??
      null

    return {
      timeline_id: link?.timeline_id ?? (code ? `code:${code}` : agg.street_key),
      street_code: code || null,
      street_name_en: agg.street_name_en,
      street_name_zh: agg.street_name_zh,
      canonical_naming_year: agg.canonical_naming_year,
      canonical_naming_date: agg.canonical_naming_date,
      derivation_reason: agg.derivation_reason,
      event_count: agg.event_count,
      geometry_link: link
        ? {
            status: link.status,
            street_code: link.street_code,
            method: link.method,
            district_hint: link.district_hint ?? null,
          }
        : {
            status: code ? 'legacy_event_code' : 'unlinked',
            street_code: code || null,
            method: code ? 'event_street_code_only' : 'name_aggregate_only',
            district_hint: null,
          },
      name_history: agg.name_history,
    }
  })

  const payload = {
    generated_at: new Date().toISOString(),
    totals: {
      timelines: timelines.length,
      linked_active: timelines.filter((t) => t.geometry_link?.status === 'active').length,
      unlinked: timelines.filter((t) => t.geometry_link?.status === 'unlinked').length,
      legacy_or_name_only: timelines.filter(
        (t) => !['active', 'unlinked', 'abolished', 'disputed'].includes(t.geometry_link?.status),
      ).length,
    },
    timelines: timelines.toSorted((a, b) =>
      String(a.street_name_en ?? a.street_name_zh ?? '').localeCompare(
        String(b.street_name_en ?? b.street_name_zh ?? ''),
      ),
    ),
  }

  await mkdir(path.dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`)

  console.log(JSON.stringify(payload.totals, null, 2))
  console.log(`\nWrote: ${OUTPUT}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
