#!/usr/bin/env node
/**
 * Reclassify colonial gazette crowd events (1900–1939) from crowdsubmitted → hkgro.
 * Does not touch modern e-Gazette (1970s+) community submissions.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { reclassifyColonialCrowdEvent } from './lib/street-naming-core.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPROVED = path.join(ROOT, 'data/crowdsubmissions/street-events-approved.json')
const HISTORY = path.join(ROOT, 'data/crowdsubmissions/street-name-history.json')
const BATCHES_DIR = path.join(ROOT, 'data/crowdsubmissions/batches')

async function reclassifyJsonFile(filePath) {
  const raw = JSON.parse(await readFile(filePath, 'utf8'))
  if (!Array.isArray(raw)) throw new Error(`${filePath} is not a JSON array`)
  let changed = 0
  const next = raw.map((event) => {
    const updated = reclassifyColonialCrowdEvent(event)
    if (updated.source !== event.source) changed += 1
    return updated
  })
  if (changed) {
    await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`)
  }
  return changed
}

async function ensureBatchSources() {
  const files = (await readdir(BATCHES_DIR)).filter((f) => /^19\d{2}-/.test(f) && f.endsWith('.json'))
  let batchUpdates = 0
  for (const file of files) {
    const filePath = path.join(BATCHES_DIR, file)
    const batch = JSON.parse(await readFile(filePath, 'utf8'))
    if (batch.source === 'hkgro') continue
    batch.source = 'hkgro'
    await writeFile(filePath, `${JSON.stringify(batch, null, 2)}\n`)
    batchUpdates += 1
  }
  return batchUpdates
}

async function main() {
  const approvedChanged = await reclassifyJsonFile(APPROVED)
  const historyChanged = await reclassifyJsonFile(HISTORY)
  const batchUpdates = await ensureBatchSources()

  console.log(
    JSON.stringify(
      {
        approved_events_reclassified: approvedChanged,
        history_events_reclassified: historyChanged,
        batch_files_source_added: batchUpdates,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
