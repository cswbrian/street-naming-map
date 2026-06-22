---
name: centreline-linker
description: Connect gazette naming events to LandsD STREETCODEs via street-centreline-map.json. Use when linking unmapped events, applying link_street_code batches, running apply-street-links, or when map/timelines show events without geometry linkage.
---

# Centreline linker

**Role 2** in [contributor-roles.md](../docs/contributor-roles.md). Parsers edit `street-events.json`; **you** edit `street-centreline-map.json`. Skill routing: [README.md](../README.md).

## Map rule

The map shows naming years only when an **active** link connects `event_ids` → `STREETCODE`. Gazette facts alone appear on `/{locale}/timelines` (unlinked filter) and in `report:unmapped-events`.

## When to use this skill

- User asks to link events to the map / centreline / STREETCODE
- After `apply-crowd-batch` without `link_street_code` on every street
- `npm run report:unmapped-events` shows a growing queue
- Homonym disambiguation (two streets, same English name)

**Not this skill:** parsing gazette PDFs → [apply-egazette-naming](../apply-egazette-naming/SKILL.md) or [parse-gazette-street-events](../parse-gazette-street-events/SKILL.md). Editing event text → [street-naming-master](../street-naming-master/SKILL.md).

## Workflow

1. **Queue**

```bash
npm run report:unmapped-events
```

Or hidden UI: `/{locale}/link-queue` (select rows → download `links.json`).

2. **Find centreline** in `public/data/hk-streets.geojson`:
   - Prefer **Chinese name + district**, not English alone
   - Confirm `STREETCODE` on the feature you mean

3. **Write link** (one row per physical street timeline):

```json
{
  "links": [{
    "timeline_id": "code:10115",
    "street_code": "10115",
    "event_ids": ["crowd|1909-gn184-safe-10115-1909-03-19"],
    "status": "active",
    "method": "manual",
    "district_hint": "Yau Ma Tei",
    "linked_at": "2026-06-09",
    "linked_by": "linker"
  }]
}
```

Example file: [data/linker/example.json](../data/linker/example.json). Schema: [docs/street-centreline-map-schema.md](../docs/street-centreline-map-schema.md).

4. **Apply**

```bash
npm run apply:street-links -- data/linker/your-links.json
```

Runs rebuild + all reports.

## Same-PR shortcut: `link_street_code` on batch

When applying a gazette batch **and** geojson match is confirmed, parsers/linkers may set on each street object:

```json
"link_street_code": "12326"
```

`apply-crowd-batch.mjs` upserts events **and** updates `street-centreline-map.json` when `gazette_only: true` (default). Omit when unsure — linker can connect later.

## Status values

| `status` | When |
|----------|------|
| `active` | Linked to current `street_code`; map shows timeline |
| `unlinked` | Events recorded; no centreline yet |
| `abolished` | Name removed; `street_code: null` |
| `disputed` | Needs reviewer |

## Rules

1. Each `event_id` appears in **at most one** link.
2. Homonyms → two `timeline_id`s, two `street_code`s, separate `event_ids`.
3. Renames on the same physical road → one link, all related `event_ids`.
4. **Never** add `street_code` back onto events in `street-events.json`.

## Verification

```bash
rg 'code:10115' data/master/street-centreline-map.json
npm run report:street-timelines    # geometry_link.status === active
npm run report:pending-years       # road moves to verified when linked
```

Spot-check on map only after link is `active`: centerline `map_year`, chip 舊稱 timeline, 來源 PDF link.

## Do not

- Edit `public/data/hk-streets.geojson` naming fields (generated)
- Use English-only name matching for homonyms
- Set `allow_street_code_link: true` on batches (maintainer legacy — ignored by map join)
