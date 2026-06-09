# Street events (gazette facts)

`data/master/street-events.json` records **what the gazette said** — not how it attaches to today's map.

## Gazette contributor: include

| Field | Source |
|-------|--------|
| `publication_date` | Notice date |
| `change_kind` | `declare` · `rename` · `delete` · `extend` |
| `street_name_en` / `street_name_zh` | Name **after** this event |
| `previous_street_name_*` | Required for `rename` |
| `district_raw_en` / `district_raw_zh` | If printed on notice |
| `notice_no`, gazette URLs | Proof |
| `evidence_kind` | Usually `gazette_primary` |
| `source` | Pipeline: `hkgro`, `egazette_pdf`, `landsd`, `crowdsubmitted` |

Copy names **exactly** from the notice.

## Gazette contributor: do not include

| Field | Where it belongs |
|-------|------------------|
| `street_code` | **Deprecated on new rows** — use [street-centreline-map.json](../data/master/street-centreline-map.json) |
| Map / geojson lookups | Link contributor workflow |
| `event_role` | Derived at build from mapping + centreline name (legacy rows may still have it) |

## Link contributor

After events are added, run `npm run report:unmapped-events` and add rows to `street-centreline-map.json` (or `npm run apply:street-links`).

## Research / built dates

Non-gazette rows (`evidence_kind: research`, `event_role: built`) may stay in the same file. Still no `street_code` on new rows — link via the map file.

## Build behaviour (current)

- Events are grouped into timelines via `street-centreline-map.json` (`event_ids` on each link).
- Unlinked events stay in `street-events.json` and appear in `report:unmapped-events` / `/{locale}/timelines` (unlinked filter).
- The map joins geometry by `STREETCODE` only — no name guessing at build time.
- `street_code` on event rows is **removed** (see `npm run strip:event-street-codes`); do not reintroduce it on new rows.
