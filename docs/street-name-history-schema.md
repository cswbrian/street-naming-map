# Street name history schema

Events describe how a street’s name changed over time. Multiple events per `street_code` form an ordered timeline.

## Event fields (crowd, LandsD, eGazette)

| Field | Type | Description |
|-------|------|-------------|
| `street_code` | string | LandsD street code; **required** to group rename chains |
| `publication_date` | ISO date | When the name took effect (use `YYYY-01-01` if only a year is known) |
| `change_kind` | `declare` \| `rename` \| `delete` | Kind of change |
| `street_name_en` / `street_name_zh` | string | Name **after** this event |
| `previous_street_name_en` / `previous_street_name_zh` | string | Name **before** (required for `rename`) |
| `evidence_level` | `gazette` \| `historical` | `gazette` = linked proof; `historical` = no gazette on file yet |
| `is_declaration_event` | boolean | Legacy flag; renames should be `false` |
| `government_notice_url_en` | URL | Gazette scan (e.g. HKGRO PDF) |
| `government_notice_label_en` | string | e.g. `Gazette No. 184` |

## Aggregate outputs (`street-aggregates-combined.json`)

| Field | Meaning |
|-------|---------|
| `canonical_naming_date` | Date shown on map: **current name since** if renamed, else earliest declaration |
| `current_name_since_date` | Latest rename to today’s name |
| `first_known_naming_date` | Earliest event in timeline |
| `name_history` | UI-ready timeline (derived from `event_history`) |

## Batch JSON (`history` per street)

```json
{
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
          "evidence_level": "historical",
          "submitter_remarks": "Original name; gazette proof not yet on file."
        },
        {
          "publication_date": "1909-03-19",
          "change_kind": "rename",
          "previous_street_name_zh": "差館街",
          "previous_street_name_en": "Station Street",
          "street_name_zh": "大沽街",
          "street_name_en": "Taku Street",
          "evidence_level": "gazette"
        }
      ]
    }
  ]
}
```

Apply with: `node scripts/apply-crowd-batch.mjs data/crowdsubmissions/batches/1909-gn184-taku-street.json`
