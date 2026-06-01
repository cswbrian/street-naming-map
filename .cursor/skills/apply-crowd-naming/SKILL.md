---
name: apply-crowd-naming
description: Apply community-verified Hong Kong street naming dates to street-naming-map with source 社群 (crowdsubmitted) always. Use when the user submits gazette proof (PDF, G.N., date, street names) via /apply-crowd-naming. Never use hkgro in this skill — use parse-hkgro-gazettes for sunzi/HKGRO pipeline only.
---

# Apply crowd naming submissions

Process community-verified street naming batches for **street-naming-map**.

## Source rule (always)

When the user invokes **`/apply-crowd-naming`**, every street in the batch must end up with map badge **社群** (`source: crowdsubmitted`).

- Always set `"source": "crowdsubmitted"` on the batch JSON (or omit `source` — `apply-crowd-batch.mjs` defaults to 社群).
- **Never** set `"source": "hkgro"` in batches for this skill, including colonial or pre-1997 gazette PDFs.
- Historical sunzi/HKGRO downloads → [parse-hkgro-gazettes](../parse-hkgro-gazettes/SKILL.md) (not this skill).

## When the user sends data

Typical input (any of):

- **PDF file(s)** attached or path given (preferred when user drops a scan)
- Gazette number (e.g. `8104` or `G.N.8104`)
- Publication date (e.g. `17/12/2004`)
- List of Chinese and/or English street names
- Optional PDF paths (`cgn…pdf`, `egn…pdf`)

Goal: mark streets under **最近核實** with badge **社群** (`crowdsubmitted`) on the map.

## Gazette proof backfill (existing records)

When a street **already has** a naming year or a **historical** crowd event (e.g. first Previous G.N. parsed from a later G.N.4509 notice) but **no hosted gazette PDF** (`government_notice_url_en` / `proof_pdf_url` null):

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

3. **Show draft to user for verification** — names, date, match table from `--match`.

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

## Batch JSON shape

Template: `data/crowdsubmissions/batch-template.json`

```json
{
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

**Name change history** (multiple dates per street): use `history` on a street entry and `street_code`. Events are stored in `data/crowdsubmissions/street-name-history.json`. See `docs/street-name-history-schema.md`.

**Street matching:** resolve by `street_code`, or match Chinese/English names against `public/data/master/pending-naming-years.json`.

**PDF filenames:** `cgn200408518104` / `egn200408518104` auto-derive egazette URLs and G.N. number when `gazette_notice_label` is omitted.

**Streets only as strings:** `"streets": ["竹篙灣公路", "欣澳道"]` also works.

## What the script updates

| File | Effect |
|------|--------|
| `data/crowdsubmissions/batch-approved.csv` | Appends approved rows |
| `data/crowdsubmissions/batch-inbox/{batch_id}/` | Stores PDF copies |
| `data/crowdsubmissions/street-events-approved.json` | Crowd events |
| `public/data/master/submission-tracker.json` | Approved badges |
| `public/data/master/recently-verified.json` | 最近核實 list |
| `public/data/hk-streets.geojson` | Map coloring + source badge **社群** (`crowdsubmitted`) |

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
3. Confirm streets show `naming_source: crowdsubmitted`.
