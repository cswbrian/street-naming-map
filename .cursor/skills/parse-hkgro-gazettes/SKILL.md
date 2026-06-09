---
name: parse-hkgro-gazettes
description: Parse HKGRO colonial gazette PDF scans (sunzi.lib.hku.hk, TIF2PDF), extract Colonial Secretary street notices, build history[] batches, and apply to street-events.json. Optional link_street_code when geojson match is confirmed. Use for 617826.pdf-style scans — not modern egn/cgn PDFs.
---

# Parse HKGRO gazettes → street events

Process **HKGRO-only** historical gazette scans for **street-naming-map**.

**Not for modern e-Gazette** (`egn…` / `cgn…` PDFs) — use [apply-egazette-naming](../apply-egazette-naming/SKILL.md) for those.

**Not for researcher workflows** (earliest non-naming cite, map-based rename chain, demoted PDF-pending row) — use [research-street-history](../research-street-history/SKILL.md). If bulk parse left a street as `no_match` in `apply-report.json`, hand-link with that skill instead of re-parsing the whole G.N.

**Event model:** [event-model.md](../event-model.md) (reference) — classify each notice into `history[]` rows. Skill routing: [README.md](../README.md).

**Architecture:** Parsers record gazette facts in `street-events.json` (no `street_code`). `--match` suggests `link_street_code` for linkers; map display requires `street-centreline-map.json`.

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
3. **Classify notice → build `history[]` per street** (declare, rename, or multi-event chain).
4. **Optional match** each street to geojson (`--match`) → set `link_street_code` when confident ([centreline-linker](../centreline-linker/SKILL.md)).
5. **Build one batch JSON per notice** (`gazette_only: true`, all streets from same G.N.).
6. **Apply** + **self-host** PDF → upserts `data/master/street-events.json` (+ centreline map if `link_street_code` set).
7. **Report** table: gazette name → event types → linked? → map status.

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
- Previous name (if “instead of” or former-name column present)
- Description (use for **matching/disambiguation only** — do not store in batch unless names mismatch)
- Shared: notice `No. N`, gazette header date
- Default `change_kind`: `declare` unless rename wording detected (see [gazette-patterns.md](gazette-patterns.md))

## Step 2 — Optional GeoJSON match (for linking)

**Always apply gazette facts** (`gazette_only: true`). Matching geojson is for **`link_street_code` only** — not a gate for recording the notice.

For each extracted pair (EN + ZH):

```bash
rg "糖街|SUGAR STREET" public/data/master/pending-naming-years.csv
```

| Match result | Action |
|--------------|--------|
| EN + ZH exact, code in GeoJSON | Apply events; set `link_street_code` — **no** `submitter_remarks` |
| EN exact, ZH differs slightly | Apply events; `submitter_remarks` notes mismatch only; link only if confident |
| EN matches, not in GeoJSON | **Apply events** without `link_street_code`; flag for linker queue |
| No match | **Apply events** with names from gazette; flag for linker / user |
| Multiple EN matches | Use DESCRIPTION to pick one for `link_street_code`; else defer linking |

Never set `street_code` on events. Defer map linkage → [centreline-linker](../centreline-linker/SKILL.md).

## Step 2b — Classify events (`history[]`)

For each matched street, build one or more `history[]` rows per [event-model.md](../event-model.md):

| Notice wording | `change_kind` | `event_role` | UI (zh) |
|----------------|---------------|--------------|---------|
| “to be known for the future” (first on file) | `declare` | `current_name` | 命名 |
| “continuation of …” (name already on file) | `extend` | `current_name` | 延伸 |
| “instead of” / lists former name | `rename` | `current_name` (or `former_name` if after-name ≠ geojson) | 命名 or 易名 / 舊稱 |
| Earlier name from user/research, no gazette | `declare` | `former_name` | 舊稱 |
| Name abolished | `delete` | `name_removed` | 名稱撤銷 |

**Mandatory:** every street entry must have a non-empty `history[]` — never apply street-only shorthand without events.

## Step 3 — Batch JSON

**One notice → one batch**, even with 15 streets. Per-street `history[]` patterns → [event-model.md](../event-model.md) (scenarios 1–7). Notice walkthroughs → [examples.md](examples.md).

### HKGRO batch shell (fill `streets[]` from event-model)

```json
{
  "batch_id": "1931-gn300-shaukiwan-streets",
  "source": "hkgro",
  "gazette_only": true,
  "gazette_notice_label": "Government Notification No. 300",
  "publication_date": "1931-05-15",
  "gazette_url_en": "/egazette/en/1931-gn300.pdf",
  "pdf_en": "/absolute/path/to/618645.pdf",
  "streets": []
}
```

Each `streets[]` item: `english_name`, `chinese_name`, optional `link_street_code`, non-empty `history[]`. Real files: `data/crowdsubmissions/batches/1909-gn184-taku-street.json`, `1924-gn119-prince-edward-road.json`.

Rules:
- Set **`"source": "hkgro"`** on every HKGRO batch (pipeline routing only; UI **來源** / **Source** shows gazette evidence kind, not HKGRO vs community).
- **Omit `submitter_remarks`** when gazette English and Chinese both match the database exactly.
- **Include `submitter_remarks` only** when gazette EN or ZH differs from the matched record (e.g. `Gazette ZH 連合道; database 連道.`).
- **Never** store gazette DESCRIPTION text or lot references in remarks.
- **Never** auto-fill batch-level `remarks` or generic “Batch G.N. … community submission” text — omit `submitter_remarks` unless gazette EN/ZH ≠ database.
- **Never** store `sunzi.lib.hku.hk` as primary URL — only `/egazette/en/…`.
- All streets in one notice share the same date, G.N., and hosted PDF (unless `history[]` includes older dates).
- Save to `data/crowdsubmissions/batches/{year}-gn{no}-{slug}.json`.

## Step 4 — Apply and host

```bash
node scripts/apply-crowd-batch.mjs data/crowdsubmissions/batches/{batch}.json
```

This upserts all `history[]` events into `data/master/street-events.json`, publishes PDFs, and runs `rebuild:naming` + `report:pending-years`.

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

| # | Gazette EN/ZH | Code | GeoJSON | Event type | Status |
|---|---------------|------|---------|------------|--------|
| 1 | Sugar Street / 糖街 | 12167 | ✓ | 命名 | applied |
| 2 | Taku Street / 大沽街 | 12326 | ✓ | 命名 + 舊稱 (2 events) | applied |
| … | … | … | … | … | … |

Event type column: 命名, 易名, 舊稱, 落成, 名稱撤銷 (see [event-model.md](../event-model.md)).

Note: unmatched names, Chinese variants, already-dated streets skipped.

**Do not commit** unless the user asks.

## Multi-PDF checklist

```
HKGRO batch:
- [ ] PDF 1: all pages rendered → all table rows extracted
- [ ] PDF 1: history[] classified per street (declare/rename/multi-event)
- [ ] PDF 1: batch applied + PDF hosted as {year}-gn{no}.pdf
- [ ] Events in street-events.json; timelines page shows new rows
- [ ] If link_street_code set: centreline map + map chip 舊稱 + 來源 verified
- [ ] Summary table delivered
```

## Pitfalls

| Issue | Fix |
|-------|-----|
| Only parsed page 1 | Re-render `--page 1`, `2`, … |
| Applied street not on map | Add `link_street_code` + centreline map link; verify code in GeoJSON |
| Street shorthand without `history[]` | Wrap each street in `history[]` — see [event-model.md](../event-model.md) |
| HKGRO URL in data | Replace with `/egazette/en/{year}-gn{no}.pdf` |
| Wrong hosted filename | Rename inbox PDF to `{year}-gn{no}.pdf` before publish |
| Rename notice recorded as declare only | Set `change_kind: rename` + `previous_street_name_*` |
