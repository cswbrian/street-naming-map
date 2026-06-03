#!/usr/bin/env node
/**
 * Reclassify egazette_pdf events stuck at evidence_kind unknown (待分類).
 * Reads notice PDFs → gazette_primary or gazette_inferred + derived_from.
 *
 * Usage:
 *   node scripts/classify-unknown-egazette.mjs [--dry-run] [--write-batches]
 */
import { execSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyEgazetteNoticeText } from './lib/egazette-evidence-classify.mjs'
import { buildSelfHostedPdfUrls } from './lib/egazette-pdf-urls.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const COMBINED = path.join(projectRoot, 'public/data/master/street-events-combined.json')
const GEOJSON = path.join(projectRoot, 'public/data/hk-streets.geojson')
const REVIEW_PATH = path.join(projectRoot, 'data/crowdsubmissions/unknown-egazette-review.json')
const BATCH_DIR = path.join(projectRoot, 'data/crowdsubmissions/batches')

const dryRun = process.argv.includes('--dry-run')
const writeBatches = process.argv.includes('--write-batches')

function pdfTextFromStem(stem) {
  const pdfPath = path.join(projectRoot, 'public/egazette/en', `${stem}.pdf`)
  try {
    return execSync(
      `python3 -c "import pypdf; r=pypdf.PdfReader('${pdfPath.replace(/'/g, "'\\''")}'); print(''.join((p.extract_text() or '') for p in r.pages[:4]))"`,
      { encoding: 'utf8', maxBuffer: 2_000_000 },
    )
  } catch {
    return null
  }
}

async function loadGeoByZh() {
  const geo = JSON.parse(await readFile(GEOJSON, 'utf8'))
  const map = new Map()
  for (const f of geo.features ?? []) {
    const zh = String(f.properties?.CHINESESTREETNAME ?? '').trim()
    const en = String(f.properties?.ENGLISHSTREETNAME ?? '').trim()
    if (zh) map.set(zh, { en, code: String(f.properties?.STREETCODE ?? '').trim() })
  }
  return map
}

function evidenceLevelFromKind(kind) {
  if (kind === 'gazette_primary' || kind === 'gazette_inferred') return 'gazette'
  return 'historical'
}

async function main() {
  const [events, geoByZh] = await Promise.all([
    readFile(COMBINED, 'utf8').then(JSON.parse),
    loadGeoByZh(),
  ])

  const targets = events.filter(
    (e) =>
      e.source === 'egazette_pdf' &&
      (e.evidence_kind === 'unknown' || !e.evidence_kind) &&
      e.notice_key,
  )

  const byNoticeKey = new Map()
  for (const event of targets) {
    const key = event.notice_key
    if (!byNoticeKey.has(key)) byNoticeKey.set(key, [])
    byNoticeKey.get(key).push(event)
  }

  const textCache = new Map()
  const review = { primary: [], inferred: [], uncertain: [], skipped: [] }
  const batchStreets = new Map()

  let changed = 0

  for (const [noticeKey, group] of byNoticeKey.entries()) {
    const stem = noticeKey.replace(/-\d+$/, '')
    if (!textCache.has(stem)) {
      textCache.set(stem, pdfTextFromStem(stem))
    }
    const text = textCache.get(stem)
    if (!text) {
      for (const event of group) {
        review.skipped.push({ event_id: event.event_id, reason: 'pdf_text_failed', notice_key: noticeKey })
      }
      continue
    }

    for (const event of group) {
      const hosted = buildSelfHostedPdfUrls(noticeKey)
      const draft = {
        ...event,
        government_notice_url_en: event.government_notice_url_en ?? hosted.en,
        government_notice_url_zh: event.government_notice_url_zh ?? hosted.zh,
      }
      const result = classifyEgazetteNoticeText(text, draft, geoByZh)

      if (result.evidence_kind === 'unknown') {
        review.uncertain.push({
          event_id: event.event_id,
          street_name_en: event.street_name_en,
          street_name_zh: event.street_name_zh,
          notice_key: noticeKey,
          match: result.match,
        })
        continue
      }

      const next = {
        ...event,
        evidence_kind: result.evidence_kind,
        evidence_level: evidenceLevelFromKind(result.evidence_kind),
        publication_date: result.publication_date ?? event.publication_date,
        year_bucket: result.publication_date
          ? Number(String(result.publication_date).slice(0, 4))
          : event.year_bucket,
        derived_from: result.derived_from,
        government_notice_url_en: draft.government_notice_url_en,
        government_notice_url_zh: draft.government_notice_url_zh,
      }

      const row = {
        event_id: event.event_id,
        street_name_en: event.street_name_en,
        street_name_zh: event.street_name_zh,
        notice_key: noticeKey,
        match: result.match,
        evidence_kind: result.evidence_kind,
        publication_date: next.publication_date,
        cited: result.cited_notice_label ?? null,
      }

      if (result.evidence_kind === 'gazette_primary') review.primary.push(row)
      else review.inferred.push(row)

      if (!dryRun) {
        const idx = events.findIndex((e) => e.event_id === event.event_id)
        if (idx >= 0) {
          events[idx] = next
          changed += 1
        }
      }

      if (writeBatches && result.evidence_kind === 'gazette_inferred') {
        const code =
          geoByZh.get(String(event.street_name_zh ?? '').trim())?.code ??
          event.street_code ??
          ''
        const batchKey = `${next.publication_date?.slice(0, 4)}-${String(event.notice_no).toLowerCase()}-reclass`
        if (!batchStreets.has(batchKey)) {
          batchStreets.set(batchKey, {
            batch_id: batchKey,
            source: 'crowdsubmitted',
            gazette_notice_label: draft.government_notice_label_en,
            publication_date: draft.publication_date,
            gazette_url_en: draft.government_notice_url_en,
            gazette_url_zh: draft.government_notice_url_zh,
            remarks: `Reclassified from 待分類 via classify-unknown-egazette (${noticeKey}).`,
            evidence_schema_version: 1,
            streets: [],
          })
        }
        const geo = geoByZh.get(String(event.street_name_zh ?? '').trim())
        batchStreets.get(batchKey).streets.push({
          street_code: code,
          english_name: event.street_name_en ?? geo?.en ?? '',
          chinese_name: event.street_name_zh ?? '',
          history: [
            {
              publication_date: next.publication_date,
              change_kind: 'declare',
              street_name_en: event.street_name_en ?? geo?.en ?? null,
              street_name_zh: event.street_name_zh ?? null,
              gazette_notice_label: result.cited_notice_label ?? null,
              evidence_kind: 'gazette_inferred',
              is_declaration_event: true,
              derived_from: next.derived_from,
              event_role: 'current_name',
            },
          ],
        })
      }
    }
  }

  review.summary = {
    targets: targets.length,
    notices: byNoticeKey.size,
    primary: review.primary.length,
    inferred: review.inferred.length,
    uncertain: review.uncertain.length,
    skipped: review.skipped.length,
    changed: dryRun ? 0 : changed,
  }

  await mkdir(path.dirname(REVIEW_PATH), { recursive: true })
  await writeFile(REVIEW_PATH, `${JSON.stringify(review, null, 2)}\n`)

  if (!dryRun) {
    await writeFile(COMBINED, `${JSON.stringify(events, null, 2)}\n`)
  }

  if (writeBatches && !dryRun) {
    await mkdir(BATCH_DIR, { recursive: true })
    for (const batch of batchStreets.values()) {
      if (!batch.streets.length) continue
      await writeFile(
        path.join(BATCH_DIR, `${batch.batch_id}.json`),
        `${JSON.stringify(batch, null, 2)}\n`,
      )
    }
    console.log(`Wrote ${batchStreets.size} crowd batch(es) for inferred streets.`)
  }

  console.log(JSON.stringify(review.summary, null, 2))
  console.log(`Review log: ${REVIEW_PATH}`)
  if (review.uncertain.length) {
    console.log('Uncertain (need manual review):')
    for (const u of review.uncertain.slice(0, 20)) {
      console.log(`  ${u.street_name_zh ?? u.street_name_en ?? '?'} — ${u.match} (${u.notice_key})`)
    }
    if (review.uncertain.length > 20) console.log(`  … and ${review.uncertain.length - 20} more`)
  }
  if (!dryRun) {
    console.log('\nNext: npm run merge:crowd && npm run report:pending-years')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
