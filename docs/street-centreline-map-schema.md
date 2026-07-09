# Street centreline map schema

Links **naming timelines** (groups of gazette events) to **LandsD centreline** `STREETCODE` values. Hand-edited by link contributors; generated timelines and map joins read this file.

**Related:** [street-events-gazette-only.md](street-events-gazette-only.md) · [contributor-roles.md](contributor-roles.md)

## File

`data/master/street-centreline-map.json`

```json
{
  "schema_version": 1,
  "updated_at": "2026-06-09T12:00:00.000Z",
  "links": []
}
```

## Link object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timeline_id` | string | yes | Internal join key, e.g. `code:10115` or `page:bel-air-peak-avenue` |
| `page_id` | string | yes | **Permanent public URL slug** — assigned once, never changed. Used in `/{locale}/streets/{page_id}`. |
| `street_code` | string \| null | yes | LandsD `STREETCODE`; null when unlinked or abolished |
| `event_ids` | string[] | yes | `event_id` values from `street-events.json` |
| `status` | enum | yes | `active` · `unlinked` · `abolished` · `disputed` |
| `method` | string | no | How the link was made: `manual`, `migrated_from_event_street_code`, `geojson_match`, … |
| `district_hint` | string | no | Disambiguation for homonyms |
| `note` | string | no | Free text for reviewers |
| `linked_at` | ISO date | no | When the link was confirmed |
| `linked_by` | string | no | Contributor id or `migrate-script` |

### Status

| Value | Meaning |
|-------|---------|
| `active` | Timeline is linked to `street_code`; map shows naming when centreline exists |
| `unlinked` | Events recorded; no centreline match yet |
| `abolished` | Street name removed; no current geometry expected |
| `disputed` | Needs reviewer decision |

## Rules

1. Each `event_id` appears in **at most one** link.
2. Homonyms (e.g. two Macdonnell Roads) → **two** `timeline_id`s, **two** `street_code`s.
3. Gazette parsers do **not** edit this file.
4. Renames on the same centreline stay in one timeline (all `event_ids` on one link).
5. **`page_id` is immutable** after first assign. Linking may set `street_code` / `status`, but must **not** rename `page_id`. Public street URLs and SEO depend on it.

## Example: Kowloon Macdonnell → Canton Road

```json
{
  "timeline_id": "code:10115",
  "page_id": "10115-canton-road",
  "street_code": "10115",
  "event_ids": ["crowd|1909-gn184-safe-10115-1909-03-19"],
  "status": "active",
  "method": "manual",
  "district_hint": "Yau Ma Tei",
  "note": "Former Macdonnell Road (Kowloon), not HK Island Macdonnell (11358)"
}
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run migrate:street-code-to-map` | Historical one-time backfill (pre–Phase 5 only) |
| `npm run strip:event-street-codes` | Remove deprecated `street_code` from all events |
| `npm run report:unmapped-events` | Events not in any link |
| `npm run report:street-timelines` | Generate `public/data/master/street-timelines.json` |
| `npm run backfill:street-page-ids` | One-time / repair: assign `page_id`, create unlinked rows |
| `npm run apply:street-links` | Apply linker JSON/CSV updates |
