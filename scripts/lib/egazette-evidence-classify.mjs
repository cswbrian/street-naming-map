import { buildSelfHostedPdfUrls, noticeKeyToStem } from './egazette-pdf-urls.mjs'

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

export function parseGazetteDate(text) {
  const m = String(text ?? '').match(
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  )
  if (!m) return null
  return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${String(m[1]).padStart(2, '0')}`
}

export function normalizeName(s) {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

const REPLACE_RE =
  /replace\s+(?:that|those)\s+set\s+out\s+in|will\s+replace\s+that\s+set\s+out\s+in/i
const PRIMARY_RE =
  /section\s+111C|111C\s*\(\s*1\s*\)|will\s+be\s+known\s+from\s+the\s+date\s+of\s+this\s+notice/i

export function isReplaceDescriptionNotice(text) {
  return REPLACE_RE.test(text)
}

export function isPrimaryNamingNotice(text) {
  return PRIMARY_RE.test(text) && !REPLACE_RE.test(text)
}

/** "X and Y ... G.N. a dated ... and G.N. b dated ... respectively" */
export function extractDualStreetRespective(text) {
  const m = text.match(
    /descriptions? of\s+([A-Z][A-Z0-9\s']+?)\s+and\s+([A-Z][A-Z0-9\s']+?)\s+in the district/i,
  )
  const gns = [
    ...text.matchAll(
      /G\.?\s*N\.?\s*(\d+)\s+dated\s+(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/gi,
    ),
  ]
  if (!m || gns.length < 2) return null
  const names = [m[1], m[2]].map((n) => n.trim().replace(/\s+/g, ' '))
  return names
    .map((rawName, i) => {
      const g = gns[i]
      const date = parseGazetteDate(g[2])
      return date
        ? {
            rawName,
            normName: normalizeName(rawName),
            cited_notice_label: `G.N.${g[1]}`,
            cited_publication_date: date,
          }
        : null
    })
    .filter(Boolean)
}

/** Single-street replace: first G.N. in preamble after "description of X" */
export function extractSingleStreetReplace(text) {
  const intro = text.split(/with immediate effect/i)[0] ?? text
  const nameM = intro.match(/description of\s+([A-Z][A-Z0-9\s'\-]+?)\s+in the district/i)
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
    cited_notice_label: `G.N.${first[1]}`,
    cited_publication_date: date,
  }
}

/** Name line immediately before G.N. (multi-entry notices) */
export function extractNameGnPairs(text) {
  const pairs = []
  const re =
    /([A-Z][A-Z0-9\s'\-]{2,55}?)\s+G\.?\s*N\.?\s*(\d+)\s+dated\s+(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/gi
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
      cited_notice_label: `G.N.${m[2]}`,
      cited_publication_date: date,
    })
  }
  return pairs
}

export function extractInferredHits(text) {
  let hits = extractNameGnPairs(text)
  if (hits.length < 2) {
    const dual = extractDualStreetRespective(text)
    if (dual?.length) hits = [...hits, ...dual]
  }
  if (hits.length < 1) {
    const single = extractSingleStreetReplace(text)
    if (single) hits = [...hits, single]
  }
  const seen = new Set()
  return hits.filter((h) => {
    const key = `${h.normName}|${h.cited_notice_label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function matchStreetToHit(event, hits, geoByName) {
  const en = normalizeName(event.street_name_en)
  const zh = String(event.street_name_zh ?? '').trim()
  if (en) {
    let hit =
      hits.find((p) => p.normName === en) ||
      hits.find((p) => p.normName.includes(en) || en.includes(p.normName))
    if (hit) return hit
  }
  if (zh && geoByName?.has(zh)) {
    const geoEn = normalizeName(geoByName.get(zh).en)
    const hit = hits.find(
      (p) => p.normName === geoEn || p.normName.includes(geoEn) || geoEn.includes(p.normName),
    )
    if (hit) return hit
  }
  if (hits.length === 1) return hits[0]
  return null
}

export function buildCitingMeta(event) {
  const noticeKey = event.notice_key ?? null
  const hosted = noticeKey ? buildSelfHostedPdfUrls(noticeKey) : { en: null, zh: null }
  const stem = noticeKeyToStem(noticeKey)
  const label = event.government_notice_label_en ?? `G.N.${String(event.notice_no ?? '').replace(/^GN/i, '')}`
  return {
    notice_label: label,
    publication_date: event.publication_date ?? null,
    government_notice_url_en: event.government_notice_url_en ?? hosted.en,
    government_notice_url_zh: event.government_notice_url_zh ?? hosted.zh,
    notice_stem: stem,
  }
}

export function classifyEgazetteNoticeText(text, event, geoByName) {
  const citing = buildCitingMeta(event)

  if (isPrimaryNamingNotice(text)) {
    return {
      evidence_kind: 'gazette_primary',
      publication_date: citing.publication_date,
      derived_from: null,
      match: 'primary_111c',
    }
  }

  if (isReplaceDescriptionNotice(text)) {
    const hits = extractInferredHits(text)
    const hit = matchStreetToHit(event, hits, geoByName)
    if (!hit) {
      return { evidence_kind: 'unknown', publication_date: citing.publication_date, derived_from: null, match: 'replace_unmatched' }
    }
    return {
      evidence_kind: 'gazette_inferred',
      publication_date: hit.cited_publication_date,
      derived_from: [
        {
          kind: 'gazette_citation',
          notice_label: citing.notice_label,
          publication_date: citing.publication_date,
          government_notice_url_en: citing.government_notice_url_en,
          government_notice_url_zh: citing.government_notice_url_zh,
          cited_notice_label: hit.cited_notice_label,
          cited_publication_date: hit.cited_publication_date,
        },
      ],
      match: 'replace_cited_gn',
      cited_notice_label: hit.cited_notice_label,
    }
  }

  if (citing.government_notice_url_en || citing.government_notice_url_zh) {
    return {
      evidence_kind: 'gazette_primary',
      publication_date: citing.publication_date,
      derived_from: null,
      match: 'default_primary_pdf',
    }
  }

  return {
    evidence_kind: 'unknown',
    publication_date: citing.publication_date,
    derived_from: null,
    match: 'unclassified',
  }
}
