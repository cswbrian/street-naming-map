---
name: parse-gazette-street-events
description: Parse street-naming gazette notices (HKGRO colonial scans and image PDFs) into history[] batches with gazette-only text, optional gazette_location, and apply to street-events.json. Modern egn/cgn text PDFs → apply-egazette-naming. Formerly parse-hkgro-gazettes.
---

# Parse gazette street events (HKGRO / colonial scans)

Process **HKGRO and colonial-era image scans** for **street-naming-map**.

**Not for modern e-Gazette text PDFs** (`egn…` / `cgn…`) — use [apply-egazette-naming](../apply-egazette-naming/SKILL.md).

**Not for researcher workflows** (earliest non-naming cite, map-based rename chain) — use [research-street-history](../research-street-history/SKILL.md).

**Shared parse rules (mandatory):** [gazette-parse-principles.md](../gazette-parse-principles.md) — gazette-only text, mismatch reporting, no online inference.

**Event model:** [event-model.md](../event-model.md) · **Patterns:** [gazette-patterns.md](gazette-patterns.md) · **Walkthroughs:** [examples.md](examples.md)

**Architecture:** Parsers record gazette facts in `street-events.json` (no `street_code`). `--match` suggests `link_street_code` for linkers; map display requires `street-centreline-map.json`.

## Gazette-only parsing (read first)

Before extracting any row, read [gazette-parse-principles.md](../gazette-parse-principles.md) in full.

Summary:

1. **Names, dates, descriptions** on `history[]` come **only** from the notice PDF (rendered pages or text layer).
2. **GeoJSON / pending CSV / other gazettes on file** — use to pick `link_street_code` and **flag mismatches** in `submitter_remarks`; never fill missing ZH or “correct” spellings from map data.
3. **No hk-place, web search, or LLM guesses** for street names or Chinese characters.
4. Store DESCRIPTION / 詳情 prose in **`gazette_location.description_raw_*`** (schema v2), not in `submitter_remarks`, except the standard undated former-name line or full present-name sentence on Pattern C rows.
5. If OCR is uncertain, say so in `submitter_remarks` (e.g. `Gazette scan ambiguous: …`) and leave the character as read — do not substitute from external sources.

## HKGRO scope

| In scope | Out of scope |
|----------|--------------|
| `sunzi.lib.hku.hk/hkgro/view/g…/*.pdf` | `egazette.gld.gov.hk` `egn`/`cgn` PDFs |
| Downloads named `617826.pdf`, `618645.pdf`, user scan folders | Modern Lands Dept text-layer notices |
| `TIF2PDF` image scans (pre-1997) | Bulk `npm run merge:egazette` pipeline |
| Colonial Secretary / Urban Council / NT Admin naming tables | Non-street government notices |

## Workflow

1. **Identify** HKGRO PDF (filename, URL, or TIF2PDF producer).
2. **Parse all pages** — notice may list **multiple streets** across 2+ pages or multiple scan files (one batch per G.N.).
3. **Transcribe from gazette only** — EN/ZH names, DESCRIPTION → `gazette_location`, classify `history[]`.
4. **Optional match** to geojson (`--match` or manual) → `link_street_code` when confident; **note mismatches** per principles doc.
5. **Build one batch JSON per notice** (`gazette_only: true`, `source: hkgro`).
6. **Apply** + **self-host** PDF → `street-events.json` (+ centreline map if linked).
7. **Report** table including **Gazette vs geojson** and **OCR confidence** columns.

## Step 1 — Render and read (always multi-page aware)

```bash
python3 scripts/render-gazette-pdf.py "/path/to/618645.pdf"
python3 scripts/render-gazette-pdf.py "/path/to/618645.pdf" --page 1 --out /tmp/p2.png
```

HKGRO scans have **empty text** — read rendered PNGs visually. Transcribe **exactly what the scan shows**; flag illegible glyphs in `submitter_remarks`.

### Extract per table row

- English name (strip trailing `.`)
- Chinese name (null if not on this notice’s pages)
- Previous / present name (rename tables)
- **Description** → `gazette_location.description_raw_en` / `description_raw_zh`; parse junctions, length, drawing ref into `gazette_location.parsed`
- Shared: notice `No. N`, gazette header date

See [gazette-patterns.md](gazette-patterns.md) for Pattern A–R layouts (3-col declare, 5-col segment split, rename lists, delete, etc.).

## Step 2 — Optional GeoJSON match (linking only)

**Always apply gazette facts** (`gazette_only: true`). Geojson is for **`link_street_code` and mismatch notes** — not a gate for recording the notice.

```bash
rg "糖街|SUGAR STREET" public/data/master/pending-naming-years.csv
```

| Match result | Action |
|--------------|--------|
| EN + ZH exact, code in GeoJSON | Set `link_street_code`; **no** `submitter_remarks` |
| EN exact, ZH differs | Apply gazette names; `submitter_remarks`: `Gazette ZH …; geojson ….` |
| EN matches, not in GeoJSON | Apply without `link_street_code`; linker queue |
| No match | Apply with **gazette** names only; linker queue |
| Multiple EN matches | Use **gazette** DESCRIPTION to pick one; else defer linking |

Never set `street_code` on events. Never copy geojson ZH onto a row when the gazette omitted Chinese.

## Step 2b — Classify events (`history[]`)

Per [event-model.md](../event-model.md). Rename notices → **two rows** (undated `former_name` + dated `rename`) when former name has no earlier naming G.N. on file — see [examples.md](examples.md) and `1936-gn918-hill-road.json`.

**Chinese:** `street_name_zh: null` when the scan has no legible Chinese for that name ([gazette-parse-principles.md](../gazette-parse-principles.md)).

## Step 3 — Batch JSON

**One notice → one batch.** Include `gazette_location` on each `history[]` row when DESCRIPTION exists (`evidence_schema_version: 2`).

```json
{
  "batch_id": "1931-gn300-shaukiwan-streets",
  "source": "hkgro",
  "gazette_only": true,
  "evidence_schema_version": 2,
  "gazette_notice_label": "Government Notification No. 300",
  "publication_date": "1931-05-15",
  "gazette_url_en": "/egazette/en/1931-gn300.pdf",
  "pdf_en": "/absolute/path/to/618645.pdf",
  "streets": [{
    "english_name": "Sugar Street",
    "chinese_name": "糖街",
    "link_street_code": "12167",
    "history": [{
      "publication_date": "1931-05-15",
      "change_kind": "declare",
      "event_role": "current_name",
      "street_name_en": "Sugar Street",
      "street_name_zh": "糖街",
      "evidence_kind": "gazette_primary",
      "gazette_location": {
        "description_raw_en": "Street off Yee Wo Street …",
        "parsed": { "plan_refs": [{ "label": "KH 2388/1", "color": "yellow" }] }
      }
    }]
  }]
}
```

Rules:

- Set **`"source": "hkgro"`** on every HKGRO batch.
- **`submitter_remarks`:** omit when gazette EN+ZH match geojson; include for **mismatches**, **OCR uncertainty**, or **standard former-name** lines only.
- **Never** store DESCRIPTION in `submitter_remarks` when `gazette_location.description_raw_*` is set.
- **Never** store `sunzi.lib.hku.hk` as primary URL — only `/egazette/en/…`.
- Save to `data/crowdsubmissions/batches/{year}-gn{no}-{slug}.json`.

## Step 4 — Apply and host

```bash
node scripts/apply-crowd-batch.mjs data/crowdsubmissions/batches/{batch}.json
```

Rename HKGRO inbox PDF to `{year}-gn{no}.pdf` before publish if needed ([gazette-files](../gazette-files/SKILL.md)).

## Step 5 — Report

| # | Gazette EN/ZH | Code | GeoJSON | Mismatch / OCR | Event type | Status |
|---|---------------|------|---------|----------------|------------|--------|
| 1 | Sugar Street / 糖街 | 12167 | ✓ | match | 命名 | applied |
| 2 | … | — | ✗ | ZH mismatch | 命名 | applied, linker queue |

**Do not commit** unless the user asks.

## Pitfalls

| Issue | Fix |
|-------|-----|
| Filled ZH from geojson / parsed-notices | Clear; use null + linker or later `supplementary_evidence` |
| Description only in remarks | Move to `gazette_location` |
| Only parsed page 1 | Re-render all pages / scan files in chain |
| Rename as single row | Add undated `former_name` + dated `rename` |
| Used web/hk-place to fix OCR | Revert to gazette reading; note uncertainty in remarks |
