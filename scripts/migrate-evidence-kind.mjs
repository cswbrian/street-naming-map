#!/usr/bin/env node
/**
 * Repeatable migration: evidence_kind, derived_from, event_role on crowd data + combined events.
 * After running:
 *   npm run merge:crowd
 *   npm run report:pending-years
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  enrichEvent,
  formatGovernmentNoticeLabels,
  normalizeDerivedFrom,
  normalizeEvidenceKind,
  normalizeStreetName,
  resolveEvidenceKind,
} from './lib/street-naming-core.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const HISTORY_PATH = path.join(projectRoot, 'data/crowdsubmissions/street-name-history.json')
const BATCH_DIR = path.join(projectRoot, 'data/crowdsubmissions/batches')
const GEOJSON_PATH = path.join(projectRoot, 'public/data/hk-streets.geojson')
const COMBINED_EVENTS_PATH = path.join(
  projectRoot,
  'public/data/master/street-events-combined.json',
)

async function loadGeojsonNamesByCode() {
  const geo = JSON.parse(await readFile(GEOJSON_PATH, 'utf8'))
  const map = new Map()
  for (const feature of geo.features ?? []) {
    const code = String(feature.properties?.STREETCODE ?? '').trim()
    if (!code || map.has(code)) continue
    map.set(code, {
      en: normalizeStreetName(feature.properties?.ENGLISHSTREETNAME) || null,
      zh: String(feature.properties?.CHINESESTREETNAME ?? '').trim() || null,
    })
  }
  return map
}

function displayNamesForEvent(event, geoByCode) {
  const code = String(event.street_code ?? '').trim()
  if (code && geoByCode.has(code)) return geoByCode.get(code)
  return {
    en: event.street_name_en ?? null,
    zh: event.street_name_zh ?? null,
  }
}

const INFERRED_RE =
  /previous\s+g\.?\s*n\.?|first\s+previous| cited in |引述|先前.*第.*號|previous g\.n\./i
const HK_PLACE_RE = /hk-?place|hkplace/i

function inferFromRemarks(remarks, batchMeta = {}) {
  const text = String(remarks ?? '')
  if (HK_PLACE_RE.test(text) || HK_PLACE_RE.test(batchMeta.gazette_notice_label ?? '')) {
    return { kind: 'news', derived_from: null }
  }
  if (!INFERRED_RE.test(text)) return null

  const citedMatch = text.match(/G\.?\s*N\.?\s*(\d+)/i)
  const citingLabel = batchMeta.gazette_notice_label ?? null
  const citingDate = batchMeta.publication_date ?? null
  const citedLabel = citedMatch ? `G.N.${citedMatch[1]}` : null

  const derived_from = [
    {
      kind: 'gazette_citation',
      notice_label: citingLabel,
      publication_date: citingDate,
      government_notice_url_en: batchMeta.gazette_url_en ?? batchMeta.government_notice_url_en ?? null,
      government_notice_url_zh: batchMeta.gazette_url_zh ?? batchMeta.government_notice_url_zh ?? null,
      cited_notice_label: citedLabel,
      cited_publication_date: null,
    },
  ]

  return { kind: 'gazette_inferred', derived_from: normalizeDerivedFrom(derived_from) }
}

function migrateEntry(entry, batchMeta = {}, street = {}, geoByCode = new Map()) {
  let draft = { ...entry }

  if (!normalizeEvidenceKind(draft.evidence_kind)) {
    const hasUrl = Boolean(
      draft.government_notice_url_en || draft.government_notice_url_zh || draft.gazette_url,
    )
    const level = String(draft.evidence_level ?? '').toLowerCase()
    const inferred = inferFromRemarks(draft.submitter_remarks ?? draft.remarks, batchMeta)
    let kind = null
    let derived_from = normalizeDerivedFrom(draft.derived_from)

    if (inferred) {
      kind = inferred.kind
      derived_from = derived_from ?? inferred.derived_from
    } else if (level === 'gazette' || (hasUrl && level !== 'historical')) {
      kind = 'gazette_primary'
    } else if (hasUrl) {
      kind = 'gazette_primary'
    } else if (
      level === 'historical' &&
      draft.gazette_notice_label &&
      INFERRED_RE.test(draft.submitter_remarks ?? '')
    ) {
      kind = 'gazette_inferred'
      derived_from =
        derived_from ??
        inferFromRemarks(draft.submitter_remarks, {
          ...batchMeta,
          gazette_notice_label: draft.gazette_notice_label,
        })?.derived_from
    } else if (level === 'historical') {
      kind = 'unknown'
    } else {
      kind = resolveEvidenceKind(draft) ?? 'unknown'
    }
    draft = { ...draft, evidence_kind: kind, ...(derived_from ? { derived_from } : {}) }
    if (kind === 'gazette_primary' && !hasUrl && level === 'historical') {
      draft.evidence_kind = 'unknown'
    }
  }

  const code = String(street.street_code ?? street.code ?? '').trim()
  const display =
    code && geoByCode.has(code)
      ? geoByCode.get(code)
      : {
          en: draft.street_name_en ?? street.english_name ?? null,
          zh: draft.street_name_zh ?? street.chinese_name ?? null,
        }

  const enriched = enrichEvent(
    {
      ...draft,
      change_kind: draft.change_kind ?? 'declare',
      street_name_en: draft.street_name_en ?? street.english_name ?? null,
      street_name_zh: draft.street_name_zh ?? street.chinese_name ?? null,
      is_declaration_event: draft.is_declaration_event,
    },
    display,
  )

  const changed =
    enriched.evidence_kind !== entry.evidence_kind ||
    enriched.event_role !== entry.event_role ||
    JSON.stringify(enriched.derived_from) !== JSON.stringify(entry.derived_from)

  return { entry: enriched, changed }
}

function migrateEvent(event, geoByCode) {
  const inferred = inferFromRemarks(event.submitter_remarks)
  let draft = { ...event }

  if (inferred && !normalizeEvidenceKind(draft.evidence_kind)) {
    draft = {
      ...draft,
      evidence_kind: inferred.kind,
      derived_from: inferred.derived_from ?? draft.derived_from,
    }
  }

  const enriched = enrichEvent(draft, displayNamesForEvent(draft, geoByCode))
  const changed =
    enriched.evidence_kind !== event.evidence_kind ||
    enriched.event_role !== event.event_role ||
    JSON.stringify(enriched.derived_from) !== JSON.stringify(event.derived_from)

  return { event: enriched, changed }
}

async function migrateHistory(geoByCode) {
  const raw = JSON.parse(await readFile(HISTORY_PATH, 'utf8'))
  const events = Array.isArray(raw) ? raw : raw.events ?? []
  let changed = 0
  const next = events.map((event) => {
    const result = migrateEvent(event, geoByCode)
    if (result.changed) changed += 1
    return result.event
  })
  await writeFile(HISTORY_PATH, `${JSON.stringify(next, null, 2)}\n`)
  return { file: HISTORY_PATH, changed, total: next.length }
}

async function migrateBatch(filePath, geoByCode) {
  const batch = JSON.parse(await readFile(filePath, 'utf8'))
  const batchMeta = {
    gazette_notice_label: batch.gazette_notice_label,
    publication_date: batch.publication_date,
    gazette_url_en: batch.gazette_url_en,
    gazette_url_zh: batch.gazette_url_zh,
    government_notice_url_en: batch.government_notice_url_en,
    government_notice_url_zh: batch.government_notice_url_zh,
  }
  let changed = 0
  let streets = batch.streets ?? []

  streets = streets.map((street) => {
    if (!Array.isArray(street.history)) return street
    const history = street.history.map((entry) => {
      const result = migrateEntry(entry, batchMeta, street, geoByCode)
      if (result.changed) changed += 1
      let entryNext = result.entry
      if (
        entryNext.evidence_kind === 'gazette_inferred' &&
        entryNext.publication_date &&
        Array.isArray(entryNext.derived_from)
      ) {
        entryNext = {
          ...entryNext,
          derived_from: entryNext.derived_from.map((ref) => ({
            ...ref,
            cited_publication_date: ref.cited_publication_date ?? entryNext.publication_date,
            cited_notice_label:
              ref.cited_notice_label ??
              formatGovernmentNoticeLabels(entryNext.gazette_notice_label).en,
          })),
        }
      }
      return entryNext
    })
    return { ...street, history }
  })

  if (!changed) return { file: filePath, changed: 0 }

  const out = {
    ...batch,
    evidence_schema_version: batch.evidence_schema_version ?? 1,
    streets,
  }
  await writeFile(filePath, `${JSON.stringify(out, null, 2)}\n`)
  return { file: path.basename(filePath), changed }
}

async function migrateCombinedEvents(geoByCode) {
  try {
    const events = JSON.parse(await readFile(COMBINED_EVENTS_PATH, 'utf8'))
    let changed = 0
    const next = events.map((event) => {
      const result = migrateEvent(event, geoByCode)
      if (result.changed) changed += 1
      return result.event
    })
    await writeFile(COMBINED_EVENTS_PATH, `${JSON.stringify(next, null, 2)}\n`)
    return { file: COMBINED_EVENTS_PATH, changed, total: next.length }
  } catch {
    return { file: COMBINED_EVENTS_PATH, changed: 0, skipped: true }
  }
}

async function main() {
  const geoByCode = await loadGeojsonNamesByCode()
  console.log(`Geojson street codes loaded: ${geoByCode.size}`)

  const historyStats = await migrateHistory(geoByCode)
  console.log('street-name-history:', historyStats)

  const names = (await readdir(BATCH_DIR)).filter((n) => n.endsWith('.json'))
  let batchChanged = 0
  for (const name of names) {
    const stats = await migrateBatch(path.join(BATCH_DIR, name), geoByCode)
    if (stats.changed) {
      batchChanged += stats.changed
      console.log('batch', stats.file, stats.changed)
    }
  }
  console.log('batch entries updated:', batchChanged)

  const combinedStats = await migrateCombinedEvents(geoByCode)
  console.log('street-events-combined:', combinedStats)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
