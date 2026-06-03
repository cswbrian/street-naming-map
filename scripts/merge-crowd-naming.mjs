#!/usr/bin/env node
/**
 * Merge approved crowdsubmitted events into combined naming data and GeoJSON.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aggregateByStreet,
  enrichGeojson,
  filterExcludedEvents,
  mergeEvents,
  normalizeNamingDateExclusions,
} from './lib/street-naming-core.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const SOURCE_PATH = path.join(
  projectRoot,
  'Transportation_RoadCentreline_20260601.gdb_converted.geojson',
)
const GEOJSON_OUTPUT = path.join(projectRoot, 'public', 'data', 'hk-streets.geojson')
const MASTER_DIR = path.join(projectRoot, 'public', 'data', 'master')
const COMBINED_EVENTS = path.join(MASTER_DIR, 'street-events-combined.json')
const COMBINED_AGGREGATES = path.join(MASTER_DIR, 'street-aggregates-combined.json')
const LANDSD_EVENTS = path.join(MASTER_DIR, 'landsd-street-events-2016plus.json')
const CROWD_APPROVED = path.join(projectRoot, 'data', 'crowdsubmissions', 'street-events-approved.json')
const CROWD_NAME_HISTORY = path.join(
  projectRoot,
  'data',
  'crowdsubmissions',
  'street-name-history.json',
)
const NAMING_DATE_EXCLUSIONS = path.join(projectRoot, 'data', 'naming-date-exclusions.json')

async function loadNamingDateExclusions() {
  try {
    const raw = JSON.parse(await readFile(NAMING_DATE_EXCLUSIONS, 'utf8'))
    return normalizeNamingDateExclusions(raw)
  } catch {
    return normalizeNamingDateExclusions({})
  }
}

async function loadJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

async function main() {
  const [combinedExisting, landsdFallback, crowdRaw, crowdHistoryRaw, sourceRaw, namingDateExclusions] =
    await Promise.all([
      loadJson(COMBINED_EVENTS, null),
      loadJson(LANDSD_EVENTS, []),
      loadJson(CROWD_APPROVED, []),
      loadJson(CROWD_NAME_HISTORY, []),
      readFile(SOURCE_PATH, 'utf8').then(JSON.parse),
      loadNamingDateExclusions(),
    ])

  const crowdEvents = [
    ...(Array.isArray(crowdRaw) ? crowdRaw : []),
    ...(Array.isArray(crowdHistoryRaw) ? crowdHistoryRaw : []),
  ]
  if (!crowdEvents.length) {
    console.log('No crowd events at', CROWD_APPROVED, 'or', CROWD_NAME_HISTORY)
    console.log('Run: npm run import:crowdsubmissions or apply-crowd-batch with history')
    return
  }

  const baseEvents = Array.isArray(combinedExisting) ? combinedExisting : landsdFallback
  const landsd = filterExcludedEvents(
    baseEvents.filter((e) => e.source === 'landsd'),
    namingDateExclusions,
  )
  const egazette = filterExcludedEvents(
    baseEvents.filter((e) => e.source === 'egazette_pdf'),
    namingDateExclusions,
  )
  const combined = mergeEvents(landsd, egazette, crowdEvents)
  const aggregates = aggregateByStreet(combined, { namingDateExclusions })

  const { enriched, joinStats } = enrichGeojson(sourceRaw, aggregates, {
    geojsonName: 'HK_Streets_Combined',
    namingDateExclusions,
  })

  await mkdir(MASTER_DIR, { recursive: true })
  await mkdir(path.dirname(GEOJSON_OUTPUT), { recursive: true })

  await writeFile(COMBINED_EVENTS, `${JSON.stringify(combined, null, 2)}\n`)
  await writeFile(COMBINED_AGGREGATES, `${JSON.stringify(aggregates, null, 2)}\n`)
  await writeFile(GEOJSON_OUTPUT, `${JSON.stringify(enriched)}\n`)

  const qa = {
    generated_at: new Date().toISOString(),
    counts: {
      crowd_events_merged: crowdEvents.length,
      combined_events: combined.length,
      street_aggregates: aggregates.length,
      streets_with_naming_year: aggregates.filter((a) => a.canonical_naming_year).length,
    },
    join_stats: joinStats,
  }
  await writeFile(path.join(MASTER_DIR, 'combined-naming-qa.json'), `${JSON.stringify(qa, null, 2)}\n`)

  console.log('Merged crowd naming data:')
  console.log(`  Crowd events: ${crowdEvents.length}`)
  console.log(`  Combined events: ${combined.length}`)
  console.log(`  Streets with naming year: ${qa.counts.streets_with_naming_year}`)
  console.log(`  GeoJSON: ${GEOJSON_OUTPUT}`)
  console.log('\nRun: npm run report:pending-years')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
