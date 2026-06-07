#!/usr/bin/env node
/**
 * Rebuild map outputs from data/master/street-events.json (single source of truth).
 *
 * Usage:
 *   node scripts/rebuild-street-naming.mjs
 *   npm run rebuild:naming
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipelinePaths, projectRoot, publicPaths } from './lib/data-paths.mjs'
import { loadMasterEvents } from './lib/master-street-events.mjs'
import {
  aggregateByStreet,
  enrichGeojson,
  normalizeNamingDateExclusions,
} from './lib/street-naming-core.mjs'

const SOURCE_PATH = path.join(
  projectRoot,
  'Transportation_RoadCentreline_20260601.gdb_converted.geojson',
)
const GEOJSON_OUTPUT = publicPaths.geojson
const NAMING_DATE_EXCLUSIONS = path.join(projectRoot, 'data', 'naming-date-exclusions.json')

async function loadNamingDateExclusions() {
  try {
    const raw = JSON.parse(await readFile(NAMING_DATE_EXCLUSIONS, 'utf8'))
    return normalizeNamingDateExclusions(raw)
  } catch {
    return normalizeNamingDateExclusions({})
  }
}

export async function rebuildStreetNaming(options = {}) {
  const [events, sourceRaw, namingDateExclusions] = await Promise.all([
    options.events ?? loadMasterEvents({ allowMissing: false }),
    readFile(options.sourcePath ?? SOURCE_PATH, 'utf8').then(JSON.parse),
    options.namingDateExclusions ?? loadNamingDateExclusions(),
  ])

  if (!events.length) {
    throw new Error('No events in data/master/street-events.json')
  }

  const aggregates = aggregateByStreet(events, { namingDateExclusions })
  const { enriched, joinStats } = enrichGeojson(sourceRaw, aggregates, {
    geojsonName: 'HK_Streets_Combined',
    namingDateExclusions,
  })

  await mkdir(path.dirname(GEOJSON_OUTPUT), { recursive: true })
  await writeFile(GEOJSON_OUTPUT, `${JSON.stringify(enriched)}\n`)

  const qa = {
    generated_at: new Date().toISOString(),
    master_events: events.length,
    street_aggregates: aggregates.length,
    streets_with_naming_year: aggregates.filter((aggregate) => aggregate.canonical_naming_year).length,
    join_stats: joinStats,
    sources: Object.fromEntries(
      [...new Set(events.map((event) => event.source ?? 'unknown'))].map((source) => [
        source,
        events.filter((event) => (event.source ?? 'unknown') === source).length,
      ]),
    ),
  }
  await mkdir(path.dirname(pipelinePaths.combinedQa), { recursive: true })
  await writeFile(pipelinePaths.combinedQa, `${JSON.stringify(qa, null, 2)}\n`)

  return { events, aggregates, joinStats, qa }
}

async function main() {
  const { qa } = await rebuildStreetNaming()
  console.log('Rebuilt naming data from data/master/street-events.json:')
  console.log(`  Master events: ${qa.master_events}`)
  console.log(`  Street aggregates: ${qa.street_aggregates}`)
  console.log(`  Streets with naming year: ${qa.streets_with_naming_year}`)
  console.log(`  GeoJSON: ${GEOJSON_OUTPUT}`)
  console.log('\nRun: npm run report:pending-years')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
