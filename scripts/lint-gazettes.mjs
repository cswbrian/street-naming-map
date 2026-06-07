#!/usr/bin/env node
/**
 * Validate notice_stem + hosted gazette URL conventions against public/egazette/.
 *
 * Usage:
 *   node scripts/lint-gazettes.mjs
 *   npm run lint:gazettes
 */

import { loadPublishedStemSet, lintEventGazette } from './lib/gazette-stem.mjs'
import { loadMasterEvents } from './lib/master-street-events.mjs'
import { projectRoot } from './lib/data-paths.mjs'

async function main() {
  const [events, publishedStems] = await Promise.all([
    loadMasterEvents(),
    loadPublishedStemSet(projectRoot),
  ])

  const errors = []
  const warnings = []

  for (const event of events) {
    const issues = lintEventGazette(event, { publishedStems })
    for (const issue of issues) {
      const row = {
        event_id: event.event_id,
        street_code: event.street_code,
        notice_stem: event.notice_stem ?? null,
        ...issue,
      }
      if (issue.level === 'error') errors.push(row)
      else warnings.push(row)
    }
  }

  const summary = {
    events_checked: events.length,
    errors: errors.length,
    warnings: warnings.length,
    published_pdfs: publishedStems.size,
  }

  console.log(JSON.stringify(summary, null, 2))

  if (warnings.length) {
    console.log('\nWarnings:')
    for (const row of warnings.slice(0, 20)) {
      console.log(`  [${row.code}] ${row.event_id}: ${row.message}`)
    }
    if (warnings.length > 20) console.log(`  … and ${warnings.length - 20} more`)
  }

  if (errors.length) {
    console.log('\nErrors:')
    for (const row of errors.slice(0, 30)) {
      console.log(`  [${row.code}] ${row.event_id}: ${row.message}`)
    }
    if (errors.length > 30) console.log(`  … and ${errors.length - 30} more`)
    process.exit(1)
  }

  console.log('\nGazette lint passed.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
