#!/usr/bin/env node
/**
 * Publish gazette notice index + corpus markdown for the Records UI.
 *
 * Usage:
 *   node scripts/build-gazette-records.mjs
 *   npm run build:gazette-records
 */

import { mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyHostedStem } from './lib/gazette-pdf-classify.mjs'
import { readCorpusBody, readCorpusMeta } from './lib/gazette-corpus.mjs'
import { publicPaths, projectRoot } from './lib/data-paths.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EGAZETTE_EN = path.join(projectRoot, 'public', 'egazette', 'en')
const OUTPUT_INDEX = path.join(projectRoot, 'public', 'data', 'master', 'gazette-notices.json')
const OUTPUT_CORPUS_DIR = path.join(projectRoot, 'public', 'data', 'corpus')

function stemFromNoticeUrl(url) {
  const text = String(url ?? '').trim()
  const m = text.match(/\/egazette\/(?:en|zh)\/([^/?#]+)\.pdf/i)
  return m ? m[1] : null
}

function normalizeNameKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function mergeStreetEntry(map, stem, entry) {
  const key = `${normalizeNameKey(entry.street_name_en)}|${normalizeNameKey(entry.street_name_zh)}`
  if (!map.has(stem)) map.set(stem, new Map())
  const inner = map.get(stem)
  if (!inner.has(key)) inner.set(key, entry)
}

async function loadLinkedStreetsByStem() {
  const byStem = new Map()
  try {
    const raw = await readFile(publicPaths.streetTimelines, 'utf8')
    const data = JSON.parse(raw)
    for (const tl of data.timelines ?? []) {
      const pageId = tl.page_id ?? null
      for (const ev of tl.name_history ?? []) {
        const stem =
          stemFromNoticeUrl(ev.notice_url_en) || stemFromNoticeUrl(ev.notice_url_zh)
        if (!stem) continue
        mergeStreetEntry(byStem, stem, {
          street_name_en: ev.name_en ?? tl.street_name_en ?? null,
          street_name_zh: ev.name_zh ?? tl.street_name_zh ?? null,
          page_id: pageId,
          source: 'verified',
        })
      }
    }
  } catch {
    /* street-timelines optional at build time */
  }
  return byStem
}

function draftWithLinks(drafts, linkedMap) {
  const linkedByEn = new Map()
  for (const row of linkedMap.values()) {
    const en = normalizeNameKey(row.street_name_en)
    if (en) linkedByEn.set(en, row.page_id)
  }
  return (drafts ?? []).map((row, index) => ({
    row_index: row.row_index ?? index + 1,
    street_name_en: row.street_name_en ?? null,
    street_name_zh: row.street_name_zh ?? null,
    page_id: linkedByEn.get(normalizeNameKey(row.street_name_en)) ?? null,
  }))
}

async function main() {
  const enFiles = await readdir(EGAZETTE_EN)
  const stems = enFiles.filter((f) => f.endsWith('.pdf')).map((f) => f.replace(/\.pdf$/, ''))
  stems.sort()

  const linkedByStem = await loadLinkedStreetsByStem()
  await mkdir(OUTPUT_CORPUS_DIR, { recursive: true })
  await mkdir(path.dirname(OUTPUT_INDEX), { recursive: true })

  const notices = []

  for (const stem of stems) {
    const classified = classifyHostedStem(stem, path.join(projectRoot, 'public', 'egazette'))
    const meta = (await readCorpusMeta(stem)) ?? {}
    const linkedMap = linkedByStem.get(stem) ?? new Map()
    const linkedStreets = [...linkedMap.values()]
    const drafts = draftWithLinks(meta.streets_draft, linkedMap)
    const body = await readCorpusBody(stem)
    const hasCorpus = body.length > 0

    if (hasCorpus) {
      await writeFile(path.join(OUTPUT_CORPUS_DIR, `${stem}.md`), `${body}\n`)
    }

    const publicationDate =
      meta.publication_date ??
      (stem.match(/^(\d{4})/) ? `${stem.match(/^(\d{4})/)[1]}-01-01` : null)

    notices.push({
      notice_stem: stem,
      gazette_notice_label_en: meta.gazette_notice_label ?? null,
      gazette_notice_label_zh: meta.gazette_notice_label ?? null,
      publication_date: publicationDate,
      format_family: meta.format_family ?? classified.format_family,
      pdf_en: classified.pdf_en,
      pdf_zh: classified.pdf_zh,
      has_corpus: hasCorpus,
      streets_draft_count: drafts.length,
      streets_draft: drafts,
      linked_street_count: linkedStreets.length,
      linked_streets: linkedStreets,
    })
  }

  notices.sort((a, b) => String(b.publication_date).localeCompare(String(a.publication_date)))

  const payload = {
    generated_at: new Date().toISOString(),
    count: notices.length,
    notices,
  }
  await writeFile(OUTPUT_INDEX, `${JSON.stringify(payload, null, 2)}\n`)

  const withCorpus = notices.filter((n) => n.has_corpus).length
  console.log(`Wrote ${OUTPUT_INDEX} (${notices.length} notices, ${withCorpus} with corpus body)`)
  console.log(`Corpus MD → ${OUTPUT_CORPUS_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
