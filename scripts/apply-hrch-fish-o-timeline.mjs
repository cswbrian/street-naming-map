#!/usr/bin/env node
/**
 * Apply corrected 1880 built → 1897 former names → 1919 rename timeline
 * for Mui Fong (11477) and Kwai Heung (11087) using HRCH fish_o research PDF.
 */
import {
  loadMasterEvents,
  removeMasterEventById,
  patchMasterEventById,
  saveMasterEvents,
  upsertMasterEvents,
} from './lib/master-street-events.mjs'
import { finalizeCrowdEvent } from './lib/street-naming-core.mjs'

const FISH_O_URL = 'https://cache.org.hk/download/fish_o_10Apr.pdf'

const HRCH_BASE = {
  evidence_kind: 'research',
  publisher: 'Hong Kong Resource Centre for Heritage',
  publisher_zh: '香港文化古蹟資源中心',
  document_label: 'fish_o',
  document_url: FISH_O_URL,
}

const GN450_CORROBORATION = {
  evidence_kind: 'gazette_primary',
  supports: ['street_name_en'],
  notice_label: 'G.N.450',
  publication_date: '1919-09-26',
  government_notice_url_en: '/egazette/en/1919-gn450.pdf',
  note: 'EN spelling corroborated at 1919 rename; does not fix 1897 naming date.',
}

const REMOVE_EVENT_IDS = [
  'crowd|1919-gn450-hk-paths-11477-rienaeker-1919-09-26',
  'crowd|1919-gn450-hk-paths-11087-torsiem-1919-09-26',
]

function builtEvent(streetCode) {
  return finalizeCrowdEvent({
    event_id: `crowd|hrch-fish-o-${streetCode}-built-1880`,
    source: 'crowdsubmitted',
    submission_id: `hrch-fish-o-${streetCode}-built-1880`,
    publication_date: '1880-01-01',
    change_kind: 'declare',
    event_role: 'built',
    street_name_en: null,
    street_name_zh: null,
    evidence_kind: 'research',
    is_declaration_event: true,
    supplementary_evidence: [
      {
        ...HRCH_BASE,
        supports: ['publication_date'],
        note: 'Earliest built circa 1880; no street name at this stage.',
      },
    ],
    display_names: { en: null, zh: null },
  })
}

function formerNameEvent(streetCode, streetNameEn, streetNameZh, slug) {
  return finalizeCrowdEvent({
    event_id: `crowd|hrch-fish-o-${streetCode}-${slug}-1897`,
    source: 'crowdsubmitted',
    submission_id: `hrch-fish-o-${streetCode}-${slug}-1897`,
    publication_date: '1897-01-01',
    change_kind: 'declare',
    event_role: 'former_name',
    street_name_en: streetNameEn,
    street_name_zh: streetNameZh,
    evidence_kind: 'research',
    is_declaration_event: true,
    supplementary_evidence: [
      {
        ...HRCH_BASE,
        supports: ['publication_date', 'street_name_zh'],
        note: 'Naming year and Chinese from HRCH research.',
      },
      GN450_CORROBORATION,
    ],
    display_names: { en: streetNameEn, zh: streetNameZh },
  })
}

const NEW_EVENTS = [
  builtEvent('11477'),
  formerNameEvent('11477', 'Rienaeker Street', '連溺加街', 'rienaeker'),
  builtEvent('11087'),
  formerNameEvent('11087', 'Torsiem Street', '多善街', 'torsiem'),
]

const RENAME_PATCHES = [
  {
    event_id: 'crowd|1919-gn450-hk-paths-11477-1919-09-26',
    previous_street_name_zh: '連溺加街',
  },
  {
    event_id: 'crowd|1919-gn450-hk-paths-11087-1919-09-26',
    previous_street_name_zh: '多善街',
  },
]

let events = await loadMasterEvents()

for (const eventId of REMOVE_EVENT_IDS) {
  const result = removeMasterEventById(events, eventId)
  if (!result.removed) {
    console.warn(`warn: event not found for removal: ${eventId}`)
  }
  events = result.events
}

for (const patch of RENAME_PATCHES) {
  const { event_id: eventId, ...fields } = patch
  const result = patchMasterEventById(events, eventId, fields)
  if (!result.found) {
    throw new Error(`rename event not found: ${eventId}`)
  }
  events = result.events
}

events = upsertMasterEvents(events, NEW_EVENTS)
await saveMasterEvents(events)

console.log('Applied HRCH fish_o timeline:')
console.log(`  removed: ${REMOVE_EVENT_IDS.length} erroneous 1919 former-name events`)
console.log(`  inserted: ${NEW_EVENTS.length} events (1880 built + 1897 former names)`)
console.log(`  patched: ${RENAME_PATCHES.length} rename rows (previous_street_name_zh)`)
console.log(`  total events: ${events.length}`)
