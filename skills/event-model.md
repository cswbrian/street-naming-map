# Street event model (batch `history[]` → master)

**Reference annex — not a standalone workflow.** Loaded via [apply-egazette-naming](apply-egazette-naming/SKILL.md), [parse-gazette-street-events](parse-gazette-street-events/SKILL.md), [research-street-history](research-street-history/SKILL.md), or [street-naming-master](street-naming-master/SKILL.md). Routing: [skills/README.md](README.md).

Full field schema: [`docs/street-name-history-schema.md`](../docs/street-name-history-schema.md). Gazette-only parse rules: [gazette-parse-principles.md](gazette-parse-principles.md).

**Skills:** Modern Lands Dept eGazette PDFs → [apply-egazette-naming/SKILL.md](apply-egazette-naming/SKILL.md). Colonial HKGRO scans → [parse-gazette-street-events/SKILL.md](parse-gazette-street-events/SKILL.md).

**After apply:** events → [`data/master/street-events.json`](../data/master/street-events.json). Map display → [`data/master/street-centreline-map.json`](../data/master/street-centreline-map.json) ([centreline-linker/SKILL.md](centreline-linker/SKILL.md)).

**Do not set `street_code` on new events.** Batch rows use `link_street_code` when a geojson match is confirmed.

## Two axes

| Axis | Values | Meaning |
|------|--------|---------|
| `change_kind` | `declare` \| `rename` \| `delete` \| `extend` | What happened in the notice |
| `event_role` | `current_name` \| `former_name` \| `built` \| `name_removed` | How the row appears in the 舊稱 timeline and map |

`evidence_kind` controls **來源** / **Source** badges (`gazette_primary`, `gazette_inferred`, `research`, …) — not the event type label.

## Chinese ↔ schema ↔ UI label

| Concept (zh) | `change_kind` | `event_role` | UI label (zh) | Notes |
|--------------|---------------|--------------|---------------|-------|
| 命名 | `declare` (or `rename` when sole timeline row) | `current_name` | 命名 | First naming of this name; sets canonical date |
| 延伸 | `extend` | `current_name` | 延伸 | Gazette names a **new segment** under existing name (“continuation of …”); excluded from canonical date when a `declare` exists |
| 易名 | `rename` | `current_name` | 易名 | Shown when another timeline row already exists |
| 舊稱 | `declare` or `rename` | `former_name` | 舊稱 | Name does not match today’s geojson |
| 落成 | `declare` | `built` | 落成 | Map year uses built-first; names often null |
| 名稱撤銷 | `delete` | `name_removed` | 名稱撤銷 | Gazette explicitly abolishes a street name |
| 憲報提及 / 新聞提及 / … | `declare` + `is_declaration_event: false` | `former_name` (usually) | 舊稱 + **XX提及** badge | Earliest documentary mention — not a naming notice; see [research-street-history](research-street-history/SKILL.md) |
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
├─ Gazette lists previous / "instead of" / Present Name → New Name?
│   └─ YES → **Two rows** when former name has no earlier naming G.N. on file:
│              (1) omit publication_date, declare, event_role: former_name, street_name_en = present name
│              (2) gazette date, rename, previous_street_name_*, street_name_en = new name, current_name
│            See 1904-gn59-victoria-road-renames.json, 1936-gn918-hill-road.json
│            If user/research supplies earlier name with its own verified date → dated former_name row instead
│            Single rename row only when after-name ≠ geojson (former_name-only segment rename)
│
├─ "continuation of …" / 延續 / existing name on map + earlier declare on file?
│   └─ YES → change_kind: extend, event_role: current_name
│            evidence_kind: gazette_primary
│            Does NOT replace earliest declare as canonical naming date
│
├─ "to be known for the future" / 宣布街道名稱 (no prior name on file)?
│   └─ YES → change_kind: declare, event_role: current_name
│            evidence_kind: gazette_primary (when this G.N. is the naming notice)
│
├─ User provides built/opened date (research, news)?
│   └─ YES → change_kind: declare, event_role: built
│            evidence_kind: research|news; supplementary_evidence for document URL
│
├─ Earliest documentary mention (not a naming notice)?
│   └─ YES → change_kind: declare, is_declaration_event: false
│            event_role: former_name when name ≠ today's geojson
│            evidence_kind: gazette_mention|legal_mention|news_mention|research_mention
│            publication_date = verified earliest date (order date if gazette cites an order)
│            supplementary_evidence[] for extra sources on the same event
│            Drives map year via earliest_attestation; does NOT set canonical naming date
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
| `publication_date` | Dated events | ISO `YYYY-MM-DD`; use `YYYY-01-01` if only year known. **Omit or `null`** on undated `former_name` rows attested only inside a rename notice |
| `change_kind` | Always | `declare`, `rename`, `delete`, or `extend` |
| `event_role` | Always | See table above |
| `street_name_en` / `street_name_zh` | Usually | Name **after** this event |
| `previous_street_name_en` / `previous_street_name_zh` | `rename` | Name **before** |
| `evidence_kind` | Always | `gazette_primary` when this batch’s PDF is the proof |
| `gazette_notice_label` | Gazette-backed | e.g. `G.N.300` |
| `government_notice_url_en` | Primary gazette | `/egazette/en/{year}-gn{no}.pdf` |
| `derived_from` | `gazette_inferred` | Citation chain from citing notice to cited G.N. |
| `supplementary_evidence` | Research/news | Per-event extra documents |
| `submitter_remarks` | Name mismatch or EN-only | e.g. `Gazette ZH 連合道; database 連道.` — omit when EN+ZH match. Note when ZH omitted because source is English-only. **Never** bulk DESCRIPTION OCR — use `gazette_location` |
| `gazette_location` | When DESCRIPTION exists | Raw + parsed location from gazette only ([schema](../docs/street-name-history-schema.md#gazette_location-schema-v2)) |
| `street_name_zh` / `previous_street_name_zh` | Per source | **Null** if the cited document has no Chinese for that name — do not copy from `parsed-notices.json` / hk-place guesses ([research-street-history](research-street-history/SKILL.md)) |

## Pattern matrix (A–R)

Reference corpus: 1961–2024 (~63 naming G.N.s). Patterns classify notice wording; timeline axes stay **`change_kind` + `event_role`**. Full gazette cues: [gazette-patterns.md](parse-gazette-street-events/gazette-patterns.md).

| Pattern | Gazette cue | `change_kind` | `history[]` rows | `event_role` | Key fields / notes |
|---------|-------------|---------------|------------------|--------------|---------------------|
| **A** | New thoroughfare; “to be known for the future” | `declare` | 1 | `current_name` | `gazette_location` from DESCRIPTION |
| **A′** | “continuation of …” / 延續 | `extend` | 1 | `current_name` | Does not replace canonical `declare` date |
| **B** | Lane absorption; multi declare table | `extend` or `rename` | 1–2 | `current_name` | G.N.50 Fu Yan Lane → Street |
| **C** | Present Name → New Name | `rename` | 2 if no prior G.N. | `former_name` + `current_name` | Undated former row + dated rename |
| **D** | ZH-only correction; EN unchanged | `rename` | 1–2 | `current_name` | `notice_type_normalized: chinese_correction`; G.N.4332, G.N.1459 |
| **E** | Segment split (5-col or 3-col) | `extend`/`rename` | 1 per segment | `current_name` | G.N.1335, G.N.2702; `split_boundary_en` |
| **F** | “replace that set out in G.N. …” | — | **0 at cite date** | — | Backfill cited G.N.; `gazette_inferred`; G.N.5399 |
| **G** | Name discontinued / abolished | `delete` | 1 | `name_removed` | G.N.851 |
| **H** | Gazette mention (non-naming) | `declare` | 1 | varies | `is_declaration_event: false`; `gazette_mention` |
| **I** | Merge rename (N → 1) | `rename` | N former + 1 | `former_name` × N + `current_name` | `merged_from_en/zh[]`; G.N.1866 |
| **J** | Gazetteer harmonization (EN fix) | `rename` | 1 | `current_name` | `notice_type_normalized: gazetteer_harmonization` |
| **K** | Paragraph rename | `rename` | 1–2 | same as C | G.N.996 |
| **L** | Proposed street | `declare`/`extend` | 1 | `current_name` | `parsed.is_proposed: true` |
| **M** | Suffix pending removal | `declare` now | 1+ | `current_name` | `parsed.suffix_pending_removal: true` |
| **N** | Proposal → enactment | `declare`/`extend` | proposal + final | `current_name` | `derived_from` G.N.51 → G.N.1335 |
| **O** | Compound former name in one cell | `rename` | 2+ per row | `former_name` × N | `merged_from_en/zh[]` |
| **P** | Obstructed / unformed | `declare` | 1 | `current_name` | `parsed.is_partially_formed: true` |
| **Q** | Inclusive boundary loop | `declare` | 1 | `current_name` | `parsed.includes_boundary_sections: true` |
| **R** | Intention to change (s.111C(2)) | `rename` (demoted) | 1 | `current_name` | `gazette_inferred`; `parsed.is_proposed: true`; G.N.3412 |

**Pattern F workflow:** Do not create an event at the citing G.N. date. Extract cited G.N. label(s), set `publication_date` from cited notice when known, attach amended `gazette_location` on backfilled row, host citing PDF on `derived_from` citing side.

**Pattern R workflow:** Record intention with `evidence_kind: gazette_inferred` and `is_declaration_event: false`. Upgrade to `gazette_primary` when final declaration G.N. is confirmed.

## Scenario examples

Reference batches under `data/crowdsubmissions/batches/`.

### 1 — First naming (HKGRO declare)

Colonial “to be known for the future” — one row:

```json
{
  "link_street_code": "12167",
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

### 3 — Rename notice with undated former name (two rows)

When a gazette rename lists a present/previous name but that name has **no separate naming date** on file, emit **two** `history[]` rows so 舊稱 shows the old name. See `1936-gn918-hill-road.json`, `1904-gn59-victoria-road-renames.json`.

```json
"history": [
  {
    "submission_id": "1904-gn59-victoria-road-renames-11817-upper-richmond-former",
    "change_kind": "declare",
    "street_name_en": "Upper Richmond Road",
    "street_name_zh": null,
    "event_role": "former_name",
    "evidence_kind": "gazette_primary",
    "government_notice_url_en": "/egazette/en/1904-gn59.pdf",
    "submitter_remarks": "Former name attested in G.N.59 rename notice; separate naming date not recorded on file."
  },
  {
    "submission_id": "1904-gn59-victoria-road-renames-11817-1904-01-29",
    "publication_date": "1904-01-29",
    "change_kind": "rename",
    "previous_street_name_en": "Upper Richmond Road",
    "street_name_en": "Robinson Road",
    "street_name_zh": null,
    "evidence_kind": "gazette_primary",
    "is_declaration_event": true,
    "event_role": "current_name",
    "government_notice_url_en": "/egazette/en/1904-gn59.pdf"
  }
]
```

Descriptive present names (route prose): short paraphrase in `street_name_en` / `previous_street_name_en`; full gazette sentence in row 1 `submitter_remarks` only.

### 4 — Former-name-only segment rename

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

### 5 — Built + former names (research)

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

### 6 — Gazette mention (non-naming cite)

See `1925-gn514-nam-cheong-nanchang.json` and [research-street-history/SKILL.md](research-street-history/SKILL.md):

```json
"history": [{
  "publication_date": "1925-09-10",
  "change_kind": "declare",
  "is_declaration_event": false,
  "street_name_en": "Nanchang Street",
  "street_name_zh": null,
  "evidence_kind": "gazette_mention",
  "event_role": "former_name",
  "gazette_notice_label": "G.N.514",
  "government_notice_url_en": "/egazette/en/1925-gn514.pdf"
}]
```

### 7 — Former-name naming + demoted rename

See `1926-gn342-1954-gn572-kai-tak-road.json` — G.N.342 names old name; G.N.572 rename pending PDF:

```json
"history": [
  {
    "publication_date": "1926-06-25",
    "change_kind": "declare",
    "is_declaration_event": true,
    "street_name_en": "Po Kong Road",
    "street_name_zh": null,
    "evidence_kind": "gazette_primary",
    "event_role": "former_name"
  },
  {
    "publication_date": "1954-05-12",
    "change_kind": "rename",
    "is_declaration_event": false,
    "previous_street_name_en": "Po Kong Road",
    "previous_street_name_zh": null,
    "street_name_en": "Kai Tak Road",
    "street_name_zh": "啓德道",
    "evidence_kind": "unknown",
    "event_role": "current_name",
    "gazette_notice_label": "G.N.572"
  }
]
```

### 8 — 取代街道說明 → inferred Previous G.N.

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

### 9 — Name extension (continuation)

G.N.427 窩打老道 (Prince Edward Rd → Cornwall St) when G.N.331 already on file:

```json
"history": [{
  "publication_date": "1929-08-23",
  "change_kind": "extend",
  "street_name_en": "Waterloo Road",
  "street_name_zh": "窩打老道",
  "evidence_kind": "gazette_primary",
  "event_role": "current_name"
}]
```

G.N.331 stays `declare` for 12690 until pre-1929 origin is sourced.

### 10 — Name abolished (pattern; rare)

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

After apply, the script runs `npm run rebuild:naming`, `report:pending-years`, `report:street-timelines`, and `report:unmapped-events`.

## Post-apply verification

```bash
rg '1909-gn184-taku' data/master/street-events.json   # by event_id slug
npm run report:unmapped-events                        # linker queue if not linked
```

**Events:** PDF hosted; rows on `/{locale}/timelines`.

**Map (linked only):** `rg 'code:12326' data/master/street-centreline-map.json` → chip 舊稱, 來源, `map_year`, **最近核實**.
