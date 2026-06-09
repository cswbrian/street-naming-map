import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  pipelinePaths,
  projectRoot,
  publicPaths,
} from './lib/data-paths.mjs'
import { loadStreetAggregates } from './lib/load-street-aggregates.mjs'
import { normalizeNamingDateExclusions } from './lib/street-naming-core.mjs'
import {
  buildNoticeStemIndex,
  buildPdfLocaleIndex,
  enrichDerivedFromEntry,
  isPlaceholderNoticeLabel,
  resolveAggregateNoticeUrls,
} from './lib/notice-url-resolve.mjs'
import {
  formatGovernmentNoticeLabels,
  makeStreetKey,
  normalizeStreetName,
} from './lib/street-naming-core.mjs'

const GEOJSON_PATH = publicPaths.geojson
const OUTPUT_DIR = path.dirname(publicPaths.verifiedRoads)
const VERIFIED_ROADS_JSON = publicPaths.verifiedRoads
const PENDING_ROADS_JSON = publicPaths.pendingRoads
const OUTPUT_CSV = publicPaths.pendingCsv
const NOTICE_STEMS_JSON = publicPaths.noticeStems
const EGAZETTE_EN_DIR = path.join(projectRoot, 'public', 'egazette', 'en')
const PDF_LOCALES_PATH = publicPaths.pdfLocales

const normalize = (value) => String(value ?? '').trim()

const asMissingYear = (value) => {
  if (value === null || value === undefined) return true
  const text = String(value).trim().toLowerCase()
  if (!text || text === 'null' || text === 'none' || text === 'nan') return true
  const numeric = Number(text)
  return !Number.isFinite(numeric)
}

const toRoadKey = (en, zh, code, segmentId) => {
  if (code) return `code:${code}`
  if (en || zh) return `name:${en}|${zh}`
  return `segment:${segmentId}`
}

const toStreetKey = (en, zh) => makeStreetKey(normalizeStreetName(en), zh)

const buildUniqueNameMap = (aggregates, field) => {
  const counts = new Map()
  for (const item of aggregates) {
    const value = normalize(item?.[field])
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const uniqueMap = new Map()
  for (const item of aggregates) {
    const value = normalize(item?.[field])
    if (!value || counts.get(value) !== 1) continue
    uniqueMap.set(value, item)
  }
  return uniqueMap
}

const patchNameHistoryUrls = (nameHistory, urls, derivedFrom) => {
  if (!Array.isArray(nameHistory)) return nameHistory ?? null
  return nameHistory.map((entry) => {
    const next = { ...entry }
    if (urls?.en || urls?.zh) {
      next.notice_url_en = next.notice_url_en ?? urls.en ?? null
      next.notice_url_zh = next.notice_url_zh ?? urls.zh ?? null
    }
    if (derivedFrom?.length && !next.derived_from) {
      next.derived_from = derivedFrom
    } else if (derivedFrom?.[0] && Array.isArray(next.derived_from) && next.derived_from[0]) {
      const merged = { ...next.derived_from[0], ...derivedFrom[0] }
      next.derived_from = [merged]
    }
    return next
  })
}

const pickNamingDetails = async (aggregate, noticeIndex, urlOptions = {}) => {
  if (!aggregate) return null
  const history = Array.isArray(aggregate.event_history) ? aggregate.event_history : []
  const canonicalKind = aggregate.canonical_evidence_kind ?? null
  const canonicalEventId = aggregate.canonical_evidence_event_id ?? null
  const canonicalEvent =
    (canonicalEventId && history.find((event) => event.event_id === canonicalEventId)) ||
    history.find(
      (event) =>
        event.evidence_kind === canonicalKind &&
        event.publication_date === aggregate.canonical_naming_date,
    ) ||
    null

  const { urls, derivedFrom: resolvedDerived } = await resolveAggregateNoticeUrls(
    aggregate,
    noticeIndex,
    urlOptions,
  )

  let derivedFrom = resolvedDerived
  if (Array.isArray(derivedFrom) && derivedFrom[0]) {
    derivedFrom = [
      await enrichDerivedFromEntry(derivedFrom[0], {
        remarks: canonicalEvent?.submitter_remarks,
        history,
        noticeIndex,
        ...urlOptions,
      }),
    ]
  }

  let rawNoticeLabel =
    canonicalKind === 'gazette_inferred' && derivedFrom?.[0]?.cited_notice_label
      ? derivedFrom[0].cited_notice_label
      : null
  if (!rawNoticeLabel || isPlaceholderNoticeLabel(rawNoticeLabel)) {
    rawNoticeLabel =
      derivedFrom?.[0]?.notice_label ??
      canonicalEvent?.government_notice_label_en ??
      canonicalEvent?.notice_no ??
      null
  }
  if (isPlaceholderNoticeLabel(rawNoticeLabel)) rawNoticeLabel = derivedFrom?.[0]?.notice_label ?? null
  const noticeLabels = formatGovernmentNoticeLabels(rawNoticeLabel)

  const mapEventId = String(aggregate.map_display_event_id ?? '').trim()
  const mapEvent = mapEventId ? history.find((event) => event.event_id === mapEventId) ?? null : null
  const mapEvidenceKind = aggregate.map_display_evidence_kind ?? mapEvent?.evidence_kind ?? null
  const mapHistoryRow =
    aggregate.name_history?.find(
      (row) =>
        String(row.date ?? '').trim() === String(aggregate.map_display_date ?? '').trim() &&
        (!mapEvidenceKind || row.evidence_kind === mapEvidenceKind),
    ) ?? null

  let mapNoticeLabels = { en: null, zh: null }
  if (mapEvent) {
    const mapRaw =
      mapEvent.government_notice_label_en ??
      mapEvent.government_notice_label_zh ??
      mapEvent.notice_no ??
      null
    mapNoticeLabels = formatGovernmentNoticeLabels(mapRaw)
  }

  const useMapForNotice = Boolean(mapEvent)
  const noticeEvent = useMapForNotice ? mapEvent : canonicalEvent
  const activeDerivedFrom = useMapForNotice ? null : derivedFrom
  const activeNoticeLabels = useMapForNotice ? mapNoticeLabels : noticeLabels

  if (useMapForNotice) {
    const mapUrls = await resolveAggregateNoticeUrls(
      { ...aggregate, canonical_naming_date: aggregate.map_display_date },
      noticeIndex,
      urlOptions,
    )
    if (mapHistoryRow?.notice_url_en || mapHistoryRow?.notice_url_zh) {
      urls.en = mapHistoryRow.notice_url_en ?? urls.en
      urls.zh = mapHistoryRow.notice_url_zh ?? urls.zh
    } else if (mapUrls.urls.en || mapUrls.urls.zh) {
      urls.en = mapUrls.urls.en ?? urls.en
      urls.zh = mapUrls.urls.zh ?? urls.zh
    } else if (mapEvent.government_notice_url_en || mapEvent.government_notice_url_zh) {
      urls.en = mapEvent.government_notice_url_en ?? urls.en
      urls.zh = mapEvent.government_notice_url_zh ?? urls.zh
    }
  }

  return {
    street_key: aggregate.street_key ?? null,
    street_code: aggregate.street_code ?? null,
    canonical_naming_date: aggregate.canonical_naming_date ?? null,
    canonical_naming_year: aggregate.canonical_naming_year ?? null,
    current_name_since_date: aggregate.current_name_since_date ?? null,
    first_known_naming_date: aggregate.first_known_naming_date ?? null,
    derivation_reason: aggregate.derivation_reason ?? null,
    map_display_date: aggregate.map_display_date ?? null,
    map_display_year: aggregate.map_display_year ?? null,
    map_year_source: aggregate.map_year_source ?? null,
    map_derivation_reason: aggregate.map_derivation_reason ?? null,
    map_display_event_id: mapEventId || null,
    map_display_evidence_kind: mapEvidenceKind,
    canonical_evidence_kind: canonicalKind,
    canonical_evidence_event_id: canonicalEventId,
    canonical_event_role: aggregate.canonical_event_role ?? canonicalEvent?.event_role ?? null,
    evidence_kind: mapEvidenceKind ?? canonicalKind,
    derived_from: activeDerivedFrom ?? derivedFrom,
    evidence_kind_note: noticeEvent?.evidence_kind_note ?? canonicalEvent?.evidence_kind_note ?? null,
    event_count: aggregate.event_count ?? 0,
    name_history: patchNameHistoryUrls(aggregate.name_history, urls, activeDerivedFrom ?? derivedFrom),
    notice_no: noticeEvent?.notice_no ?? canonicalEvent?.notice_no ?? null,
    notice_type: noticeEvent?.notice_type_normalized ?? canonicalEvent?.notice_type_normalized ?? null,
    notice_source: noticeEvent?.source ?? canonicalEvent?.source ?? null,
    notice_key: noticeEvent?.notice_key ?? canonicalEvent?.notice_key ?? null,
    government_notice_label_en:
      activeNoticeLabels.en ??
      noticeLabels.en ??
      canonicalEvent?.government_notice_label_en ??
      null,
    government_notice_label_zh:
      activeNoticeLabels.zh ??
      noticeLabels.zh ??
      canonicalEvent?.government_notice_label_zh ??
      null,
    government_notice_url_en: urls.en ?? derivedFrom?.[0]?.government_notice_url_en ?? null,
    government_notice_url_zh: urls.zh ?? derivedFrom?.[0]?.government_notice_url_zh ?? null,
    related_gazette_plan_url_en: canonicalEvent?.related_gazette_plan_urls_en?.[0] ?? null,
    related_gazette_plan_url_zh: canonicalEvent?.related_gazette_plan_urls_zh?.[0] ?? null,
  }
}

const toCsvRow = (values) =>
  values
    .map((value) => {
      const text = String(value ?? '')
      if (text.includes('"') || text.includes(',') || text.includes('\n')) {
        return `"${text.replaceAll('"', '""')}"`
      }
      return text
    })
    .join(',')

const slimPendingRoad = (row) => {
  const slim = {
    road_key: row.road_key,
    street_code: row.street_code,
    english_name: row.english_name,
    chinese_name: row.chinese_name,
    street_type: row.street_type,
    naming_year: row.naming_year,
    naming_date: row.naming_date,
    naming_source: row.naming_source,
    segment_count: row.segment_count,
  }
  // Keep name history on pending roads that only have former-name events.
  if (row.naming_details?.name_history?.length) {
    slim.naming_details = row.naming_details
  }
  return slim
}

async function loadNamingDateExclusions() {
  try {
    const raw = JSON.parse(
      await readFile(path.join(projectRoot, 'data', 'naming-date-exclusions.json'), 'utf8'),
    )
    return normalizeNamingDateExclusions(raw)
  } catch {
    return normalizeNamingDateExclusions({})
  }
}

async function loadAggregatesFromMaster() {
  const { aggregates } = await loadStreetAggregates({
    namingDateExclusions: await loadNamingDateExclusions(),
  })
  return aggregates
}

async function main() {
  const [rawGeojson, aggregateRows] = await Promise.all([
    readFile(GEOJSON_PATH, 'utf8'),
    loadAggregatesFromMaster(),
  ])
  const data = JSON.parse(rawGeojson)
  const features = Array.isArray(data?.features) ? data.features : []

  const aggregatesByStreetKey = new Map(
    aggregateRows.map((item) => [String(item.street_key ?? '').trim(), item]),
  )
  const aggregatesByStreetCode = new Map(
    aggregateRows
      .filter((item) => String(item.street_code ?? '').trim())
      .map((item) => [String(item.street_code).trim(), item]),
  )
  const aggregatesByEnUnique = buildUniqueNameMap(aggregateRows, 'street_name_en')
  const aggregatesByZhUnique = buildUniqueNameMap(aggregateRows, 'street_name_zh')
  const [noticeStemIndex, pdfLocales] = await Promise.all([
    buildNoticeStemIndex(EGAZETTE_EN_DIR),
    buildPdfLocaleIndex({ projectRoot }),
  ])
  await writeFile(PDF_LOCALES_PATH, `${JSON.stringify(pdfLocales, null, 2)}\n`)

  const urlOptions = { filterPublished: true, projectRoot }
  const namingDetailsByStreetKey = new Map()
  const namingDetailsByStreetCode = new Map()
  for (const item of aggregateRows) {
    const details = await pickNamingDetails(item, noticeStemIndex, urlOptions)
    const key = String(item.street_key ?? '').trim()
    const code = String(item.street_code ?? '').trim()
    if (key && details) namingDetailsByStreetKey.set(key, details)
    if (code && details) namingDetailsByStreetCode.set(code, details)
  }

  const allRoads = new Map()
  let missingYearSegments = 0

  for (const feature of features) {
    const props = feature?.properties ?? {}
    const namingYear = props.naming_year
    const mapYear = props.map_year
    const effectiveNamingYear = asMissingYear(namingYear)
      ? asMissingYear(mapYear)
        ? null
        : Number(mapYear)
      : Number(namingYear)
    if (effectiveNamingYear === null) {
      missingYearSegments += 1
    }

    const en = normalize(props.ENGLISHSTREETNAME)
    const zh = normalize(props.CHINESESTREETNAME)
    const streetCode = normalize(props.STREETCODE)
    const streetType = normalize(props.STREETTYPE)
    const segmentId = normalize(props.STREETCENTRELINEID) || normalize(props.OBJECTID) || 'unknown'
    const roadKey = toRoadKey(en, zh, streetCode, segmentId)
    const streetKey = toStreetKey(en, zh)
    const aggregate =
      (streetCode ? aggregatesByStreetCode.get(streetCode) : null) ??
      aggregatesByStreetKey.get(streetKey) ??
      aggregatesByEnUnique.get(en) ??
      aggregatesByZhUnique.get(zh) ??
      null
    const namingDetails =
      (streetCode ? namingDetailsByStreetCode.get(streetCode) : null) ??
      namingDetailsByStreetKey.get(streetKey) ??
      (aggregate ? await pickNamingDetails(aggregate, noticeStemIndex, urlOptions) : null)

    const mapSurfaceYear =
      namingDetails?.map_display_year != null ? Number(namingDetails.map_display_year) : null
    const mapSurfaceDate = normalize(namingDetails?.map_display_date) || null
    const tableYear = mapSurfaceYear ?? effectiveNamingYear
    const tableDate =
      mapSurfaceDate || normalize(props.map_date) || normalize(props.naming_date) || null

    if (!allRoads.has(roadKey)) {
      allRoads.set(roadKey, {
        road_key: roadKey,
        street_code: streetCode || null,
        english_name: en || null,
        chinese_name: zh || null,
        street_type: streetType || null,
        naming_year: tableYear,
        naming_date: tableDate,
        naming_source: normalize(props.naming_source) || null,
        naming_details: namingDetails,
        segment_count: 0,
      })
    }

    const road = allRoads.get(roadKey)
    road.segment_count += 1
    if (road.naming_year === null && tableYear !== null) {
      road.naming_year = tableYear
    }
    if (!road.naming_date && tableDate) {
      road.naming_date = tableDate
    }
    if (!road.naming_source && normalize(props.naming_source)) {
      road.naming_source = normalize(props.naming_source)
    }
    if (!road.naming_details && namingDetails) {
      road.naming_details = namingDetails
    }
  }

  const roads = [...allRoads.values()].sort((a, b) => {
    if (b.segment_count !== a.segment_count) return b.segment_count - a.segment_count
    return String(a.english_name ?? '').localeCompare(String(b.english_name ?? ''))
  })
  const verifiedRoads = roads.filter((row) => row.naming_year !== null)
  const pendingRoads = roads.filter((row) => row.naming_year === null).map(slimPendingRoad)
  const roadsWithStreetName = roads.filter(
    (row) => normalize(row.english_name) || normalize(row.chinese_name),
  )
  const pendingRoadsWithStreetName = roadsWithStreetName.filter((row) => row.naming_year === null)

  const totals = {
    total_segments: features.length,
    segments_missing_naming_year: missingYearSegments,
    unique_roads: roads.length,
    unique_roads_with_street_name: roadsWithStreetName.length,
    unique_roads_with_naming_year: verifiedRoads.length,
    unique_roads_with_street_name_and_naming_year:
      roadsWithStreetName.length - pendingRoadsWithStreetName.length,
    unique_roads_missing_naming_year: pendingRoads.length,
    unique_roads_missing_naming_year_with_street_name: pendingRoadsWithStreetName.length,
  }

  const sharedMeta = {
    generated_at: new Date().toISOString(),
    source_file: 'public/data/hk-streets.geojson',
    notice_stem_index_path: 'public/data/master/egazette-notice-stems.json',
    egazette_pdf_locales_path: 'public/data/master/egazette-pdf-locales.json',
    totals,
  }

  const verifiedPayload = {
    ...sharedMeta,
    kind: 'verified',
    roads: verifiedRoads,
  }

  const pendingPayload = {
    ...sharedMeta,
    kind: 'pending',
    roads: pendingRoads,
  }

  const csvLines = [
    toCsvRow([
      'road_key',
      'street_code',
      'english_name',
      'chinese_name',
      'street_type',
      'naming_year',
      'naming_date',
      'government_notice_url_en',
      'government_notice_url_zh',
      'segment_count',
    ]),
    ...roads.map((row) =>
      toCsvRow([
        row.road_key,
        row.street_code ?? '',
        row.english_name ?? '',
        row.chinese_name ?? '',
        row.street_type ?? '',
        row.naming_year ?? '',
        row.naming_date ?? '',
        row.naming_details?.government_notice_url_en ?? '',
        row.naming_details?.government_notice_url_zh ?? '',
        row.segment_count,
      ]),
    ),
  ]

  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(VERIFIED_ROADS_JSON, `${JSON.stringify(verifiedPayload, null, 2)}\n`)
  await writeFile(PENDING_ROADS_JSON, `${JSON.stringify(pendingPayload, null, 2)}\n`)
  await writeFile(OUTPUT_CSV, `${csvLines.join('\n')}\n`)
  await writeFile(NOTICE_STEMS_JSON, `${JSON.stringify(noticeStemIndex, null, 2)}\n`)

  console.log(`Total segments: ${features.length}`)
  console.log(`Segments missing naming_year: ${missingYearSegments}`)
  console.log(`Unique roads: ${roads.length}`)
  console.log(`Verified roads: ${verifiedRoads.length}`)
  console.log(`Pending roads: ${pendingRoads.length}`)
  console.log(`Wrote: ${VERIFIED_ROADS_JSON}`)
  console.log(`Wrote: ${PENDING_ROADS_JSON}`)
  console.log(`Wrote: ${OUTPUT_CSV}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
