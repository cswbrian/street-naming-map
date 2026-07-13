/**
 * Classify hosted gazette PDFs by format_family and language_layout.
 * Used by coverage report and corpus extract.
 */

import path from 'node:path'
import { accessSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const LANDS_HEADER = /\bLands Department\b|地政總署/i
const STREET_NAME = /\bSTREET NAME\b|\bStreet Name\b|街道命名|DELETION OF STREET|取代街道/i
const PHMSO = /111C\(1\)|Public Health and Municipal Services|公眾衞生及市政/i
const HKGG = /\bTHE HONG KONG GOVERNMENT GAZETTE\b|\bHong Kong Government Gazette\b/i
const HEREBY = /\bIt is hereby notified\b/i
const CORRIGENDUM = /\bCORRIGENDUM\b/i

const CJK_RE = /[\u4e00-\u9fff]/
const LATIN_RE = /[A-Za-z]{4,}/

export const FORMAT_FAMILIES = [
  'hkgro_image_scan',
  'lands_modern_text',
  'lands_modern_poor_text',
  'hk_government_gazette_text',
  'unclassified',
]

export const LANGUAGE_LAYOUTS = [
  'en_only',
  'zh_only',
  'paired_en_zh',
  'combined_single_file',
]

export function stemNamingPattern(stem) {
  if (/^\d{4}-gn\d+/i.test(stem)) return 'year_gn'
  if (/^\d{4}-\d{2}-\d{1,2}-\d+/.test(stem)) return 'vol_issue'
  return 'other'
}

function extractTextPymupdf(filePath, maxPages = 2) {
  const script = `
import fitz, sys
path = sys.argv[1]
max_p = int(sys.argv[2])
doc = fitz.open(path)
parts = []
for i, page in enumerate(doc):
    if i >= max_p: break
    parts.append(page.get_text("text") or "")
text = "\\n".join(parts)
print(text)
print(f"__PAGES__={doc.page_count}", file=sys.stderr)
`
  const result = spawnSync('python3', ['-c', script, filePath, String(maxPages)], {
    encoding: 'utf8',
  })
  const text = result.stdout ?? ''
  const pageMatch = (result.stderr ?? '').match(/__PAGES__=(\d+)/)
  return {
    text,
    chars: text.trim().length,
    pages: pageMatch ? Number(pageMatch[1]) : 0,
  }
}

export function probePdfText(filePath, maxPages = 2) {
  if (!filePath) return { text: '', chars: 0, pages: 0 }
  try {
    return extractTextPymupdf(filePath, maxPages)
  } catch {
    return { text: '', chars: 0, pages: 0 }
  }
}

export function localeExtractionStatus(chars, text, lands, colonial, hkgg) {
  if (chars < 80) return 'ocr_needed'
  if (chars < 200 && !lands && !colonial && !hkgg) return 'poor_text'
  return 'text_layer'
}

export function detectLanguageLayout({ enProbe, zhProbe, hasZh }) {
  const en = enProbe ?? { text: '', chars: 0 }
  const enCjk = CJK_RE.test(en.text)
  const enLatin = LATIN_RE.test(en.text)
  const enCombined = enCjk && enLatin && en.chars >= 200

  if (!hasZh) {
    if (enCombined) return 'combined_single_file'
    return 'en_only'
  }

  const zh = zhProbe ?? { text: '', chars: 0 }
  if (enCombined && zh.chars < 80) return 'combined_single_file'
  if (zh.chars >= 80 && en.chars < 80) return 'zh_only'
  return 'paired_en_zh'
}

export function classifyFormatFamily({ stem, enProbe, zhProbe, naming }) {
  const text = enProbe?.text ?? ''
  const chars = enProbe?.chars ?? 0
  const combined = `${text}\n${zhProbe?.text ?? ''}`
  const lands = LANDS_HEADER.test(combined) || STREET_NAME.test(combined)
  const phmso = PHMSO.test(combined)
  const hkgg = HKGG.test(text)
  const colonial = HEREBY.test(text) && !lands

  if (lands || (STREET_NAME.test(combined) && chars >= 200) || phmso) {
    if (chars < 200 && naming === 'vol_issue') return 'lands_modern_poor_text'
    return 'lands_modern_text'
  }

  if (naming === 'vol_issue' && chars < 200) return 'lands_modern_poor_text'

  if (hkgg && chars >= 500) return 'hk_government_gazette_text'

  if (naming === 'year_gn' && chars < 80) return 'hkgro_image_scan'

  if (naming === 'year_gn' && chars >= 200) {
    if (lands || STREET_NAME.test(combined) || phmso) return 'lands_modern_text'
    return 'hk_government_gazette_text'
  }

  return 'unclassified'
}

export function guessNoticeType(textEn = '', textZh = '') {
  const combined = `${textEn}\n${textZh}`
  if (CORRIGENDUM.test(combined)) return 'corrigendum'
  if (/replacing description of street|取代街道說明/i.test(combined)) return 'replace_description'
  if (/notice of intention to change the name|更改街道名稱的意向/i.test(combined)) return 'intention'
  if (/declaration to change the name|宣布更改街道名稱/i.test(combined)) return 'rename'
  if (/deletion of street|撤銷街道名稱/i.test(combined)) return 'deletion'
  if (/street name|街道命名/i.test(combined)) return 'declare'
  return 'unknown'
}

export function classifyHostedStem(stem, egazetteRoot) {
  const enPath = path.join(egazetteRoot, 'en', `${stem}.pdf`)
  const zhPath = path.join(egazetteRoot, 'zh', `${stem}.pdf`)
  const enProbe = probePdfText(enPath)
  let zhExists = false
  try {
    accessSync(zhPath)
    zhExists = true
  } catch {
    zhExists = false
  }
  const zhProbe = zhExists ? probePdfText(zhPath) : null
  const naming = stemNamingPattern(stem)
  const language_layout = detectLanguageLayout({ enProbe, zhProbe, hasZh: zhExists })
  const format_family = classifyFormatFamily({ stem, enProbe, zhProbe, naming })
  const text = `${enProbe.text}\n${zhProbe?.text ?? ''}`
  const notice_type_guess = guessNoticeType(enProbe.text, zhProbe?.text ?? '')

  const extraction_en = localeExtractionStatus(
    enProbe.chars,
    enProbe.text,
    LANDS_HEADER.test(text),
    HEREBY.test(enProbe.text),
    HKGG.test(enProbe.text),
  )
  const extraction_zh = zhExists
    ? localeExtractionStatus(
        zhProbe.chars,
        zhProbe.text,
        LANDS_HEADER.test(text),
        HEREBY.test(zhProbe.text),
        HKGG.test(zhProbe.text),
      )
    : 'absent'

  return {
    stem,
    naming,
    format_family,
    language_layout,
    notice_type_guess,
    extraction_en,
    extraction_zh,
    en_chars: enProbe.chars,
    zh_chars: zhProbe?.chars ?? 0,
    pdf_en: `/egazette/en/${stem}.pdf`,
    pdf_zh: zhExists ? `/egazette/zh/${stem}.pdf` : null,
    en_path: enPath,
    zh_path: zhExists ? zhPath : null,
  }
}
