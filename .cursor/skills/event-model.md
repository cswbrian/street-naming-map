# Street event model (batch `history[]` → master)

Reference for agents applying gazette batches. Full schema: [`docs/street-name-history-schema.md`](../../docs/street-name-history-schema.md).

**Skills:** Modern Lands Dept eGazette PDFs → [apply-egazette-naming/SKILL.md](apply-egazette-naming/SKILL.md). Colonial HKGRO scans → [parse-hkgro-gazettes/SKILL.md](parse-hkgro-gazettes/SKILL.md).

**Source of truth after apply:** [`data/master/street-events.json`](../../data/master/street-events.json)

## Two axes

| Axis | Values | Meaning |
|------|--------|---------|
| `change_kind` | `declare` \| `rename` \| `delete` | What happened in the notice |
| `event_role` | `current_name` \| `former_name` \| `built` \| `name_removed` | How the row appears in the 舊稱 timeline and map |

`evidence_kind` controls **來源** / **Source** badges (`gazette_primary`, `gazette_inferred`, `research`, …) — not the event type label.

## Chinese ↔ schema ↔ UI label

| Concept (zh) | `change_kind` | `event_role` | UI label (zh) | Notes |
|--------------|---------------|--------------|---------------|-------|
| 命名 | `declare` (or `rename` when sole timeline row) | `current_name` | 命名 | Default for first naming or current name on map |
| 易名 | `rename` | `current_name` | 易名 | Shown when another timeline row already exists |
| 舊稱 | `declare` or `rename` | `former_name` | 舊稱 | Name does not match today’s geojson |
| 落成 | `declare` | `built` | 落成 | Map year uses built-first; names often null |
| 名稱撤銷 | `delete` | `name_removed` | 名稱撤銷 | Gazette explicitly abolishes a street name |
| 取代街道說明 | — | — | — | **Not a naming event** — see below |

## Decision tree

```
Read notice
│
├─ Modern: "取代街道說明" / "replacing description of street"?
│   └─ YES → Do NOT create event at citing G.N. date
│            Extract first Previous G.N. per street
│            → history[] with publication_date = Previous G.N. date
│            → evidence_kind: gazette_inferred, derived_from cites citing G.N.
│            → Host citing G.N. PDF; optional later backfill cited G.N. → gazette_primary
│
├─ Gazette lists previous / "instead of" name?
│   └─ YES → change_kind: rename
│            Fill previous_street_name_en/zh + street_name_en/zh
│            event_role: current_name if after-names match geojson, else former_name
│            If user/research supplies earlier name without gazette → add second row:
│              declare + former_name + evidence_kind: unknown|research
│
├─ "to be known for the future" / 宣布街道名稱?
│   └─ YES → change_kind: declare, event_role: current_name
│            evidence_kind: gazette_primary (when this G.N. is the naming notice)
│
├─ User provides built/opened date (research, news)?
│   └─ YES → change_kind: declare, event_role: built
│            evidence_kind: research|news; supplementary_evidence for document URL
│
└─ Name explicitly abolished / ceased to be known?
    └─ YES → change_kind: delete, event_role: name_removed
```

## Mandatory: `history[]` on every street

`apply-crowd-batch.mjs` upserts events **only** when each street object has a non-empty `history[]` array.

| Input style | Result |
|-------------|--------|
| `history[]` present | Upserts into `data/master/street-events.json` |
| Street shorthand only (`"streets": ["盛芳街"]` or `{ chinese_name }`) | Legacy CSV path — **avoid**; wrap as `{ chinese_name, history: [{…}] }` |

Each `history[]` entry should set `evidence_kind` and `event_role` explicitly.

## Field cheat sheet (per `history[]` row)

| Field | Required when | Notes |
|-------|---------------|-------|
| `publication_date` | Always | ISO `YYYY-MM-DD`; use `YYYY-01-01` if only year known |
| `change_kind` | Always | `declare`, `rename`, or `delete` |
| `event_role` | Always | See table above |
| `street_name_en` / `street_name_zh` | Usually | Name **after** this event |
| `previous_street_name_en` / `previous_street_name_zh` | `rename` | Name **before** |
| `evidence_kind` | Always | `gazette_primary` when this batch’s PDF is the proof |
| `gazette_notice_label` | Gazette-backed | e.g. `G.N.300` |
| `government_notice_url_en` | Primary gazette | `/egazette/en/{year}-gn{no}.pdf` |
| `derived_from` | `gazette_inferred` | Citation chain from citing notice to cited G.N. |
| `supplementary_evidence` | Research/news | Per-event extra documents |
| `submitter_remarks` | Name mismatch only | e.g. `Gazette ZH 連合道; database 連道.` — omit when EN+ZH match |

## Scenario examples

Reference batches under `data/crowdsubmissions/batches/`.

### 1 — First naming (HKGRO declare)

Colonial “to be known for the future” — one row:

```json
{
  "street_code": "12167",
  "english_name": "SUGAR STREET",
  "chinese_name": "糖街",
  "history": [{
    "publication_date": "1931-05-15",
    "change_kind": "declare",
    "street_name_en": "Sugar Street",
    "street_name_zh": "糖街",
    "evidence_kind": "gazette_primary",
    "event_role": "current_name"
  }]
}
```

### 2 — Rename with prior name (two rows)

See `1909-gn184-taku-street.json` — older name without gazette + gazette rename:

```json
"history": [
  {
    "publication_date": "1872-01-01",
    "change_kind": "declare",
    "street_name_en": "Station Street",
    "street_name_zh": "差館街",
    "evidence_kind": "unknown",
    "event_role": "former_name",
    "submitter_remarks": "Original name circa 1872; gazette proof not yet on file."
  },
  {
    "publication_date": "1909-03-19",
    "change_kind": "rename",
    "previous_street_name_en": "Station Street",
    "previous_street_name_zh": "差館街",
    "street_name_en": "Taku Street",
    "street_name_zh": "大沽街",
    "evidence_kind": "gazette_primary",
    "event_role": "current_name"
  }
]
```

### 3 — Former-name-only segment rename

See `1924-gn119-prince-edward-road.json` — segment renamed to a name that is **not** today’s map name (`former_name` only):

```json
"history": [{
  "publication_date": "1924-03-07",
  "change_kind": "rename",
  "street_name_en": "Prince Edward Road",
  "street_name_zh": "太子道",
  "previous_street_name_en": "Edward Avenue",
  "previous_street_name_zh": "宜華徑",
  "evidence_kind": "gazette_primary",
  "event_role": "former_name"
}]
```

### 4 — Built + former names (research)

See `hrch-fish-o-1880-1897-mui-kwai.json`:

```json
"history": [
  {
    "publication_date": "1880-01-01",
    "change_kind": "declare",
    "event_role": "built",
    "street_name_en": null,
    "street_name_zh": null,
    "evidence_kind": "research",
    "supplementary_evidence": [{ "evidence_kind": "research", "document_url": "…", "supports": ["publication_date"] }]
  },
  {
    "publication_date": "1897-01-01",
    "change_kind": "declare",
    "event_role": "former_name",
    "street_name_en": "Rienaeker Street",
    "street_name_zh": "連溺加街",
    "evidence_kind": "research"
  }
]
```

### 5 — 取代街道說明 → inferred Previous G.N.

See `2018-gn6060-first-previous-gn.json`. **Do not** use citing G.N. date as naming date:

```json
"history": [{
  "publication_date": "1960-11-11",
  "change_kind": "declare",
  "street_name_en": "Lung Cheung Road",
  "street_name_zh": "龍翔道",
  "gazette_notice_label": "G.N.1713",
  "evidence_kind": "gazette_inferred",
  "event_role": "current_name",
  "derived_from": [{
    "kind": "gazette_citation",
    "notice_label": "G.N.6060",
    "publication_date": "2018-08-10",
    "government_notice_url_en": "/egazette/en/2018-gn6060.pdf",
    "cited_notice_label": "G.N.1713",
    "cited_publication_date": "1960-11-11"
  }]
}]
```

Later: apply primary PDF for G.N.1713 → upgrade same row to `gazette_primary`, remove citation-only remarks.

### 6 — Name abolished (pattern; rare)

```json
"history": [{
  "publication_date": "YYYY-MM-DD",
  "change_kind": "delete",
  "street_name_en": "Former Street Name",
  "street_name_zh": "舊街名",
  "evidence_kind": "gazette_primary",
  "event_role": "name_removed"
}]
```

Use only when the gazette explicitly abolishes the name — verify wording.

## Add vs update (upsert)

`apply-crowd-batch.mjs` → `appendMasterEvents()` → `upsertMasterEvents()`:

| Situation | Action |
|-----------|--------|
| New street + date + role | Appends new event |
| Same dedupe key already exists | Skipped (console warning) |
| Same `event_id` | Replaced in place |
| `unknown` / `gazette_inferred` row exists | Apply primary gazette batch for cited date → upgrades `evidence_kind`, attaches PDF URL; remove stale “cited in G.N.…” remarks |
| Manual edit | Use [`street-naming-master/SKILL.md`](street-naming-master/SKILL.md) helpers |

After apply, the script runs `npm run rebuild:naming` and `npm run report:pending-years`.

## Post-apply verification

```bash
# Events for a street
rg '"street_code": "12326"' data/master/street-events.json

npm run rebuild:naming
```

Spot-check on the map:

1. Road chip **舊稱** timeline shows correct labels (命名 / 易名 / 舊稱 / 落成 / 名稱撤銷)
2. **來源** links to hosted G.N. PDF for `gazette_primary` events
3. Centerline year matches `map_year` (built-first when `built` event exists)
4. Street appears under **最近核實** when canonical naming date is set
