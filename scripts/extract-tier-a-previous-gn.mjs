#!/usr/bin/env node
/**
 * Parse LandsD replace-description notices for Tier A streets.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

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

function parseGazetteDate(text) {
  const m = text.match(
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
  try {
    await mkdir(path.dirname(cachePath), { recursive: true })
    execSync(`curl -fsSL -o "${cachePath}" "${url}"`, { stdio: 'pipe' })
  } catch {
    return null
  }
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

/** "X and Y ... G.N. a dated ... and G.N. b dated ... respectively" */
function extractDualStreetRespective(text) {
  const m = text.match(
    /descriptions? of\s+([A-Z][A-Z0-9\s]+?)\s+and\s+([A-Z][A-Z0-9\s]+?)\s+in the district/i,
  )
  const gns = [
    ...text.matchAll(
      /G\.?\s*N\.?\s*(\d+)\s+dated\s+(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/gi,
    ),
  ]
  if (!m || gns.length < 2) return null
  const names = [m[1], m[2]].map((n) => n.trim().replace(/\s+/g, ' '))
  return names.map((rawName, i) => {
    const g = gns[i]
    const date = parseGazetteDate(g[2])
    return date
      ? {
          rawName,
          normName: normalizeName(rawName),
          gazette_notice_label: `G.N.${g[1]}`,
          publication_date: date,
        }
      : null
  }).filter(Boolean)
}

/** Single-street notices: Previous G.N. in preamble after "replace that set out in" */
function extractSingleStreetPreamble(text) {
  const intro = text.split(/with immediate effect/i)[0] ?? text
  const nameM = intro.match(/description of\s+([A-Z][A-Z0-9\s\-]+?)\s+in the district/i)
  const gnMatches = [
    ...intro.matchAll(
      /G\.?\s*N\.?\s*(\d+)\s+dated\s+(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/gi,
    ),
  ]
  if (!nameM || !gnMatches.length) return null
  const first = gnMatches[0]
  const date = parseGazetteDate(first[2])
  if (!date) return null
  const rawName = nameM[1].trim().replace(/\s+/g, ' ')
  return {
    rawName,
    normName: normalizeName(rawName),
    gazette_notice_label: `G.N.${first[1]}`,
    publication_date: date,
  }
}

/** Each entry: name line immediately before first G.N. for that street */
function extractNameGnPairs(text) {
  const pairs = []
  const re =
    /([A-Z][A-Z0-9\s\-]{2,55}?)\s+G\.?\s*N\.?\s*(\d+)\s+dated\s+(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/gi
  let m
  while ((m = re.exec(text)) !== null) {
    const rawName = m[1].trim().replace(/\s+/g, ' ')
    if (/^(DESCRIPTION|NAME|PREVIOUS|THE|ITS|PLAN|COPY|NOTICE)/i.test(rawName)) continue
    if (rawName.length < 4) continue
    const date = parseGazetteDate(m[3])
    if (!date) continue
    pairs.push({
      rawName,
      normName: normalizeName(rawName),
      gazette_notice_label: `G.N.${m[2]}`,
      publication_date: date,
    })
  }
  return pairs
}

function matchStreet(street, pairs) {
  const target = normalizeName(street.en)
  let hit =
    pairs.find((p) => p.normName === target) ||
    pairs.find((p) => p.normName.includes(target) || target.includes(p.normName))
  if (!hit && street.en.includes(' ')) {
    const compact = street.en.split(/\s+/).map(normalizeName).join('')
    hit = pairs.find((p) => p.normName === compact || p.normName.includes(compact))
  }
  return hit ?? null
}

async function main() {
  const audit = JSON.parse(
    await readFile(path.join(projectRoot, 'public/data/master/audit-naming-years-2000-2026.json'), 'utf8'),
  )
  const landsd = JSON.parse(
    await readFile(path.join(projectRoot, 'public/data/master/landsd-street-events-2016plus.json'), 'utf8'),
  )
  const geo = JSON.parse(await readFile(path.join(projectRoot, 'public/data/hk-streets.geojson'), 'utf8'))
  const codeByName = new Map()
  for (const f of geo.features) {
    const en = (f.properties.ENGLISHSTREETNAME || '').trim().toUpperCase()
    const zh = (f.properties.CHINESESTREETNAME || '').trim()
    const code = String(f.properties.STREETCODE || '')
    if (code) codeByName.set(`${en}|${zh}`, code)
  }

  const tierA = audit.rows.filter((r) => r.tier === 'A_replace_description')
  const byEvent = new Map(landsd.map((e) => [e.event_id, e]))
  const notices = new Map()
  for (const r of tierA) {
    const ev = byEvent.get(r.driving_event_id)
    const en = (r.english_name || '').trim()
    const zh = (r.chinese_name || '').trim()
    const code = r.street_code || codeByName.get(`${en.toUpperCase()}|${zh}`) || ''
    const gnKey = `${r.naming_date}|${ev?.notice_no}`
    if (!notices.has(gnKey)) {
      const fname = ev?.government_notice_url_en?.split('/').pop() || 'notice.pdf'
      notices.set(gnKey, {
        gn: r.driving_notice,
        date: r.naming_date,
        notice_no: ev?.notice_no,
        url_en: ev?.government_notice_url_en,
        url_zh: ev?.government_notice_url_zh,
        pdf_en: `data/crowdsubmissions/batch-inbox/tier-a-${ev?.notice_no?.toLowerCase()}/${fname}`,
        pdf_zh: `data/crowdsubmissions/batch-inbox/tier-a-${ev?.notice_no?.toLowerCase()}/${ev?.government_notice_url_zh?.split('/').pop()}`,
        streets: [],
      })
    }
    notices.get(gnKey).streets.push({
      event_id: r.driving_event_id,
      code,
      en,
      zh,
    })
  }

  const exclusions = []
  const batches = []
  const failures = []
  const cacheDir = path.join(projectRoot, 'data/crowdsubmissions/batch-inbox/tier-a-pdf-cache')

  for (const notice of notices.values()) {
    const fname = notice.url_en.split('/').pop()
    const text = await pdfText(notice.url_en, path.join(cacheDir, fname))
    if (!text) {
      failures.push({ notice: notice.gn, error: 'pdf_failed' })
      continue
    }
    let pairs = extractNameGnPairs(text)
    if (pairs.length < notice.streets.length) {
      const dual = extractDualStreetRespective(text)
      if (dual?.length) pairs = dual
      else {
        const single = extractSingleStreetPreamble(text)
        if (single) pairs = [...pairs, single]
      }
    }
    const batchStreets = []
    for (const street of notice.streets) {
      exclusions.push(street.event_id)
      const code =
        street.code || codeByName.get(`${street.en.toUpperCase()}|${street.zh}`) || ''
      let hit = matchStreet(street, pairs)
      if (!hit && notice.streets.length === 1 && pairs.length === 1) {
        hit = pairs[0]
      }
      // Chi Kiang vs Chi Kiang spelling in PDF
      if (!hit && normalizeName(street.en).includes('CHIKIANG')) {
        hit = pairs.find((p) => p.normName.includes('CHIKIANG') || p.rawName.includes('KIANG'))
      }
      if (!hit) {
        failures.push({
          notice: notice.gn,
          street: street.en,
          error: 'name_not_matched',
          pairs: pairs.map((p) => p.rawName),
        })
        continue
      }
      if (!code) {
        failures.push({ notice: notice.gn, street: street.en, error: 'missing_street_code' })
        continue
      }
      batchStreets.push({
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
            submitter_remarks: `First Previous G.N. for ${street.zh} cited in ${notice.gn} (${notice.date}).`,
          },
        ],
      })
    }
    if (!batchStreets.length) continue
    batches.push({
      batch_id: `${notice.date.slice(0, 4)}-${notice.notice_no.toLowerCase()}-tier-a`,
      source: 'crowdsubmitted',
      gazette_notice_label: notice.gn,
      publication_date: notice.date,
      pdf_en: notice.pdf_en,
      pdf_zh: notice.pdf_zh,
      remarks: `${notice.gn} (${notice.date}) replaces street description only (Tier A bulk fix).`,
      streets: batchStreets,
    })
  }

  const batchDir = path.join(projectRoot, 'data/crowdsubmissions/batches')
  await mkdir(batchDir, { recursive: true })
  for (const batch of batches) {
    await writeFile(
      path.join(batchDir, `${batch.batch_id}.json`),
      `${JSON.stringify(batch, null, 2)}\n`,
    )
  }

  await writeFile(
    path.join(projectRoot, 'data/crowdsubmissions/tier-a-manifest.json'),
    JSON.stringify({ batches: batches.length, streets: batches.reduce((n, b) => n + b.streets.length, 0), exclusions: exclusions.length, failures }, null, 2),
  )
  await writeFile(
    path.join(projectRoot, 'data/crowdsubmissions/tier-a-exclusions.json'),
    JSON.stringify({ event_ids: [...new Set(exclusions)] }, null, 2),
  )
  console.log(
    `batches=${batches.length} streets=${batches.reduce((n, b) => n + b.streets.length, 0)} failures=${failures.length}`,
  )
  if (failures.length) console.log(JSON.stringify(failures, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
