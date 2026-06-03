# Street name history schema

Events describe how a street’s name changed over time. Multiple events per `street_code` form an ordered timeline.

## Product model (map focus)

Identity on the map comes from [`public/data/hk-streets.geojson`](public/data/hk-streets.geojson): `STREETCODE` + current `ENGLISHSTREETNAME` / `CHINESESTREETNAME`.

| User question | `event_role` | On map? | In 舊稱 history? |
|---------------|--------------|---------|------------------|
| When was **current name** named? | `current_name` | **Yes** (`canonical_naming_date`) | Only if also a rename with prior name |
| Earlier names | `former_name` | No | **Yes** |
| When built / opened | `built` | No (v1) | **Yes** when recorded |
| Name abolished | `name_removed` | No | Optional |

**Naming date ≠ built date** — do not use `built` for the map year.

## Pipeline vs evidence

| Field | Role |
|-------|------|
| `source` | **Pipeline ingest** only (`hkgro`, `crowdsubmitted`, `landsd`, `egazette_pdf`) — not shown in UI |
| *(UI)* **來源** / **Source** | From `evidence_kind` on `naming_details` (`gazette_primary`, `gazette_inferred`, …) |
| `event_role` | **UX role** for this fact: `current_name`, `former_name`, `built`, `name_removed` |
| `evidence_kind` | **What document class** supports the date (see below) |
| `evidence_level` | **Deprecated** — use `evidence_kind`. Still read for compatibility: `gazette` → `gazette_primary`; `historical` → `unknown` until migrated |

## Event fields (crowd, LandsD, eGazette)

| Field | Type | Description |
|-------|------|-------------|
| `street_code` | string | LandsD street code; **required** to group rename chains |
| `publication_date` | ISO date | When the name took effect (use `YYYY-01-01` if only a year is known) |
| `change_kind` | `declare` \| `rename` \| `delete` | Kind of change |
| `street_name_en` / `street_name_zh` | string | Name **after** this event |
| `previous_street_name_en` / `previous_street_name_zh` | string | Name **before** (required for `rename`) |
| `event_role` | enum | `current_name` \| `former_name` \| `built` \| `name_removed` |
| `evidence_kind` | enum | See **Evidence kinds** |
| `evidence_kind_note` | string | Required when `evidence_kind` is `other` |
| `derived_from` | array | Citation chain (required for `gazette_inferred`) |
| `evidence_level` | `gazette` \| `historical` | Deprecated; written from `evidence_kind` on merge |
| `is_declaration_event` | boolean | Legacy flag; renames should be `false` |
| `government_notice_url_en` | URL | Gazette scan (e.g. HKGRO PDF) |
| `government_notice_label_en` | string | e.g. `Gazette No. 184` |
| `proof_pdf_url` | URL | Non-hosted attachment |

### Evidence kinds

| `evidence_kind` | Meaning |
|-----------------|---------|
| `gazette_primary` | This event’s naming date comes from the actual gazette notice (PDF/URL on this event) |
| `gazette_inferred` | Date/G.N. from another notice (e.g. “Previous G.N.” in a later notice); use `derived_from` |
| `legal_other` | Ordinance, court, plan-only, other legal document |
| `news` | Newspaper, magazine, official press |
| `hearsay` | Oral tradition, forum, unverified secondary |
| `unknown` | Date present; type not yet classified |
| `other` | Rare cases; set `evidence_kind_note` |

**Strength order** (badges / sort only; map still shows the year):  
`gazette_primary` > `gazette_inferred` > `legal_other` > `news` > `hearsay` > `unknown` > `other`

### `derived_from` (per event)

For `gazette_inferred` (and optionally `legal_other` / `news`):

```json
{
  "derived_from": [
    {
      "kind": "gazette_citation",
      "notice_label": "G.N.6060",
      "publication_date": "2018-08-10",
      "government_notice_url_en": "/egazette/en/2018-gn6060.pdf",
      "cited_notice_label": "G.N.1713",
      "cited_publication_date": "1960-11-11"
    }
  ]
}
```

- **Citing** notice: later G.N. that references “Previous G.N.” (usually has PDF on the batch).
- **Cited** notice: the G.N./date used for the canonical naming year (often label-only until backfilled).

## Aggregate outputs (`street-aggregates-combined.json`)

| Field | Meaning |
|-------|---------|
| `canonical_naming_date` | Date shown on map: **current name since** if renamed, else earliest declaration |
| `canonical_evidence_kind` | `evidence_kind` of the event that supplies `canonical_naming_date` |
| `canonical_evidence_event_id` | `event_id` of that event (QA) |
| `canonical_event_role` | Usually `current_name` |
| `current_name_since_date` | Latest rename to today’s name |
| `first_known_naming_date` | Earliest event in timeline |
| `name_history` | UI-ready timeline (derived from `event_history`) |
| `derivation_reason` | How canonical date was chosen (`current_name_since`, etc.) |

## Batch JSON (`history` per street)

Optional batch root: `evidence_schema_version: 1`

```json
{
  "evidence_schema_version": 1,
  "gazette_notice_label": "Gazette No. 184",
  "publication_date": "1909-03-19",
  "gazette_url_en": "/egazette/en/1909-gn184.pdf",
  "pdf_en": "data/crowdsubmissions/batch-inbox/1909-gn184-taku/1909-gn184.pdf",
  "streets": [
    {
      "street_code": "12326",
      "chinese_name": "大沽街",
      "english_name": "TAKU STREET",
      "history": [
        {
          "publication_date": "1872-01-01",
          "change_kind": "declare",
          "street_name_zh": "差館街",
          "street_name_en": "Station Street",
          "evidence_kind": "unknown",
          "submitter_remarks": "Original name; gazette proof not yet on file."
        },
        {
          "publication_date": "1909-03-19",
          "change_kind": "rename",
          "previous_street_name_zh": "差館街",
          "previous_street_name_en": "Station Street",
          "street_name_zh": "大沽街",
          "street_name_en": "Taku Street",
          "evidence_kind": "gazette_primary"
        }
      ]
    }
  ]
}
```

**Inferred example** (Previous G.N. in G.N.6060):

```json
{
  "publication_date": "1960-11-11",
  "change_kind": "declare",
  "evidence_kind": "gazette_inferred",
  "gazette_notice_label": "G.N.1713",
  "derived_from": [
    {
      "kind": "gazette_citation",
      "notice_label": "G.N.6060",
      "publication_date": "2018-08-10",
      "government_notice_url_en": "/egazette/en/2018-gn6060.pdf",
      "cited_notice_label": "G.N.1713",
      "cited_publication_date": "1960-11-11"
    }
  ]
}
```

Apply with: `node scripts/apply-crowd-batch.mjs data/crowdsubmissions/batches/1909-gn184-taku-street.json`

After batch changes, regenerate master data: `node scripts/merge-crowd-naming.mjs` and `node scripts/report-pending-naming-years.mjs`.
