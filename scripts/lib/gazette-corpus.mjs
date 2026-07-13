/**
 * Gazette corpus: one Markdown file per notice (frontmatter + body).
 * Frontmatter holds scalars + streets_draft[]; body holds OCR / tables.
 */

import { mkdir, readFile, writeFile, access, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const projectRoot = path.resolve(__dirname, '../..')
export const CORPUS_DIR = path.join(projectRoot, 'data', 'gazette-corpus')
export const CORPUS_INDEX = path.join(CORPUS_DIR, 'index.json')

const FRONTMATTER_KEYS = [
  'notice_stem',
  'format_family',
  'language_layout',
  'gazette_notice_label',
  'publication_date',
  'notice_type_guess',
  'source_scope',
  'table_layout',
  'ocr_engine',
  'corpus_body_format',
  'excluded_notices',
  'extraction_method_en',
  'extraction_method_zh',
  'ocr_confidence_en',
  'ocr_confidence_zh',
  'table_rows_parsed',
  'parse_quality',
  'pdf_en',
  'pdf_zh',
  'apply_status',
  'updated_at',
  'streets_draft',
]

/** @returns {{ meta: object, body: string }} */
export function parseCorpusDocument(raw) {
  const text = String(raw ?? '')
  if (!text.startsWith('---')) {
    return { meta: {}, body: text.replace(/^\uFEFF/, '').trim() }
  }
  const end = text.indexOf('\n---', 3)
  if (end === -1) {
    return { meta: {}, body: text.replace(/^\uFEFF/, '').trim() }
  }
  const fmText = text.slice(3, end).replace(/^\r?\n/, '')
  const body = text.slice(end + 4).replace(/^\r?\n/, '')
  let meta = {}
  try {
    const parsed = parseYaml(fmText)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      meta = parsed
    }
  } catch {
    meta = {}
  }
  if (!Array.isArray(meta.streets_draft)) meta.streets_draft = meta.streets_draft ?? []
  if (!Array.isArray(meta.streets_draft)) meta.streets_draft = []
  if (!Array.isArray(meta.excluded_notices) && meta.excluded_notices != null) {
    meta.excluded_notices = [].concat(meta.excluded_notices)
  }
  return { meta, body: body.trimEnd() }
}

export function buildCorpusFrontmatter(meta) {
  const doc = {}
  for (const key of FRONTMATTER_KEYS) {
    const val = meta[key]
    if (val == null || val === '') continue
    if (key === 'streets_draft' && Array.isArray(val) && val.length === 0) continue
    if (key === 'excluded_notices' && Array.isArray(val) && val.length === 0) continue
    doc[key] = val
  }
  const yaml = stringifyYaml(doc, {
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'PLAIN',
  }).trimEnd()
  return `---\n${yaml}\n---`
}

export function buildCorpusMarkdown(
  meta,
  { textEn = '', textZh = '', textMixed = '' } = {},
) {
  const parts = [buildCorpusFrontmatter(meta), '']

  if (textMixed.trim()) {
    parts.push(textMixed.trim(), '')
    return `${parts.join('\n').trimEnd()}\n`
  }

  const layout = meta.language_layout ?? 'paired_en_zh'

  if (layout === 'zh_only') {
    parts.push('## 中文', '', textZh.trim(), '')
  } else if (layout === 'combined_single_file' || meta.table_layout === 'colonial_three_column') {
    parts.push('## Combined', '', (textEn || textZh).trim(), '')
  } else {
    if (textEn.trim()) {
      parts.push('## English', '', textEn.trim(), '')
    }
    if (textZh.trim() && layout !== 'en_only') {
      parts.push('## 中文', '', textZh.trim(), '')
    }
  }

  return `${parts.join('\n').trimEnd()}\n`
}

export function corpusPaths(stem) {
  return {
    md: path.join(CORPUS_DIR, `${stem}.md`),
    /** @deprecated sidecar removed — kept for migration helpers */
    meta: path.join(CORPUS_DIR, `${stem}.meta.json`),
  }
}

export async function corpusExists(stem) {
  try {
    await access(corpusPaths(stem).md)
    return true
  } catch {
    return false
  }
}

/**
 * Write corpus MD only (frontmatter includes streets_draft). Removes legacy .meta.json.
 */
export async function writeCorpusEntry(stem, meta, body, streetsDraft = null) {
  await mkdir(CORPUS_DIR, { recursive: true })
  const paths = corpusPaths(stem)
  const draft =
    streetsDraft ??
    meta.streets_draft ??
    []
  const fullMeta = {
    notice_stem: stem,
    ...meta,
    streets_draft: Array.isArray(draft) ? draft : [],
    updated_at: meta.updated_at ?? new Date().toISOString(),
  }
  const md = buildCorpusMarkdown(fullMeta, body)
  await writeFile(paths.md, md)

  try {
    await unlink(paths.meta)
  } catch {
    /* no sidecar */
  }

  return { md: paths.md, meta: null }
}

/**
 * Read corpus metadata from MD frontmatter (source of truth).
 * Falls back to legacy .meta.json only if MD is missing or has no usable frontmatter stem.
 */
export async function readCorpusMeta(stem) {
  const paths = corpusPaths(stem)
  try {
    const raw = await readFile(paths.md, 'utf8')
    const { meta } = parseCorpusDocument(raw)
    if (meta && (meta.notice_stem || meta.streets_draft || meta.format_family)) {
      return {
        notice_stem: stem,
        ...meta,
        streets_draft: Array.isArray(meta.streets_draft) ? meta.streets_draft : [],
      }
    }
  } catch {
    /* try sidecar */
  }

  try {
    const raw = await readFile(paths.meta, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Read MD body without frontmatter (for publishing). */
export async function readCorpusBody(stem) {
  try {
    const raw = await readFile(corpusPaths(stem).md, 'utf8')
    return parseCorpusDocument(raw).body.trim()
  } catch {
    return ''
  }
}

export async function loadCorpusIndex() {
  try {
    const raw = await readFile(CORPUS_INDEX, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { stems: [], updated_at: null }
  }
}

export async function saveCorpusIndex(entries) {
  await mkdir(CORPUS_DIR, { recursive: true })
  const index = {
    updated_at: new Date().toISOString(),
    count: entries.length,
    stems: entries,
  }
  await writeFile(CORPUS_INDEX, `${JSON.stringify(index, null, 2)}\n`)
  return index
}

export function extractionMethodFromStatus(status) {
  if (status === 'text_layer' || status === 'poor_text') return 'text_layer'
  if (status === 'ocr_needed') return 'ocr'
  if (status === 'absent') return 'absent'
  return 'failed'
}

export function ocrConfidenceFromChars(chars, method) {
  if (method === 'absent') return null
  if (method === 'text_layer' && chars > 200) return 'clear'
  if (method === 'text_layer' && chars > 80) return 'uncertain'
  if (method === 'ocr' && chars > 100) return 'uncertain'
  if (chars < 20) return 'illegible'
  return 'uncertain'
}
