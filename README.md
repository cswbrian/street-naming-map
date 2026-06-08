# Hong Kong Streets Timeline PWA

Interactive React PWA that visualizes Hong Kong street development over time. Each road can have multiple dated naming events shown in the per-street history panel.

## Architecture

One master file feeds generated assets. The map app reads only the outputs.

```
data/master/street-events.json     ← edit (all naming history)
        │
        ├─ npm run rebuild:naming   → public/data/hk-streets.geojson
        └─ npm run report:pending-years
                → public/data/master/verified-roads.json
                → public/data/master/pending-roads.json
```

| Layer | Role |
|-------|------|
| `data/master/street-events.json` | Single source of truth — one event per naming fact (date, street, optional gazette proof). Field reference: [docs/street-name-history-schema.md](docs/street-name-history-schema.md). |
| `public/data/hk-streets.geojson` | Road geometry + derived `map_year` / `naming_year` per segment (generated). |
| `verified-roads.json` / `pending-roads.json` | Roads split by whether a canonical naming year exists; verified rows carry full `naming_details` (timeline, evidence, gazette links). Pending rows stay slim so the app does not load empty history for ~11k roads. |

## Data model (read this first)

### Events

The master file is a flat `events[]` array. Each object is one dated fact about one street (`street_code`). Multiple events for the same code form an ordered timeline.

Every event has two independent axes:

| Axis | Values | Meaning |
|------|--------|---------|
| `change_kind` | `declare` · `rename` · `delete` · `extend` | What happened in the source document |
| `event_role` | `current_name` · `former_name` · `built` · `name_removed` | How the row appears in the 舊稱 timeline and map logic |

`source` (`hkgro`, `crowdsubmitted`, `landsd`, `egazette_pdf`) records **which pipeline ingested** the row. It is not shown in the UI.

Full field reference: [docs/street-name-history-schema.md](docs/street-name-history-schema.md). Agent-oriented examples: [.cursor/skills/event-model.md](.cursor/skills/event-model.md).

### Derived years (computed at build time)

`npm run rebuild:naming` groups events by `street_code`, sorts by `publication_date`, and derives two years per street:

| Field | GeoJSON property | Used for |
|-------|------------------|----------|
| `canonical_naming_date` / `canonical_naming_year` | `naming_date` / `naming_year` | When the **current name** was gazetted — latest rename to today’s name, else earliest `declare` for that name. `extend` rows are excluded when a `declare` already exists. |
| `map_display_date` / `map_display_year` | `map_date` / `map_year` | **Map display year** — earliest `built` event if present, else canonical naming date. |

A street with only a built date and no naming date stays in `pending-roads.json` but can still appear on the map at its built year.

### Verified vs pending

`npm run report:pending-years` splits roads using `naming_year` (canonical naming only):

- **Verified** — `naming_year` is set. Row includes `naming_details` (`name_history`, `canonical_evidence_kind`, gazette URLs).
- **Pending** — no canonical naming year yet. May still have partial `name_history` if former names or built dates were recorded.

## How the timeline works

When you select a road, the chip shows a **name history list** — every recorded event for that street, newest first:

```
[date] [event type]     e.g. 1909  易名
[street name]           e.g. 大沽街
[來源 / source badge]   e.g. 憲報 → PDF link
```

Built from `naming_details.name_history` via `src/lib/nameHistory.js`. Only roads in `verified-roads.json` (or pending rows that already have `naming_details`) populate this panel.

If the street has no canonical naming year, a pending row is inserted at the top showing “資料待補”.

## Event types

How `change_kind` + `event_role` map to UI labels (Chinese / English):

| Concept | `change_kind` | `event_role` | UI label (zh / en) | On map? | Sets canonical naming date? |
|---------|---------------|--------------|---------------------|---------|----------------------------|
| First naming of current name | `declare` | `current_name` | 命名 / Named | Yes (`map_year`) | Yes |
| Rename to current name | `rename` | `current_name` | 易名 / Rename (or 命名 if sole row) | Yes | Yes (latest rename) |
| New segment, same name | `extend` | `current_name` | 延伸 / Extended | No* | No when `declare` exists |
| Earlier name | `declare` or `rename` | `former_name` | 舊稱 / Former name | No | No |
| Built / opened | `declare` | `built` | 落成 / Built | Yes (`map_year`, built-first) | No |
| Name abolished | `delete` | `name_removed` | 名稱撤銷 / Name removed | No | No |

\*An `extend` row supplies `map_year` only when no `declare` exists for the current name.

**Not an event:** modern gazette notices titled “取代街道說明” (replacing description of street). Extract the cited **Previous G.N.** date instead and record it as `gazette_inferred` — see [event-model.md](.cursor/skills/event-model.md) scenario 5.

### Minimum event fields

```json
{
  "event_id": "crowd|1909-gn184-taku-12326-1909-03-19",
  "source": "hkgro",
  "street_code": "12326",
  "publication_date": "1909-03-19",
  "change_kind": "rename",
  "event_role": "current_name",
  "street_name_en": "Taku Street",
  "street_name_zh": "大沽街",
  "previous_street_name_en": "Station Street",
  "previous_street_name_zh": "差館街",
  "evidence_kind": "gazette_primary",
  "government_notice_url_en": "/egazette/en/1909-gn184.pdf",
  "government_notice_label_en": "Gazette No. 184"
}
```

Use `YYYY-01-01` when only the year is known. `event_id` must be unique; pattern: `{source}|{batch-or-notice-slug}-{street_code}-{publication_date}`.

## Evidence kinds

`evidence_kind` drives the **來源 / Source** badge in the UI (not the event-type label). Strength order (badges and sort only — the map still shows the year):

`gazette_primary` > `gazette_inferred` > `legal_other` > `research` > `news` > `hearsay` > `unknown` > `other`

| `evidence_kind` | Meaning | Typical proof |
|-----------------|---------|---------------|
| `gazette_primary` | Naming date from the actual gazette notice | `government_notice_url_en` pointing to hosted PDF |
| `gazette_inferred` | Date/G.N. inferred from another notice (e.g. “Previous G.N.”) | `derived_from[]` citation chain; citing G.N. PDF hosted |
| `legal_other` | Ordinance, court, plan, other legal document | Document URL |
| `research` | Academic / heritage-centre research | `supplementary_evidence[]` with `document_url` |
| `news` | Newspaper, magazine, official press | Document URL |
| `hearsay` | Oral tradition, forum, unverified secondary | — |
| `unknown` | Date present; source not yet classified | Shown as pending in timeline |
| `other` | Rare cases | Set `evidence_kind_note` |

### Supplementary and inferred evidence

- **`supplementary_evidence[]`** — extra documents on one event (e.g. gazette for the date + research PDF for Chinese name only). Each item has `supports`: `publication_date`, `street_name_en`, `street_name_zh`, `previous_street_name_en`, `previous_street_name_zh`.
- **`derived_from[]`** — required for `gazette_inferred`. Links the citing notice (later G.N. with “Previous G.N.”) to the cited notice whose date becomes the naming year.

The road chip and dashboard show a **pending** state when `unknown` lacks proof, when `gazette_inferred` lacks a hosted citing PDF, or when `research` lacks a `supplementary_evidence` document URL.

## Contribute

1. Find the street — use `street_code` from `public/data/hk-streets.geojson` or `pending-roads.json`.
2. Add naming events — edit `data/master/street-events.json` directly, or use the **apply-egazette-naming** skill (`/apply-egazette-naming`) when you have Lands Dept eGazette PDFs (`egn…` / `cgn…`).
3. Rebuild:

```bash
npm run rebuild:naming && npm run report:pending-years
```

4. Check locally: `npm run dev` — map year chip and 來源 link should update.
5. Commit the master file and generated files under `public/data/`.

Do not hand-edit generated geojson or road lists.

```bash
npm install
npm run dev
```

Deploys to GitHub Pages on push to `main` (see `.github/workflows/deploy-pages.yml`). Live site: [cswbrian.github.io/street-naming-map](https://cswbrian.github.io/street-naming-map/).

## Agents

Use these Cursor skills for data work — follow them instead of improvising:

| Task | Skill |
|------|-------|
| Edit naming events in master | [.cursor/skills/street-naming-master/SKILL.md](.cursor/skills/street-naming-master/SKILL.md) |
| Gazette PDF naming & placement | [.cursor/skills/gazette-files/SKILL.md](.cursor/skills/gazette-files/SKILL.md) |
| Apply Lands Dept eGazette naming events (`egn`/`cgn` PDFs) | [.cursor/skills/apply-egazette-naming/SKILL.md](.cursor/skills/apply-egazette-naming/SKILL.md) |
| Parse colonial HKGRO gazette scans | [.cursor/skills/parse-hkgro-gazettes/SKILL.md](.cursor/skills/parse-hkgro-gazettes/SKILL.md) |

After any master change: `npm run rebuild:naming && npm run report:pending-years`.
