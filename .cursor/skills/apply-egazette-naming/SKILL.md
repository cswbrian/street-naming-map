---
name: apply-egazette-naming
description: Parse Lands Department eGazette street-naming notices (egn/cgn PDFs from egazette.gld.gov.hk), build history[] events, and upsert into street-events.json via /apply-egazette-naming. Batch source is crowdsubmitted (not hkgro). Use parse-hkgro-gazettes for sunzi/HKGRO colonial scans only.
---

# Apply Lands Department eGazette naming events

Parse **modern Lands Department** street-naming notices from the government e-Gazette (`egn…` / `cgn…` PDFs) and upsert naming events into **street-naming-map**.

**Event model:** [event-model.md](../event-model.md) (reference) — every apply must upsert full `history[]` events. Skill routing: [README.md](../README.md).

## Scope

| In scope | Out of scope |
|----------|--------------|
| `egazette.gld.gov.hk` PDFs (`egn…`, `cgn…`) | HKGRO / sunzi colonial scans (`617826.pdf`, TIF2PDF) |
| Lands Dept 街道命名 / 宣布街道名稱 / 取代街道說明 notices | Bulk harvest pipeline (`npm run merge:egazette`) — see [docs/egazette-pipeline.md](../../docs/egazette-pipeline.md) |
| Community-verified PDF drops with structured batch JSON | Direct LandsD CSV scrape (`source: landsd`) |

Colonial HKGRO scans → [parse-hkgro-gazettes](../parse-hkgro-gazettes/SKILL.md).

## Pipeline routing (batch `source` field)

When the user invokes **`/apply-egazette-naming`**, set `"source": "crowdsubmitted"` on the batch JSON (or omit — `apply-crowd-batch.mjs` defaults to crowd).

- **`crowdsubmitted`** = pipeline ingest label only; the UI shows **來源** from `evidence_kind` (憲報), not “crowd”.
- **Never** set `"source": "hkgro"` in this skill.

## When the user sends data

Typical input (any of):

- **PDF file(s)** attached or path given (preferred — `egn…` EN + `cgn…` ZH)
- Gazette number (e.g. `8104` or `G.N.8104`)
- Publication date (e.g. `17/12/2004`)
- List of Chinese and/or English street names

Goal: upsert gazette facts via `history[]`, host PDFs, set **來源** `gazette_primary`. Map years update only when `link_street_code` or a linker connects `street-centreline-map.json` (see [centreline-linker](../centreline-linker/SKILL.md)).

## Mandatory `history[]`

**Every street entry must include a non-empty `history[]` array.** This is the only path that upserts into `data/master/street-events.json`.

| Avoid (legacy) | Use instead |
|----------------|-------------|
| `"streets": ["盛芳街"]` | `{ "chinese_name": "盛芳街", "history": [{ … }] }` |
| `street_code` on batch (parser) | Omit — linkers set `link_street_code` or edit `street-centreline-map.json` |
| `event_role` on every history row | Omit unless needed; derived at build when linked |

`parse-crowd-gazette-pdf.mjs` drafts `declare` + `current_name` only — **upgrade** to `rename`, `gazette_inferred`, or multi-event chains during verification (see [event-model.md](../event-model.md)).

## Event classification

| Notice type | Action |
|-------------|--------|
| `宣布街道名稱` / Declaration of street name (first on file) | `change_kind: declare`, `evidence_kind: gazette_primary` |
| “continuation of …” / same name, new segment | `change_kind: extend`, `event_role: current_name`, `evidence_kind: gazette_primary` |
| Previous name in notice / “instead of” | `change_kind: rename` + `previous_street_name_*`; add `former_name` row if earlier name known without gazette |
| `取代街道說明` / replacing description of street | **Do not** create event at citing G.N. date. Extract **first Previous G.N.** per street → `gazette_inferred` at cited date + `derived_from` citing the replace-description G.N. Host citing PDF. See `2018-gn6060-first-previous-gn.json` |
| Built / opened date (research, news) | `event_role: built`, `evidence_kind: research` or `news`; `supplementary_evidence` for document URL |
| Name explicitly abolished | `change_kind: delete`, `event_role: name_removed` |

取代街道 is **not** a timeline event type — it yields an inferred naming event at the Previous G.N. date plus optional later backfill to `gazette_primary`.

## Gazette proof backfill (existing records)

When a street **already has** a naming year or a **`gazette_inferred`** / `unknown` event (e.g. first Previous G.N. parsed from a later notice) but **no hosted gazette PDF** for the cited G.N. (`government_notice_url_en` null):

1. **Apply the primary gazette** for that naming date (`pdf_en`, `gazette_notice_label`, `publication_date`, full `history[]`). Set batch `gazette_only: true` (default).
2. **Do not** keep indirect citation remarks (`submitter_remarks` / batch `remarks` about “cited in G.N.…”).
3. **Linkers** attach map separately via `link_street_code` on the batch row or `npm run apply:street-links` — parsers do not skip streets missing from geojson.
4. Set `gazette_url_en` / `gazette_url_zh` explicitly when PDF filenames have suffixes (e.g. `egn…-1.pdf`) that break auto-URL derivation.
5. Run **`npm run report:pending-years`** after duplicate cleanup.

## Add vs update events

| Situation | What happens |
|-----------|--------------|
| New street + date + role | `apply-crowd-batch.mjs` appends via `upsertMasterEvents` |
| Same `event_id` | Replaced in place |
| Same dedupe key already in master | Skipped (console warning) |
| Existing `unknown` / `gazette_inferred` row | Apply primary gazette for cited date → upgrades `evidence_kind`, attaches PDF |
| Manual patch | [street-naming-master/SKILL.md](../street-naming-master/SKILL.md) |

## Workflow

### A. User attaches eGazette PDF(s) (parse first, apply after verification)

1. **Parse PDF → draft batch JSON** (do not apply yet):

```bash
node scripts/parse-crowd-gazette-pdf.mjs "/path/to/egn….pdf" --match
```

Writes `data/crowdsubmissions/batches/{year}-gn{no}-draft.json` by default. Pass the **English** `egn…` PDF; add `cgn…` path to batch `pdf_zh` before apply.

2. **If `status: needs_visual_parse`** (image-only scan, no text layer):
   - Render pages: `python3 scripts/render-gazette-pdf.py "<pdf>" --page 0 --out /tmp/p1.png`
   - Read PNGs visually and fill draft JSON: G.N., `publication_date`, each street’s EN/ZH (and `link_street_code` when matched)
   - **Do not** transcribe gazette location/DESCRIPTION text into the batch

3. **Classify events** — check notice type (declare / rename / replace_description / delete). Upgrade draft `history[]` per [event-model.md](../event-model.md).

4. **Show draft to user for verification** — G.N., date, and `--match` table. When geojson match is confident, set `link_street_code`; otherwise apply gazette facts only and leave linking to [centreline-linker](../centreline-linker/SKILL.md).

5. **Apply only after user confirms**:

```bash
node scripts/apply-crowd-batch.mjs data/crowdsubmissions/batches/…-draft.json
```

### B. User provides structured fields (no PDF parse)

1. **Build batch JSON** with `history[]` on every street (see template below).
2. **Run the batch script**:

```bash
node scripts/apply-crowd-batch.mjs /tmp/batch.json
```

3. **Verify** (post-apply checklist below).
4. **Report** to user: streets updated, event types, G.N. label, date, hosted PDF paths.
5. **Do not commit** unless the user asks.

PDFs are copied to `batch-inbox/`, published to `public/egazette/`, and stored as `/egazette/{en|zh}/{year-vol-gno-notice}.pdf`. To republish: `npm run publish:crowd-gazettes`. PDF placement rules: [gazette-files/SKILL.md](../gazette-files/SKILL.md).

## PDF parsing behaviour

| PDF type | Extraction | Street parser |
|----------|------------|---------------|
| Modern Lands Dept (`egn`/`cgn`, text layer) | pdfjs / PyMuPDF | `lands_modern` (regex, same as egazette pipeline) |
| Colonial Urban Council / thoroughfare table | text from scan/OCR | `colonial_thoroughfare` |
| Image-only scan | `needs_visual_parse` | Agent transcribes from rendered PNGs |

**`submitter_remarks`:** omit when EN+ZH match the database; include **only** for gazette/database name mismatches.

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
  "gazette_only": true,
  "streets": [
    {
      "link_street_code": "12278",
      "chinese_name": "大全街",
      "english_name": "Tai Tsun Street",
      "history": [{
        "publication_date": "2004-12-17",
        "change_kind": "declare",
        "street_name_en": "Tai Tsun Street",
        "street_name_zh": "大全街",
        "evidence_kind": "gazette_primary",
        "event_role": "current_name"
      }]
    }
  ]
}
```

### `evidence_kind` (required on each `history` entry)

| Kind | When to use |
|------|-------------|
| `gazette_primary` | This batch’s G.N. PDF is the naming notice for that date |
| `gazette_inferred` | Date/G.N. from “Previous G.N.” in another notice — set `derived_from` |
| `news` / `legal_other` / `hearsay` | Non-gazette; add `evidence_kind_note` or brief `submitter_remarks` |
| `unknown` | Date known; primary gazette not on file yet |

### `event_role` (required on each `history` entry)

| Role | When | UI (zh) |
|------|------|---------|
| `current_name` | After-names match geojson | 命名 (or 易名 if rename + prior timeline row) |
| `former_name` | Does not match today’s map name | 舊稱 |
| `built` | Opened/built date (map year built-first) | 落成 |
| `name_removed` | `change_kind: delete` | 名稱撤銷 |

See `docs/street-name-history-schema.md` for full field reference.

## Street matching (critical)

**Never locate a street by English alone** when homonyms exist (e.g. **Wing Yip Street** → 榮業街 `12751` and 永業街 `12752`).

| Priority | What to provide | Result |
|----------|-----------------|--------|
| 1 | `link_street_code` (from geojson `STREETCODE`) | Exact match (best) |
| 2 | `chinese_name` + `english_name` | Match both against pending data |
| 3 | `chinese_name` only | OK if **unique** |
| 4 | `english_name` only | OK only if **exactly one** road shares that English name |

### Agent checklist (before apply)

1. Run `--match` on the draft; read match table (`✓` / `✗` per street).
2. Copy gazette **Chinese + English** into batch JSON.
3. Confirm every street has non-empty `history[]` with `evidence_kind` and `event_role`.
4. For `取代街道說明`, use Previous G.N. dates — not the citing G.N. date.
5. Set `gazette_url_en` / `gazette_url_zh` when auto-derivation from filenames may fail.

### Post-apply checklist

**Events (always):**

1. Grep `event_id` in `street-events.json` — count matches `history[]` rows.
2. Hosted PDF at `/egazette/en/{stem}.pdf`; `npm run lint:gazettes` passes.
3. Row visible on `/{locale}/timelines`.

**Map (only if `link_street_code` or linker applied):**

4. `rg 'code:CODE' data/master/street-centreline-map.json` — `event_ids` include new rows.
5. Map chip **舊稱** labels correct; **來源** → G.N. PDF; centerline `map_year` matches.
6. Street in **最近核實** when linked + canonical naming date set.

## What the script updates

| File | Effect |
|------|--------|
| `data/master/street-events.json` | **Primary target** — upsert naming events |
| `data/master/street-centreline-map.json` | When batch streets include `link_street_code` |
| `data/crowdsubmissions/batch-inbox/{batch_id}/` | PDF copies |
| `public/egazette/` | Hosted gazette PDFs |
| `public/data/hk-streets.geojson` | Regenerated — naming years only for **linked** STREETCODEs |

## npm scripts

| Command | Purpose |
|---------|---------|
| `node scripts/parse-crowd-gazette-pdf.mjs <pdf> [--match]` | PDF → draft batch JSON |
| `node scripts/apply-crowd-batch.mjs <json>` | Apply batch → master events |
| `npm run publish:crowd-gazettes` | Publish inbox PDFs + update URLs |
| `npm run rebuild:naming` | Rebuild geojson after master/map changes |
| `npm run report:unmapped-events` | Linker queue after parser-only apply |

## Example: eGazette PDF attachment

> `~/Downloads/egn200307488574.pdf` + `cgn200307488574.pdf`

1. `node scripts/parse-crowd-gazette-pdf.mjs "…egn….pdf" --match`
2. Classify `history[]` per [event-model.md](../event-model.md); add `pdf_zh`, verify matches.
3. `node scripts/apply-crowd-batch.mjs …-draft.json`

## Example: structured message

> gazette number: 8104, date: 17/12/2004, 竹篙灣公路, 欣澳道, PDFs at ~/Downloads/cgn….pdf

1. Write batch JSON with `history[]` on each street.
2. `node scripts/apply-crowd-batch.mjs …`
3. Confirm **來源** shows `憲報` with working PDF link.
