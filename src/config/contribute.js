/**
 * Google Form URLs and pre-fill entry IDs.
 * Replace placeholders after creating forms — see docs/crowdsource-google-forms-setup.md
 */

import { getSiteBaseUrl } from '../lib/seo.js'

const SITE_BASE = getSiteBaseUrl()

/** Single-street form: https://forms.gle/jekKtsP36mrVvyAG9 */
export const SINGLE_FORM_ID = '1FAIpQLSd-046moDam17Bhn59HAsMnbm_d5JmT5tE-jF-zHVfUwqiByA'

/** Lazy batch upload (up to 10 PDFs, auto street/year detection) */
export const LAZY_BATCH_FORM_URL = 'https://forms.gle/wcPUaoeV66dP5n4F7'

/** Batch upload form */
export const BATCH_FORM_ID = 'REPLACE_BATCH_FORM_ID'

export const singleFormUrl = `https://docs.google.com/forms/d/e/${SINGLE_FORM_ID}/viewform`
export const batchFormUrl = `https://docs.google.com/forms/d/e/${BATCH_FORM_ID}/viewform`

/**
 * Google Forms pre-fill entry IDs (from form "Get pre-filled link").
 * Update each value when the form is created.
 */
export const SINGLE_FORM_ENTRIES = {
  // Add via Get pre-filled link if you use street code on the form:
  streetCode: 'entry.REPLACE_STREET_CODE',
  englishName: 'entry.145949072',
  chineseName: 'entry.1355672527',
  namingDate: 'entry.1548672820',
  proofType: 'entry.501884929',
  gazetteUrl: 'entry.1105355214',
  noticeLabel: 'entry.2130032957',
  remarks: 'entry.730388691',
}

export const confirmationReturnUrl = (locale = 'en') =>
  `${SITE_BASE}/${locale}/names?filter=pending`

export const isSingleFormConfigured = () => !SINGLE_FORM_ID.startsWith('REPLACE_')

export const isBatchFormConfigured = () => !BATCH_FORM_ID.startsWith('REPLACE_')

/** At least single-street form (batch optional). */
export const isFormsConfigured = () => isSingleFormConfigured()
