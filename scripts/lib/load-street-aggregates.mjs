import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { projectRoot } from './data-paths.mjs'
import { loadMasterEvents } from './master-street-events.mjs'
import { loadCentrelineMap } from './street-centreline-map.mjs'
import {
  aggregateByCentrelineMap,
  normalizeNamingDateExclusions,
} from './street-naming-core.mjs'

const NAMING_DATE_EXCLUSIONS = path.join(projectRoot, 'data', 'naming-date-exclusions.json')

async function loadNamingDateExclusions() {
  try {
    const raw = JSON.parse(await readFile(NAMING_DATE_EXCLUSIONS, 'utf8'))
    return normalizeNamingDateExclusions(raw)
  } catch {
    return normalizeNamingDateExclusions({})
  }
}

/** Load events + centreline map → timeline aggregates for rebuild / report scripts. */
export async function loadStreetAggregates(options = {}) {
  const [events, centrelineMap, namingDateExclusions] = await Promise.all([
    options.events ?? loadMasterEvents({ allowMissing: options.allowMissing }),
    options.centrelineMap ?? loadCentrelineMap({ allowMissing: true }),
    options.namingDateExclusions ?? loadNamingDateExclusions(),
  ])

  const aggregates = aggregateByCentrelineMap(events, centrelineMap, { namingDateExclusions })
  return { events, centrelineMap, aggregates, namingDateExclusions }
}
