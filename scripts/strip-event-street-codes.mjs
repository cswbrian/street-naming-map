#!/usr/bin/env node
/**
 * Remove street_code from all events in street-events.json (Phase 5).
 * Centreline linkage lives only in street-centreline-map.json.
 *
 * Usage:
 *   node scripts/strip-event-street-codes.mjs
 *   npm run strip:event-street-codes
 */

import { loadMasterEvents, saveMasterEvents } from './lib/master-street-events.mjs'

async function main() {
  const events = await loadMasterEvents()
  let stripped = 0
  const cleaned = events.map((event) => {
    if (!Object.hasOwn(event, 'street_code')) return event
    stripped += 1
    const { street_code: _removed, ...rest } = event
    return rest
  })

  await saveMasterEvents(cleaned)
  console.log(
    JSON.stringify(
      {
        total_events: cleaned.length,
        stripped_street_code_fields: stripped,
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
