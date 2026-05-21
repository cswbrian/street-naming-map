#!/usr/bin/env node
/**
 * Parse eGazette street-naming PDFs: extract text, structure via OpenRouter, write events JSON.
 */

import { appendFile, access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExtractionWithLlm } from './lib/egazette-llm-parse.mjs'
import { parseExtractionWithRegex } from './lib/egazette-regex-parse.mjs'
import { PILOT_NOTICE_KEYS } from './lib/egazette-pilot-notices.mjs'

export { PILOT_NOTICE_KEYS }
import {
  EGAZETTE_PATHS,
  appendParsedProgress,
  extractNoticeText,
  loadCachedExtraction,
  loadManifest,
  loadParsedProgress,
  noticeKey,
  pdfPathsForNoticeKey,
  saveCachedExtraction,
} from './lib/egazette-pdf-text.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const PARSED_OUTPUT = path.join(projectRoot, 'data', 'egazette', 'parsed', 'egazette-street-events.json')
const PARSED_PILOT_OUTPUT = path.join(
  projectRoot,
  'data',
  'egazette',
  'parsed',
  'egazette-street-events-pilot.json',
)
const FAILURES_CSV = path.join(projectRoot, 'data', 'egazette', 'progress', 'parse-failures.csv')

function parseArgs(argv) {
  const opts = {
    pilot: false,
    resume: true,
    extractOnly: false,
    skipLlm: false,
    useRegex: false,
    llmRemaining: false,
    limit: 0,
    noticeKeys: null,
    playwrightFallback: false,
    model: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--pilot') opts.pilot = true
    else if (arg === '--no-resume') opts.resume = false
    else if (arg === '--extract-only') opts.extractOnly = true
    else if (arg === '--skip-llm') opts.skipLlm = true
    else if (arg === '--use-regex') opts.useRegex = true
    else if (arg === '--llm-remaining') opts.llmRemaining = true
    else if (arg === '--playwright-fallback') opts.playwrightFallback = true
    else if (arg === '--limit' && argv[i + 1]) opts.limit = Number(argv[++i])
    else if (arg === '--notice-key' && argv[i + 1]) {
      opts.noticeKeys = [argv[++i]]
    }
    else if (arg === '--model' && argv[i + 1]) opts.model = argv[++i]
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/parse-egazette-pdfs.mjs [options]

Options:
  --pilot              Parse the 10-notice pilot set (post-2016 validation + 1 pre-2016)
  --notice-key <key>   Parse a single notice (e.g. 2026-30-17-2370-0)
  --limit <n>          Cap number of notices to process
  --no-resume          Re-process notices already in parsed.csv
  --extract-only       Only cache PDF text extractions (no LLM)
  --skip-llm           Extract text only, skip OpenRouter
  --use-regex          Parse with regex (no API cost; lower accuracy)
  --llm-remaining      LLM-parse only notices missing from existing parsed JSON (merge)
  --playwright-fallback  Use Playwright textLayer if pdfjs fails
  --model <id>         OpenRouter model override

Requires OPENROUTER_API_KEY unless --extract-only or --skip-llm.
`)
      process.exit(0)
    }
  }
  return opts
}

async function logFailure(noticeKeyValue, stage, error) {
  await mkdir(path.dirname(FAILURES_CSV), { recursive: true })
  let header = ''
  try {
    await import('node:fs/promises').then((fs) => fs.access(FAILURES_CSV))
  } catch {
    header = 'notice_key,stage,error,ts\n'
  }
  const line = `${noticeKeyValue},${stage},"${String(error).replaceAll('"', '""')}",${new Date().toISOString()}\n`
  await appendFile(FAILURES_CSV, header + line)
}

async function loadDotEnv() {
  for (const name of ['.env.local', '.env']) {
    try {
      const raw = await readFile(path.join(projectRoot, name), 'utf8')
      for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq < 0) continue
        const key = trimmed.slice(0, eq).trim()
        let value = trimmed.slice(eq + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (!process.env[key]) process.env[key] = value
      }
    } catch {
      // optional env file
    }
  }
}

async function listAllNoticeKeys() {
  const enFiles = await readdir(EGAZETTE_PATHS.pdfEn).catch(() => [])
  return enFiles.filter((f) => f.endsWith('-en.pdf')).map((f) => f.replace(/-en\.pdf$/, '-0'))
}

async function loadExistingParsedEvents(outputPath) {
  try {
    await access(outputPath)
    const raw = await readFile(outputPath, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data.events) ? data.events : data
  } catch {
    return []
  }
}

async function resolveRemainingNoticeKeys(outputPath) {
  const existing = await loadExistingParsedEvents(outputPath)
  const withEvents = new Set(existing.map((e) => e.notice_key).filter(Boolean))
  const allKeys = await listAllNoticeKeys()
  return allKeys.filter((k) => !withEvents.has(k))
}

async function main() {
  await loadDotEnv()
  const opts = parseArgs(process.argv.slice(2))
  const manifest = await loadManifest()
  const manifestByKey = new Map(manifest.map((n) => [noticeKey(n), n]))

  const outputPath = opts.pilot ? PARSED_PILOT_OUTPUT : PARSED_OUTPUT
  let existingEvents = []

  let keys = opts.noticeKeys ?? (opts.pilot ? PILOT_NOTICE_KEYS : [...manifestByKey.keys()])

  if (opts.llmRemaining) {
    existingEvents = await loadExistingParsedEvents(outputPath)
    keys = await resolveRemainingNoticeKeys(outputPath)
    console.log(`LLM remaining: ${keys.length} notices without parsed events`)
  } else if (!opts.pilot && !opts.noticeKeys) {
    keys = (await listAllNoticeKeys()).filter((k) => manifestByKey.has(k) || pdfPathsForNoticeKey(k))
  }

  if (opts.limit > 0) keys = keys.slice(0, opts.limit)

  if (opts.llmRemaining && !opts.useRegex && !process.env.OPENROUTER_API_KEY) {
    throw new Error(
      'OPENROUTER_API_KEY is required for --llm-remaining. Add it to .env.local in the project root or export it in your shell.',
    )
  }

  const llmDelayMs = opts.llmRemaining ? 400 : 0
  const done = opts.resume && !opts.llmRemaining ? await loadParsedProgress() : new Set()
  const newEvents = []
  const summary = {
    processed: 0,
    skipped: 0,
    extracted: 0,
    parsed: 0,
    failed: 0,
    events_total: 0,
  }

  for (const key of keys) {
    if (opts.resume && done.has(key) && !opts.noticeKeys) {
      summary.skipped += 1
      continue
    }

    summary.processed += 1
    console.log(`\n[${summary.processed}/${keys.length}] ${key}`)

    try {
      let extraction = await loadCachedExtraction(key)
      if (!extraction?.text_en && !extraction?.text_zh) {
        extraction = await extractNoticeText(key, {
          playwrightFallback: opts.playwrightFallback,
          manifest,
        })
        await saveCachedExtraction(extraction)
        summary.extracted += 1
      }

      if (!extraction.text_en && !extraction.text_zh) {
        throw new Error('No text extracted from EN or ZH PDF')
      }

      console.log(`  text: en=${extraction.text_en.length} zh=${extraction.text_zh.length} chars`)

      if (opts.extractOnly || opts.skipLlm) {
        await appendParsedProgress(key)
        continue
      }

      const noticeMeta = manifestByKey.get(key) ?? parseNoticeKeyMeta(key)
      const pdfPaths = pdfPathsForNoticeKey(key)
      const useRegex = opts.useRegex
      if (!useRegex && !process.env.OPENROUTER_API_KEY) {
        throw new Error(
          'OPENROUTER_API_KEY is not set. Export it or pass --use-regex for free (lower-accuracy) parsing.',
        )
      }
      if (useRegex) console.log('  parser: regex')
      else console.log('  parser: openrouter')
      if (llmDelayMs > 0) await new Promise((r) => setTimeout(r, llmDelayMs))
      const events = useRegex
        ? parseExtractionWithRegex(extraction, noticeMeta, { pdfPaths })
        : await parseExtractionWithLlm(extraction, noticeMeta, {
            model: opts.model,
            pdfPaths,
          })
      newEvents.push(...events)
      summary.parsed += 1
      summary.events_total += events.length
      console.log(`  events: ${events.length}`)
      if (!opts.llmRemaining) await appendParsedProgress(key)
    } catch (error) {
      summary.failed += 1
      console.error(`  FAIL: ${error.message}`)
      await logFailure(key, 'parse', error.message)
    }
  }

  const mergedEvents = opts.llmRemaining ? [...existingEvents, ...newEvents] : newEvents
  if (mergedEvents.length) {
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          count: mergedEvents.length,
          regex_events: opts.llmRemaining ? existingEvents.length : undefined,
          llm_events_added: opts.llmRemaining ? newEvents.length : undefined,
          events: mergedEvents,
        },
        null,
        2,
      )}\n`,
    )
    console.log(`\nWrote ${mergedEvents.length} events to ${outputPath}`)
    if (opts.llmRemaining) {
      console.log(`  kept ${existingEvents.length} regex events, added ${newEvents.length} LLM events`)
    }
  }

  console.log('\nSummary:', JSON.stringify(summary, null, 2))
  if (summary.failed > 0) process.exitCode = 1
}

function parseNoticeKeyMeta(key) {
  const match = key.match(/^(\d+)-(\d+)-(\d+)-(\d+)-(\d+)$/)
  if (!match) return { notice_no: '0' }
  const [, year, volume, gno, noticeNo, extra] = match
  return { year: Number(year), volume: Number(volume), gno: Number(gno), notice_no: noticeNo, extra: Number(extra) }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
