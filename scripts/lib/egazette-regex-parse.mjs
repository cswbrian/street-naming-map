import { parseGazetteFooterDate } from './egazette-dates.mjs'
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

function detectNoticeType(textEn, textZh) {
  const combined = `${textEn} ${textZh}`
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
  if (/replacing description of street/i.test(combined) || /取代街道說明/.test(combined)) {
    return {
      notice_type_raw_en: 'Replacing description of street',
      notice_type_raw_zh: '取代街道說明',
      notice_type_normalized: 'replace_description',
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
  const planRe =
    /Plan No\.\s*[^.]+\.\s+(.+?)\s+(?:t he road|a copy of)/gi
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

export function parseExtractionWithRegex(extraction, noticeMeta, options = {}) {
  const textEn = extraction.text_en ?? ''
  const textZh = extraction.text_zh ?? ''
  const noticeNo = normalizeNoticeNo(String(noticeMeta?.notice_no ?? ''))
  const publicationDate = parseGazetteFooterDate(textEn, textZh)
  const noticeTypes = detectNoticeType(textEn, textZh)
  const planLabels = extractPlanLabels(`${textEn} ${textZh}`)
  const enNames = extractEnglishStreetNames(textEn)
  const zhNames = extractChineseStreetNames(textZh)
  const pairs = pairStreetNames(enNames, zhNames)

  if (!pairs.length) return []

  const gnLabel = String(noticeMeta?.notice_no ?? noticeNo).replace(/^GN/i, '')

  return pairs.map((pair, index) =>
    finalizeEgazetteEvent(
      {
        publication_date: publicationDate,
        street_name_en: pair.en,
        street_name_zh: pair.zh,
        district_raw_en: null,
        district_raw_zh: null,
        ...noticeTypes,
        notice_no: noticeNo,
        government_notice_label_en: `G.N.${gnLabel}`,
        government_notice_label_zh: `第${gnLabel}號`,
        related_gazette_plan_labels_en: planLabels,
        related_gazette_plan_labels_zh: planLabels,
        notice_key: extraction.notice_key,
        pdf_path_en: options.pdfPaths?.en ?? null,
        pdf_path_zh: options.pdfPaths?.zh ?? null,
      },
      index,
    ),
  )
}
