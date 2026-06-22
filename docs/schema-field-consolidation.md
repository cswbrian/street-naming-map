# Schema field consolidation (v2)

Phased migration plan for overlapping event fields after `gazette_location` (schema v2). **Backward compatible:** v1 events without `gazette_location` remain valid; build and linker unchanged until UI consumes descriptions.

Related: [`street-name-history-schema.md`](street-name-history-schema.md), [`gazette-parse-principles.md`](../skills/gazette-parse-principles.md).

## Version bump

| File | Version | Change |
|------|---------|--------|
| `data/master/street-events.json` root | `schema_version: 2` | Optional `gazette_location` on events (migrate on next master edit) |
| Batch JSON | `evidence_schema_version: 2` | `history[].gazette_location` supported |

Existing batches at `evidence_schema_version: 1` continue to apply unchanged.

## Remove from new rows (phased)

| Field | Action | Rationale |
|-------|--------|-----------|
| `street_code` | Already removed | Per [street-events-gazette-only.md](street-events-gazette-only.md) |
| `proof_pdf_url`, `evidence_level`, `year_bucket` | Already removed | Derive from `publication_date` |
| `pdf_path_en`, `pdf_path_zh` | **Stop writing on crowd/hkgro rows** | Duplicates `government_notice_url_*`; legacy `egazette_pdf` pipeline rows only (~165) |

## Merge / dual-write (do not delete yet)

| From | Into | Rule |
|------|------|------|
| DESCRIPTION prose in `submitter_remarks` | `gazette_location.description_raw_*` | Migration script for G.N.59-style rows; remarks revert to QA boilerplate only |
| `related_gazette_plan_labels_*` | `gazette_location.parsed.plan_refs[].label` | **Dual-write** during transition via `finalizeCrowdEvent` / `finalizeEgazetteEvent`; HKGRO codes (`HH 3197`) and LandsD codes (`HKRM44`) share shape |
| `district_raw_*` when only in description | `gazette_location.parsed.district_*` | Keep `district_raw_*` when printed in notice header; parsed when extracted from intro |

## Keep unchanged (core event identity)

`event_id`, `publication_date`, `change_kind`, `event_role`, `street_name_*`, `previous_street_name_*`, `evidence_kind`, `is_declaration_event`, `government_notice_url_*`, `government_notice_label_*`, `notice_stem`, `derived_from`, `supplementary_evidence`, `source`, `submission_id`, `reviewed_at`, `crowd_origin`

## Keep but clarify roles

| Field | Role after v2 |
|-------|-----------------|
| `submitter_remarks` | **Human QA only**: EN/ZH mismatch, former-name boilerplate, researcher notes — **never** bulk DESCRIPTION OCR |
| `notice_type_raw_*` | Verbatim notice title from gazette header |
| `notice_type_normalized` | Parser class; new values: `gazetteer_harmonization`, `chinese_correction`, `replace_description`, `intention_to_change` |
| `notice_key` | **`egazette_pdf` pipeline only** — not on hkgro/crowd rows |
| `related_gazette_plan_urls_*` | Hosted plan PDFs; populate from `plan_refs[].url` when available |

## Do not remove

`is_declaration_event` — still drives canonical naming vs mention rows in `aggregateByStreet()`.

## Implementation status

| Item | Status |
|------|--------|
| `finalizeCrowdEvent` passes `gazette_location` | Done |
| Plan label dual-write from `plan_refs` | Done |
| `extract-gazette-location.mjs` draft script | Done |
| Modern parser: replace_description, ZH-only, intention | Done |
| Bulk migrate G.N.59 remarks → `gazette_location` | Not started |
| Strip `pdf_path_*` from crowd/hkgro master rows | Not started |
| Bump `street-events.json` `schema_version` to 2 | On next master data edit |

## Migration checklist (future)

1. Script: move DESCRIPTION-length `submitter_remarks` → `gazette_location.description_raw_en`.
2. Script: populate `plan_refs` from existing `related_gazette_plan_labels_*` on master events.
3. Set `schema_version: 2` on `street-events.json` when first v2 events land.
4. Stop writing `pdf_path_*` on new crowd/hkgro apply paths (already omitted by `finalizeCrowdEvent`).
