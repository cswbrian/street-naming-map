/** Normalize and extract gazette_location from notice text or batch history rows. */

const PLAN_LABEL_RE = /\b([A-Z]{2,4}RM\d+[a-z]?)\b/gi
const LENGTH_M_RE = /approximately\s+([\d,.]+)\s*metres?/i
const LENGTH_M_ZH_RE = /長約\s*([\d,.]+)\s*米/
const JUNCTION_EN_RE =
  /\b(?:junction with|starts from its junction with|ends at its junction with|commencing at its junction with)\s+([^.;]+?)(?:\s+and|\s+where|\.|;|$)/gi
const UNNAMED_JUNCTION_RE =
  /unnamed road near ([^.]+?)(?:\.|,|\s+It\s)/gi
const DISTRICT_EN_RE =
  /district of\s+([^,]+?),\s*New Territories|in the district of\s+([^,]+?),\s*New Territories|in\s+([^,]+?),\s*Hong Kong Island|Central and Western District/i
const DISTRICT_ZH_RE = /位於新界([^，的]+)區|位於香港([^，的]+)區|中西區/

function cleanText(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractPlanRefs(text) {
  const labels = []
  let m = PLAN_LABEL_RE.exec(text)
  while (m) {
    labels.push(m[1].toUpperCase().replace(/\s+/g, ''))
    m = PLAN_LABEL_RE.exec(text)
  }
  return [...new Set(labels)].map((label) => ({ label, color: null, url_en: null }))
}

function extractReferencedStreets(text) {
  const streets = new Set()
  let m = JUNCTION_EN_RE.exec(text)
  while (m) {
    const phrase = cleanText(m[1])
    if (phrase && !/^an?\s+unnamed/i.test(phrase)) streets.add(phrase)
    m = JUNCTION_EN_RE.exec(text)
  }
  return [...streets]
}

function extractUnnamedJunctions(text) {
  const refs = []
  let m = UNNAMED_JUNCTION_RE.exec(text)
  while (m) {
    refs.push(cleanText(m[1]))
    m = UNNAMED_JUNCTION_RE.exec(text)
  }
  return refs
}

function extractDistrict(textEn, textZh) {
  const en = String(textEn ?? '')
  const zh = String(textZh ?? '')
  let districtEn = null
  let districtZh = null

  const d1 = en.match(/district of\s+([^,]+?),\s*New Territories/i)
  const d2 = en.match(/in\s+([^,]+?),\s*Hong Kong Island/i)
  const d3 = en.match(/Central and Western District/i)
  if (d1) districtEn = `${cleanText(d1[1])}, New Territories`
  else if (d2) districtEn = `${cleanText(d2[1])}, Hong Kong Island`
  else if (d3) districtEn = 'Central and Western District'

  const z1 = zh.match(/位於新界([^，的]+)區/)
  const z2 = zh.match(/位於香港([^，的]+)區/)
  const z3 = zh.match(/中西區/)
  if (z1) districtZh = `${z1[1]}區`
  else if (z2) districtZh = `${z2[1]}區`
  else if (z3) districtZh = '中西區'

  return { district_en: districtEn, district_zh: districtZh }
}

/** Extract Description | Name block from modern Lands Dept notice (egn/cgn). */
export function extractModernDescriptionBlocks(textEn = '', textZh = '') {
  const en = String(textEn ?? '')
  const zh = String(textZh ?? '')

  const enMatch = en.match(
    /Description\s+Name\s+(The (?:street|road)[\s\S]*?)(?:\n\s*[A-Z][A-Z\s()]+\n|A copy of Plan)/i,
  )
  const zhMatch = zh.match(
    /說明\s+名稱\s+(這(?:街道|道路)[\s\S]*?)(?:\n\s*[\u4e00-\u9fff]+\n|查閱)/,
  )

  const descriptionRawEn = enMatch ? cleanText(enMatch[1]) : null
  const descriptionRawZh = zhMatch ? cleanText(zhMatch[1].replace(/\s+/g, '')) : null

  const combined = `${descriptionRawEn ?? ''} ${descriptionRawZh ?? ''} ${en} ${zh}`
  const lengthM =
    Number(String(enMatch?.[1] ?? '').match(LENGTH_M_RE)?.[1]?.replace(/,/g, '')) ||
    Number(String(zhMatch?.[1] ?? '').match(LENGTH_M_ZH_RE)?.[1]?.replace(/,/g, '')) ||
    null

  const planRefs = extractPlanRefs(combined)
  const referencedStreets = extractReferencedStreets(descriptionRawEn ?? en)
  const unnamedJunctionRefs = extractUnnamedJunctions(descriptionRawEn ?? en)
  const { district_en, district_zh } = extractDistrict(en, zh)

  const parsed = {
    road_form: /\bhighway\b/i.test(combined) ? 'highway' : /\bcul-de-sac\b/i.test(combined) ? 'cul_de_sac' : 'thoroughfare',
    is_cul_de_sac: /\bcul-de-sac\b/i.test(combined),
    is_highway: /\bhighway\b/i.test(combined),
    is_proposed: /\bproposed\b/i.test(combined) || /擬建/.test(zh),
    is_partially_formed: /not yet being surfaced|obstructed at/i.test(combined),
    suffix_pending_removal: /to be dropped later|後綴.*將.*刪除/.test(combined),
    includes_boundary_sections: /with and including that section/i.test(combined),
    is_open_space: /\bopen space\b/i.test(combined),
    commences_at_en: null,
    terminates_at_en: null,
    runs: [],
    length_m: lengthM || null,
    length_unit: lengthM ? 'm' : null,
    plan_refs: planRefs,
    district_en,
    district_zh,
    lot_refs: [],
    formerly_section_of_en: /formerly section of\s+([^,]+)/i.test(combined)
      ? cleanText(combined.match(/formerly section of\s+([^,]+)/i)[1])
      : null,
    split_boundary_en: null,
    referenced_streets_en: referencedStreets,
    unnamed_junction_refs_en: unnamedJunctionRefs,
    replaces_gn_labels: [],
    merged_from_en: [],
    merged_from_zh: [],
  }

  return {
    description_raw_en: descriptionRawEn,
    description_raw_zh: descriptionRawZh,
    parsed,
  }
}

export function normalizeGazetteLocation(raw) {
  if (!raw || typeof raw !== 'object') return null

  const parsedIn = raw.parsed && typeof raw.parsed === 'object' ? raw.parsed : {}
  const planRefs = Array.isArray(parsedIn.plan_refs)
    ? parsedIn.plan_refs.map((ref) => ({
        label: ref?.label ?? null,
        color: ref?.color ?? null,
        url_en: ref?.url_en ?? null,
      }))
    : []

  return {
    description_raw_en: raw.description_raw_en ?? null,
    description_raw_zh: raw.description_raw_zh ?? null,
    parsed: {
      road_form: parsedIn.road_form ?? null,
      is_cul_de_sac: Boolean(parsedIn.is_cul_de_sac),
      is_highway: Boolean(parsedIn.is_highway),
      is_proposed: Boolean(parsedIn.is_proposed),
      is_partially_formed: Boolean(parsedIn.is_partially_formed),
      suffix_pending_removal: Boolean(parsedIn.suffix_pending_removal),
      includes_boundary_sections: Boolean(parsedIn.includes_boundary_sections),
      is_open_space: Boolean(parsedIn.is_open_space),
      commences_at_en: parsedIn.commences_at_en ?? null,
      terminates_at_en: parsedIn.terminates_at_en ?? null,
      runs: Array.isArray(parsedIn.runs) ? parsedIn.runs : [],
      length_m: parsedIn.length_m ?? null,
      length_unit: parsedIn.length_unit ?? null,
      plan_refs: planRefs,
      district_en: parsedIn.district_en ?? null,
      district_zh: parsedIn.district_zh ?? null,
      lot_refs: Array.isArray(parsedIn.lot_refs) ? parsedIn.lot_refs : [],
      formerly_section_of_en: parsedIn.formerly_section_of_en ?? null,
      split_boundary_en: parsedIn.split_boundary_en ?? null,
      referenced_streets_en: Array.isArray(parsedIn.referenced_streets_en)
        ? parsedIn.referenced_streets_en
        : [],
      unnamed_junction_refs_en: Array.isArray(parsedIn.unnamed_junction_refs_en)
        ? parsedIn.unnamed_junction_refs_en
        : [],
      replaces_gn_labels: Array.isArray(parsedIn.replaces_gn_labels) ? parsedIn.replaces_gn_labels : [],
      merged_from_en: Array.isArray(parsedIn.merged_from_en) ? parsedIn.merged_from_en : [],
      merged_from_zh: Array.isArray(parsedIn.merged_from_zh) ? parsedIn.merged_from_zh : [],
    },
  }
}

/** Dual-write plan_refs labels to related_gazette_plan_labels_* when present. */
export function planLabelsFromGazetteLocation(gazetteLocation) {
  const refs = gazetteLocation?.parsed?.plan_refs ?? []
  return refs.map((r) => r.label).filter(Boolean)
}

export function buildGazetteLocationFromDescription(descriptionEn, descriptionZh) {
  if (!descriptionEn && !descriptionZh) return null
  const combined = `${descriptionEn ?? ''} ${descriptionZh ?? ''}`
  return normalizeGazetteLocation({
    description_raw_en: descriptionEn ?? null,
    description_raw_zh: descriptionZh ?? null,
    parsed: {
      ...extractModernDescriptionBlocks(descriptionEn ?? combined, descriptionZh ?? '').parsed,
      plan_refs: extractPlanRefs(combined),
    },
  })
}
