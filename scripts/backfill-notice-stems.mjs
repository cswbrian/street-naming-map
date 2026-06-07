#!/usr/bin/env node
/**
 * Backfill notice_stem and normalize self-hosted gazette URLs in street-events.json.
 *
 * Usage:
 *   node scripts/backfill-notice-stems.mjs [--dry-run]
 */

import { backfillEventGazetteFields, loadPublishedStemSet } from './lib/gazette-stem.mjs'
import { loadMasterEvents, saveMasterEvents } from './lib/master-street-events.mjs'
import { projectRoot } from './lib/data-paths.mjs'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  const [events, publishedStems] = await Promise.all([
    loadMasterEvents(),
    loadPublishedStemSet(projectRoot),
  ])

  let stemAdded = 0
  let stemUpdated = 0
  let urlPatched = 0
  const next = []

  for (const event of events) {
    const beforeStem = event.notice_stem ?? null
    const beforeEn = event.government_notice_url_en ?? null
    const beforeZh = event.government_notice_url_zh ?? null
    const { event: patched, changed } = backfillEventGazetteFields(event, publishedStems)
    if (changed) {
      if (!beforeStem && patched.notice_stem) stemAdded += 1
      else if (beforeStem !== patched.notice_stem) stemUpdated += 1
      if (beforeEn !== patched.government_notice_url_en || beforeZh !== patched.government_notice_url_zh) {
        urlPatched += 1
      }
    }
    next.push(patched)
  }

  const wrote = stemAdded > 0 || stemUpdated > 0 || urlPatched > 0
  if (!dryRun && wrote) {
    await saveMasterEvents(next)
  }

  console.log(
    JSON.stringify(
      {
        dry_run: dryRun,
        events: events.length,
        notice_stem_added: stemAdded,
        notice_stem_updated: stemUpdated,
        urls_normalized: urlPatched,
        published_stems_on_disk: publishedStems.size,
      },
      null,
      2,
    ),
  )

  if (dryRun) console.log('\nDry run — no files written.')
  else console.log('\nWrote data/master/street-events.json')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
