---
name: apply-crowd-naming
description: Apply community-verified Hong Kong street naming dates from gazette proof (PDF, G.N., date, street names) via /apply-crowd-naming. Batch `source` must be crowdsubmitted (not hkgro). Use parse-hkgro-gazettes for sunzi/HKGRO scans only.
---

# Apply crowd naming submissions

Process community-verified street naming batches for **street-naming-map**.

## Pipeline routing (batch `source` field)

When the user invokes **`/apply-crowd-naming`**, set `"source": "crowdsubmitted"` on the batch JSON (or omit — `apply-crowd-batch.mjs` defaults to crowd).

- **Never** set `"source": "hkgro"` in this skill (including colonial scans in inbox).
- Historical sunzi/HKGRO downloads → [parse-hkgro-gazettes](../parse-hkgro-gazettes/SKILL.md).

The app **does not** show crowd vs HKGRO badges. After apply, users see **來源** / **Source** = gazette evidence (`gazette_primary` / `gazette_inferred`) with a PDF link — not `naming_source`.

## When the user sends data

Typical input (any of):

- **PDF file(s)** attached or path given (preferred when user drops a scan)
- Gazette number (e.g. `8104` or `G.N.8104`)
- Publication date (e.g. `17/12/2004`)
- List of Chinese and/or English street names
- Optional PDF paths (`cgn…pdf`, `egn…pdf`)

Goal: set naming date + **來源** `gazette_primary` (hosted PDF), list under **最近核實**, update map year coloring.

## Gazette proof backfill (existing records)

When a street **already has** a naming year or a **`gazette_inferred`** / `unknown` crowd event (e.g. first Previous G.N. parsed from a later G.N.4509 notice) but **no hosted gazette PDF** for the cited G.N. (`government_notice_url_en` / `proof_pdf_url` null):

1. **Apply the primary gazette** for that naming date as a normal crowd batch (`pdf_en`, `gazette_notice_label`, `publication_date`, matched `street_code`). The merge pipeline attaches `/egazette/en/{year}-gn{no}.pdf` to map and 最近核實.
2. **Do not** keep indirect citation remarks (`submitter_remarks` / batch `remarks` about “cited in G.N.…” or “misparsed egazette”). Remove them from batch JSON and drop duplicate `street-name-history` events for the same street + date once primary proof is applied.
3. **Omit** streets that do not match `hk-streets.geojson` (user may exclude explicitly, e.g. 佑福街 with no centreline).
4. **Colonial / scan PDFs** (`IMG_….pdf` in `batch-inbox/{year}-gn{no}/`): `publish-crowd-gazette-pdfs.mjs` copies them to `public/egazette/en/{year}-gn{no}.pdf` using the **batch folder name** when the filename is not `egn…` / `cgn…`.
5. After removing duplicate `street-name-history` events, run **`npm run report:pending-years`** so map chip remarks in `pending-naming-years.json` stay in sync.

## Workflow

### A. User attaches a gazette PDF (parse first, apply after verification)

1. **Parse PDF → draft batch JSON** (do not apply yet):

```bash
node scripts/parse-crowd-gazette-pdf.mjs "/path/to/notice.pdf" --match
```

Writes `data/crowdsubmissions/batches/{year}-gn{no}-draft.json` by default.

2. **If `status: needs_visual_parse`** (image-only scan, no text layer):
   - Render pages: `python3 scripts/render-gazette-pdf.py "<pdf>" --page 0 --out /tmp/p1.png`
   - Read PNGs visually (or via vision) and fill draft JSON: G.N., `publication_date`, each street’s EN/ZH (and `street_code` when matched)
   - G.N. can often be inferred from filename (e.g. `GN1078-74…` → `G.N.1078`)
   - **Do not** transcribe gazette location/DESCRIPTION text into the batch

3. **Show draft to user for verification** — G.N., date, and `--match` table: each street must show `✓` with the expected **street_code** and **Chinese** name (not English-only on a homonym).

4. **Apply only after user confirms**:

```bash
node scripts/apply-crowd-batch.mjs data/crowdsubmissions/batches/…-draft.json
```

Remove `_draft` / `_parse` keys from JSON before apply if present (optional; apply script ignores unknown keys).

### B. User provides structured fields (no PDF parse)

1. **Build batch JSON** from user input (see template below).
2. **Run the batch script**:

```bash
node scripts/apply-crowd-batch.mjs /tmp/batch.json
```

3. **Verify** hosted gazette links and map data updated.
4. **Report** to user: streets updated, G.N. label, date, hosted PDF paths.
5. **Do not commit** unless the user asks.

PDFs are copied to `batch-inbox/`, published to `public/egazette/`, and stored as `/egazette/{en|zh}/{year-vol-gno-notice}.pdf`. To republish existing inbox PDFs: `npm run publish:crowd-gazettes`.

## PDF parsing behaviour

| PDF type | Extraction | Street parser |
|----------|------------|---------------|
| Modern Lands Dept (`egn`/`cgn`, text layer) | pdfjs / PyMuPDF | `lands_modern` (regex, same as egazette pipeline) |
| Colonial Urban Council / thoroughfare table | text from scan/OCR | `colonial_thoroughfare` (numbered “Thoroughfare…” rows) |
| Image-only scan | `needs_visual_parse` | Agent transcribes from rendered PNGs |

**`submitter_remarks`:** do **not** extract gazette DESCRIPTION / location paragraphs from PDFs in this skill. Omit remarks when EN+ZH match the database. Include remarks **only** when gazette EN or ZH differs from the matched record (e.g. `Gazette ZH 連合道; database 連道.`). Never use generic batch labels or “cited in G.N.…” / “misparsed egazette” notes — primary gazette proof replaces those.

When transcribing from PDF/vision, capture **both** name columns from the notice table (Description / Name in EN and ZH). Do not fill English only and skip Chinese.

## Batch JSON shape

Template: `data/crowdsubmissions/batch-template.json` (`evidence_schema_version: 1`)

```json
{
  "evidence_schema_version": 1,
  "source": "crowdsubmitted",
  "gazette_notice_label": "G.N.8104",
  "publication_date": "2004-12-17",
  "pdf_en": "/path/to/egn200408518104.pdf",
  "pdf_zh": "/path/to/cgn200408518104.pdf",
  "streets": [
    { "chinese_name": "竹篙灣公路" },
    { "street_code": "12278", "chinese_name": "大全街", "english_name": "Tai Tsun Street" }
  ]
}
```

### `evidence_kind` (required on each `history` entry)

| Kind | When to use |
|------|-------------|
| `gazette_primary` | This batch’s G.N. PDF is the naming notice for that date |
| `gazette_inferred` | Date/G.N. from “Previous G.N.” in another notice — set `derived_from` (citing batch G.N. + cited G.N.) |
| `news` / `legal_other` / `hearsay` | Non-gazette; add `evidence_kind_note` or brief `submitter_remarks` |
| `unknown` | Date known; primary gazette not on file yet |

### `event_role` (required on each `history` entry)

| Role | When |
|------|------|
| `current_name` | This event’s **after** names match geojson / the matched `street_code` row |
| `former_name` | Older name or declare that does not match today’s map name |
| `built` | Opened/built date (not used for map year in v1) |
| `name_removed` | `change_kind: delete` |

PDF parse drafts must include `history[]` with `evidence_kind: gazette_primary` and `event_role: current_name` for each street in the notice (see `parse-crowd-gazette-pdf.mjs`).

Do **not** use deprecated `evidence_level` alone. See `docs/street-name-history-schema.md`.

**Name change history** (multiple dates per street): use `history` on a street entry and `street_code`. Events are stored in `data/crowdsubmissions/street-name-history.json`.

## Street matching (critical)

Hong Kong centrelines often share the **same English name** with different Chinese names (e.g. **Wing Yip Street** → 榮業街 `12751` and 永業街 `12752`). **Never locate a street by English alone** when more than one pending road shares that English name.

`apply-crowd-batch.mjs` / `parse-crowd-gazette-pdf.mjs --match` resolve rows via `matchRowToRoadKey` in `scripts/lib/crowd-submission-core.mjs`:

| Priority | What to provide | Result |
|----------|-----------------|--------|
| 1 | `street_code` | Exact match (best) |
| 2 | `chinese_name` + `english_name` | Match both against `pending-naming-years.json` |
| 3 | `chinese_name` only | OK if **unique** in pending data |
| 4 | `english_name` only | OK only if **exactly one** road has that English name; otherwise **stop** and ask user / add Chinese |

### Agent checklist (before apply)

1. Run `--match` on the draft and read the match table (`✓` / `✗` per street).
2. For each street, prefer **`chinese_name` from the gazette** (and English when shown). Copy both into batch JSON.
3. If the gazette lists only English, look up `public/data/hk-streets.geojson` or pending data for the **Chinese name** on the target centreline — do not guess from English alone.
4. If English matches multiple roads, disambiguate with Chinese or `street_code` before apply.
5. After apply, spot-check map chip: Chinese + English match the intended road; **來源** links to the G.N. PDF (`憲報` when primary).

### Batch JSON (required fields)

- **Always** set `chinese_name` when the notice or Lands Department plan gives it.
- Set `english_name` when known (confirmation, not sole key).
- Set `street_code` when `--match` or pending lookup returns it.

```json
{ "street_code": "12045", "chinese_name": "盛芳街", "english_name": "Shing Fong Street" }
```

**Avoid:**

```json
{ "english_name": "Wing Yip Street" }
```

when multiple `Wing Yip Street` rows exist — apply will **fail** or you risk the wrong centreline.

**String shorthand:** `"streets": ["盛芳街", "欣澳道"]` is treated as **Chinese only** (good). Do not pass English-only strings unless you have verified uniqueness.

**Homonym pitfall (map merge):** Even with a correct crowd event, `merge:crowd` used to colour lines by English fallback. Excluded wrong codes live in `data/naming-date-exclusions.json` (e.g. `12751` 榮業街). Add `street_code` there if a homonym must stay un-dated.

**PDF filenames:** `cgn200408518104` / `egn200408518104` auto-derive egazette URLs and G.N. number when `gazette_notice_label` is omitted.

## What the script updates

| File | Effect |
|------|--------|
| `data/crowdsubmissions/batch-approved.csv` | Appends approved rows |
| `data/crowdsubmissions/batch-inbox/{batch_id}/` | Stores PDF copies |
| `data/crowdsubmissions/street-events-approved.json` | Crowd events |
| `public/data/master/submission-tracker.json` | Approved badges |
| `public/data/master/recently-verified.json` | 最近核實 list |
| `public/data/hk-streets.geojson` | Map year coloring; `naming_details` → **來源** column (`gazette_primary` / inferred) |

## CSV header pitfall

If editing `batch-approved.csv` manually, use header **`gazette notice label`** (spaces), not `gazette_notice_label` — the import script only maps spaced aliases.

## npm scripts

| Command | Purpose |
|---------|---------|
| `node scripts/parse-crowd-gazette-pdf.mjs <pdf> [--match]` | PDF → draft batch JSON (verify first) |
| `node scripts/apply-crowd-batch.mjs <json>` | Full batch apply (after verification) |
| `npm run publish:crowd-gazettes` | Publish inbox PDFs + update URLs |
| `npm run apply:crowd` | Re-import CSV + merge (after manual CSV edits) |
| `npm run merge:crowd` | Merge only (after patching approved JSON) |

## Example: PDF attachment

> `/Users/me/Downloads/GN1078-74 … Tam.pdf`

1. `node scripts/parse-crowd-gazette-pdf.mjs "…pdf" --match` (or vision fill if image-only).
2. User verifies draft in `data/crowdsubmissions/batches/…-draft.json`.
3. `node scripts/apply-crowd-batch.mjs …-draft.json`.

## Example: structured message

> gazette number: 8104, date: 17/12/2004, 竹篙灣公路, 欣澳道, PDFs at ~/Downloads/cgn….pdf

1. Write batch JSON with those fields.
2. Run `node scripts/apply-crowd-batch.mjs …`
3. Confirm **街道** table **來源** shows `憲報` (or `憲報（推斷）`) with working PDF link; map chip matches street names.
