#!/usr/bin/env node
/**
 * Apply centreline link updates from JSON.
 *
 * Usage:
 *   node scripts/apply-street-links.mjs path/to/links.json
 *   npm run apply:street-links -- data/linker/inbox/example.json
 *
 * Input: { "links": [ { timeline_id, street_code, event_ids, status, ... } ] }
 *    or: [ { ... }, ... ]
 */

import { readFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadCentrelineMap,
  saveCentrelineMap,
  upsertCentrelineLinks,
  validateCentrelineMap,
  enrichCentrelineLinkHints,
} from './lib/street-centreline-map.mjs'
import { loadMasterEvents } from './lib/master-street-events.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

function parseArgs(argv) {
  const file = argv.find((a) => !a.startsWith('-'))
  if (!file) {
    console.error('Usage: node scripts/apply-street-links.mjs <links.json>')
    process.exit(1)
  }
  return path.resolve(file)
}

async function main() {
  const filePath = parseArgs(process.argv.slice(2))
  const raw = JSON.parse(await readFile(filePath, 'utf8'))
  const incoming = Array.isArray(raw) ? raw : (raw.links ?? [])
  if (!incoming.length) {
    console.error('No links in input')
    process.exit(1)
  }

  const existing = await loadCentrelineMap({ allowMissing: true })
  const events = await loadMasterEvents()
  const eventById = new Map(
    events.map((event) => [String(event.event_id ?? '').trim(), event]).filter(([id]) => id),
  )
  const resolveNames = (hint) => {
    for (const rawId of hint.event_ids ?? []) {
      const event = eventById.get(String(rawId).trim())
      if (!event) continue
      const en = String(event.street_name_en ?? '').trim()
      const zh = String(event.street_name_zh ?? '').trim()
      if (en || zh) return { en, zh }
    }
    return { en: null, zh: null }
  }
  const enriched = enrichCentrelineLinkHints(incoming, existing, resolveNames)
  const merged = upsertCentrelineLinks(existing, enriched)
  const validation = validateCentrelineMap(merged)
  if (!validation.valid) {
    console.error('Validation failed:', validation.errors)
    process.exit(1)
  }

  await saveCentrelineMap(merged)
  console.log(`Applied ${incoming.length} link update(s). Total links: ${merged.links.length}`)

  if (validation.warnings.length) {
    console.log('Warnings:', validation.warnings)
  }

  execSync('npm run rebuild:naming && npm run report:pending-years && npm run report:street-timelines && npm run report:unmapped-events', {
    cwd: projectRoot,
    stdio: 'inherit',
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
