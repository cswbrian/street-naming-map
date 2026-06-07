#!/usr/bin/env node
/**
 * Merge eGazette-parsed events into the master file and rebuild the map.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { applyFooterPublicationDate } from './lib/egazette-dates.mjs'
import { EGAZETTE_PATHS } from './lib/egazette-pdf-text.mjs'
import { pipelinePaths, projectRoot, publicPaths } from './lib/data-paths.mjs'
import {
  classifyEgazetteEvent,
  filterExcludedEvents,
  normalizeNamingDateExclusions,
} from './lib/street-naming-core.mjs'
import {
  loadMasterEvents,
  mergeMasterEvents,
  saveMasterEvents,
} from './lib/master-street-events.mjs'
import { rebuildStreetNaming } from './rebuild-street-naming.mjs'

const EGAZETTE_EVENTS = path.join(projectRoot, 'data', 'egazette', 'parsed', 'egazette-street-events.json')
const EGAZETTE_PILOT_EVENTS = path.join(
  projectRoot,
  'data',
  'egazette',
  'parsed',
  'egazette-street-events-pilot.json',
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

  const [master, egazetteRaw, namingDateExclusions] = await Promise.all([
    loadMasterEvents(),
    readFile(egazettePath, 'utf8').then(JSON.parse),
    loadNamingDateExclusions(),
  ])

  const extractionMap = await loadExtractionMap()
  const rawEgazetteEvents = egazetteRaw.events ?? egazetteRaw
  const datedEgazetteEvents = refreshEgazetteDates(rawEgazetteEvents, extractionMap)
  const egazetteEvents = filterExcludedEvents(
    datedEgazetteEvents.map(classifyEgazetteEvent),
    namingDateExclusions,
  )

  const datesChanged = datedEgazetteEvents.some(
    (event, index) => event.publication_date !== rawEgazetteEvents[index]?.publication_date,
  )
  if (!opts.usePilot && datesChanged) {
    await writeFile(
      egazettePath,
      `${JSON.stringify({ ...egazetteRaw, events: datedEgazetteEvents, generated_at: new Date().toISOString() }, null, 2)}\n`,
    )
  }

  const nextMaster = mergeMasterEvents(master, egazetteEvents)
  await saveMasterEvents(nextMaster)

  const { qa } = await rebuildStreetNaming({
    events: nextMaster,
    namingDateExclusions,
  })

  console.log('Imported eGazette events into data/master/street-events.json:')
  console.log(`  eGazette events imported: ${egazetteEvents.length}`)
  console.log(`  Master events: ${nextMaster.length}`)
  console.log(`  Streets with naming year: ${qa.streets_with_naming_year}`)
  console.log('\nRun: npm run report:pending-years')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
