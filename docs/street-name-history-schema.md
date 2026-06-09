# Street name history schema

Events describe how a street’s name changed over time. Multiple events linked to the same centreline (`street-centreline-map.json`) form an ordered timeline.

**Do not add `street_code` to new events** — linkage lives in [street-centreline-map.json](../data/master/street-centreline-map.json). See [street-events-gazette-only.md](street-events-gazette-only.md).

## Product model (map focus)

Identity on the map comes from [`public/data/hk-streets.geojson`](public/data/hk-streets.geojson): `STREETCODE` + current `ENGLISHSTREETNAME` / `CHINESESTREETNAME`.

| User question | `event_role` | On map? | In 舊稱 history? |
|---------------|--------------|---------|------------------|
| When built / opened | `built` | **Yes** (`map_year`, earliest built) | **Yes** when recorded |
| When was **current name** named? | `current_name` + `declare` / `rename` | **Yes** (`map_year` fallback via `naming_year`) | `extend` rows appear as **延伸**; do not set canonical date when a `declare` exists |
| Same name, new segment gazetted | `current_name` + `extend` | No (unless no `declare` on file) | **Yes** |
| Earlier names | `former_name` | No | **Yes** |
| Name abolished | `name_removed` | No | Optional |

**Map year vs naming date:** Centerline labels, timeline slider, and road fade use **`map_year`** (built-first, else canonical naming year). The road chip 舊稱 timeline and verified/pending split use **`naming_year`** / `canonical_naming_date` (current-name events only).

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
| `street_code` | string | **Deprecated on events** — do not set on new rows. Use `street-centreline-map.json` to group events by `STREETCODE`. Legacy rows may still appear in old `event_id` slugs only. |
| `publication_date` | ISO date | When the name took effect (use `YYYY-01-01` if only a year is known) |
| `change_kind` | `declare` \| `rename` \| `delete` \| `extend` | Kind of change (`extend` = new segment gazetted under existing name; excluded from canonical naming unless no `declare` exists) |
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
| `proof_pdf_url` | URL | Non-hosted attachment (legacy; prefer `supplementary_evidence`) |
| `supplementary_evidence` | array | Extra documents supporting specific fields on this event (see below) |

### Evidence kinds

| `evidence_kind` | Meaning |
|-----------------|---------|
| `gazette_primary` | This event’s naming date comes from the actual gazette notice (PDF/URL on this event) |
| `gazette_inferred` | Date/G.N. from another notice (e.g. “Previous G.N.” in a later notice); use `derived_from` |
| `legal_other` | Ordinance, court, plan-only, other legal document |
| `research` | Academic / heritage-centre compiled research (not gazette, not press) |
| `news` | Newspaper, magazine, official press |
| `hearsay` | Oral tradition, forum, unverified secondary |
| `unknown` | Date present; type not yet classified |
| `other` | Rare cases; set `evidence_kind_note` |
| `gazette_mention` | Earliest street name in a gazette notice that is **not** a naming declaration (UI: 憲報提及) |
| `legal_mention` | Earliest mention in a legal document (UI: 法律文件提及) |
| `news_mention` | Earliest mention in news (UI: 新聞提及) |
| `research_mention` | Earliest mention in research (UI: 研究提及) |

**Strength order** (badges / sort only):  
`gazette_primary` > `gazette_inferred` > `gazette_mention` > `legal_other` > `legal_mention` > `research` > `research_mention` > `news` > `news_mention` > `hearsay` > `unknown` > `other`

**Attestation map year:** `map_display_date` uses earliest `*_mention` row (after `built`, before canonical naming). Set `is_declaration_event: false` on attestation rows.

### `supplementary_evidence` (per event, schema v2)

Use when **one event** is supported by multiple documents (e.g. gazette for date + research PDF for Chinese only).

```json
{
  "evidence_kind": "gazette_primary",
  "government_notice_url_en": "/egazette/en/1919-gn450.pdf",
  "supplementary_evidence": [
    {
      "evidence_kind": "research",
      "publisher": "Hong Kong Resource Centre for Heritage",
      "publisher_zh": "香港文化古蹟資源中心",
      "document_label": "fish_o",
      "document_url": "https://cache.org.hk/download/fish_o_10Apr.pdf",
      "supports": ["street_name_zh"],
      "note": "Former name Chinese; gazette has EN only."
    }
  ]
}
```

**`supports` values:** `publication_date`, `street_name_en`, `street_name_zh`, `previous_street_name_en`, `previous_street_name_zh`.

Event-level `evidence_kind` = primary source for the event date; supplementary rows cite what each attachment proves.

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

## Derived aggregates (computed at build time)

Per-street rollups (`canonical_naming_date`, `name_history`, etc.) are computed in memory by `aggregateByStreet()` during `npm run rebuild:naming` and `npm run report:pending-years`. They are not persisted to disk.

| Field | Meaning |
|-------|---------|
| `canonical_naming_date` | **Naming** date: current name since if renamed, else earliest current-name declaration |
| `canonical_naming_year` | Year slice of `canonical_naming_date` → GeoJSON `naming_year` |
| `map_display_date` | **Map** date: earliest `built`, else `*_mention`, else earliest `gazette_primary`/`gazette_inferred` row, else `canonical_naming_date` |
| `map_display_year` | Year slice of `map_display_date` → GeoJSON `map_year` |
| `map_year_source` | `'built'`, `'attestation'`, `'gazette_document'`, or `'naming'` |
| `map_derivation_reason` | `built_earliest`, `attestation_earliest`, `gazette_document_earliest`, `naming_canonical`, or `no_date` |
| `earliest_gazette_document_date` | Earliest gazette-backed event (incl. `former_name` naming) |
| `earliest_attestation_date` | Earliest `*_mention` event date (if any) |
| `earliest_attestation_year` | Year slice of `earliest_attestation_date` |
| `canonical_evidence_kind` | `evidence_kind` of the event that supplies `canonical_naming_date` |
| `canonical_evidence_event_id` | `event_id` of that event (QA) |
| `canonical_event_role` | Usually `current_name` |
| `current_name_since_date` | Latest rename to today’s name |
| `first_known_naming_date` | Earliest event in timeline |
| `name_history` | UI-ready timeline (derived from `event_history`) |
| `derivation_reason` | How canonical naming date was chosen (`current_name_since`, etc.) |

GeoJSON segment properties (from `enrichGeojson()`): `naming_year`/`naming_date` = canonical naming only; `map_year`/`map_date`/`map_year_source` = built-first display for map UI.

## Batch JSON (`history` per street)

Optional batch root: `evidence_schema_version: 1`

```json
{
  "evidence_schema_version": 1,
  "gazette_notice_label": "Gazette No. 184",
  "publication_date": "1909-03-19",
  "gazette_url_en": "/egazette/en/1909-gn184.pdf",
  "pdf_en": "data/crowdsubmissions/batch-inbox/1909-gn184-taku/1909-gn184.pdf",
  "gazette_only": true,
  "streets": [
    {
      "link_street_code": "12326",
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

After batch changes, regenerate map data: `npm run rebuild:naming` and `npm run report:pending-years`.
