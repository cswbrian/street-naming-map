#!/usr/bin/env node
/**
 * Publish crowd-submitted gazette PDFs from batch-inbox to public/egazette.
 *
 * Usage:
 *   node scripts/publish-crowd-gazette-pdfs.mjs [--update-data]
 */

import { access, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildSelfHostedPdfUrlsFromStem,
  parseEgazetteArchiveFilename,
} from './lib/egazette-pdf-urls.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const BATCH_INBOX = path.join(projectRoot, 'data', 'crowdsubmissions', 'batch-inbox')
const PUBLIC_EN = path.join(projectRoot, 'public', 'egazette', 'en')
const PUBLIC_ZH = path.join(projectRoot, 'public', 'egazette', 'zh')
const APPROVED_EVENTS = path.join(
  projectRoot,
  'data',
  'crowdsubmissions',
  'street-events-approved.json',
)
const NAME_HISTORY_EVENTS = path.join(
  projectRoot,
  'data',
  'crowdsubmissions',
  'street-name-history.json',
)
const BATCH_CSV = path.join(projectRoot, 'data', 'crowdsubmissions', 'batch-approved.csv')

function parseArgs(argv) {
  return { updateData: argv.includes('--update-data') }
}

async function walkPdfFiles(dir) {
  const results = []
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await walkPdfFiles(fullPath)))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      results.push(fullPath)
    }
  }
  return results
}

export async function publishCrowdGazettePdfs(options = {}) {
  const pdfFiles = await walkPdfFiles(options.inboxDir ?? BATCH_INBOX)
  const stems = new Map()
  let copied = 0

  await mkdir(PUBLIC_EN, { recursive: true })
  await mkdir(PUBLIC_ZH, { recursive: true })

  for (const src of pdfFiles) {
    let parsed = parseEgazetteArchiveFilename(src)
    if (!parsed) {
      const batchId = path.basename(path.dirname(src))
      parsed = parseEgazetteArchiveFilename(`${batchId}.pdf`)
    }
    if (!parsed) {
      console.warn(`Skipping unrecognized PDF name: ${src}`)
      continue
    }

    const destDir = parsed.type === 'egn' ? PUBLIC_EN : PUBLIC_ZH
    const dest = path.join(destDir, `${parsed.stem}.pdf`)
    await copyFile(src, dest)
    copied += 1

    const batchId = path.basename(path.dirname(src))
    const urls = buildSelfHostedPdfUrlsFromStem(parsed.stem)
    const existing = stems.get(parsed.stem)
    if (existing) {
      existing.batch_ids.add(batchId)
    } else {
      stems.set(parsed.stem, {
        ...parsed,
        urls,
        src,
        batch_ids: new Set([batchId]),
      })
    }
  }

  return { copied, stems }
}

function findStemEntryForEvent(event, stemMap) {
  const noticeNo = String(event.notice_no ?? '').replace(/^GN/i, '')
  for (const entry of stemMap.values()) {
    if (entry.notice_no === noticeNo) return entry
  }

  const submissionId = String(event.submission_id ?? '')
  const batchHint = submissionId.match(/(\d{4}-gn\d+)/i)?.[1]
  if (batchHint) {
    for (const entry of stemMap.values()) {
      if (entry.batch_ids?.has(batchHint)) return entry
    }
  }

  return null
}

async function updateCrowdEventFile(filePath, stemMap) {
  let events = []
  try {
    events = JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return 0
  }
  if (!Array.isArray(events)) return 0

  let updated = 0
  for (const event of events) {
    const stemEntry = findStemEntryForEvent(event, stemMap)
    if (!stemEntry) continue

    const nextEn = stemEntry.urls.en
    const nextZh = stemEntry.urls.zh
    if (
      nextEn !== event.government_notice_url_en ||
      nextZh !== event.government_notice_url_zh
    ) {
      event.government_notice_url_en = nextEn
      event.government_notice_url_zh = nextZh
      event.notice_stem = stemEntry.stem
      updated += 1
    }
  }

  if (updated) {
    await writeFile(filePath, `${JSON.stringify(events, null, 2)}\n`)
  }
  return updated
}

async function updateApprovedEvents(stemMap) {
  return updateCrowdEventFile(APPROVED_EVENTS, stemMap)
}

async function updateBatchCsv(stemMap) {
  let text = ''
  try {
    text = await readFile(BATCH_CSV, 'utf8')
  } catch {
    return 0
  }

  const lines = text.trim().split(/\r?\n/)
  if (lines.length <= 1) return 0

  const hostedByNotice = new Map()
  for (const entry of stemMap.values()) {
    hostedByNotice.set(entry.notice_no, entry.urls.en)
  }

  let updated = 0
  const nextLines = [lines[0]]
  for (const line of lines.slice(1)) {
    const externalMatch = line.match(/https:\/\/egazette\.gld\.gov\.hk[^,]*/)
    let hosted = null

    const submissionMatch = line.match(/(\d{4}-gn\d+)-[^,]*/)
    if (submissionMatch) {
      for (const entry of stemMap.values()) {
        if (entry.batch_ids?.has(submissionMatch[1])) {
          hosted = entry.urls.en
          break
        }
      }
    }

    if (!hosted) {
      const labelMatch = line.match(/G\.N\.(\d+)/)
      hosted = labelMatch ? hostedByNotice.get(labelMatch[1]) : null
    }

    if (hosted && externalMatch && externalMatch[0] !== hosted) {
      nextLines.push(line.replace(externalMatch[0], hosted))
      updated += 1
    } else {
      nextLines.push(line)
    }
  }

  if (updated) {
    await writeFile(BATCH_CSV, `${nextLines.join('\n')}\n`)
  }
  return updated
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  try {
    await access(BATCH_INBOX)
  } catch {
    console.error(`Missing ${BATCH_INBOX}`)
    process.exit(1)
  }

  const { copied, stems } = await publishCrowdGazettePdfs()
  console.log(`Published ${copied} crowd gazette PDF(s) to public/egazette/`)

  for (const entry of stems.values()) {
    console.log(`  ${entry.stem}: ${entry.urls.en}`)
  }

  if (opts.updateData) {
    const eventsUpdated = await updateApprovedEvents(stems)
    const historyUpdated = await updateCrowdEventFile(NAME_HISTORY_EVENTS, stems)
    const csvUpdated = await updateBatchCsv(stems)
    console.log(`Updated ${eventsUpdated} approved event URL(s)`)
    console.log(`Updated ${historyUpdated} name-history event URL(s)`)
    console.log(`Updated ${csvUpdated} batch CSV row URL(s)`)
    console.log('Run: npm run merge:crowd && npm run report:pending-years')
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
