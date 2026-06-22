import { parseGazetteFooterDate } from './egazette-dates.mjs'
import {
  extractModernDescriptionBlocks,
  normalizeGazetteLocation,
  planLabelsFromGazetteLocation,
} from './gazette-location.mjs'
import {
  finalizeEgazetteEvent,
  normalizeNoticeNo,
  normalizeStreetName,
} from './street-naming-core.mjs'

const STREET_SUFFIX =
  '(?:Street|Road|Lane|Drive|Avenue|Highway|Path|Square|Circuit|Boulevard|Flyover|Bypass|Interchange|Crescent|Terrace|Walk|Way|Close|Gardens|Rise|View|Court|Plaza|Link|Bridge|Tunnel)'

const ZH_STREET_SUFFIX = '(?:街|路|道|臺|里|圍|巷|坊|徑|橋|高速|公路|天橋|繞道|交匯處)'

function fixSpacedCapsName(raw) {
  const tokens = raw.replace(/\s+/g, ' ').trim().split(' ')
  const words = []
  let letterBuffer = ''
  for (const token of tokens) {
    if (/^[A-Z]$/.test(token)) {
      letterBuffer += token
      continue
    }
    if (letterBuffer) {
      words.push(letterBuffer)
      letterBuffer = ''
    }
    words.push(token)
  }
  if (letterBuffer) words.push(letterBuffer)
  let result = words
    .map((w) => {
      if (/^[A-Z]{2,}$/.test(w)) {
        return w.charAt(0) + w.slice(1).toLowerCase()
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
  result = result.replace(/\bByp\s+Ass\b/i, 'Bypass').replace(/\bByp\s+A\s+Ss\b/i, 'Bypass')
  result = result.replace(/\bS\s+Treet\b/i, 'Street').replace(/\bR\s+O\s+Ad\b/i, 'Road')
  return result
}

export function detectNoticeType(textEn, textZh) {
  const combined = `${textEn} ${textZh}`

  if (
    /notice of intention to change the name of a street/i.test(combined) ||
    /更改街道名稱的意向公告/.test(combined)
  ) {
    return {
      notice_type_raw_en: 'Notice of Intention to Change the Name of a Street',
      notice_type_raw_zh: '更改街道名稱的意向公告',
      notice_type_normalized: 'intention_to_change',
    }
  }

  if (
    /replacing description of street/i.test(combined) ||
    /取代街道說明/.test(combined) ||
    /set out in G\.N\.\s*\d+/i.test(textEn)
  ) {
    return {
      notice_type_raw_en: 'Replacing description of street',
      notice_type_raw_zh: '取代街道說明',
      notice_type_normalized: 'replace_description',
    }
  }

  if (
    /declaration to change the name of a street/i.test(combined) ||
    /宣布更改街道名稱/.test(combined)
  ) {
    return {
      notice_type_raw_en: 'Declaration to Change the Name of a Street',
      notice_type_raw_zh: '宣布更改街道名稱',
      notice_type_normalized: 'chinese_correction',
    }
  }

  if (
    /declaration of street name/i.test(combined) ||
    /宣布街道名稱/.test(combined) ||
    (/Notice is hereby given under section 111C/i.test(textEn) &&
      /will be known from the date of this notice/i.test(textEn)) ||
    (/現根據/.test(textZh) && /採用以下名稱/.test(textZh))
  ) {
    return {
      notice_type_raw_en: 'Declaration of street name',
      notice_type_raw_zh: '宣布街道名稱',
      notice_type_normalized: 'declaration',
    }
  }

  if (/corrigendum/i.test(combined) || /勘誤|更正/.test(combined)) {
    return {
      notice_type_raw_en: 'Corrigendum',
      notice_type_raw_zh: '勘誤',
      notice_type_normalized: 'corrigendum',
    }
  }

  return {
    notice_type_raw_en: 'Street Name',
    notice_type_raw_zh: '街道命名',
    notice_type_normalized: 'other',
  }
}

function extractPlanLabels(text) {
  const labels = []
  const regex = /\b([A-Z]{2,4}RM\d+[a-z]?)\b/gi
  let match = regex.exec(text)
  while (match) {
    labels.push(match[1].toUpperCase().replace(/\s+/g, ''))
    match = regex.exec(text)
  }
  return [...new Set(labels)]
}

function extractCitedGnLabels(text) {
  const labels = []
  const re = /G\.N\.\s*(\d+)/gi
  let m = re.exec(text)
  while (m) {
    labels.push(`G.N.${m[1]}`)
    m = re.exec(text)
  }
  return [...new Set(labels)]
}

function isLikelyStreetName(name) {
  return (
    name.length >= 5 &&
    name.length <= 60 &&
    !/\b(the|its|this|road is|junction|proposed|description|department|ordinance|following)\b/i.test(
      name,
    )
  )
}

/** Street name sits after each Plan No. line (before "t he road" or "a copy of"). */
function extractEnglishStreetNames(textEn) {
  const fromPlans = []
  const planRe = /Plan No\.\s*[^.]+\.\s+(.+?)\s+(?:t he road|a copy of)/gi
  let m = planRe.exec(textEn)
  while (m) {
    const fixed = fixSpacedCapsName(m[1].trim())
    if (isLikelyStreetName(fixed)) fromPlans.push(normalizeStreetName(fixed))
    m = planRe.exec(textEn)
  }
  if (fromPlans.length) return [...new Set(fromPlans)]

  return []
}

const ZH_NAME_BLOCK =
  /地政|總署|條例|擬建|粉紅|黃色|綠色|查閱|說明|名稱|這道路|未命名|交界|擬建|政府|圖書|銷售|北角|銅鑼灣|高士威|元朗|渣華|道路長|以其|或到|香港|新界|公告/

/** Chinese names appear after 標示。, before 這道路 or 查閱. */
function extractChineseStreetNames(textZh) {
  const names = []
  const compact = textZh.replace(/\s+/g, '')

  const beforeRoad = new RegExp(
    `標示。[^。]{0,60}?([\\u4e00-\\u9fff]{2,12}${ZH_STREET_SUFFIX})這道路`,
    'g',
  )
  let m = beforeRoad.exec(compact)
  while (m) {
    const name = m[1]
    if (!ZH_NAME_BLOCK.test(name)) names.push(name)
    m = beforeRoad.exec(compact)
  }

  const beforeLookup = new RegExp(
    `標示。[^。]{0,60}?([\\u4e00-\\u9fff]{2,12}${ZH_STREET_SUFFIX})查`,
    'g',
  )
  let bl = beforeLookup.exec(compact)
  while (bl) {
    const name = bl[1]
    if (!ZH_NAME_BLOCK.test(name)) names.push(name)
    bl = beforeLookup.exec(compact)
  }

  return [...new Set(names)]
}

function extractSpacedCapsNameFromIntention(textEn) {
  const m = textEn.match(
    /Description\s+Name\s+The street[\s\S]*?\s+([A-Z](?:\s+[A-Z]){2,}(?:\s+[A-Z][a-z]+)*)\s+A copy of Plan/i,
  )
  if (!m) return null
  return fixSpacedCapsName(m[1].trim())
}

function extractNameFromDescriptionBlock(textEn) {
  const block = extractModernDescriptionBlocks(textEn, '')
  const raw = block.description_raw_en ?? ''
  const inline = raw.match(
    new RegExp(`\\b([A-Z][A-Za-z'\\s]+${STREET_SUFFIX})\\b`),
  )
  if (inline) return normalizeStreetName(fixSpacedCapsName(inline[1].trim()))
  const afterRoad = raw.match(/The (?:street|road)\s+is[\s\S]*?\.\s+([A-Z][A-Za-z'\s]+)\./i)
  if (afterRoad && isLikelyStreetName(fixSpacedCapsName(afterRoad[1]))) {
    return normalizeStreetName(fixSpacedCapsName(afterRoad[1]))
  }
  return null
}

function extractZhNameFromDescriptionBlock(textZh) {
  const block = extractModernDescriptionBlocks('', textZh)
  const compact = (block.description_raw_zh ?? textZh).replace(/\s+/g, '')
  const afterPlan = compact.match(
    new RegExp(`圖則([\\u4e00-\\u9fff]{2,8}${ZH_STREET_SUFFIX})`),
  )
  if (afterPlan && !/[圖說明號]/.test(afterPlan[1])) return afterPlan[1]

  const afterName = compact.includes('說明名稱') ? compact.split('說明名稱').pop() : compact
  const names = []
  const re = new RegExp(`([\\u4e00-\\u9fff]{2,8}${ZH_STREET_SUFFIX})`, 'g')
  let m = re.exec(afterName ?? '')
  while (m) {
    const name = m[1]
    if (
      !/^(這道路|這街道|取代|宣布|街道|地政|總署)/.test(name) &&
      !/[圖則說明號]/.test(name)
    ) {
      names.push(name)
    }
    m = re.exec(afterName ?? '')
  }
  return names.at(-1) ?? null
}

function extractCitedPublicationDate(textEn, textZh) {
  const combined = `${textEn} ${textZh}`
  const iso =
    combined.match(/Previous G\.N\.\s*\d+\s+dated\s+(\d{4}-\d{2}-\d{2})/i)?.[1] ??
    combined.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)?.slice(1)
  if (Array.isArray(iso) && iso.length === 3) {
    return `${iso[0]}-${String(iso[1]).padStart(2, '0')}-${String(iso[2]).padStart(2, '0')}`
  }
  return typeof iso === 'string' ? iso : null
}

function extractNameFromReplaceBody(textEn) {
  const m = textEn.match(
    new RegExp(
      `(?:street|road)\\s+([A-Z][A-Za-z'\\s-]+${STREET_SUFFIX})\\s+set out`,
      'i',
    ),
  )
  return m ? normalizeStreetName(fixSpacedCapsName(m[1].trim())) : null
}

function extractZhNameFromIntention(textZh) {
  const compact = textZh.replace(/\s+/g, '')
  const m = compact.match(
    new RegExp(`說明名稱這(?:街道|道路)[^。]{0,120}?([\\u4e00-\\u9fff]{2,12}${ZH_STREET_SUFFIX})查閱`),
  )
  return m?.[1] ?? null
}

function extractPreviousGnDate(textEn, textZh) {
  const combined = `${textEn} ${textZh}`
  const cited = combined.match(/Previous G\.N\.\s*(\d+)/i) ?? combined.match(/先前第\s*(\d+)\s*號/i)
  return cited?.[1] ?? null
}

function pairStreetNames(enNames, zhNames) {
  if (!enNames.length && !zhNames.length) return []
  if (!enNames.length) return zhNames.map((zh) => ({ en: null, zh }))
  if (!zhNames.length) return enNames.map((en) => ({ en, zh: null }))

  const n = Math.min(enNames.length, zhNames.length) || Math.max(enNames.length, zhNames.length)
  const pairs = []
  for (let i = 0; i < n; i += 1) {
    pairs.push({
      en: enNames[Math.min(i, enNames.length - 1)] ?? null,
      zh: zhNames[Math.min(i, zhNames.length - 1)] ?? null,
    })
  }
  if (enNames.length > zhNames.length) {
    for (let i = zhNames.length; i < enNames.length; i += 1) {
      pairs.push({ en: enNames[i], zh: null })
    }
  } else if (zhNames.length > enNames.length) {
    for (let i = enNames.length; i < zhNames.length; i += 1) {
      pairs.push({ en: null, zh: zhNames[i] })
    }
  }
  return pairs
}

function historyRowForNotice({
  noticeTypes,
  publicationDate,
  pair,
  gazetteLocation,
  planLabels,
  gnLabel,
  noticeNo,
  citedGn,
}) {
  const normalized = noticeTypes.notice_type_normalized
  const planFromLoc = planLabelsFromGazetteLocation(gazetteLocation)
  const mergedPlanLabels = [...new Set([...planLabels, ...planFromLoc])]

  if (normalized === 'replace_description') {
    return {
      publication_date: publicationDate,
      change_kind: 'declare',
      street_name_en: pair.en,
      street_name_zh: pair.zh,
      evidence_kind: 'gazette_inferred',
      event_role: 'current_name',
      notice_type_normalized: 'replace_description',
      gazette_location: gazetteLocation,
      related_gazette_plan_labels_en: mergedPlanLabels,
      related_gazette_plan_labels_zh: mergedPlanLabels,
      derived_from: citedGn
        ? [{ notice_label: gnLabel, cites_notice_label: `G.N.${citedGn}` }]
        : null,
      submitter_remarks: citedGn
        ? `Replace-description notice; backfill publication_date from cited G.N.${citedGn} when PDF on file.`
        : 'Replace-description notice; verify cited Previous G.N. date.',
    }
  }

  if (normalized === 'chinese_correction') {
    return {
      publication_date: publicationDate,
      change_kind: 'rename',
      street_name_en: pair.en,
      street_name_zh: pair.zh,
      evidence_kind: 'gazette_primary',
      event_role: 'current_name',
      notice_type_normalized: 'chinese_correction',
      gazette_location: gazetteLocation,
      related_gazette_plan_labels_en: mergedPlanLabels,
      related_gazette_plan_labels_zh: mergedPlanLabels,
      submitter_remarks: 'ZH-only rename (Declaration to Change); EN name unchanged in notice.',
    }
  }

  if (normalized === 'intention_to_change') {
    return {
      publication_date: publicationDate,
      change_kind: 'declare',
      street_name_en: pair.en,
      street_name_zh: pair.zh,
      evidence_kind: 'gazette_inferred',
      event_role: 'current_name',
      notice_type_normalized: 'intention_to_change',
      gazette_location: gazetteLocation,
      related_gazette_plan_labels_en: mergedPlanLabels,
      related_gazette_plan_labels_zh: mergedPlanLabels,
      submitter_remarks:
        'Intention notice only — demote to gazette_inferred until confirming declaration G.N.',
    }
  }

  const changeKind = normalized === 'declaration' ? 'declare' : 'declare'
  return {
    publication_date: publicationDate,
    change_kind: changeKind,
    street_name_en: pair.en,
    street_name_zh: pair.zh,
    evidence_kind: 'gazette_primary',
    event_role: 'current_name',
    notice_type_normalized: normalized,
    gazette_location: gazetteLocation,
    related_gazette_plan_labels_en: mergedPlanLabels,
    related_gazette_plan_labels_zh: mergedPlanLabels,
  }
}

/** Parse modern Lands Dept notice into draft history[] rows (for crowd batches). */
export function parseModernNoticeToHistory(extraction, noticeMeta) {
  const textEn = extraction.text_en ?? ''
  const textZh = extraction.text_zh ?? ''
  const noticeNo = normalizeNoticeNo(String(noticeMeta?.notice_no ?? ''))
  const noticeTypes = detectNoticeType(textEn, textZh)
  let publicationDate = parseGazetteFooterDate(textEn, textZh)
  if (noticeTypes.notice_type_normalized === 'replace_description') {
    publicationDate = extractCitedPublicationDate(textEn, textZh) ?? publicationDate
  }
  const planLabels = extractPlanLabels(`${textEn} ${textZh}`)
  const gazetteLocation = normalizeGazetteLocation(extractModernDescriptionBlocks(textEn, textZh))
  const gnLabel = String(noticeMeta?.notice_no ?? noticeNo).replace(/^GN/i, '')
  const gnFull = `G.N.${gnLabel}`

  let enNames = extractEnglishStreetNames(textEn)
  let zhNames = extractChineseStreetNames(textZh)

  if (noticeTypes.notice_type_normalized === 'chinese_correction' && !enNames.length) {
    enNames = []
  }

  if (noticeTypes.notice_type_normalized === 'intention_to_change') {
    const en = extractSpacedCapsNameFromIntention(textEn)
    const zh = extractZhNameFromIntention(textZh)
    if (en) enNames = [normalizeStreetName(en)]
    if (zh) zhNames = [zh]
  }

  if (!enNames.length) {
    const fromDesc = extractNameFromDescriptionBlock(textEn)
    if (fromDesc) enNames = [fromDesc]
  }
  if (!zhNames.length) {
    const fromDescZh = extractZhNameFromDescriptionBlock(textZh)
    if (fromDescZh) zhNames = [fromDescZh]
  }

  if (noticeTypes.notice_type_normalized === 'replace_description' && !enNames.length) {
    const fromReplace = extractNameFromReplaceBody(textEn)
    if (fromReplace) enNames = [fromReplace]
  }

  const pairs = pairStreetNames(enNames, zhNames)
  if (!pairs.length) return { noticeTypes, history: [], gazetteLocation }

  const citedGn = extractPreviousGnDate(textEn, textZh)

  const history = pairs.map((pair) =>
    historyRowForNotice({
      noticeTypes,
      publicationDate,
      pair,
      gazetteLocation,
      planLabels,
      gnLabel: gnFull,
      noticeNo,
      citedGn,
    }),
  )

  return { noticeTypes, history, gazetteLocation, publicationDate, noticeNo }
}

export function parseExtractionWithRegex(extraction, noticeMeta, options = {}) {
  const textEn = extraction.text_en ?? ''
  const textZh = extraction.text_zh ?? ''
  const noticeNo = normalizeNoticeNo(String(noticeMeta?.notice_no ?? ''))
  const publicationDate = parseGazetteFooterDate(textEn, textZh)
  const noticeTypes = detectNoticeType(textEn, textZh)
  const planLabels = extractPlanLabels(`${textEn} ${textZh}`)
  const gazetteLocation = normalizeGazetteLocation(extractModernDescriptionBlocks(textEn, textZh))
  const enNames = extractEnglishStreetNames(textEn)
  const zhNames = extractChineseStreetNames(textZh)

  let pairs = pairStreetNames(enNames, zhNames)

  if (noticeTypes.notice_type_normalized === 'chinese_correction' && zhNames.length && !enNames.length) {
    pairs = zhNames.map((zh) => ({ en: null, zh }))
  }

  if (noticeTypes.notice_type_normalized === 'intention_to_change' && !pairs.length) {
    const en = extractSpacedCapsNameFromIntention(textEn)
    const zh = extractZhNameFromIntention(textZh)
    if (en || zh) pairs = [{ en: en ? normalizeStreetName(en) : null, zh }]
  }

  if (!pairs.length) return []

  const gnLabel = String(noticeMeta?.notice_no ?? noticeNo).replace(/^GN/i, '')
  const planFromLoc = planLabelsFromGazetteLocation(gazetteLocation)
  const mergedPlanLabels = [...new Set([...planLabels, ...planFromLoc])]

  return pairs.map((pair, index) =>
    finalizeEgazetteEvent(
      {
        publication_date: publicationDate,
        street_name_en: pair.en,
        street_name_zh: pair.zh,
        district_raw_en: gazetteLocation?.parsed?.district_en ?? null,
        district_raw_zh: gazetteLocation?.parsed?.district_zh ?? null,
        ...noticeTypes,
        notice_no: noticeNo,
        government_notice_label_en: `G.N.${gnLabel}`,
        government_notice_label_zh: `第${gnLabel}號`,
        related_gazette_plan_labels_en: mergedPlanLabels,
        related_gazette_plan_labels_zh: mergedPlanLabels,
        notice_key: extraction.notice_key,
        pdf_path_en: options.pdfPaths?.en ?? null,
        pdf_path_zh: options.pdfPaths?.zh ?? null,
        gazette_location: gazetteLocation,
        change_kind:
          noticeTypes.notice_type_normalized === 'chinese_correction'
            ? 'rename'
            : noticeTypes.notice_type_normalized === 'replace_description'
              ? 'declare'
              : undefined,
        evidence_kind:
          noticeTypes.notice_type_normalized === 'replace_description' ||
          noticeTypes.notice_type_normalized === 'intention_to_change'
            ? 'gazette_inferred'
            : 'gazette_primary',
      },
      index,
    ),
  )
}

export { extractCitedGnLabels }
