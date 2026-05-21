import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { governmentNoticeUrlsFromEvent } from './lib/egazette-pdf-urls.mjs'
import { makeStreetKey, normalizeStreetName } from './lib/street-naming-core.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const GEOJSON_PATH = path.join(projectRoot, 'public', 'data', 'hk-streets.geojson')
const LANDSD_AGGREGATES_PATH = path.join(
  projectRoot,
  'public',
  'data',
  'master',
  'landsd-street-aggregates-2016plus.json',
)
const COMBINED_AGGREGATES_PATH = path.join(
  projectRoot,
  'public',
  'data',
  'master',
  'street-aggregates-combined.json',
)
const OUTPUT_DIR = path.join(projectRoot, 'public', 'data', 'master')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'pending-naming-years.json')
const OUTPUT_CSV = path.join(OUTPUT_DIR, 'pending-naming-years.csv')

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

const pickNamingDetails = (aggregate) => {
  if (!aggregate) return null
  const history = Array.isArray(aggregate.event_history) ? aggregate.event_history : []
  const declarationEvent =
    history.find((event) => event?.is_declaration_event) ??
    history.find((event) => event?.publication_date === aggregate.canonical_naming_date) ??
    history[0] ??
    null

  const urls = governmentNoticeUrlsFromEvent(declarationEvent)

  return {
    street_key: aggregate.street_key ?? null,
    canonical_naming_date: aggregate.canonical_naming_date ?? null,
    canonical_naming_year: aggregate.canonical_naming_year ?? null,
    derivation_reason: aggregate.derivation_reason ?? null,
    event_count: aggregate.event_count ?? 0,
    notice_no: declarationEvent?.notice_no ?? null,
    notice_type: declarationEvent?.notice_type_normalized ?? null,
    notice_source: declarationEvent?.source ?? null,
    notice_key: declarationEvent?.notice_key ?? null,
    government_notice_label_en: declarationEvent?.government_notice_label_en ?? null,
    government_notice_label_zh: declarationEvent?.government_notice_label_zh ?? null,
    government_notice_url_en: urls.en,
    government_notice_url_zh: urls.zh,
    related_gazette_plan_url_en:
      declarationEvent?.related_gazette_plan_urls_en?.[0] ?? null,
    related_gazette_plan_url_zh:
      declarationEvent?.related_gazette_plan_urls_zh?.[0] ?? null,
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

async function resolveAggregatesPath() {
  try {
    await access(COMBINED_AGGREGATES_PATH)
    return COMBINED_AGGREGATES_PATH
  } catch {
    return LANDSD_AGGREGATES_PATH
  }
}

async function main() {
  const aggregatesPath = await resolveAggregatesPath()
  const [rawGeojson, rawAggregates] = await Promise.all([
    readFile(GEOJSON_PATH, 'utf8'),
    readFile(aggregatesPath, 'utf8'),
  ])
  const data = JSON.parse(rawGeojson)
  const aggregates = JSON.parse(rawAggregates)
  const features = Array.isArray(data?.features) ? data.features : []
  const aggregateRows = Array.isArray(aggregates) ? aggregates : []

  const aggregatesByStreetKey = new Map(
    aggregateRows.map((item) => [String(item.street_key ?? '').trim(), item]),
  )
  const aggregatesByEnUnique = buildUniqueNameMap(aggregateRows, 'street_name_en')
  const aggregatesByZhUnique = buildUniqueNameMap(aggregateRows, 'street_name_zh')

  const allRoads = new Map()
  let missingYearSegments = 0

  for (const feature of features) {
    const props = feature?.properties ?? {}
    const namingYear = props.naming_year
    if (asMissingYear(namingYear)) {
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
      aggregatesByStreetKey.get(streetKey) ??
      aggregatesByEnUnique.get(en) ??
      aggregatesByZhUnique.get(zh) ??
      null
    const namingDetails = pickNamingDetails(aggregate)

    if (!allRoads.has(roadKey)) {
      allRoads.set(roadKey, {
        road_key: roadKey,
        street_code: streetCode || null,
        english_name: en || null,
        chinese_name: zh || null,
        street_type: streetType || null,
        naming_year: asMissingYear(namingYear) ? null : Number(namingYear),
        naming_date: normalize(props.naming_date) || null,
        naming_source: normalize(props.naming_source) || null,
        naming_details: namingDetails,
        segment_count: 0,
      })
    }

    const road = allRoads.get(roadKey)
    road.segment_count += 1
    if (
      road.naming_year === null &&
      !asMissingYear(namingYear) &&
      Number.isFinite(Number(namingYear))
    ) {
      road.naming_year = Number(namingYear)
    }
    if (!road.naming_date && normalize(props.naming_date)) {
      road.naming_date = normalize(props.naming_date)
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
  const pendingRoads = roads.filter((row) => row.naming_year === null)

  const summary = {
    generated_at: new Date().toISOString(),
    source_file: 'public/data/hk-streets.geojson',
    totals: {
      total_segments: features.length,
      segments_missing_naming_year: missingYearSegments,
      unique_roads: roads.length,
      unique_roads_with_naming_year: roads.length - pendingRoads.length,
      unique_roads_missing_naming_year: pendingRoads.length,
    },
    roads,
    pending_roads: pendingRoads,
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
  await writeFile(OUTPUT_JSON, `${JSON.stringify(summary, null, 2)}\n`)
  await writeFile(OUTPUT_CSV, `${csvLines.join('\n')}\n`)

  console.log(`Total segments: ${features.length}`)
  console.log(`Segments missing naming_year: ${missingYearSegments}`)
  console.log(`Unique roads: ${roads.length}`)
  console.log(`Unique roads missing naming_year: ${pendingRoads.length}`)
  console.log(`Wrote: ${OUTPUT_JSON}`)
  console.log(`Wrote: ${OUTPUT_CSV}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
