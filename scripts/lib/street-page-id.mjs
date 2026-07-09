import { createHash } from 'node:crypto'
import { normalizeStreetName } from './street-naming-core.mjs'

const PAGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugifyEnglishStreetName(name) {
  return normalizeStreetName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function slugifyDistrictHint(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}

function shortHash(parts) {
  const input = parts.filter(Boolean).join('|')
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}

export function isValidPageId(value) {
  const id = String(value ?? '').trim()
  return Boolean(id) && PAGE_ID_PATTERN.test(id) && id.length <= 80
}

/**
 * Mint a URL-safe page_id. Caller must track usedIds to avoid collisions.
 */
export function buildStreetPageId(
  { streetCode, streetNameEn, streetNameZh, districtHint, eventIds = [] },
  usedIds,
) {
  const code = String(streetCode ?? '').trim()
  const enSlug = slugifyEnglishStreetName(streetNameEn)
  const districtSlug = slugifyDistrictHint(districtHint)

  let base = ''
  if (code && enSlug) {
    base = `${code}-${enSlug}`
  } else if (code) {
    base = `${code}-street`
  } else if (enSlug && districtSlug) {
    base = `${enSlug}-${districtSlug}`
  } else if (enSlug) {
    base = enSlug
  } else {
    base = `tl-${shortHash([streetNameEn, streetNameZh, ...(eventIds ?? [])])}`
  }

  let candidate = base.slice(0, 80)
  let suffix = 2
  while (usedIds.has(candidate)) {
    const stem = base.slice(0, Math.max(1, 80 - String(suffix).length - 1))
    candidate = `${stem}-${suffix}`
    suffix += 1
  }
  usedIds.add(candidate)
  return candidate
}

export function buildTimelineIdForPage(pageId) {
  return `page:${pageId}`
}
