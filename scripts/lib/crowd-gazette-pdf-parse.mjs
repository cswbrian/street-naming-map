import path from 'node:path'
import { parseGazetteFooterDate } from './egazette-dates.mjs'
import { extractTextFromPdf } from './egazette-pdf-text.mjs'
import { buildGazetteLocationFromDescription } from './gazette-location.mjs'
import { parseModernNoticeToHistory } from './egazette-regex-parse.mjs'
import { extractNoticeNumber, normalizeStreetName } from './street-naming-core.mjs'

const STREET_SUFFIX_EN =
  'Street|Road|Lane|Drive|Avenue|Highway|Path|Square|Circuit|Boulevard|Flyover|Bypass|Interchange|Crescent|Terrace|Walk|Way|Close|Gardens|Rise|View|Court|Plaza|Link|Bridge|Tunnel|Place'

const COLONIAL_ROW_RE = new RegExp(
  String.raw`\b(\d+)\.\s+(Thoroughfare[\s\S]*?)\s+([A-Z][A-Z0-9\s\-']+(?:${STREET_SUFFIX_EN}))\s+([\u4e00-\u9fff]{2,12})`,
  'gi',
)

const GN_LABEL_RE = /\bG\.?\s*N\.?\s*(\d+)\b/i
const GN_FILENAME_RE = /\bGN\s*(\d+)\b/i
const COLONIAL_DATE_RE =
  /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})\b/gi
const COLONIAL_DATE_CAPS_RE =
  /\b(\d{1,2})\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER),?\s+(\d{4})\b/g

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

function toIso(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`
}

export function parseGnFromTextOrFilename(text, filePath) {
  const fromText = text.match(GN_LABEL_RE)?.[1]
  if (fromText) return fromText
  const base = path.basename(filePath ?? '')
  return base.match(GN_FILENAME_RE)?.[1] ?? null
}

export function parsePublicationDateFromNotice(textEn = '', textZh = '') {
  const footer = parseGazetteFooterDate(textEn, textZh)
  if (footer) return footer

  for (const match of String(textEn).matchAll(COLONIAL_DATE_RE)) {
    const month = MONTHS[match[2].toLowerCase()]
    if (month) return toIso(match[3], month, match[1])
  }

  const caps = COLONIAL_DATE_CAPS_RE.exec(textEn)
  if (caps) {
    const month = MONTHS[caps[2].toLowerCase()]
    if (month) return toIso(caps[3], month, caps[1])
  }

  const zhDates = [...String(textZh).matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)]
  if (zhDates.length) {
    const m = zhDates.at(-1)
    return toIso(m[1], m[2], m[3])
  }

  return null
}

function cleanDescription(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()
}

export function parseColonialThoroughfareTable(textEn = '', textZh = '') {
  const combined = `${textEn}\n${textZh}`
  const rows = []
  let match = COLONIAL_ROW_RE.exec(combined)
  while (match) {
    rows.push({
      index: Number(match[1]),
      description: cleanDescription(match[2]),
      english_name: normalizeStreetName(match[3].trim()),
      chinese_name: match[4].trim(),
    })
    match = COLONIAL_ROW_RE.exec(combined)
  }
  return rows
}

/** apply-egazette-naming / parse-crowd-gazette-pdf → crowdsubmitted pipeline source */
export function detectBatchSource() {
  return 'crowdsubmitted'
}

export async function extractPdfTextAllLayers(filePath) {
  const pdfjs = await extractTextFromPdf(filePath)
  if (pdfjs.text.length > 80) {
    return { text_en: pdfjs.text, text_zh: '', page_count: pdfjs.page_count, method: 'pdfjs' }
  }

  const pymupdf = await extractTextViaPymupdf(filePath)
  if (pymupdf.text.length > 80) {
    return {
      text_en: pymupdf.text,
      text_zh: '',
      page_count: pymupdf.page_count,
      method: 'pymupdf',
    }
  }

  return {
    text_en: pdfjs.text || pymupdf.text,
    text_zh: '',
    page_count: pdfjs.page_count || pymupdf.page_count,
    method: 'image',
  }
}

async function extractTextViaPymupdf(filePath) {
  const { spawnSync } = await import('node:child_process')
  const script = `
import fitz, sys
path = sys.argv[1]
doc = fitz.open(path)
parts = []
for page in doc:
    parts.append(page.get_text("text"))
print("\\n".join(parts))
print(f"__PAGES__={doc.page_count}", file=sys.stderr)
`
  const result = spawnSync('python3', ['-c', script, filePath], { encoding: 'utf8' })
  const text = (result.stdout ?? '').replace(/\s+/g, ' ').trim()
  const pageMatch = (result.stderr ?? '').match(/__PAGES__=(\d+)/)
  return { text, page_count: pageMatch ? Number(pageMatch[1]) : 0 }
}

export function parseStreetsFromNoticeText(extraction, noticeMeta) {
  const colonial = parseColonialThoroughfareTable(extraction.text_en, extraction.text_zh)
  if (colonial.length) {
    return {
      streets: colonial.map((row) => ({
        english_name: row.english_name,
        chinese_name: row.chinese_name,
        description: row.description,
        gazette_location: buildGazetteLocationFromDescription(row.description, null),
      })),
      parser: 'colonial_thoroughfare',
    }
  }

  const modern = parseModernNoticeToHistory(extraction, noticeMeta)
  if (modern.history.length) {
    return {
      streets: modern.history.map((h) => ({
        english_name: h.street_name_en,
        chinese_name: h.street_name_zh,
        history: [h],
        gazette_location: h.gazette_location,
      })),
      parser: 'lands_modern',
      notice_types: modern.noticeTypes,
    }
  }

  return { streets: [], parser: null }
}

export function buildCrowdBatchDraft({
  pdfPath,
  gazetteNoticeLabel,
  publicationDate,
  streets,
  source,
  parseMeta = {},
}) {
  const gn = extractNoticeNumber(gazetteNoticeLabel)
  const batchId =
    parseMeta.batch_id ??
    (publicationDate && gn ? `${publicationDate.slice(0, 4)}-gn${gn}` : path.basename(pdfPath, '.pdf'))

  return {
    evidence_schema_version: 2,
    _draft: true,
    _parse: parseMeta,
    batch_id: batchId,
    source: source ?? 'crowdsubmitted',
    gazette_notice_label: gazetteNoticeLabel ?? (gn ? `G.N.${gn}` : null),
    publication_date: publicationDate,
    pdf_en: pdfPath,
    streets: streets.map((row) => {
      const entry = {}
      if (row.english_name) entry.english_name = row.english_name
      if (row.chinese_name) entry.chinese_name = row.chinese_name
      if (row.street_code) entry.street_code = row.street_code

      if (Array.isArray(row.history) && row.history.length) {
        entry.history = row.history.map((h) => ({
          ...h,
          gazette_location: h.gazette_location ?? row.gazette_location ?? null,
          event_role: h.event_role ?? 'current_name',
        }))
      } else if (publicationDate && (row.english_name || row.chinese_name)) {
        const nameEn = row.english_name ? normalizeStreetName(row.english_name) : null
        entry.history = [
          {
            publication_date: publicationDate,
            change_kind: 'declare',
            street_name_en: nameEn ?? row.english_name ?? null,
            street_name_zh: row.chinese_name ?? null,
            evidence_kind: 'gazette_primary',
            event_role: 'current_name',
            gazette_location: row.gazette_location ?? buildGazetteLocationFromDescription(row.description, null),
          },
        ]
      }
      return entry
    }),
  }
}

export async function parseCrowdGazettePdf(filePath, options = {}) {
  const absPath = path.resolve(filePath)
  const extraction = await extractPdfTextAllLayers(absPath)
  const gn = parseGnFromTextOrFilename(`${extraction.text_en} ${extraction.text_zh}`, absPath)
  const noticeMeta = { notice_no: gn ? `GN${gn}` : null }
  const publicationDate =
    options.publication_date ?? parsePublicationDateFromNotice(extraction.text_en, extraction.text_zh)
  const gazetteNoticeLabel =
    options.gazette_notice_label ?? (gn ? `G.N.${gn}` : null)

  if (extraction.method === 'image' && !options.streets?.length) {
    return {
      status: 'needs_visual_parse',
      extraction,
      gazette_notice_label: gazetteNoticeLabel,
      publication_date: publicationDate,
      hint: 'Render with: python3 scripts/render-gazette-pdf.py "<pdf>" --page N --out /tmp/page.png',
      pdf_en: absPath,
    }
  }

  const parsed =
    options.streets?.length > 0
      ? { streets: options.streets, parser: options.parser ?? 'manual' }
      : parseStreetsFromNoticeText(
          { ...extraction, notice_key: gazetteNoticeLabel ?? 'crowd-pdf' },
          noticeMeta,
        )

  const source = options.source ?? detectBatchSource({ pdfPath: absPath })

  const batch = buildCrowdBatchDraft({
    pdfPath: absPath,
    gazetteNoticeLabel,
    publicationDate,
    streets: parsed.streets,
    source,
    parseMeta: {
      method: extraction.method,
      parser: parsed.parser,
      page_count: extraction.page_count,
    },
  })

  return { status: 'draft', batch, extraction }
}
