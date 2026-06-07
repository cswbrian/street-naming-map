#!/usr/bin/env node
/**
 * Compare eGazette pilot parse output against LandsD 2016+ ground truth.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { normalizeNoticeNo, normalizeStreetName, streetNamesMatch } from './lib/street-naming-core.mjs'
import { PILOT_NOTICE_KEYS } from './lib/egazette-pilot-notices.mjs'
import { projectRoot } from './lib/data-paths.mjs'
import { loadMasterEventsBySource } from './lib/master-street-events.mjs'

const PARSED_PILOT = path.join(
  projectRoot,
  'data',
  'egazette',
  'parsed',
  'egazette-street-events-pilot.json',
)
const QA_JSON = path.join(projectRoot, 'data', 'egazette', 'pilot-qa-report.json')
const QA_MD = path.join(projectRoot, 'data', 'egazette', 'pilot-qa-report.md')

function noticeNoFromKey(noticeKey) {
  const match = noticeKey.match(/^(\d+)-(\d+)-(\d+)-(\d+)-/)
  return match ? normalizeNoticeNo(match[4]) : null
}

function groupByNotice(events) {
  const map = new Map()
  for (const event of events) {
    const gn = normalizeNoticeNo(event.notice_no)
    if (!map.has(gn)) map.set(gn, [])
    map.get(gn).push(event)
  }
  return map
}

function matchEvents(parsed, expected) {
  const used = new Set()
  const rows = []

  for (const exp of expected) {
    const match = parsed.find(
      (p, idx) =>
        !used.has(idx) &&
        streetNamesMatch(p, exp) &&
        normalizeNoticeNo(p.notice_no) === normalizeNoticeNo(exp.notice_no),
    )
    const idx = match ? parsed.indexOf(match) : -1
    if (idx >= 0) used.add(idx)

    const fieldMatches = {
      publication_date: match?.publication_date === exp.publication_date,
      notice_no: match ? normalizeNoticeNo(match.notice_no) === normalizeNoticeNo(exp.notice_no) : false,
      notice_type_normalized: match?.notice_type_normalized === exp.notice_type_normalized,
      street_name_en:
        match &&
        normalizeStreetName(match.street_name_en) === normalizeStreetName(exp.street_name_en),
      street_name_zh:
        match &&
        String(match.street_name_zh ?? '').trim() === String(exp.street_name_zh ?? '').trim(),
    }

    rows.push({
      expected: {
        publication_date: exp.publication_date,
        notice_no: exp.notice_no,
        notice_type_normalized: exp.notice_type_normalized,
        street_name_en: exp.street_name_en,
        street_name_zh: exp.street_name_zh,
      },
      parsed: match
        ? {
            publication_date: match.publication_date,
            notice_no: match.notice_no,
            notice_type_normalized: match.notice_type_normalized,
            street_name_en: match.street_name_en,
            street_name_zh: match.street_name_zh,
          }
        : null,
      matched: Boolean(match),
      field_matches: fieldMatches,
    })
  }

  const extraParsed = parsed.filter((_, idx) => !used.has(idx))

  return { rows, extraParsed }
}

function toMarkdown(report) {
  const lines = [
    '# eGazette Pilot QA Report',
    '',
    `Generated at: ${report.generated_at}`,
    '',
    '## Summary',
    `- Notices evaluated: ${report.notices_evaluated}`,
    `- Expected street rows: ${report.totals.expected_rows}`,
    `- Matched rows: ${report.totals.matched_rows}`,
    `- Row match rate: ${(report.totals.row_match_rate * 100).toFixed(1)}%`,
    `- Field accuracy (matched rows): ${(report.totals.field_accuracy * 100).toFixed(1)}%`,
    '',
    '## Per-notice',
    '',
  ]

  for (const notice of report.per_notice) {
    lines.push(`### ${notice.notice_key} (${notice.gn})`)
    lines.push(`- Expected rows: ${notice.expected_count}, matched: ${notice.matched_count}`)
    if (notice.pre_2016) lines.push('- Pre-2016 (no LandsD ground truth)')
    if (notice.extra_parsed.length) {
      lines.push(`- Extra parsed rows: ${notice.extra_parsed.length}`)
    }
    for (const row of notice.rows) {
      const status = row.matched ? 'ok' : 'MISS'
      lines.push(
        `- [${status}] ${row.expected.street_name_en ?? '?'} / ${row.expected.street_name_zh ?? '?'}`,
      )
      if (!row.matched) continue
      const failed = Object.entries(row.field_matches).filter(([, v]) => !v).map(([k]) => k)
      if (failed.length) lines.push(`  - field mismatches: ${failed.join(', ')}`)
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

async function main() {
  const landsd = await loadMasterEventsBySource('landsd')
  const parsedFile = JSON.parse(await readFile(PARSED_PILOT, 'utf8'))
  const parsedEvents = parsedFile.events ?? parsedFile

  const landsdByGn = groupByNotice(landsd)
  const parsedByGn = groupByNotice(parsedEvents)

  const perNotice = []
  let expectedRows = 0
  let matchedRows = 0
  let fieldChecks = 0
  let fieldHits = 0

  for (const noticeKey of PILOT_NOTICE_KEYS) {
    const gn = noticeNoFromKey(noticeKey)
    const expected = landsdByGn.get(gn) ?? []
    const parsed = parsedByGn.get(gn) ?? []
    const pre2016 = Number(noticeKey.slice(0, 4)) < 2016

    if (!pre2016 && !expected.length) {
      console.warn(`Warning: no LandsD events for ${noticeKey} (${gn})`)
    }

    const { rows, extraParsed } = matchEvents(parsed, expected)
    const matchedCount = rows.filter((r) => r.matched).length

    expectedRows += expected.length
    matchedRows += matchedCount

    for (const row of rows.filter((r) => r.matched)) {
      for (const ok of Object.values(row.field_matches)) {
        fieldChecks += 1
        if (ok) fieldHits += 1
      }
    }

    perNotice.push({
      notice_key: noticeKey,
      gn,
      pre_2016: pre2016,
      expected_count: expected.length,
      parsed_count: parsed.length,
      matched_count: matchedCount,
      rows,
      extra_parsed: extraParsed,
    })
  }

  const report = {
    generated_at: new Date().toISOString(),
    notices_evaluated: PILOT_NOTICE_KEYS.length,
    totals: {
      expected_rows: expectedRows,
      matched_rows: matchedRows,
      row_match_rate: expectedRows ? matchedRows / expectedRows : 0,
      field_accuracy: fieldChecks ? fieldHits / fieldChecks : 0,
    },
    per_notice: perNotice,
  }

  await mkdir(path.dirname(QA_JSON), { recursive: true })
  await writeFile(QA_JSON, `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(QA_MD, toMarkdown(report))

  console.log('Pilot QA report:')
  console.log(`  Row match rate: ${(report.totals.row_match_rate * 100).toFixed(1)}%`)
  console.log(`  Field accuracy: ${(report.totals.field_accuracy * 100).toFixed(1)}%`)
  console.log(`  JSON: ${QA_JSON}`)
  console.log(`  MD: ${QA_MD}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
