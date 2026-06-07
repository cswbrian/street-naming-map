---
name: parse-hkgro-gazettes
description: Parse HKGRO historical Hong Kong gazette PDF scans (sunzi.lib.hku.hk, TIF2PDF), extract single- or multi-street Colonial Secretary notices, verify names against hk-streets.geojson, and apply crowd naming batches. Use when the user provides HKGRO gazette PDFs, filenames like 617826.pdf or 618645.pdf, or asks to parse/map historical gazette notices to street records.
---

# Parse HKGRO gazettes → map street records

Process **HKGRO-only** historical gazette scans for **street-naming-map**.

**Not for modern e-Gazette** (`egn…` / `cgn…` PDFs) — use [apply-crowd-naming](../apply-crowd-naming/SKILL.md) for those.

## HKGRO scope

| In scope | Out of scope |
|----------|--------------|
| `sunzi.lib.hku.hk/hkgro/view/g…/*.pdf` | `egazette.gld.gov.hk` PDFs |
| Downloads named `617826.pdf`, `618645.pdf` | `egn202630172370.pdf` |
| `TIF2PDF` image scans (pre-1997) | Lands Dept CSV-linked modern notices |
| Colonial Secretary street/road tables | Non-street government notices |

## Workflow

1. **Identify** HKGRO PDF (filename, URL, or TIF2PDF producer).
2. **Parse** all pages — notice may list **multiple streets** across 2+ pages.
3. **Match each street** to `pending-naming-years` **and confirm in `hk-streets.geojson`**.
4. **Build one batch JSON per notice** (all streets from same G.N. in one batch).
5. **Apply** + **self-host** PDF at `/egazette/en/{year}-gn{no}.pdf`.
6. **Report** match table: gazette name → code → in GeoJSON? → applied? (source **HKGRO**)

For notice layout patterns, see [gazette-patterns.md](gazette-patterns.md).  
For walkthroughs, see [examples.md](examples.md).

## Step 1 — Render and read (always multi-page aware)

```bash
python3 scripts/render-gazette-pdf.py "/path/to/618645.pdf"
# If pages=2+, render each page:
python3 scripts/render-gazette-pdf.py "/path/to/618645.pdf" --page 1 --out /tmp/p2.png
```

HKGRO scans have **empty text** — read rendered PNGs visually.

### Gazette patterns to recognize

**Pattern A — single street:** one table row under Colonial Secretary `No. N`.

**Pattern B — multiple streets:** intro says “roads and streets **are**” (plural); table continues on next page. Extract **every row** before matching.

```
DESCRIPTION  |  FUTURE NAME  |  CHINESE VERSION
```

Extract per row:
- English name (strip trailing `.`)
- Chinese name
- Description (use for **matching/disambiguation only** — do not store in batch unless names mismatch)
- Shared: notice `No. N`, gazette header date, `change_kind: declare`

## Step 2 — Match every street to GeoJSON

**Do not apply a name that is not on the map.**

For each extracted pair (EN + ZH):

```bash
rg "糖街|SUGAR STREET" public/data/master/pending-naming-years.csv
```

Then verify geometry:

```python
# street_code from CSV must appear in hk-streets.geojson
```

| Match result | Action |
|--------------|--------|
| EN + ZH exact, code in GeoJSON | Apply — **no** `submitter_remarks` |
| EN exact, ZH differs slightly (e.g. 連合道 vs 連道) | Apply; `submitter_remarks` notes mismatch only (e.g. `Gazette ZH 連合道; database 連道.`) |
| EN matches, not in GeoJSON | **Skip** — report to user |
| No match | **Skip** — report to user |
| Multiple EN matches | Use DESCRIPTION (lots, intersecting roads) to pick one; else ask user |

Prefer `street_code` over name-only matching once confirmed.

## Step 3 — Batch JSON

**One notice → one batch**, even with 15 streets:

```json
{
  "batch_id": "1931-gn300-shaukiwan-streets",
  "source": "hkgro",
  "gazette_notice_label": "Government Notification No. 300",
  "publication_date": "1931-05-15",
  "gazette_url_en": "/egazette/en/1931-gn300.pdf",
  "pdf_en": "/absolute/path/to/618645.pdf",
  "streets": [
    {
      "street_code": "12167",
      "english_name": "SUGAR STREET",
      "chinese_name": "糖街",
      "history": [{
        "publication_date": "1931-05-15",
        "change_kind": "declare",
        "street_name_en": "Sugar Street",
        "street_name_zh": "糖街",
        "gazette_notice_label": "Government Notification No. 300",
        "proof_pdf_url": "/egazette/en/1931-gn300.pdf",
        "evidence_kind": "gazette_primary",
        "event_role": "current_name"
      }]
    }
  ]
}
```

Rules:
- Set **`"source": "hkgro"`** on every HKGRO batch (pipeline routing only; UI **來源** / **Source** shows gazette evidence kind, not HKGRO vs community).
- **Omit `submitter_remarks`** when gazette English and Chinese both match the database exactly.
- **Include `submitter_remarks` only** when gazette EN or ZH differs from the matched record (e.g. `Gazette ZH 連合道; database 連道.`).
- **Never** store gazette DESCRIPTION text or lot references in remarks.
- **Never** auto-fill batch-level `remarks` or generic “Batch G.N. … community submission” text — omit `submitter_remarks` unless gazette EN/ZH ≠ database.
- **Never** store `sunzi.lib.hku.hk` as primary URL — only `/egazette/en/…`.
- All streets in one notice share the same date, G.N., and hosted PDF.
- Save to `data/crowdsubmissions/batches/{year}-gn{no}-{slug}.json`.

## Step 4 — Apply and host

```bash
node scripts/apply-crowd-batch.mjs data/crowdsubmissions/batches/{batch}.json
```

HKGRO filenames (`618645.pdf`) are not recognized by publish — rename:

```bash
cp data/crowdsubmissions/batch-inbox/{batch_id}/618645.pdf \
   data/crowdsubmissions/batch-inbox/{batch_id}/1931-gn300.pdf
node scripts/publish-crowd-gazette-pdfs.mjs --update-data
cp public/egazette/en/1931-gn300.pdf public/egazette/zh/1931-gn300.pdf
npm run rebuild:naming
```

## Step 5 — Report

Multi-street inspection table:

| # | Gazette EN/ZH | Code | GeoJSON | Status |
|---|---------------|------|---------|--------|
| 1 | Sugar Street / 糖街 | 12167 | ✓ | applied |
| … | … | … | … | … |

Note: unmatched names, Chinese variants, already-dated streets skipped.

**Do not commit** unless the user asks.

## Multi-PDF checklist

```
HKGRO batch:
- [ ] PDF 1: all pages rendered → all table rows extracted
- [ ] PDF 1: each row matched + GeoJSON verified
- [ ] PDF 1: batch applied + PDF hosted as {year}-gn{no}.pdf
- [ ] Summary table delivered
```

## Pitfalls

| Issue | Fix |
|-------|-----|
| Only parsed page 1 | Re-render `--page 1`, `2`, … |
| Applied street not on map | Always verify `street_code` in GeoJSON first |
| HKGRO URL in data | Replace with `/egazette/en/{year}-gn{no}.pdf` |
| Wrong hosted filename | Rename inbox PDF to `{year}-gn{no}.pdf` before publish |
