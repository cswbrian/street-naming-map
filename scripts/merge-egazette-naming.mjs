#!/usr/bin/env node
/**
 * Merge eGazette-parsed events with LandsD events, re-aggregate, enrich GeoJSON.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyFooterPublicationDate } from './lib/egazette-dates.mjs'
import { EGAZETTE_PATHS } from './lib/egazette-pdf-text.mjs'
import {
  aggregateByStreet,
  classifyEgazetteEvent,
  enrichGeojson,
  mergeEvents,
} from './lib/street-naming-core.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const SOURCE_PATH = path.join(
  projectRoot,
  'Transportation_RoadCentreline_20260402.gdb_converted.geojson',
)
const GEOJSON_OUTPUT = path.join(projectRoot, 'public', 'data', 'hk-streets.geojson')
const MASTER_DIR = path.join(projectRoot, 'public', 'data', 'master')
const LANDSD_EVENTS = path.join(MASTER_DIR, 'landsd-street-events-2016plus.json')
const EGAZETTE_EVENTS = path.join(projectRoot, 'data', 'egazette', 'parsed', 'egazette-street-events.json')
const EGAZETTE_PILOT_EVENTS = path.join(
  projectRoot,
  'data',
  'egazette',
  'parsed',
  'egazette-street-events-pilot.json',
)
const COMBINED_EVENTS = path.join(MASTER_DIR, 'street-events-combined.json')
const COMBINED_AGGREGATES = path.join(MASTER_DIR, 'street-aggregates-combined.json')

function parseArgs(argv) {
  const opts = { usePilot: false }
  for (const arg of argv) {
    if (arg === '--pilot') opts.usePilot = true
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/merge-egazette-naming.mjs [--pilot]

Merges parsed eGazette events with LandsD 2016+ events and regenerates hk-streets.geojson.
Default input: data/egazette/parsed/egazette-street-events.json
--pilot uses egazette-street-events-pilot.json instead.
`)
      process.exit(0)
    }
  }
  return opts
}

async function loadExtractionMap() {
  const map = new Map()
  let files = []
  try {
    files = await readdir(EGAZETTE_PATHS.extractions)
  } catch {
    return map
  }
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const data = JSON.parse(await readFile(path.join(EGAZETTE_PATHS.extractions, file), 'utf8'))
    if (data?.notice_key) map.set(data.notice_key, data)
  }
  return map
}

function refreshEgazetteDates(events, extractionMap) {
  return events.map((event) => {
    if (!event.notice_key) return event
    const extraction = extractionMap.get(event.notice_key)
    return extraction ? applyFooterPublicationDate(event, extraction) : event
  })
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const egazettePath = opts.usePilot ? EGAZETTE_PILOT_EVENTS : EGAZETTE_EVENTS

  const [landsd, egazetteRaw, sourceRaw] = await Promise.all([
    readFile(LANDSD_EVENTS, 'utf8').then(JSON.parse),
    readFile(egazettePath, 'utf8').then(JSON.parse),
    readFile(SOURCE_PATH, 'utf8').then(JSON.parse),
  ])

  const extractionMap = await loadExtractionMap()
  const rawEgazetteEvents = egazetteRaw.events ?? egazetteRaw
  const datedEgazetteEvents = refreshEgazetteDates(rawEgazetteEvents, extractionMap)
  const egazetteEvents = datedEgazetteEvents.map(classifyEgazetteEvent)

  const datesChanged = datedEgazetteEvents.some(
    (event, index) => event.publication_date !== rawEgazetteEvents[index]?.publication_date,
  )
  if (!opts.usePilot && datesChanged) {
    await writeFile(
      egazettePath,
      `${JSON.stringify({ ...egazetteRaw, events: datedEgazetteEvents, generated_at: new Date().toISOString() }, null, 2)}\n`,
    )
  }

  const combined = mergeEvents(landsd, egazetteEvents)
  const aggregates = aggregateByStreet(combined)

  const { enriched, joinStats } = enrichGeojson(sourceRaw, aggregates, {
    geojsonName: 'HK_Streets_Combined',
  })

  await mkdir(MASTER_DIR, { recursive: true })
  await mkdir(path.dirname(GEOJSON_OUTPUT), { recursive: true })

  await writeFile(COMBINED_EVENTS, `${JSON.stringify(combined, null, 2)}\n`)
  await writeFile(COMBINED_AGGREGATES, `${JSON.stringify(aggregates, null, 2)}\n`)
  await writeFile(GEOJSON_OUTPUT, `${JSON.stringify(enriched)}\n`)

  const qa = {
    generated_at: new Date().toISOString(),
    counts: {
      landsd_events: landsd.length,
      egazette_events: egazetteEvents.length,
      combined_events: combined.length,
      street_aggregates: aggregates.length,
      streets_with_naming_year: aggregates.filter((a) => a.canonical_naming_year).length,
    },
    join_stats: joinStats,
  }
  await writeFile(
    path.join(MASTER_DIR, 'combined-naming-qa.json'),
    `${JSON.stringify(qa, null, 2)}\n`,
  )

  console.log('Merged naming data:')
  console.log(`  LandsD events: ${landsd.length}`)
  console.log(`  eGazette events: ${egazetteEvents.length}`)
  console.log(`  Combined: ${combined.length}`)
  console.log(`  Aggregates with naming year: ${qa.counts.streets_with_naming_year}`)
  console.log(`  Join stats: ${JSON.stringify(joinStats)}`)
  console.log(`  GeoJSON: ${GEOJSON_OUTPUT}`)
  console.log('\nRun: npm run report:pending-years')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
