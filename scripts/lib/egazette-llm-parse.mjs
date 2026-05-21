import {
  finalizeEgazetteEvent,
  isDeclarationEvent,
  normalizeNoticeNo,
  normalizeNoticeType,
} from './street-naming-core.mjs'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const GN_PATTERN = /^GN\d+$/i

const SYSTEM_PROMPT = `You extract structured street-naming events from Hong Kong Government Gazette (Lands Department) notices.
Return ONLY valid JSON: an object with key "events" containing an array of event objects.
Each event must have:
- publication_date (ISO YYYY-MM-DD, from the gazette notice date in the document)
- street_name_en (English street name, title case)
- street_name_zh (Chinese street name)
- district_raw_en, district_raw_zh
- notice_type_raw_en, notice_type_raw_zh (exact wording from notice, e.g. "Declaration of street name", "Replacing description of street", "Corrigendum")
- notice_no (as G.N. number, will be normalized to GN####)
- related_gazette_plan_labels_en, related_gazette_plan_labels_zh (arrays of plan codes like YLRM225, may be empty)
Do not invent streets. One array entry per street named in the notice.`

export function buildUserPrompt(extraction, noticeMeta) {
  const noticeNo = noticeMeta?.notice_no ?? 'unknown'
  const metaLine = noticeMeta
    ? `Gazette metadata: year=${noticeMeta.year}, volume=${noticeMeta.volume}, gno=${noticeMeta.gno}, notice_no=${noticeMeta.notice_no}, extra=${noticeMeta.extra ?? 0}`
    : ''
  return `${metaLine}

English notice text:
${extraction.text_en || '(empty)'}

Chinese notice text:
${extraction.text_zh || '(empty)'}

Extract all street naming events from this Government Notice G.N. ${noticeNo}.`
}

export function validateParsedEvents(data, expectedNoticeNo) {
  const errors = []
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Response is not an object'], events: [] }
  }
  const events = Array.isArray(data.events) ? data.events : Array.isArray(data) ? data : []
  if (!events.length) errors.push('No events in response')

  const normalized = []
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i]
    const rowErrors = []
    if (!e.publication_date || !ISO_DATE.test(e.publication_date)) {
      rowErrors.push(`events[${i}].publication_date invalid`)
    }
    if (!e.street_name_en && !e.street_name_zh) {
      rowErrors.push(`events[${i}] missing street names`)
    }
    const noticeNo = normalizeNoticeNo(e.notice_no ?? expectedNoticeNo)
    if (!GN_PATTERN.test(noticeNo)) {
      rowErrors.push(`events[${i}].notice_no invalid: ${e.notice_no}`)
    }
    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }
    normalized.push({
      ...e,
      notice_no: noticeNo,
      notice_type_normalized:
        e.notice_type_normalized ??
        normalizeNoticeType(e.notice_type_raw_en, e.notice_type_raw_zh),
      is_declaration_event:
        e.is_declaration_event ??
        isDeclarationEvent(e.notice_type_raw_en, e.notice_type_raw_zh),
      related_gazette_plan_labels_en: e.related_gazette_plan_labels_en ?? [],
      related_gazette_plan_labels_zh: e.related_gazette_plan_labels_zh ?? [],
      related_gazette_plan_urls_en: e.related_gazette_plan_urls_en ?? [],
      related_gazette_plan_urls_zh: e.related_gazette_plan_urls_zh ?? [],
    })
  }

  return { valid: errors.length === 0 && normalized.length > 0, errors, events: normalized }
}

export async function parseExtractionWithLlm(extraction, noticeMeta, options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required for LLM parsing')
  }

  const model = options.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL
  const expectedNoticeNo = normalizeNoticeNo(String(noticeMeta?.notice_no ?? ''))
  const userPrompt = buildUserPrompt(extraction, noticeMeta)

  const callLlm = async (extraFeedback = '') => {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/cswbrian/street-naming-map',
        'X-Title': 'street-naming-map egazette parser',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: extraFeedback ? `${userPrompt}\n\nFix these validation errors:\n${extraFeedback}` : userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`OpenRouter HTTP ${response.status}: ${body.slice(0, 500)}`)
    }

    const payload = await response.json()
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('Empty LLM response')

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('LLM response is not JSON')
      parsed = JSON.parse(jsonMatch[0])
    }
    return parsed
  }

  let parsed = await callLlm()
  let validation = validateParsedEvents(parsed, expectedNoticeNo)

  if (!validation.valid) {
    parsed = await callLlm(validation.errors.join('\n'))
    validation = validateParsedEvents(parsed, expectedNoticeNo)
  }

  if (!validation.valid) {
    const err = new Error(`LLM validation failed: ${validation.errors.join('; ')}`)
    err.validation = validation
    throw err
  }

  const paths = options.pdfPaths ?? {}
  return validation.events.map((raw, index) =>
    finalizeEgazetteEvent(
      {
        ...raw,
        notice_key: extraction.notice_key,
        pdf_path_en: paths.en ?? null,
        pdf_path_zh: paths.zh ?? null,
        government_notice_label_en: raw.government_notice_label_en ?? `G.N.${String(noticeMeta?.notice_no ?? raw.notice_no).replace(/^GN/i, '')}`,
        government_notice_label_zh: raw.government_notice_label_zh ?? `第${String(noticeMeta?.notice_no ?? raw.notice_no).replace(/^GN/i, '')}號`,
      },
      index,
    ),
  )
}
