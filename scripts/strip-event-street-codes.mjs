#!/usr/bin/env node
/**
 * Remove deprecated fields from all events in street-events.json.
 * Centreline linkage lives only in street-centreline-map.json.
 *
 * Usage:
 *   node scripts/strip-event-street-codes.mjs
 *   npm run strip:event-street-codes
 */

import { loadMasterEvents, saveMasterEvents } from './lib/master-street-events.mjs'

/** Fields removed from master events — redundant with publication_date / other canonical fields. */
const DEPRECATED_EVENT_FIELDS = ['street_code', 'proof_pdf_url', 'evidence_level', 'year_bucket']

async function main() {
  const events = await loadMasterEvents()
  const stripped = Object.fromEntries(DEPRECATED_EVENT_FIELDS.map((key) => [key, 0]))
  const cleaned = events.map((event) => {
    let next = event
    for (const key of DEPRECATED_EVENT_FIELDS) {
      if (!Object.hasOwn(next, key)) continue
      stripped[key] += 1
      if (next === event) next = { ...event }
      delete next[key]
    }
    return next
  })

  await saveMasterEvents(cleaned)
  console.log(
    JSON.stringify(
      {
        total_events: cleaned.length,
        stripped_fields: stripped,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
