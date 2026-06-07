#!/usr/bin/env node
/**
 * Reclassify crowd events at evidence_kind news (新聞).
 * Upgrades to gazette_primary / gazette_inferred when PDFs support it;
 * removes duplicate hk-place rows when a gazette_primary sibling exists.
 *
 * Usage:
 *   node scripts/classify-news-evidence.mjs [--dry-run]
 */
import { execSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyNewsCrowdEvent } from './lib/news-evidence-classify.mjs'

import { pipelinePaths, projectRoot, publicPaths } from './lib/data-paths.mjs'
import {
  loadMasterEvents,
  patchMasterEventById,
  removeMasterEventById,
  saveMasterEvents,
} from './lib/master-street-events.mjs'
import { classifyNewsCrowdEvent } from './lib/news-evidence-classify.mjs'

const MASTER = pipelinePaths.streetEvents
const BATCH_DIR = path.join(projectRoot, 'data/crowdsubmissions/batches')
const STEMS = publicPaths.noticeStems
const GEOJSON = publicPaths.geojson
const REVIEW_PATH = path.join(projectRoot, 'data/crowdsubmissions/news-evidence-review.json')

const dryRun = process.argv.includes('--dry-run')

/** Wrongly upgraded from 新聞 using extension-notice PDF dates (2026-06-04). */
const REVERT_HKPLACE_NEWS = [
  {
    event_id: 'crowd|2009-gn7995-hkplace-extensions-14299-2008-02-01',
    publication_date: '2008-02-01',
    year_bucket: 2008,
    submitter_remarks: 'Original naming per hk-place (2008); G.N.7995 is extension only.',
  },
  {
    event_id: 'crowd|2009-gn7995-hkplace-extensions-10332-2008-05-09',
    publication_date: '2008-05-09',
    year_bucket: 2008,
    submitter_remarks: 'Original naming per hk-place (2008); G.N.7995 is extension only.',
  },
  {
    event_id: 'crowd|2010-gn4562-choi-hing-wing-14296-2007-11-09',
    publication_date: '2007-11-09',
    year_bucket: 2007,
    submitter_remarks: 'Original naming per hk-place (2007); G.N.4562 is extension only.',
  },
  {
    event_id: 'crowd|2010-gn4562-choi-hing-wing-14308-2008-07-11',
    publication_date: '2008-07-11',
    year_bucket: 2008,
    submitter_remarks: 'Original naming per hk-place (2008); G.N.4562 is extension only.',
  },
]

function revertHkPlaceNewsPatch(spec) {
  return {
    publication_date: spec.publication_date,
    year_bucket: spec.year_bucket,
    evidence_kind: 'news',
    evidence_level: 'historical',
    notice_no: 'CROWD',
    government_notice_label_en: null,
    government_notice_label_zh: null,
    government_notice_url_en: null,
    government_notice_url_zh: null,
    derived_from: null,
    submitter_remarks: spec.submitter_remarks,
    event_role: 'current_name',
    change_kind: 'declare',
  }
}

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

function applyPatch(event, patch) {
  return { ...event, ...patch }
}

function patchEventInList(list, eventId, patch, remove = false) {
  const idx = list.findIndex((e) => e.event_id === eventId)
  if (idx < 0) return false
  if (remove) {
    list.splice(idx, 1)
    return true
  }
  list[idx] = applyPatch(list[idx], patch)
  return true
}

async function patchBatchRemoveStreet(batchId, streetCode) {
  const batchPath = path.join(BATCH_DIR, `${batchId}.json`)
  let batch
  try {
    batch = JSON.parse(await readFile(batchPath, 'utf8'))
  } catch {
    return
  }
  const before = batch.streets?.length ?? 0
  batch.streets = (batch.streets ?? []).filter((s) => String(s.street_code) !== String(streetCode))
  if (batch.streets.length === before) return
  if (!dryRun) await writeFile(batchPath, `${JSON.stringify(batch, null, 2)}\n`)
}

async function main() {
  let events = await loadMasterEvents()
  const [stemsIndex, geoByZh] = await Promise.all([
    readFile(STEMS, 'utf8').then(JSON.parse),
    loadGeoByZh(),
  ])

  for (const spec of REVERT_HKPLACE_NEWS) {
    const patch = revertHkPlaceNewsPatch(spec)
    if (!dryRun) {
      const result = patchMasterEventById(events, spec.event_id, patch)
      events = result.events
    }
  }

  const targets = events.filter(
    (e) => e.source === 'crowdsubmitted' && e.evidence_kind === 'news' && e.is_declaration_event,
  )

  const textCache = new Map()
  const getPdfText = (stem) => {
    if (!textCache.has(stem)) textCache.set(stem, pdfTextFromStem(stem))
    return textCache.get(stem)
  }

  const review = {
    upgraded_primary: [],
    upgraded_inferred: [],
    removed_duplicate: [],
    retain_news: [],
    fix_sibling_primary: [],
    skipped: [],
  }

  const removeIds = new Set()
  const siblingPatches = new Map()

  for (const event of targets) {
    const code = String(event.street_code ?? '').trim()
    const siblings = code ? events.filter((e) => String(e.street_code) === code) : []

    const result = classifyNewsCrowdEvent(event, {
      stemsIndex,
      getPdfText,
      siblings,
      geoByZh,
    })

    const row = {
      event_id: event.event_id,
      street_name_zh: event.street_name_zh,
      street_name_en: event.street_name_en,
      action: result.action,
      match: result.match,
      reason: result.reason ?? null,
    }

    if (result.action === 'remove_duplicate') {
      review.removed_duplicate.push({ ...row, primary_event_id: result.primary_event_id })
      removeIds.add(event.event_id)
      const primary = siblings.find((e) => e.event_id === result.primary_event_id)
      if (primary && (primary.event_role !== 'current_name' || primary.publication_date !== event.publication_date)) {
        siblingPatches.set(primary.event_id, {
          publication_date: event.publication_date,
          change_kind: 'declare',
          event_role: 'current_name',
          evidence_kind: 'gazette_primary',
          evidence_level: 'gazette',
        })
        review.fix_sibling_primary.push({
          event_id: primary.event_id,
          publication_date: event.publication_date,
        })
      }
      continue
    }

    if (result.action === 'upgrade_primary' || result.action === 'upgrade_inferred') {
      const bucket =
        result.action === 'upgrade_primary' ? review.upgraded_primary : review.upgraded_inferred
      bucket.push({ ...row, publication_date: result.patch.publication_date })
      if (!dryRun) {
        const patched = patchMasterEventById(events, event.event_id, result.patch)
        events = patched.events
      }
      continue
    }

    review.retain_news.push(row)
  }

  if (!dryRun) {
    for (const [eventId, patch] of siblingPatches) {
      const patched = patchMasterEventById(events, eventId, patch)
      events = patched.events
    }
    for (const id of removeIds) {
      const removed = removeMasterEventById(events, id)
      events = removed.events
    }
    await patchBatchRemoveStreet('2009-gn7995-hkplace-extensions', '14171')
    await saveMasterEvents(events)
  }

  review.summary = {
    targets: targets.length,
    upgraded_primary: review.upgraded_primary.length,
    upgraded_inferred: review.upgraded_inferred.length,
    removed_duplicate: review.removed_duplicate.length,
    fix_sibling_primary: review.fix_sibling_primary.length,
    retain_news: review.retain_news.length,
    dryRun,
  }

  await mkdir(path.dirname(REVIEW_PATH), { recursive: true })
  await writeFile(REVIEW_PATH, `${JSON.stringify(review, null, 2)}\n`)
  console.log(JSON.stringify(review.summary, null, 2))
  console.log(`Review log: ${REVIEW_PATH}`)
  if (!dryRun) console.log('\nNext: npm run rebuild:naming && npm run report:pending-years')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
