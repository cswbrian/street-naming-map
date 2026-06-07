#!/usr/bin/env node
/**
 * Rewrite legacy /street-naming-map/egazette/... paths to /egazette/... in data files.
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeStoredHostedPath } from './lib/egazette-pdf-urls.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

import { normalizeStoredHostedPath } from './lib/egazette-pdf-urls.mjs'

const TARGETS = [
  'data/master/street-events.json',
  'data/crowdsubmissions/batch-approved.csv',
  'public/data/master/verified-roads.json',
  'public/data/master/pending-roads.json',
  'public/data/master/pending-naming-years.csv',
]

function migrateValue(value) {
  if (typeof value === 'string') {
    return normalizeStoredHostedPath(value)
  }
  if (Array.isArray(value)) {
    return value.map(migrateValue)
  }
  if (value && typeof value === 'object') {
    const next = {}
    for (const [key, child] of Object.entries(value)) {
      next[key] = migrateValue(child)
    }
    return next
  }
  return value
}

async function migrateFile(relativePath) {
  const filePath = path.join(projectRoot, relativePath)
  let text
  try {
    text = await readFile(filePath, 'utf8')
  } catch {
    return { relativePath, updated: false, reason: 'missing' }
  }

  const before = text
  if (relativePath.endsWith('.json')) {
    const data = JSON.parse(text)
    const migrated = migrateValue(data)
    text = `${JSON.stringify(migrated, null, 2)}\n`
  } else {
    text = text.replace(/\/street-naming-map\/egazette/g, '/egazette')
    if (!text.endsWith('\n')) text += '\n'
  }

  const changed = text !== before
  if (changed) await writeFile(filePath, text)
  return { relativePath, updated: changed }
}

async function main() {
  const results = []
  for (const target of TARGETS) {
    results.push(await migrateFile(target))
  }

  const updated = results.filter((r) => r.updated)
  console.log(`Migrated ${updated.length} file(s):`)
  for (const { relativePath } of updated) console.log(`  ${relativePath}`)
  if (!updated.length) console.log('  (no changes needed)')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
