# Migration: street events ↔ centreline map

Status: **Phases 0–6 implemented** (2026-06-09)

## Goal

Separate gazette facts from map linkage so parsers and linkers can work independently.

## Completed

| Phase | Deliverable |
|-------|-------------|
| 0 | [contributor-roles.md](contributor-roles.md), [street-events-gazette-only.md](street-events-gazette-only.md), [street-centreline-map-schema.md](street-centreline-map-schema.md) |
| 1 | `data/master/street-centreline-map.json`, `npm run migrate:street-code-to-map`, `npm run report:unmapped-events` |
| 2 | `aggregateByCentrelineMap`, rebuild/report use map, `npm run report:street-timelines`, `npm run apply:street-links` |

## First-time setup (historical — already run on this repo)

```bash
npm run migrate:street-code-to-map   # one-time: backfill map from legacy event street_code
npm run strip:event-street-codes     # one-time: remove street_code from events (Phase 5)
npm run rebuild:naming
npm run report:pending-years
npm run report:street-timelines
npm run report:unmapped-events
```

New clones only need `rebuild:naming` and the report scripts unless recovering from pre-migration data.

## Phase 3 (done)

- `apply-crowd-batch.mjs` defaults to `gazette_only: true` — no geojson match required
- New events omit `street_code` (`allow_street_code_link` in batch JSON is **maintainer legacy only** — prefer `link_street_code` + centreline map)
- Linkers use `link_street_code` on batch rows or `npm run apply:street-links`
- Simple declare rows (no `history`) now create events directly

## Phase 4 (done)

- Hidden linker queue at `/{locale}/link-queue` (not in main nav)
- Source / change-kind filters, row selection, centreline search, download `links.json`
- Example: `data/linker/example.json`

## Phase 5 (done)

- `npm run strip:event-street-codes` removes `street_code` from all events
- `enrichGeojson` joins map features by `STREETCODE` only (no English name fallback)
- `aggregateByCentrelineMap` no longer picks up events via legacy `event.street_code`

## Phase 6 (done)

- Public timelines index at `/{locale}/timelines` (in main nav)
- Reads `public/data/master/street-timelines.json` from `npm run report:street-timelines`

## Parity check

After `migrate:street-code-to-map` + `rebuild:naming` + `report:pending-years`, verified road count should match pre-migration (~856).
