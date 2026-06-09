#!/usr/bin/env node
/**
 * Regenerate reports/timeline-audit-2026-06-09.md from timeline-audit-data.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const d = JSON.parse(readFileSync(path.join(root, 'reports/timeline-audit-data.json'), 'utf8'))

function mdTable(headers, rows) {
  const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const line = (row) => `| ${row.map(esc).join(' | ')} |`
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n')
}

const mismatchByCat = {}
for (const m of d.mismatches) {
  mismatchByCat[m.category] = (mismatchByCat[m.category] || 0) + 1
}

const sections = []

sections.push(`# Street timeline audit report

Generated: 2026-06-09 · Read-only audit of [data/master/street-events.json](../data/master/street-events.json)

## How to read this report

Each **event** is one dated fact in the master file (e.g. "Lung Yuet Road named 2016-03-18"). Events with the same \`street_code\` form a **timeline** for one road.

**Important:** A data issue can exist in the master file even when the map looks fine. The build pipeline can match events to roads by **English name** when \`street_code\` is missing — so roads like Lung Yuet Road and Fung Yu Road appear correctly on the map today, but their events are still not explicitly linked by code.

| Term | Meaning |
| --- | --- |
| \`street_code\` | LandsD centreline ID (e.g. \`14412\`) — the reliable join key |
| Name-only aggregate | Timeline grouped by English\\|Chinese name because the event has no \`street_code\` |
| Verified road | Road on the map with a naming year and 舊稱 timeline |
| Shadow duplicate | Same street exists twice: once by code, once by name only |

---

## Executive summary

**958** events → **914** timelines → **856** verified roads on the map. Gazette lint: **0 errors**.

### Do users see broken roads on the map?

**Mostly no.** The biggest issue (missing \`street_code\`) sounds alarming but often **does not** hide roads from the map. Name-based fallback matching works when the English name is unique.

${mdTable(
  ['Source', 'Events missing code', 'On map today', 'Not on map'],
  [
    ['landsd', '117', '111 (95%)', '6'],
    ['egazette_pdf', '164', '83 (51%)', '81'],
    ['crowdsubmitted', '25', '0', '25'],
    ['**Total**', '**306**', '**194 (63%)**', '**112 (37%)**'],
  ],
)}

### What actually needs fixing?

${mdTable(
  ['Priority', 'Issue', 'User-visible today?', 'Fix needed?'],
  [
    [
      '**High**',
      '6 shadow duplicates with year conflicts (Cheung Sha Wan, Shing Kai, Chui Kwan, Nga Cheung, Lai Po, Fleming)',
      'Possible wrong naming year on map',
      '**Yes** — merge or delete orphan events',
    ],
    [
      '**High**',
      '81 egazette + 25 crowd events not on map',
      'Roads show "資料待補" or no timeline',
      '**Yes** — backfill \`street_code\` or match to geojson',
    ],
    [
      '**Medium**',
      '306 events missing \`street_code\` (but 194 already on map)',
      'Map OK for most landsd roads; fragile for homonyms',
      '**Yes** — backfill codes for data hygiene',
    ],
    [
      '**Medium**',
      '6 landsd roads not matching (HZMB Link Road, etc.)',
      'Missing naming year',
      '**Yes** — fix name spelling or add geometry',
    ],
    [
      '**Low**',
      '56 aggregate vs geojson name mismatches',
      'Map names correct; QA flags only (except remarks UI)',
      '**Optional** — fix pickDisplayNames logic or geometry labels',
    ],
    [
      '**Low**',
      "Queen's Road occupation names in aggregate metadata",
      'Map and timeline correct',
      '**Optional** — cosmetic in build logic',
    ],
    [
      '**Low**',
      '1 rename chain break on 11805',
      'Timeline may confuse historians',
      '**Optional** — add missing intermediate event',
    ],
  ],
)}

### Summary counts

${mdTable(
  ['Metric', 'Value'],
  [
    ['Total events', d.summary.total_events],
    ['Total timelines (aggregates)', d.summary.total_aggregates],
    ['Timelines with street_code', d.summary.coded_aggregates],
    ['Name-only timelines', d.summary.name_only_aggregates],
    ['Events missing street_code', d.summary.missing_street_code],
    ['Shadow duplicate pairs', d.summary.shadow_duplicates],
    ['Name mismatches (aggregate vs geojson)', d.summary.mismatches],
  ],
)}

---

## 1. Missing \`street_code\` (306 events)

### What this means

These event rows have no \`street_code\` field. In the master file they are grouped by **name** (\`Lung Yuet Road|龍悅道\`) instead of **code** (\`code:14412\`).

### Why Lung Yuet Road still works on the map

1. The **centreline** has \`STREETCODE: 14412\` and name "LUNG YUET ROAD".
2. The **event** has no code but name "Lung Yuet Road".
3. At build time, [\`enrichGeojson\`](../scripts/lib/street-naming-core.mjs) tries code first, then **falls back to English name** when the name is unique.
4. Result: \`naming_year: 2016\` appears on the map and the 舊稱 panel works.

You will see \`naming_details.street_code: null\` in verified-roads even though the road row has \`street_code: 14412\` — that is the symptom.

### When this becomes a real problem

- **Homonyms** — two different roads share a similar English name; name fallback attaches the wrong timeline.
- **Shadow duplicates** — same street has both a coded timeline and a name-only copy (see §2).
- **Editing** — you cannot find events by grepping \`street_code: "14412"\` in the master file.
- **egazette_pdf / crowd** — only ~51% and 0% reach the map without code; most of the real gaps are here.

### Fix recommendation

| Action | Effort | Effect |
| --- | --- | --- |
| Backfill \`street_code\` on all 117 \`landsd\` events | Low — match EN+ZH to geojson | Explicit linkage; no behaviour change for roads already on map |
| Backfill 164 \`egazette_pdf\` events | Medium — many lack English name | ~81 more roads could get timelines |
| Match or remove 25 \`crowdsubmitted\` tier-c orphans | Medium — may be renamed/absorbed streets | Unclear if these roads still exist under different names |
| Fix 6 landsd name mismatches | Low per road | HZMB Link Road, On Pik Road, Kam Yee Road, Toscana Drive, Choi Lung Street, Ping Yip Street |

### Roads with landsd events that are NOT on the map (6)

| English | Chinese | Gazette date |
| --- | --- | --- |
| Hong Kong-Zhuhai-Macao Bridge Hong Kong Link Road | 港珠澳大橋香港連接路 | 2017-03-10 |
| On Pik Road | 安碧道 | 2021-10-22 |
| Kam Yee Road | 錦義路 | 2023-12-08 |
| Toscana Drive | 意濤徑 | 2024-04-26 |
| Choi Lung Street | 彩隆街 | 2025-10-10 |
| Ping Yip Street | 屏業街 | 2026-04-24 |

<details>
<summary>Full table: all 306 events missing street_code (click to expand)</summary>

${mdTable(
  ['event_id', 'source', 'date', 'EN', 'ZH', 'change_kind', 'notice_no'],
  d.missingCode.map((e) => [e.event_id, e.source, e.date, e.en, e.zh, e.change_kind, e.notice_no]),
)}

</details>

---

## 2. Shadow duplicate timelines (10 pairs)

### What this means

The same street name exists **twice** in the master data: once linked by \`street_code\` (used by the map) and once as a name-only orphan (ignored by the map but still in the file).

### Impact

${mdTable(
  ['Conflict?', 'Streets', 'What happens'],
  [
    [
      '**YES — fix**',
      'Cheung Sha Wan, Shing Kai, Chui Kwan, Nga Cheung, Lai Po, Fleming',
      'Orphan has different (or null) canonical year; QA reports false issues; risk if code-based row is ever deleted',
    ],
    [
      'no',
      'Tong Hang, Tsz Tin, Hing Kwai, Yau Ma Tei Interchange',
      'Duplicate copy with same date — harmless but should be merged for cleanliness',
    ],
  ],
)}

### Fix recommendation

For each pair: **delete the name-only orphan event** (or merge its events into the coded \`street_code\` if the orphan has extra facts). Re-run \`npm run rebuild:naming && npm run report:pending-years\`.

${mdTable(
  ['Street', 'Coded', 'Coded canonical', 'Orphan canonical', 'Fix action'],
  d.shadowDuplicates.map((s) => {
    const action = s.conflict
      ? s.nameOnlyCanonical
        ? 'Delete orphan or merge into coded row'
        : 'Delete orphan (false no_declaration)'
      : 'Delete duplicate orphan'
    return [s.en || s.nameKey, s.coded, s.codedCanonical, s.nameOnlyCanonical ?? '(null)', action]
  }),
)}

---

## 3. Aggregate display names (pickDisplayNames)

### What this means

Build logic sets the timeline's "display name" from the **last event by date**, even if that event is a former name (e.g. Japanese occupation rename).

### Impact on users

**None for normal map use.** The map chip shows names from geojson (Queen's Road Central), not from this aggregate field. This only breaks automated QA comparisons and internal metadata.

### Fix recommendation

**Optional.** Change \`pickDisplayNames\` to prefer the latest \`current_name\` event, or the geojson name. Low priority.

**Rename chain break on 11805:** occupation event says previous name was Queen's Road East, but prior event is Gap Road — optional historical cleanup.

---

## 4. Name mismatches: aggregate vs geojson (56 streets)

### What this means

For 56 verified roads, the timeline's stored display name differs from the centreline label in geojson. The map **shows the geojson name** (correct for users).

### Impact on users

${mdTable(
  ['Category', 'Count', 'User sees', 'Fix?'],
  [
    [
      'Occupation name in aggregate (11804–11806)',
      mismatchByCat.occupation_latest_aggregate || 0,
      "Correct Queen's Road names on map",
      'Optional — build logic',
    ],
    [
      'Chinese differs, English agrees',
      mismatchByCat.zh_only_geojson_or_event || 0,
      'Map Chinese from geojson; 舊稱 may show gazette Chinese + remark',
      'Verify gazette; often geojson Chinese is wrong (e.g. 10326 Conduit Road)',
    ],
    [
      'English differs',
      mismatchByCat.en_mismatch || 0,
      'Map uses geojson English',
      'Review for spelling vs homonym (e.g. Emma/Ema Avenue)',
    ],
  ],
)}

### Fix recommendation

- **10326, 10666:** Likely **geojson label bugs** (干德道 on Conduit Road; 克頓道 on Hatton Road) — fix upstream in LandsD geometry, not delete events.
- **Most zh-only (40):** Gazette Chinese may be authoritative; UI already adds remarks via \`buildNamingRemarks\`.
- **No urgent fix** unless you want cleaner QA output.

### Full mismatch table

${mdTable(
  ['street_code', 'category', 'geo EN', 'agg EN', 'geo ZH', 'agg ZH', 'canonical'],
  d.mismatches
    .toSorted((a, b) => String(a.code).localeCompare(String(b.code)))
    .map((m) => [m.code, m.category, m.geoEn, m.aggEn, m.geoZh, m.aggZh, m.canonical]),
)}

---

## 5. Other issues

### Multiple declare events (4 name-only timelines)

Likely corrigendum/republication pairs (e.g. Lung Wo Road 2009 + 2011). **Fix:** verify gazette, keep one row or link as corrigendum. Low urgency unless years conflict.

${mdTable(
  ['street', 'declare dates', 'event_ids'],
  d.multiDeclare.map((m) => [m.key, m.dates.join(', '), m.ids.join('; ')]),
)}

### Manual exclusions (\`data/naming-date-exclusions.json\`)

Intentional — eGazette "replace description" notices excluded from canonical year. Roads on this list show pending on map **by design**.

### What looks healthy

- No duplicate event IDs, future dates, or invalid roles
- No naming year drift between geojson and aggregates (for matched roads)
- Gazette URL lint passes

---

## 6. Priority manual review notes
`)

function timelineBlock(code, title, notes, fixNeeded) {
  const p = d.priorityDetails[code]
  let s = `### ${title} (\`${code}\`)\n\n${notes}\n\n`
  if (!p) return `${s}_No aggregate found._\n\n`
  const g = p.geo
  s += `**Geojson:** ${g?.ENGLISHSTREETNAME} / ${g?.CHINESESTREETNAME}\n`
  s += `**Canonical naming:** ${p.canonical} · **Fix needed?** ${fixNeeded}\n\n`
  s += '| date | kind | role | EN | ZH | previous EN |\n| --- | --- | --- | --- | --- | --- |\n'
  for (const e of p.events) {
    s += `| ${e.date} | ${e.kind} | ${e.role} | ${e.en ?? ''} | ${e.zh ?? ''} | ${e.prev_en ?? ''} |\n`
  }
  return `${s}\n`
}

sections.push(
  timelineBlock(
    '11804',
    "Queen's Road Central",
    'Timeline is coherent; occupation rename correctly marked former_name. Post-1945 restore event may be missing.',
    'Optional — historical completeness',
  ),
)
sections.push(
  timelineBlock(
    '11805',
    "Queen's Road East",
    'Gap Road → occupation rename chain needs review.',
    'Optional — historical cleanup',
  ),
)
sections.push(
  timelineBlock(
    '11806',
    "Queen's Road West",
    'Same pattern as 11804.',
    'Optional — historical completeness',
  ),
)
sections.push(
  timelineBlock(
    '10206',
    'Cheung Sha Wan Road',
    'Coded year 1923 vs orphan 1927 — verify gazettes and delete orphan.',
    '**Yes** — shadow duplicate with year conflict',
  ),
)
sections.push(
  timelineBlock(
    '14363',
    'Shing Kai Road',
    'Coded 2012 vs orphan 2017 — merge or delete orphan.',
    '**Yes** — shadow duplicate with year conflict',
  ),
)
sections.push(
  timelineBlock(
    '13996',
    'Chui Kwan Drive',
    'Orphan has extra 2024 events not on coded timeline.',
    '**Yes** — shadow duplicate; merge events into coded row',
  ),
)
sections.push(
  timelineBlock(
    '10326',
    'Conduit Road',
    'Event 干諾道 is correct; geojson 干德道 is wrong.',
    'Optional — geojson label fix upstream',
  ),
)
sections.push(
  timelineBlock(
    '10666',
    'Hatton Road',
    'Event 旭龢道 is correct; geojson 克頓道 is Kotewall Road.',
    'Optional — geojson label fix upstream',
  ),
)

sections.push(`---

## Appendix A: Coded timelines (${d.codedAppendix.length})

Flags: \`ok\` · \`shadow\` · \`mismatch\` · \`chain-break\` · \`excluded\`

${mdTable(
  ['code', 'EN', 'ZH', 'events', 'year', 'derivation', 'flags'],
  d.codedAppendix.map((r) => [r.code, r.en, r.zh, r.events, r.canonical ?? '', r.reason, r.flags]),
)}

---

## Appendix B: Name-only timelines (${d.nameOnlyAppendix.length})

Not linked by \`street_code\`. \`shadow-duplicate\` = redundant copy of a coded timeline.

${mdTable(
  ['key', 'EN', 'ZH', 'events', 'year', 'derivation', 'flags'],
  d.nameOnlyAppendix.map((r) => [r.key, r.en, r.zh, r.events, r.canonical ?? '', r.reason, r.flags]),
)}
`)

const md = sections.join('\n')
writeFileSync(path.join(root, 'reports/timeline-audit-2026-06-09.md'), md)
console.log(`Wrote reports/timeline-audit-2026-06-09.md (${md.length} chars)`)
