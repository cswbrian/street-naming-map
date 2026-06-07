#!/usr/bin/env node
/**
 * Reclassify colonial gazette crowd events (1900–1939) from crowdsubmitted → hkgro.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { reclassifyColonialCrowdEvent } from './lib/street-naming-core.mjs'
import { loadMasterEvents, saveMasterEvents } from './lib/master-street-events.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BATCHES_DIR = path.join(ROOT, 'data/crowdsubmissions/batches')

async function reclassifyMasterEvents() {
  const events = await loadMasterEvents()
  let changed = 0
  const next = events.map((event) => {
    const updated = reclassifyColonialCrowdEvent(event)
    if (updated.source !== event.source) changed += 1
    return updated
  })
  if (changed) await saveMasterEvents(next)
  return { changed, total: next.length }
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
  const { changed, total } = await reclassifyMasterEvents()
  const batchUpdates = await ensureBatchSources()

  console.log(
    JSON.stringify(
      {
        events_reclassified: changed,
        batch_files_source_added: batchUpdates,
        total_events: total,
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
