/**
 * Display-time notice label formatting (mirrors scripts/lib/street-naming-core.mjs).
 */

export function extractNoticeNumber(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const compact = value.replace(/\s+/g, '')
  if (/^\d+$/.test(compact)) return compact
  const match = value.match(/(?:G\.?\s*N\.?\s*|第\s*)?(\d+)/i)
  return match?.[1] ?? null
}

export function formatNoticeLabel(raw, locale) {
  const value = String(raw ?? '').trim()
  if (!value) return locale === 'zh' ? '第?號' : 'G.N.?'

  const compact = value.replace(/\s+/g, '')
  const digitsOnly = /^\d+$/.test(compact)
  const num = extractNoticeNumber(value)
  if (!num) return value

  if (digitsOnly) {
    return locale === 'zh' ? `第${num}號` : `G.N.${num}`
  }

  if (locale === 'zh') {
    return /第/.test(value) ? value : `第${num}號`
  }
  return /G\.?\s*N\.?/i.test(value) ? value.replace(/\s+/g, '') : `G.N.${num}`
}
