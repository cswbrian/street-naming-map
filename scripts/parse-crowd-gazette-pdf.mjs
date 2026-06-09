#!/usr/bin/env node
/**
 * Parse a crowd-submitted gazette PDF into draft batch JSON (verify before apply).
 *
 * Usage:
 *   node scripts/parse-crowd-gazette-pdf.mjs /path/to/notice.pdf
 *   node scripts/parse-crowd-gazette-pdf.mjs /path/to/notice.pdf --match
 *   node scripts/parse-crowd-gazette-pdf.mjs /path/to/notice.pdf --out data/crowdsubmissions/batches/draft.json
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPendingRoadKeys, matchRowToRoadKey } from './lib/crowd-submission-core.mjs'
import { makeStreetKey } from './lib/street-naming-core.mjs'
import { parseCrowdGazettePdf } from './lib/crowd-gazette-pdf-parse.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const BATCHES_DIR = path.join(projectRoot, 'data', 'crowdsubmissions', 'batches')

function parseArgs(argv) {
  const opts = { match: false, out: null, help: false }
  const positional = []
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg === '--match') opts.match = true
    else if (arg === '--out') {
      opts.out = argv[i + 1]
      i += 1
    } else if (!arg.startsWith('-')) positional.push(arg)
  }
  return { ...opts, pdf: positional[0] ?? null }
}

function findPendingRoad(street, pendingMap) {
  const roadKey = matchRowToRoadKey(street, pendingMap)
  if (roadKey && pendingMap.has(roadKey)) return pendingMap.get(roadKey)

  const streetKey = makeStreetKey(street.english_name, street.chinese_name)
  for (const road of pendingMap.values()) {
    if (makeStreetKey(road.english_name, road.chinese_name) === streetKey && streetKey !== '|') {
      return road
    }
  }
  return null
}

function printMatchTable(batch, pendingMap) {
  console.log('\nMatch preview (pending-naming-years):')
  console.log('─'.repeat(72))
  for (const street of batch.streets ?? []) {
    const road = findPendingRoad(street, pendingMap)
    const label = street.chinese_name || street.english_name
    if (road) {
      console.log(
        `  ✓ ${label} → link_street_code ${road.street_code ?? '?'} (${road.english_name ?? ''} / ${road.chinese_name ?? ''})`,
      )
    } else {
      console.log(`  ✗ ${label} → no match`)
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help || !opts.pdf) {
    console.log(`Usage: node scripts/parse-crowd-gazette-pdf.mjs <notice.pdf> [--match] [--out path.json]

Extracts G.N., publication date, street names, and location descriptions from a gazette PDF.
Image-only scans return status "needs_visual_parse" — read rendered pages and fill draft JSON.

Does not apply to the map. After you verify the draft:
  node scripts/apply-crowd-batch.mjs <draft.json>`)
    process.exit(opts.help ? 0 : 1)
  }

  const result = await parseCrowdGazettePdf(opts.pdf)
  if (result.status === 'needs_visual_parse') {
    console.log(JSON.stringify(result, null, 2))
    console.error(
      '\nNo extractable text — render pages and read visually, then write draft JSON or re-run apply skill with structured streets.',
    )
    process.exit(2)
  }

  const { batch } = result
  let outPath = opts.out
  if (!outPath) {
    await mkdir(BATCHES_DIR, { recursive: true })
    outPath = path.join(BATCHES_DIR, `${batch.batch_id}-draft.json`)
  } else {
    outPath = path.resolve(outPath)
    await mkdir(path.dirname(outPath), { recursive: true })
  }

  let pendingMap = null
  if (opts.match && batch.streets?.length) {
    pendingMap = await loadPendingRoadKeys(projectRoot)
    batch.streets = batch.streets.map((street) => {
      const road = findPendingRoad(street, pendingMap)
      if (!road?.street_code) return street
      return { ...street, link_street_code: String(road.street_code) }
    })
  }

  await writeFile(outPath, `${JSON.stringify(batch, null, 2)}\n`)
  console.log(`Draft batch: ${outPath}`)
  console.log(`  G.N.     ${batch.gazette_notice_label}`)
  console.log(`  Date     ${batch.publication_date ?? '(not detected)'}`)
  console.log(`  Source   ${batch.source}`)
  console.log(`  Streets  ${batch.streets?.length ?? 0}`)
  console.log(`  Parser   ${batch._parse?.parser ?? '—'} (${batch._parse?.method})`)

  if (pendingMap) {
    printMatchTable(batch, pendingMap)
  }

  console.log('\nFull draft JSON written. Verify names, date, and matches before apply-crowd-batch.')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
