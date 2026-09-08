#!/usr/bin/env node
/**
 * One-off: diff LandsD gazetted-street CSV vs our street-events first/latest naming.
 *
 * Usage:
 *   node scripts/compare-landsd-gazetted-streets.mjs \
 *     --input "/path/to/Gazetted Street Name.csv" \
 *     --out reports/landsd-gazetted-vs-our-naming.csv
 *
 *   npm run report:landsd-compare -- --input "/path/to/file.csv"
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { projectRoot } from './lib/data-paths.mjs'
import { loadMasterEvents } from './lib/master-street-events.mjs'
import {
  makeStreetKey,
  normalizeNoticeNo,
  normalizeStreetName,
} from './lib/street-naming-core.mjs'

const DEFAULT_OUT = path.join(projectRoot, 'reports', 'landsd-gazetted-vs-our-naming.csv')

const CURRENT_KINDS = new Set(['declare', 'rename', 'extend'])

const CSV_COLUMNS = [
  'status',
  'match_key',
  'landsd_en',
  'landsd_zh',
  'landsd_district',
  'landsd_date',
  'landsd_gn',
  'our_first_en',
  'our_first_zh',
  'our_first_date',
  'our_first_gn',
  'our_first_event_id',
  'our_first_change_kind',
  'our_latest_date',
  'our_latest_gn',
  'our_latest_event_id',
  'our_latest_change_kind',
  'date_eq_first',
  'gn_eq_first',
  'date_eq_latest',
  'gn_eq_latest',
  'notes',
]

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: node scripts/compare-landsd-gazetted-streets.mjs --input <csv> [--out <csv>]

Compare LandsD gazetted streets (latest GN per street) with our first and latest naming events.

Options:
  --input <path>   LandsD CSV (required)
  --out <path>     Output CSV (default: reports/landsd-gazetted-vs-our-naming.csv)`)
    process.exit(0)
  }

  let input = null
  let out = DEFAULT_OUT
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--input') {
      input = argv[++i]
      continue
    }
    if (arg === '--out') {
      out = argv[++i]
      continue
    }
    if (arg.startsWith('--input=')) {
      input = arg.slice('--input='.length)
      continue
    }
    if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length)
      continue
    }
  }

  if (!input) {
    console.error('Missing --input <path> to LandsD CSV.')
    process.exit(1)
  }

  return {
    input: path.resolve(input),
    out: path.resolve(out),
  }
}

function toCsvRow(values) {
  return values
    .map((value) => {
      const text = String(value ?? '')
      if (text.includes('"') || text.includes(',') || text.includes('\n')) {
        return `"${text.replaceAll('"', '""')}"`
      }
      return text
    })
    .join(',')
}

function parseCsv(text) {
  const rows = []
  let field = ''
  let row = []
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (ch === '\n') {
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
      continue
    }
    if (ch === '\r') continue
    field += ch
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }

  if (rows.length === 0) return []

  const headers = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim())
  return rows.slice(1).map((cells) => {
    const obj = {}
    for (let i = 0; i < headers.length; i += 1) {
      obj[headers[i]] = cells[i] ?? ''
    }
    return obj
  })
}

function findColumn(row, predicators) {
  const keys = Object.keys(row)
  for (const pred of predicators) {
    const key = keys.find((k) => pred(k))
    if (key) return key
  }
  return null
}

function parseLandsdDate(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function enKey(name) {
  return normalizeStreetName(name).toUpperCase()
}

function isComparableEvent(event) {
  const kind = event?.change_kind
  if (!CURRENT_KINDS.has(kind)) return false
  const role = event?.event_role
  return role == null || role === 'current_name'
}

function noticeDigits(noticeNo) {
  const normalized = normalizeNoticeNo(noticeNo)
  const match = String(normalized).match(/(\d+)/)
  return match ? match[1].replace(/^0+/, '') || '0' : ''
}

function pickFirstNaming(events) {
  const dated = events
    .filter((e) => e.publication_date)
    .toSorted((a, b) => String(a.publication_date).localeCompare(String(b.publication_date)))
  const declares = dated.filter((e) => e.change_kind === 'declare')
  return declares[0] ?? dated[0] ?? null
}

function pickLatest(events) {
  const dated = events
    .filter((e) => e.publication_date)
    .toSorted((a, b) => String(a.publication_date).localeCompare(String(b.publication_date)))
  return dated.at(-1) ?? null
}

function buildOurIndex(events) {
  /** @type {Map<string, object[]>} */
  const byEn = new Map()
  /** @type {Map<string, object[]>} */
  const byEnZh = new Map()

  for (const event of events) {
    if (!isComparableEvent(event)) continue
    const en = enKey(event.street_name_en)
    if (!en) continue
    if (!byEn.has(en)) byEn.set(en, [])
    byEn.get(en).push(event)

    const fullKey = makeStreetKey(event.street_name_en, event.street_name_zh)
    if (!byEnZh.has(fullKey)) byEnZh.set(fullKey, [])
    byEnZh.get(fullKey).push(event)
  }

  return { byEn, byEnZh }
}

function eventSummary(event) {
  if (!event) {
    return {
      en: '',
      zh: '',
      date: '',
      gn: '',
      event_id: '',
      change_kind: '',
    }
  }
  return {
    en: event.street_name_en ?? '',
    zh: event.street_name_zh ?? '',
    date: event.publication_date ?? '',
    gn: normalizeNoticeNo(event.notice_no) || '',
    event_id: event.event_id ?? '',
    change_kind: event.change_kind ?? '',
  }
}

function classifyStatus({ first, latest, landsdDate, landsdGn }) {
  const firstDateEq = Boolean(first?.date && landsdDate && first.date === landsdDate)
  const firstGnEq = Boolean(
    first?.gn && landsdGn && noticeDigits(first.gn) === noticeDigits(landsdGn),
  )
  const latestDateEq = Boolean(latest?.date && landsdDate && latest.date === landsdDate)
  const latestGnEq = Boolean(
    latest?.gn && landsdGn && noticeDigits(latest.gn) === noticeDigits(landsdGn),
  )

  const agreeLatest = latestDateEq && latestGnEq
  const agreeFirst = firstDateEq && firstGnEq

  let status
  const notes = []

  if (agreeLatest) {
    status = 'agree_latest'
    if (agreeFirst && first.event_id === latest.event_id) {
      notes.push('first_equals_latest')
    } else if (agreeFirst) {
      notes.push('also_agrees_first')
    }
  } else if (agreeFirst) {
    status = 'agree_first_only'
    notes.push('landsd_matches_first_not_latest')
  } else {
    status = 'name_match_diff'
    if (!first.date && !latest.date) notes.push('our_event_undated')
    else if (firstDateEq || latestDateEq) notes.push('date_partial_match')
    else if (firstGnEq || latestGnEq) notes.push('gn_partial_match')
  }

  return {
    status,
    date_eq_first: firstDateEq,
    gn_eq_first: firstGnEq,
    date_eq_latest: latestDateEq,
    gn_eq_latest: latestGnEq,
    notes: notes.join('; '),
  }
}

function emptyRowExtras() {
  return {
    our_first_en: '',
    our_first_zh: '',
    our_first_date: '',
    our_first_gn: '',
    our_first_event_id: '',
    our_first_change_kind: '',
    our_latest_date: '',
    our_latest_gn: '',
    our_latest_event_id: '',
    our_latest_change_kind: '',
    date_eq_first: false,
    gn_eq_first: false,
    date_eq_latest: false,
    gn_eq_latest: false,
    notes: '',
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const rawText = await readFile(opts.input, 'utf8')
  const rawRows = parseCsv(rawText)
  if (rawRows.length === 0) {
    console.error('No data rows in LandsD CSV.')
    process.exit(1)
  }

  const sample = rawRows[0]
  const colEn = findColumn(sample, [(k) => /english\s*name/i.test(k)])
  const colZh = findColumn(sample, [(k) => /chinese\s*name/i.test(k)])
  const colDistrict = findColumn(sample, [
    (k) => /district/i.test(k),
    (k) => /district\s*code/i.test(k),
  ])
  const colDate = findColumn(sample, [(k) => /gazette\s*date/i.test(k)])
  const colGn = findColumn(sample, [(k) => /gazette\s*notice/i.test(k)])

  if (!colEn || !colZh || !colDate || !colGn) {
    console.error('Could not detect required LandsD columns.', Object.keys(sample))
    process.exit(1)
  }

  const landsdRows = rawRows.map((row) => {
    const enRaw = String(row[colEn] ?? '').trim()
    const zhRaw = String(row[colZh] ?? '').trim()
    const district = colDistrict ? String(row[colDistrict] ?? '').trim() : ''
    const dateRaw = String(row[colDate] ?? '').trim()
    const gnRaw = String(row[colGn] ?? '').trim()
    return {
      en: enRaw,
      zh: zhRaw,
      district,
      date: parseLandsdDate(dateRaw),
      date_raw: dateRaw,
      gn: gnRaw ? normalizeNoticeNo(gnRaw) : '',
      en_key: enKey(enRaw),
      full_key: makeStreetKey(enRaw, zhRaw),
    }
  })

  const events = await loadMasterEvents()
  const { byEn, byEnZh } = buildOurIndex(events)

  /** EN keys matched from LandsD side */
  const matchedEnKeys = new Set()
  const outRows = []

  for (const ld of landsdRows) {
    let group = null
    let matchKey = ''

    if (ld.en_key && byEn.has(ld.en_key)) {
      group = byEn.get(ld.en_key)
      matchKey = `en:${ld.en_key}`
      // Prefer EN+ZH subgroup when ZH present and unique among events for that EN
      if (ld.zh) {
        const zhMatches = group.filter(
          (e) => String(e.street_name_zh ?? '').trim() === ld.zh,
        )
        if (zhMatches.length > 0) {
          group = zhMatches
          matchKey = `en_zh:${ld.full_key}`
        }
      }
    } else if (ld.full_key && byEnZh.has(ld.full_key)) {
      group = byEnZh.get(ld.full_key)
      matchKey = `en_zh:${ld.full_key}`
    }

    if (!group || group.length === 0) {
      outRows.push({
        status: 'landsd_only',
        match_key: '',
        landsd_en: ld.en,
        landsd_zh: ld.zh,
        landsd_district: ld.district,
        landsd_date: ld.date ?? ld.date_raw,
        landsd_gn: ld.gn,
        ...emptyRowExtras(),
        notes: ld.date ? '' : 'unparsed_landsd_date',
      })
      continue
    }

    matchedEnKeys.add(ld.en_key)
    const first = eventSummary(pickFirstNaming(group))
    const latest = eventSummary(pickLatest(group))
    const classified = classifyStatus({
      first,
      latest,
      landsdDate: ld.date,
      landsdGn: ld.gn,
    })

    const notes = [classified.notes]
    if (!ld.date) notes.push('unparsed_landsd_date')
    if (group.length > 1 && new Set(group.map((e) => e.event_id)).size > 2) {
      notes.push(`our_event_count=${group.length}`)
    }

    outRows.push({
      status: classified.status,
      match_key: matchKey,
      landsd_en: ld.en,
      landsd_zh: ld.zh,
      landsd_district: ld.district,
      landsd_date: ld.date ?? ld.date_raw,
      landsd_gn: ld.gn,
      our_first_en: first.en,
      our_first_zh: first.zh,
      our_first_date: first.date,
      our_first_gn: first.gn,
      our_first_event_id: first.event_id,
      our_first_change_kind: first.change_kind,
      our_latest_date: latest.date,
      our_latest_gn: latest.gn,
      our_latest_event_id: latest.event_id,
      our_latest_change_kind: latest.change_kind,
      date_eq_first: classified.date_eq_first,
      gn_eq_first: classified.gn_eq_first,
      date_eq_latest: classified.date_eq_latest,
      gn_eq_latest: classified.gn_eq_latest,
      notes: notes.filter(Boolean).join('; '),
    })
  }

  // ours_only: unique EN keys in our index not matched by LandsD
  for (const [en, group] of byEn.entries()) {
    if (matchedEnKeys.has(en)) continue
    const first = eventSummary(pickFirstNaming(group))
    const latest = eventSummary(pickLatest(group))
    outRows.push({
      status: 'ours_only',
      match_key: `en:${en}`,
      landsd_en: '',
      landsd_zh: '',
      landsd_district: '',
      landsd_date: '',
      landsd_gn: '',
      our_first_en: first.en,
      our_first_zh: first.zh,
      our_first_date: first.date,
      our_first_gn: first.gn,
      our_first_event_id: first.event_id,
      our_first_change_kind: first.change_kind,
      our_latest_date: latest.date,
      our_latest_gn: latest.gn,
      our_latest_event_id: latest.event_id,
      our_latest_change_kind: latest.change_kind,
      date_eq_first: false,
      gn_eq_first: false,
      date_eq_latest: false,
      gn_eq_latest: false,
      notes: '',
    })
  }

  outRows.sort((a, b) => {
    const statusCmp = String(a.status).localeCompare(String(b.status))
    if (statusCmp !== 0) return statusCmp
    const enA = a.landsd_en || a.our_first_en
    const enB = b.landsd_en || b.our_first_en
    return String(enA).localeCompare(String(enB))
  })

  const csv = [
    toCsvRow(CSV_COLUMNS),
    ...outRows.map((row) => toCsvRow(CSV_COLUMNS.map((col) => row[col]))),
  ].join('\n')

  await mkdir(path.dirname(opts.out), { recursive: true })
  await writeFile(opts.out, `${csv}\n`, 'utf8')

  const counts = Object.create(null)
  for (const row of outRows) {
    counts[row.status] = (counts[row.status] || 0) + 1
  }

  const matched =
    (counts.agree_latest || 0) +
    (counts.agree_first_only || 0) +
    (counts.name_match_diff || 0)
  const agreeLatest = counts.agree_latest || 0
  const agreeFirstOnly = counts.agree_first_only || 0

  console.log(`LandsD rows: ${landsdRows.length}`)
  console.log(`Our comparable EN keys: ${byEn.size}`)
  console.log(`Output rows: ${outRows.length}`)
  console.log(`Wrote ${opts.out}`)
  console.log('Status counts:')
  for (const status of [
    'agree_latest',
    'agree_first_only',
    'name_match_diff',
    'landsd_only',
    'ours_only',
  ]) {
    console.log(`  ${status}: ${counts[status] || 0}`)
  }
  if (matched > 0) {
    console.log(
      `Among name matches (${matched}): agree_latest ${((agreeLatest / matched) * 100).toFixed(1)}%, agree_first_only ${((agreeFirstOnly / matched) * 100).toFixed(1)}%`,
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
