import {
  batchFormUrl,
  isBatchFormConfigured,
  isSingleFormConfigured,
  SINGLE_FORM_ENTRIES,
  singleFormUrl,
} from '../config/contribute.js'

const encode = (value) => encodeURIComponent(String(value ?? '').trim())

export function buildSingleStreetFormUrl({ streetCode, englishName, chineseName }) {
  if (!isSingleFormConfigured()) return null

  const parts = []
  if (streetCode && !SINGLE_FORM_ENTRIES.streetCode.includes('REPLACE')) {
    parts.push(`${SINGLE_FORM_ENTRIES.streetCode}=${encode(streetCode)}`)
  }
  if (englishName && !SINGLE_FORM_ENTRIES.englishName.includes('REPLACE')) {
    parts.push(`${SINGLE_FORM_ENTRIES.englishName}=${encode(englishName)}`)
  }
  if (chineseName && !SINGLE_FORM_ENTRIES.chineseName.includes('REPLACE')) {
    parts.push(`${SINGLE_FORM_ENTRIES.chineseName}=${encode(chineseName)}`)
  }

  return parts.length ? `${singleFormUrl}?${parts.join('&')}` : singleFormUrl
}

export function getBatchFormUrl() {
  return isBatchFormConfigured() ? batchFormUrl : null
}

export function getGeneralSingleFormUrl() {
  return isSingleFormConfigured() ? singleFormUrl : null
}
