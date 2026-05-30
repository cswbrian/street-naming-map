#!/usr/bin/env node
/**
 * Fix Tier B (misparsed egazette) and Tier C (deletion notices).
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const MONTHS = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

function parseDate(text) {
  let fixed = String(text ?? '').replace(
    /(January|February|March|April|May|June|July|August|September|October|November|December)(\d{4})/i,
    '$1 $2',
  )
  fixed = fixed.replace(/\bm\s+ay\b/i, 'May').replace(/\s+/g, ' ')
  const m = fixed.match(
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  )
  if (!m) return null
  return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${String(m[1]).padStart(2, '0')}`
}

function normalizeName(s) {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

async function pdfText(url, cachePath) {
  await mkdir(path.dirname(cachePath), { recursive: true })
  execSync(`curl -fsSL -o "${cachePath}" "${url}"`, { stdio: 'pipe' })
  const data = new Uint8Array(await readFile(cachePath))
  const doc = await getDocument({ data, useSystemFonts: true }).promise
  let text = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text += `${content.items.map((it) => it.str).join(' ')} `
  }
  return text.replace(/\s+/g, ' ').trim()
}

const DISTRICT_PREFIXES = [
  'Kowloon City',
  'Wong Tai Sin',
  'Kwun Tong',
  'Eastern',
  'Sha Tin',
  'Islands',
  'New Territories',
  'Hong Kong Island',
]

function stripDistrictPrefix(name) {
  let s = String(name ?? '').trim().replace(/\s+/g, ' ')
  for (const prefix of DISTRICT_PREFIXES) {
    if (s.startsWith(`${prefix} `)) s = s.slice(prefix.length + 1).trim()
  }
  return s
}

/** Deletion notice: "Street Name G.N. n dated d" rows (table or inline). */
function parseDeletionNamedIn(text) {
  const rows = []
  const re =
    /([A-Za-z][A-Za-z0-9\s\-]{3,80}?)\s+G\.?\s*N\.?\s*(\d+)\s+dated\s+(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4})/gi
  let m
  while ((m = re.exec(text)) !== null) {
    const rawName = stripDistrictPrefix(m[1].trim().replace(/\s+/g, ' '))
    if (/^(Street|Named|Notice|Director|Department|Deletion|District)/i.test(rawName)) continue
    const date = parseDate(m[3])
    if (!date) continue
    rows.push({
      rawName,
      normName: normalizeName(rawName),
      gazette_notice_label: `G.N.${m[2]}`,
      publication_date: date,
    })
  }
  return rows
}

/** Single-street deletion: "that CARGO CIRCUIT ... named in G.N. 3682 dated ..." */
function parseSingleStreetDeletion(text) {
  const m = text.match(
    /that\s+([A-Za-z][A-Za-z0-9\s\-]+?)\s+in\s+the\s+district[\s\S]*?named\s+in\s+G\.?\s*N\.?\s*(\d+)\s+dated\s+(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4})/i,
  )
  if (!m) return null
  const date = parseDate(m[3])
  if (!date) return null
  const rawName = m[1].trim().replace(/\s+/g, ' ')
  return {
    rawName,
    normName: normalizeName(rawName),
    gazette_notice_label: `G.N.${m[2]}`,
    publication_date: date,
  }
}

/** OCR-broken single street (e.g. G.N.6002 Cheong Lin Path). */
function parseBrokenSingleDeletion(text, streetEn) {
  const gn = text.match(/G\.?\s*n\.?\s*(\d+)\s+dated\s+([\d\sA-Za-z]+?\d{4})/i)
  if (!gn) return null
  const date = parseDate(gn[2])
  if (!date) return null
  const blob = normalizeName(text)
  const target = normalizeName(streetEn)
  if (!blob.includes(target) && !blob.includes(target.replace(/PATH$/, ''))) return null
  return {
    rawName: streetEn,
    normName: normalizeName(streetEn),
    gazette_notice_label: `G.N.${gn[1]}`,
    publication_date: date,
  }
}

/** Hard-coded "Named in" when PDF OCR is unusable. */
const TIER_C_MANUAL_NAMED_IN = {
  '2021-09-24|GN6002|0': {
    gazette_notice_label: 'G.N.3296',
    publication_date: '2002-05-31',
  },
}

function matchNamedInRow(namedIn, streetEn) {
  const target = normalizeName(streetEn)
  return (
    namedIn.find((n) => n.normName === target) ||
    namedIn.find((n) => n.normName.endsWith(target) || target.endsWith(n.normName))
  )
}

/** Parse misparsed egazette street_name_en */
function parseMisparsedField(s) {
  const cleaned = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const m = cleaned.match(
    /^(.+?)\s+G\.?\s*n\.?\s*(\d+)\s+Dated\s+(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i,
  )
  if (!m) return null
  const streetPart = m[1].replace(/\s+/g, ' ').trim()
  const date = parseDate(m[3])
  if (!date) return null
  return {
    streetGuess: streetPart,
    normGuess: normalizeName(streetPart),
    gazette_notice_label: `G.N.${m[2]}`,
    publication_date: date,
  }
}

/** Tier B: map event_id -> real street from landsd replace_description (excluded) or manual */
const TIER_B_EVENT_MAP = {
  '2019-05-31|GN3587|0': { en: 'Lung Ma Road', zh: '龍馬路' },
  '2020-06-12|GN3237|0': { en: 'Luk Mei Tsuen Road', zh: '鹿尾村路' },
  '2020-04-03|GN1670|0': { en: 'Nam Hing West Road', zh: '南慶西路' },
  '2020-06-12|GN3235|0': { en: 'Shing Fung Road', zh: '承豐道' },
  '2020-08-07|GN4509|0': { en: 'Wing Fook Street', zh: '永福街' },
  '2021-12-03|GN7634|0': { en: 'Fu Tei Road', zh: '富地路' },
  '2021-09-24|GN6004|0': { en: 'Sky City Road East', zh: '航天城東路' },
  '2021-09-24|GN6004|1': { en: 'Sky City Road', zh: '航天城路' },
  '2021-10-08|GN6314|0': { en: 'Yuen Long Pau Cheung Square', zh: '元朗炮仗坊' },
  '2022-11-25|GN6836|0': { en: 'Wan O Road', zh: '環澳路' },
  '2023-05-05|GN2752|0': { en: 'Chun Tin Street', zh: '春田街' },
  '2025-07-25|GN4610|0': { en: 'Ying Hei Road', zh: '迎禧路' },
  '2023-03-24|GN1790|0': { en: 'Shing Fung Road', zh: '承豐道' },
  '2024-08-16|GN4838|0': { en: 'Chui Kwan Drive', zh: '翠群徑' },
  '2024-12-06|GN7370|0': { en: 'Shing Cheong Road', zh: '承昌道' },
  '2025-11-21|GN7382|0': { en: 'Yau Ma Tei Interchange', zh: '油麻地交匯處' },
  '2025-12-19|GN8147|0': { en: 'Cultural Drive', zh: '文化道' },
}

async function main() {
  const audit = JSON.parse(
    await readFile(path.join(projectRoot, 'public/data/master/audit-naming-years-2000-2026.json'), 'utf8'),
  )
  const landsd = JSON.parse(
    await readFile(path.join(projectRoot, 'public/data/master/landsd-street-events-2016plus.json'), 'utf8'),
  )
  const combined = JSON.parse(
    await readFile(path.join(projectRoot, 'public/data/master/street-events-combined.json'), 'utf8'),
  )
  const geo = JSON.parse(await readFile(path.join(projectRoot, 'public/data/hk-streets.geojson'), 'utf8'))
  const history = JSON.parse(
    await readFile(path.join(projectRoot, 'data/crowdsubmissions/street-name-history.json'), 'utf8'),
  )
  const exclPath = path.join(projectRoot, 'data/naming-date-exclusions.json')
  const excl = JSON.parse(await readFile(exclPath, 'utf8'))
  const exclIds = new Set(excl.event_ids || [])

  const codeByName = new Map()
  for (const f of geo.features) {
    const en = (f.properties.ENGLISHSTREETNAME || '').trim().toUpperCase()
    const zh = (f.properties.CHINESESTREETNAME || '').trim()
    const code = String(f.properties.STREETCODE || '')
    if (code) codeByName.set(`${en}|${zh}`, code)
  }
  let pendingRoads = []
  try {
    const pending = JSON.parse(
      await readFile(path.join(projectRoot, 'public/data/master/pending-naming-years.json'), 'utf8'),
    )
    pendingRoads = pending.roads ?? []
    for (const road of pendingRoads) {
      const en = (road.english_name || '').trim().toUpperCase()
      const zh = (road.chinese_name || '').trim()
      const code = String(road.street_code || '').trim()
      if (code && en) codeByName.set(`${en}|${zh}`, code)
    }
  } catch {
    /* optional */
  }

  function lookupCode(en, zh) {
    return codeByName.get(`${en.toUpperCase()}|${zh}`) || ''
  }

  const historyKeys = new Set(
    history.map(
      (h) =>
        `${h.street_code || h.street_name_en}|${h.street_name_zh || ''}|${h.publication_date}|${h.gazette_notice_label}`,
    ),
  )

  const tierB = audit.rows.filter((r) => r.tier === 'B_egazette_misparsed_name')
  const tierC = audit.rows.filter((r) => r.tier === 'C_deletion_notice')
  const byLandsd = new Map(landsd.map((e) => [e.event_id, e]))

  const newExclusions = []
  const batchGroups = new Map()

  // --- Tier B: exclude all misparsed egazette + add crowd where not already in history ---
  for (const row of tierB) {
    const eid = row.driving_event_id
    newExclusions.push(eid)

    const ev = combined.find((e) => e.event_id === eid && e.source === 'egazette_pdf')
    const mapped = TIER_B_EVENT_MAP[eid]
    const parsed = parseMisparsedField(row.english_name || ev?.street_name_en)
    if (!mapped || !parsed) continue

    const en = mapped.en
    const zh = mapped.zh
    const code = lookupCode(en, zh)

    const histKey = `${en}|${zh}|${parsed.publication_date}|${parsed.gazette_notice_label}`
    if (historyKeys.has(histKey)) continue

    const landsdEv = byLandsd.get(eid)
    const noticeDate = landsdEv?.publication_date || row.naming_date
    const noticeNo = landsdEv?.notice_no || row.driving_notice?.replace('G.N.', 'GN')
    const gnLabel = `G.N.${String(noticeNo).replace(/^GN/i, '')}`
    const batchKey = `${noticeDate}|${noticeNo}`

    if (!batchGroups.has(batchKey)) {
      const url = landsdEv?.government_notice_url_en
      const fname = url?.split('/').pop() || 'notice.pdf'
      batchGroups.set(batchKey, {
        batch_id: `${noticeDate.slice(0, 4)}-${String(noticeNo).toLowerCase()}-tier-b`,
        gazette_notice_label: gnLabel,
        publication_date: noticeDate,
        pdf_en: `data/crowdsubmissions/batch-inbox/tier-bc-${String(noticeNo).toLowerCase()}/${fname}`,
        pdf_zh: landsdEv?.government_notice_url_zh
          ? `data/crowdsubmissions/batch-inbox/tier-bc-${String(noticeNo).toLowerCase()}/${landsdEv.government_notice_url_zh.split('/').pop()}`
          : null,
        remarks: `${gnLabel} misparsed egazette row; canonical date from Previous G.N. in notice text.`,
        streets: [],
        url_en: url,
      })
    }

    batchGroups.get(batchKey).streets.push({
      street_code: code,
      english_name: en.toUpperCase(),
      chinese_name: zh,
      history: [
        {
          publication_date: parsed.publication_date,
          change_kind: 'declare',
          street_name_en: en,
          street_name_zh: zh,
          gazette_notice_label: parsed.gazette_notice_label,
          evidence_level: 'historical',
          is_declaration_event: true,
          submitter_remarks: `Parsed from misparsed egazette text; cited in ${gnLabel} (${noticeDate}).`,
        },
      ],
    })
    historyKeys.add(histKey)
  }

  // Also exclude any remaining egazette with G.n. in name
  for (const ev of combined) {
    if (ev.source !== 'egazette_pdf') continue
    if (!/G\.?n\.|Dated/i.test(ev.street_name_en || '')) continue
    if (!exclIds.has(ev.event_id) && !newExclusions.includes(ev.event_id)) {
      newExclusions.push(ev.event_id)
    }
  }

  // --- Tier C: deletion notices ---
  const cNotices = new Map()
  for (const row of tierC) {
    const eid = row.driving_event_id
    newExclusions.push(eid)
    const ev = byLandsd.get(eid)
    if (!ev) continue
    const key = `${ev.publication_date}|${ev.notice_no}`
    if (!cNotices.has(key)) {
      cNotices.set(key, {
        notice_no: ev.notice_no,
        date: ev.publication_date,
        gn: ev.government_notice_label_en,
        url_en: ev.government_notice_url_en,
        url_zh: ev.government_notice_url_zh,
        streets: [],
      })
    }
    cNotices.get(key).streets.push({
      event_id: eid,
      en: row.english_name,
      zh: row.chinese_name,
    })
  }

  const cacheDir = path.join(projectRoot, 'data/crowdsubmissions/batch-inbox/tier-bc-pdf-cache')
  for (const notice of cNotices.values()) {
    const fname = notice.url_en.split('/').pop()
    const text = await pdfText(notice.url_en, path.join(cacheDir, fname))
    let namedIn = parseDeletionNamedIn(text)
    if (!namedIn.length) {
      const single = parseSingleStreetDeletion(text)
      if (single) namedIn = [single]
    }

    const batchKey = `del|${notice.date}|${notice.notice_no}`
    for (const street of notice.streets) {
      const code = lookupCode(street.en, street.zh)
      let hit = matchNamedInRow(namedIn, street.en)
      if (!hit && notice.streets.length === 1) {
        hit = parseBrokenSingleDeletion(text, street.en)
      }
      const manual = TIER_C_MANUAL_NAMED_IN[street.event_id]
      if (!hit && manual) {
        hit = {
          rawName: street.en,
          normName: normalizeName(street.en),
          gazette_notice_label: manual.gazette_notice_label,
          publication_date: manual.publication_date,
        }
      }
      if (!hit) continue

      const histKey = `${street.en}|${street.zh}|${hit.publication_date}|${hit.gazette_notice_label}`
      if (historyKeys.has(histKey)) continue

      if (!batchGroups.has(batchKey)) {
        batchGroups.set(batchKey, {
          batch_id: `${notice.date.slice(0, 4)}-${notice.notice_no.toLowerCase()}-tier-c`,
          gazette_notice_label: notice.gn,
          publication_date: notice.date,
          pdf_en: `data/crowdsubmissions/batch-inbox/tier-bc-${notice.notice_no.toLowerCase()}/${fname}`,
          pdf_zh: notice.url_zh
            ? `data/crowdsubmissions/batch-inbox/tier-bc-${notice.notice_no.toLowerCase()}/${notice.url_zh.split('/').pop()}`
            : null,
          remarks: `${notice.gn} (${notice.date}) deletes street name; original naming from "Named in" column.`,
          streets: [],
          url_en: notice.url_en,
        })
      }

      const batchStreet = {
        street_code: code,
        english_name: street.en.toUpperCase(),
        chinese_name: street.zh,
        history: [
          {
            publication_date: hit.publication_date,
            change_kind: 'declare',
            street_name_en: street.en,
            street_name_zh: street.zh,
            gazette_notice_label: hit.gazette_notice_label,
            evidence_level: 'historical',
            is_declaration_event: true,
            submitter_remarks: `Original naming ("Named in") cited in deletion notice ${notice.gn} (${notice.date}).`,
          },
        ],
      }
      if (!code) batchStreet.allow_name_only = true
      batchGroups.get(batchKey).streets.push(batchStreet)
      historyKeys.add(histKey)
    }
  }

  // Write exclusions
  for (const id of newExclusions) {
    if (!exclIds.has(id)) {
      excl.event_ids.push(id)
      exclIds.add(id)
      if (!excl.notes[id]) {
        const isDel = tierC.some((r) => r.driving_event_id === id)
        excl.notes[id] = isDel
          ? 'Tier C — deletion notice; use original "Named in" G.N. date, not deletion date.'
          : 'Tier B — misparsed egazette_pdf row; excluded in favour of crowd historical date.'
      }
    }
  }
  await writeFile(exclPath, `${JSON.stringify(excl, null, 2)}\n`)

  // Write batches
  const batchDir = path.join(projectRoot, 'data/crowdsubmissions/batches')
  const written = []
  for (const batch of batchGroups.values()) {
    if (!batch.streets.length) continue
    if (batch.pdf_en && batch.url_en) {
      const dir = path.join(projectRoot, path.dirname(batch.pdf_en))
      await mkdir(dir, { recursive: true })
      try {
        execSync(`curl -fsSL -o "${path.join(projectRoot, batch.pdf_en)}" "${batch.url_en}"`, {
          stdio: 'pipe',
        })
      } catch {
        /* en pdf optional */
      }
    }
    const out = path.join(batchDir, `${batch.batch_id}.json`)
    const payload = { ...batch, allow_name_only: batch.streets.some((s) => s.allow_name_only) }
    delete payload.url_en
    await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`)
    written.push(batch.batch_id)
  }

  console.log(
    JSON.stringify(
      {
        exclusions_added: newExclusions.length,
        batches_written: written.length,
        streets_in_batches: [...batchGroups.values()].reduce((n, b) => n + b.streets.length, 0),
        batch_ids: written,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
