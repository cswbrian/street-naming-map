---
name: street-naming-master
description: Edit gazette naming events in data/master/street-events.json (amend, remove, direct insert). For centreline map linkage use centreline-linker skill. For PDF batches use apply-egazette-naming or parse-gazette-street-events. For researcher earliest-evidence / rename chains use research-street-history.
---

# Street naming master file

**Contributor docs:** [README](../README.md) · [contributor-roles.md](../docs/contributor-roles.md)

## Two files, two roles

| File | Role |
|------|------|
| `data/master/street-events.json` | Gazette facts (this skill) |
| `data/master/street-centreline-map.json` | Map linkage → [centreline-linker/SKILL.md](../centreline-linker/SKILL.md) |

```json
{
  "schema_version": 1,
  "updated_at": "2026-06-07T…",
  "events": [ /* flat array, sorted by publication_date */ ]
}
```

Sources: `crowdsubmitted`, `hkgro`, `landsd`, `egazette_pdf`.

- Field reference: [docs/street-name-history-schema.md](../docs/street-name-history-schema.md)
- Batch `history[]` patterns: [event-model.md](../event-model.md)
- Gazette PDFs: [gazette-files/SKILL.md](../gazette-files/SKILL.md)

## After any edit

```bash
npm run backfill:notice-stems   # if gazette URLs/stems changed
npm run lint:gazettes
npm run rebuild:naming && npm run report:pending-years && npm run report:street-timelines && npm run report:unmapped-events
```

Optional: `npm run build` before deploy.

## Insert a new event

1. **Gazette parsers:** add dated facts to `events[]` — **no `street_code`**. See [street-events-gazette-only.md](../docs/street-events-gazette-only.md).
2. **Linkers:** do not add `street_code` here — use [centreline-linker/SKILL.md](../centreline-linker/SKILL.md).
3. Unique `event_id` per row.

**`event_id` pattern:** `{source}|{batch-slug}-{name-slug}-{publication_date}` (old slugs may embed a code — do not copy that pattern).

Example: `crowd|1909-gn184-taku-大沽街-1909-03-19`

**Minimum fields for a gazette-backed rename:**

```json
{
  "event_id": "crowd|1909-gn184-taku-大沽街-1909-03-19",
  "source": "hkgro",
  "publication_date": "1909-03-19",
  "change_kind": "rename",
  "street_name_en": "Taku Street",
  "street_name_zh": "大沽街",
  "previous_street_name_en": "Station Street",
  "previous_street_name_zh": "差館街",
  "event_role": "current_name",
  "evidence_kind": "gazette_primary",
  "notice_no": "GN184",
  "government_notice_label_en": "G.N.184",
  "government_notice_label_zh": "第184號",
  "government_notice_url_en": "/egazette/en/1909-gn184.pdf",
  "government_notice_url_zh": "/egazette/zh/1909-gn184.pdf"
}
```

For **Previous G.N.** citations: `evidence_kind: "gazette_inferred"` + `derived_from[]`.

## Amend / remove

Find by `event_id` (grep). Patch in place — do **not** change `event_id` unless replacing a row.

Common patches:
- Fix `government_notice_url_en` after PDF publish
- Upgrade `evidence_kind` `unknown` → `gazette_primary`
- Fix dates or names (never add `street_code` — update centreline map instead)

Delete by `event_id`, then rebuild. Remove `event_id` from centreline map links if orphaned.

## Library helpers (`scripts/lib/master-street-events.mjs`)

| Function | Use |
|----------|-----|
| `loadMasterEvents()` | Read events |
| `saveMasterEvents(events)` | Write + sort + `updated_at` |
| `upsertMasterEvents(master, incoming)` | Insert/replace by `event_id` |
| `patchMasterEventById` / `removeMasterEventById` | Amend / delete |
| `findMasterEventsByStreetCode(events, code, centrelineMap?)` | Events for a STREETCODE via map `event_ids` |

## Gazette batch workflow (preferred for PDFs)

Use a parser skill instead of hand-editing when starting from a PDF — [skills/README.md](../README.md):

| Task | Skill |
|------|--------|
| Modern `egn`/`cgn` naming notice | [apply-egazette-naming](../apply-egazette-naming/SKILL.md) |
| HKGRO naming table | [parse-gazette-street-events](../parse-gazette-street-events/SKILL.md) |
| Earliest mention, rename chain, map identity, demote unverified | [research-street-history](../research-street-history/SKILL.md) |

Common master patches from research workflow: demote row (`is_declaration_event: false`, `unknown`, URLs null); upgrade when PDF arrives (`gazette_primary`).

## Import paths (rare)

| Script | When |
|--------|------|
| `npm run merge:egazette` | Bulk parsed eGazette → master |
| `npm run import:crowdsubmissions` | Legacy Google Form CSV |

## Do not edit

- `public/data/hk-streets.geojson` naming fields
- `public/data/master/verified-roads.json` / `pending-roads.json` / `street-timelines.json` / `unmapped-events.json`

## QA

```bash
node -e "const s=require('./data/master/street-events.json'); const c={}; s.events.forEach(e=>c[e.source]=(c[e.source]||0)+1); console.log(c, 'total', s.events.length)"
npm run rebuild:naming && npm run report:pending-years
```

- **Events:** grep `event_id`; check `/{locale}/timelines`
- **Map:** only after centreline link — chip 舊稱, 來源, `map_year`
