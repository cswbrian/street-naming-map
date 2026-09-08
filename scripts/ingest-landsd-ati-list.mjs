#!/usr/bin/env node
/**
 * One-off: ingest LandsD ATI gazetted-street historical list as gap-only events.
 *
 * Usage:
 *   npm run ingest:landsd-ati
 *   npm run ingest:landsd-ati -- --apply
 *   node scripts/ingest-landsd-ati-list.mjs --input data/landsd-ati/....csv --dry-run
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { projectRoot } from './lib/data-paths.mjs'
import { appendMasterEvents, loadMasterEvents } from './lib/master-street-events.mjs'
import {
  normalizeNoticeNo,
  normalizeStreetName,
} from './lib/street-naming-core.mjs'

const DEFAULT_INPUT = path.join(
  projectRoot,
  'data/landsd-ati/gazetted-streets-historical-2026-07-31.csv',
)
const DEFAULT_REPORT = path.join(projectRoot, 'reports/landsd-ati-ingest-report.json')
const DEFAULT_REPORT_CSV = path.join(projectRoot, 'reports/landsd-ati-ingest-report.csv')

const EVIDENCE_NOTE = 'Provided by Lands Department. No gazette PDF attached.'

const SUBMITTER_REMARKS = 'Provided by Lands Department.'

const CURRENT_KINDS = new Set(['declare', 'rename', 'extend'])

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: node scripts/ingest-landsd-ati-list.mjs [--input <csv>] [--apply] [--out <json>]

Gap-only ingest of LandsD ATI street gazette list into street-events.json.

Options:
  --input <path>   CSV from data/landsd-ati/ (default: 2026-07-31 extract)
  --apply          Write events to master (default is dry-run)
  --dry-run        Explicit dry-run (default)
  --out <path>     Report JSON path
  --out-csv <path> Report CSV path`)
    process.exit(0)
  }

  let input = DEFAULT_INPUT
  let apply = false
  let out = DEFAULT_REPORT
  let outCsv = DEFAULT_REPORT_CSV
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--dry-run') {
      apply = false
      continue
    }
    if (arg === '--input') {
      input = argv[++i]
      continue
    }
    if (arg.startsWith('--input=')) {
      input = arg.slice('--input='.length)
      continue
    }
    if (arg === '--out') {
      out = argv[++i]
      continue
    }
    if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length)
      continue
    }
    if (arg === '--out-csv') {
      outCsv = argv[++i]
      continue
    }
    if (arg.startsWith('--out-csv=')) {
      outCsv = arg.slice('--out-csv='.length)
      continue
    }
  }

  return {
    input: path.resolve(input),
    apply,
    out: path.resolve(out),
    outCsv: path.resolve(outCsv),
  }
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
  if (!rows.length) return []
  const headers = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim())
  return rows.slice(1).map((cells) => {
    const obj = {}
    for (let i = 0; i < headers.length; i += 1) {
      obj[headers[i]] = cells[i] ?? ''
    }
    return obj
  })
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

function enKey(name) {
  return normalizeStreetName(name).toUpperCase()
}

function noticeDigits(noticeNo) {
  const normalized = normalizeNoticeNo(noticeNo)
  const match = String(normalized).match(/(\d+)/)
  return match ? match[1].replace(/^0+/, '') || '0' : ''
}

function coverageKey(en, date, gnRaw) {
  return `${enKey(en)}|${date}|${noticeDigits(gnRaw)}`
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))
}

function parseLandsdDate(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  if (isIsoDate(value)) return value
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatNoticeNo(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  if (/^\d+$/.test(value)) return `GN${value}`
  if (/^S_\d+$/i.test(value)) return value.toUpperCase()
  const digits = noticeDigits(value)
  if (digits && /^\d+$/.test(value.replace(/^G\.?N\.?\s*/i, ''))) return `GN${digits}`
  if (digits) return `GN${digits}`
  return value.slice(0, 80)
}

function noticeStem(date, noticeNo) {
  const year = String(date ?? '').slice(0, 4)
  const digits = noticeDigits(noticeNo)
  if (!year || !digits) return null
  return `${year}-gn${digits}`
}

function slugEn(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function isComparableNamingEvent(event) {
  const kind = event?.change_kind
  if (!CURRENT_KINDS.has(kind)) return false
  const role = event?.event_role
  return role == null || role === 'current_name'
}

function titleCaseEn(name) {
  const normalized = normalizeStreetName(name)
  return normalized || String(name ?? '').trim()
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const csvText = await readFile(opts.input, 'utf8')
  const rawRows = parseCsv(csvText)
  const master = await loadMasterEvents()

  /** @type {Set<string>} */
  const covered = new Set()
  /** @type {Set<string>} */
  const streetsWithNaming = new Set()

  for (const event of master) {
    const en = event.street_name_en
    const date = event.publication_date
    if (en && date) {
      covered.add(coverageKey(en, date, event.notice_no ?? ''))
    }
    if (en && isComparableNamingEvent(event)) {
      streetsWithNaming.add(enKey(en))
    }
  }

  /** @type {object[]} */
  const parsed = []
  /** @type {object[]} */
  const unparsed = []

  for (const row of rawRows) {
    const en = String(row.english_name ?? '').trim()
    const zh = String(row.chinese_name ?? '').trim()
    const date =
      parseLandsdDate(row.gazette_date) || parseLandsdDate(row.gazette_date_raw)
    const gnRaw = String(row.gazette_notice ?? '').trim()
    if (!en || !date || !isIsoDate(date)) {
      unparsed.push({
        status: 'unparsed_date',
        english_name: en,
        chinese_name: zh,
        gazette_date: row.gazette_date,
        gazette_date_raw: row.gazette_date_raw,
        gazette_notice: gnRaw,
      })
      continue
    }
    parsed.push({
      en,
      zh,
      date,
      gnRaw,
      districtCode: String(row.district_code ?? '').trim(),
      districtEn: String(row.district_en ?? '').trim(),
      districtZh: String(row.district_zh ?? '').trim(),
    })
  }

  // Group by EN for earliest-gap declare logic
  /** @type {Map<string, typeof parsed>} */
  const byEn = new Map()
  for (const row of parsed) {
    const key = enKey(row.en)
    if (!byEn.has(key)) byEn.set(key, [])
    byEn.get(key).push(row)
  }
  for (const rows of byEn.values()) {
    rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.gnRaw).localeCompare(String(b.gnRaw)))
  }

  /** @type {object[]} */
  const toInsert = []
  /** @type {object[]} */
  const skipped = []
  /** @type {Set<string>} */
  const seenIncoming = new Set()

  for (const [key, rows] of byEn) {
    const hasNaming = streetsWithNaming.has(key)
    let insertedForStreet = 0
    for (const row of rows) {
      const cov = coverageKey(row.en, row.date, row.gnRaw)
      if (!noticeDigits(row.gnRaw) && !String(row.gnRaw).trim()) {
        skipped.push({ status: 'missing_gn', ...row })
        continue
      }
      if (covered.has(cov) || seenIncoming.has(cov)) {
        skipped.push({
          status: covered.has(cov) ? 'skipped_covered' : 'skipped_duplicate_in_file',
          english_name: row.en,
          chinese_name: row.zh,
          gazette_date: row.date,
          gazette_notice: row.gnRaw,
        })
        continue
      }
      seenIncoming.add(cov)

      const noticeNo = formatNoticeNo(row.gnRaw)
      const streetEn = titleCaseEn(row.en)
      const changeKind = !hasNaming && insertedForStreet === 0 ? 'declare' : 'extend'
      const eventId = `landsd-ati|${row.date}|${noticeNo}|${slugEn(streetEn) || 'street'}`

      const event = {
        event_id: eventId,
        source: 'landsd_ati',
        publication_date: row.date,
        street_name_en: streetEn,
        street_name_zh: row.zh || null,
        district_raw_en: row.districtEn || null,
        district_raw_zh: row.districtZh || null,
        notice_no: noticeNo,
        government_notice_label_en: noticeNo.startsWith('GN')
          ? `G.N. ${noticeDigits(noticeNo)}`
          : row.gnRaw,
        government_notice_label_zh: noticeDigits(noticeNo)
          ? `第${noticeDigits(noticeNo)}號`
          : null,
        notice_stem: noticeStem(row.date, noticeNo),
        change_kind: changeKind,
        event_role: 'current_name',
        is_declaration_event: changeKind === 'declare',
        evidence_kind: 'other',
        evidence_kind_note: EVIDENCE_NOTE,
        submitter_remarks: SUBMITTER_REMARKS,
      }

      toInsert.push(event)
      insertedForStreet += 1
    }
  }

  const summary = {
    input: opts.input,
    apply: opts.apply,
    landsd_rows: rawRows.length,
    parsed_rows: parsed.length,
    unparsed_date: unparsed.length,
    skipped_covered: skipped.filter((s) => s.status === 'skipped_covered').length,
    skipped_other: skipped.filter((s) => s.status !== 'skipped_covered').length,
    to_insert: toInsert.length,
    declare: toInsert.filter((e) => e.change_kind === 'declare').length,
    extend: toInsert.filter((e) => e.change_kind === 'extend').length,
    master_before: master.length,
  }

  const report = {
    summary,
    samples_insert: toInsert.slice(0, 8),
    samples_skipped: skipped.slice(0, 8),
    unparsed: unparsed.slice(0, 30),
  }

  await mkdir(path.dirname(opts.out), { recursive: true })
  await writeFile(opts.out, `${JSON.stringify(report, null, 2)}\n`)

  const csvLines = [
    toCsvRow([
      'status',
      'event_id',
      'change_kind',
      'english_name',
      'chinese_name',
      'gazette_date',
      'gazette_notice',
      'notice_no',
    ]),
  ]
  for (const event of toInsert) {
    csvLines.push(
      toCsvRow([
        'insert',
        event.event_id,
        event.change_kind,
        event.street_name_en,
        event.street_name_zh,
        event.publication_date,
        event.government_notice_label_en,
        event.notice_no,
      ]),
    )
  }
  for (const row of skipped) {
    csvLines.push(
      toCsvRow([
        row.status,
        '',
        '',
        row.english_name,
        row.chinese_name,
        row.gazette_date,
        row.gazette_notice,
        '',
      ]),
    )
  }
  for (const row of unparsed) {
    csvLines.push(
      toCsvRow([
        row.status,
        '',
        '',
        row.english_name,
        row.chinese_name,
        row.gazette_date || row.gazette_date_raw,
        row.gazette_notice,
        '',
      ]),
    )
  }
  await writeFile(opts.outCsv, `${csvLines.join('\n')}\n`)

  console.log(JSON.stringify(summary, null, 2))
  console.log(`Wrote report ${opts.out}`)
  console.log(`Wrote CSV ${opts.outCsv}`)

  if (!opts.apply) {
    console.log('Dry-run only. Re-run with --apply to write street-events.json.')
    return
  }

  const added = await appendMasterEvents(toInsert)
  console.log(`Applied: appendMasterEvents added ${added} (requested ${toInsert.length}).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
