import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aggregateByStreet,
  enrichGeojson,
  groupBy,
  isDeclarationEvent,
  normalizeNoticeNo,
  normalizeNoticeType,
} from './lib/street-naming-core.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const SOURCE_PATH = path.join(
  projectRoot,
  'Transportation_RoadCentreline_20260402.gdb_converted.geojson',
)
const OUTPUT_PATH = path.join(projectRoot, 'public', 'data', 'hk-streets.geojson')
const MASTER_OUTPUT_DIR = path.join(projectRoot, 'public', 'data', 'master')

const LANDSD_EN_URL =
  'https://www.landsd.gov.hk/en/survey-mapping/mapping/street-geographical-place-naming/street-naming.html'
const LANDSD_TC_URL =
  'https://www.landsd.gov.hk/tc/survey-mapping/mapping/street-geographical-place-naming/street-naming.html'
const START_YEAR = 2016

const decodeHtml = (value) =>
  value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .trim()

const stripTags = (html) => decodeHtml(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))

const toAbsoluteUrl = (href, baseUrl) => {
  if (!href) return null
  try {
    return new URL(href, baseUrl).href
  } catch {
    return null
  }
}

const parseDate = (raw, lang) => {
  const value = raw.trim()
  if (!value) return null

  if (lang === 'tc') {
    const match = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    if (!match) return null
    const [, y, m, d] = match
    return `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`
  }

  const months = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  }
  const enMatch = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (!enMatch) return null
  const [, dayRaw, monthRaw, yearRaw] = enMatch
  const month = months[monthRaw.toLowerCase()]
  if (!month) return null
  const day = Number(dayRaw)
  return `${yearRaw}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const parseLinks = (cellHtml, baseUrl) => {
  const links = []
  const regex = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match = regex.exec(cellHtml)
  while (match) {
    const [, href, textHtml] = match
    const url = toAbsoluteUrl(href, baseUrl)
    if (url) {
      links.push({
        label: stripTags(textHtml),
        url,
      })
    }
    match = regex.exec(cellHtml)
  }
  return links
}

const splitRowCells = (rowHtml) => {
  const cells = []
  const regex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi
  let match = regex.exec(rowHtml)
  while (match) {
    cells.push(match[1])
    match = regex.exec(rowHtml)
  }
  return cells
}

const parseTables = (html) => {
  const tables = []
  const regex = /<table\b[\s\S]*?<\/table>/gi
  let match = regex.exec(html)
  while (match) {
    tables.push(match[0])
    match = regex.exec(html)
  }
  return tables
}

const parseRows = (tableHtml) => {
  const rows = []
  const regex = /<tr\b[\s\S]*?<\/tr>/gi
  let match = regex.exec(tableHtml)
  while (match) {
    rows.push(match[0])
    match = regex.exec(tableHtml)
  }
  return rows
}

const parseLandsdPageEvents = (html, lang, baseUrl) => {
  const tables = parseTables(html)
  const events = []
  let rowIndex = 0

  for (const table of tables) {
    const rows = parseRows(table)
    for (const rowHtml of rows) {
      const cells = splitRowCells(rowHtml)
      if (cells.length < 6) continue
      const publicationDate = parseDate(stripTags(cells[0]), lang)
      if (!publicationDate) continue
      const yearBucket = Number(publicationDate.slice(0, 4))
      if (yearBucket < START_YEAR) continue

      const streetName = stripTags(cells[1])
      const districtRaw = stripTags(cells[2])
      const noticeTypeRaw = stripTags(cells[3])
      const govNoticeLinks = parseLinks(cells[4], baseUrl)
      const planLinks = parseLinks(cells[5], baseUrl)
      const govNotice = govNoticeLinks[0] ?? { label: stripTags(cells[4]), url: null }

      const noticeNoRaw = govNotice.label
      const noticeNo = normalizeNoticeNo(noticeNoRaw)

      events.push({
        source: 'landsd',
        source_lang: lang,
        publication_date: publicationDate,
        street_name_en: lang === 'en' ? streetName : null,
        street_name_zh: lang === 'tc' ? streetName : null,
        district_raw: districtRaw,
        notice_type_raw: noticeTypeRaw,
        notice_no: noticeNo,
        government_notice_label: noticeNoRaw,
        government_notice_url: govNotice.url,
        related_gazette_plan_urls: planLinks.map((link) => link.url),
        related_gazette_plan_labels: planLinks.map((link) => link.label),
        year_bucket: yearBucket,
        ingest_row_index: rowIndex,
      })
      rowIndex += 1
    }
  }

  return events
}

const reconcileBilingualEvents = (enEvents, tcEvents) => {
  const groupedEn = groupBy(enEvents, (item) => `${item.publication_date}|${item.notice_no}`)
  const groupedTc = groupBy(tcEvents, (item) => `${item.publication_date}|${item.notice_no}`)
  const keys = new Set([...groupedEn.keys(), ...groupedTc.keys()])
  const reconciled = []
  const qa = {
    unmatched_en_groups: [],
    unmatched_tc_groups: [],
    count_mismatch_groups: [],
  }

  for (const key of keys) {
    const enGroup = (groupedEn.get(key) ?? []).toSorted((a, b) => a.ingest_row_index - b.ingest_row_index)
    const tcGroup = (groupedTc.get(key) ?? []).toSorted((a, b) => a.ingest_row_index - b.ingest_row_index)

    if (!enGroup.length) qa.unmatched_tc_groups.push({ key, count: tcGroup.length })
    if (!tcGroup.length) qa.unmatched_en_groups.push({ key, count: enGroup.length })
    if (enGroup.length !== tcGroup.length) {
      qa.count_mismatch_groups.push({ key, en_count: enGroup.length, tc_count: tcGroup.length })
    }

    const maxLength = Math.max(enGroup.length, tcGroup.length)
    for (let index = 0; index < maxLength; index += 1) {
      const en = enGroup[index]
      const tc = tcGroup[index]
      const base = en ?? tc
      if (!base) continue

      const noticeTypeEn = en?.notice_type_raw ?? null
      const noticeTypeTc = tc?.notice_type_raw ?? null
      const normalizedNoticeType = normalizeNoticeType(noticeTypeEn, noticeTypeTc)
      const eventId = `${base.publication_date}|${base.notice_no}|${index}`

      reconciled.push({
        event_id: eventId,
        source: 'landsd',
        publication_date: base.publication_date,
        street_name_en: en?.street_name_en ?? null,
        street_name_zh: tc?.street_name_zh ?? null,
        district_raw_en: en?.district_raw ?? null,
        district_raw_zh: tc?.district_raw ?? null,
        notice_type_raw_en: noticeTypeEn,
        notice_type_raw_zh: noticeTypeTc,
        notice_type_normalized: normalizedNoticeType,
        notice_no: base.notice_no,
        government_notice_label_en: en?.government_notice_label ?? null,
        government_notice_label_zh: tc?.government_notice_label ?? null,
        government_notice_url_en: en?.government_notice_url ?? null,
        government_notice_url_zh: tc?.government_notice_url ?? null,
        related_gazette_plan_urls_en: en?.related_gazette_plan_urls ?? [],
        related_gazette_plan_urls_zh: tc?.related_gazette_plan_urls ?? [],
        related_gazette_plan_labels_en: en?.related_gazette_plan_labels ?? [],
        related_gazette_plan_labels_zh: tc?.related_gazette_plan_labels ?? [],
        year_bucket: base.year_bucket,
        is_declaration_event: isDeclarationEvent(noticeTypeEn, noticeTypeTc),
      })
    }
  }

  return { reconciled, qa }
}

const fetchPage = async (url) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'street-naming-map/1.0 (+https://github.com/cswbrian/street-naming-map)',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`)
  }
  return response.text()
}

const writeJson = async (pathValue, data) => {
  await writeFile(pathValue, `${JSON.stringify(data, null, 2)}\n`)
}

const qaToMarkdown = (qa) => {
  const lines = [
    '# LandsD 2016+ QA Report',
    '',
    `Generated at: ${qa.generated_at}`,
    '',
    '## Counts',
    `- EN rows: ${qa.counts.en_events}`,
    `- TC rows: ${qa.counts.tc_events}`,
    `- Reconciled events: ${qa.counts.reconciled_events}`,
    `- Street aggregates: ${qa.counts.street_aggregates}`,
    `- Streets missing declaration: ${qa.counts.streets_missing_declaration}`,
    '',
    '## Join stats',
    `- Total features: ${qa.join_stats.total_features}`,
    `- Matched exact: ${qa.join_stats.matched_exact_features}`,
    `- Matched fallback: ${qa.join_stats.matched_fallback_features}`,
    `- Unmatched: ${qa.join_stats.unmatched_features}`,
    '',
    '## Reconciliation warnings',
    `- EN-only groups: ${qa.reconciliation.unmatched_en_groups.length}`,
    `- TC-only groups: ${qa.reconciliation.unmatched_tc_groups.length}`,
    `- Count mismatches: ${qa.reconciliation.count_mismatch_groups.length}`,
    '',
  ]
  return `${lines.join('\n')}\n`
}

async function main() {
  const [enHtml, tcHtml] = await Promise.all([fetchPage(LANDSD_EN_URL), fetchPage(LANDSD_TC_URL)])
  const enEvents = parseLandsdPageEvents(enHtml, 'en', LANDSD_EN_URL)
  const tcEvents = parseLandsdPageEvents(tcHtml, 'tc', LANDSD_TC_URL)
  const { reconciled, qa: reconciliationQa } = reconcileBilingualEvents(enEvents, tcEvents)
  const aggregates = aggregateByStreet(reconciled)

  const raw = await readFile(SOURCE_PATH, 'utf8')
  const sourceData = JSON.parse(raw)

  if (sourceData?.type !== 'FeatureCollection' || !Array.isArray(sourceData.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection with a features array.')
  }

  const { enriched, joinStats } = enrichGeojson(sourceData, aggregates, {
    defaultSource: 'landsd_2016_plus',
    geojsonName: 'HK_Streets_LandsD2016Plus',
  })
  const streetsMissingDeclaration = aggregates.filter(
    (item) => item.derivation_reason === 'no_declaration_found',
  ).length
  const qaReport = {
    generated_at: new Date().toISOString(),
    counts: {
      en_events: enEvents.length,
      tc_events: tcEvents.length,
      reconciled_events: reconciled.length,
      street_aggregates: aggregates.length,
      streets_missing_declaration: streetsMissingDeclaration,
    },
    reconciliation: reconciliationQa,
    join_stats: joinStats,
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await mkdir(MASTER_OUTPUT_DIR, { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(enriched)}\n`)
  await writeJson(path.join(MASTER_OUTPUT_DIR, 'landsd-street-events-2016plus.json'), reconciled)
  await writeJson(path.join(MASTER_OUTPUT_DIR, 'landsd-street-aggregates-2016plus.json'), aggregates)
  await writeJson(path.join(MASTER_OUTPUT_DIR, 'landsd-qa-report-2016plus.json'), qaReport)
  await writeFile(path.join(MASTER_OUTPUT_DIR, 'landsd-qa-report-2016plus.md'), qaToMarkdown(qaReport))

  console.log(`Generated ${enriched.features.length} road features with LandsD-derived naming dates`)
  console.log(`Reconciled events: ${reconciled.length}`)
  console.log(`Street aggregates: ${aggregates.length}`)
  console.log(`Missing declaration streets: ${streetsMissingDeclaration}`)
  console.log(`Join stats: ${JSON.stringify(joinStats)}`)
  console.log(`Output: ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
