# Hong Kong Streets Timeline PWA

Interactive React PWA that visualizes the history of Hong Kong street development by animating roads over time using derived `naming_year` values.

## Features

- Full-screen MapLibre map with cyberpunk styling
- Timeline slider to reveal roads up to a selected year
- Bilingual road labels (English + Chinese) with year markers
- Period-based color grouping with interactive legend filtering
- Region and sub-district navigation with smooth fly-to
- Bilingual road search with direct map zoom

## Tech Stack

- React + Vite
- MapLibre GL JS
- deck.gl

## Data

- Source road geometry: `Transportation_RoadCentreline_20260402.gdb_converted.geojson`
- LandsD source pages (2016+):
  - `https://www.landsd.gov.hk/en/survey-mapping/mapping/street-geographical-place-naming/street-naming.html`
  - `https://www.landsd.gov.hk/tc/survey-mapping/mapping/street-geographical-place-naming/street-naming.html`
- App dataset: `public/data/hk-streets.geojson` (generated from LandsD event history)
- Master artifacts:
  - `public/data/master/landsd-street-events-2016plus.json`
  - `public/data/master/landsd-street-aggregates-2016plus.json`
  - `public/data/master/landsd-qa-report-2016plus.json`
  - `public/data/master/landsd-qa-report-2016plus.md`

Generate naming data:

```bash
npm run prepare:data
```

### eGazette street-naming PDF harvest

Government gazette PDFs for Lands Department **街道命名** notices. Script: `scripts/fetch-egazette-street-pdfs.mjs`.

**Always run in this order:** bootstrap → harvest links → download PDFs. Do not skip steps.

#### Prerequisites (once per machine)

```bash
npm install
npx playwright install chromium
```

#### Command reference

| Command | What it does |
|--------|----------------|
| `npm run fetch:egazette:bootstrap` | Manual login; saves session (required before harvest/download) |
| `npm run fetch:egazette:harvest` | Collect all notice links → `manifests/notices.json` |
| `npm run fetch:egazette` | Download EN+ZH PDFs from manifest (skips already completed) |
| `npm run fetch:egazette:test` | Offline sanity check (no browser) |

#### Step 1 — Bootstrap session (manual, ~2 minutes)

Opens **real Google Chrome** (not a Playwright automation window) so you can click Turnstile normally.

```bash
npm run fetch:egazette:bootstrap
```

In the Chrome window:

1. Accept cookies (if shown)
2. Check **我已閱讀並接受…**
3. Complete Turnstile (**驗證您是人類**)
4. Click **繼續**

Wait until the terminal says `Saved storage state`. You can close Chrome.

Saved under `data/egazette/session/` (gitignored):

- `storageState.json` — cookie snapshot
- `browser-profile/` — Chrome profile reused for harvest/download

**Re-bootstrap when:** you see `404 | NOT FOUND`, `Session invalid`, or redirects to terms/important-notices during harvest or download.

#### Step 2 — Harvest notice links

Builds the manifest before any PDF download. Default periods: **`2016-2012`** and **`2011或之前`** (pre-2017 gazette; complements LandsD data from 2016+).

```bash
npm run fetch:egazette:harvest
```

- Crawls **every page** in period `2016-2012`, then **every page** in `2011或之前`
- Output: `data/egazette/manifests/notices.json`
- Progress: `data/egazette/progress/checkpoint.json`

Watch the log: you should see `page 1`, `page 2`, … until a page returns 0 notices. If every period stops at `page 1` with exactly 50 rows, the session may be bad — re-bootstrap.

**Resume interrupted harvest** (keeps existing manifest merge):

```bash
node scripts/fetch-egazette-street-pdfs.mjs --harvest-only
```

**Harvest all four period buckets** (includes 2026–2022, 2021–2017):

```bash
npm run fetch:egazette:harvest:all
```

**Custom periods:**

```bash
node scripts/fetch-egazette-street-pdfs.mjs --harvest-only --periods 2016-2012,2011或之前
```

#### Step 3 — Download PDFs

Runs **after** harvest. Does not re-harvest.

```bash
npm run fetch:egazette
```

- Reads `data/egazette/manifests/notices.json`
- For each notice: downloads English + Chinese PDF
- Skips rows already listed in `data/egazette/progress/completed.csv`
- Saves files to `data/egazette/raw-pdfs/en/` and `data/egazette/raw-pdfs/zh/`
- Summary: `data/egazette/progress/run-summary.json`

**How PDFs are fetched:** canonical URL `/pdf?type=egn|cgn&...` opens the site’s PDF.js viewer; the script reads the presigned `/os/gazette/...pdf` URL from the viewer and downloads bytes in-session (presigned URLs are not stored).

**Test a small batch:**

```bash
node scripts/fetch-egazette-street-pdfs.mjs --download-only --download-limit 4
```

**Resume after interruption:** run the same command again; completed pairs `(notice_key, lang)` are skipped automatically.

#### Output layout

```
data/egazette/
  manifests/notices.json       # harvest output (canonical /pdf? links)
  progress/
    checkpoint.json          # harvest resume state
    completed.csv            # finished downloads (resume skip list)
    attempts.csv             # all download attempts
    failures.csv             # failed downloads
    run-summary.json         # last download run stats
  raw-pdfs/en/*.pdf
  raw-pdfs/zh/*.pdf
  session/                   # gitignored (bootstrap cookies + Chrome profile)
```

#### Re-run scenarios (cheat sheet)

| Situation | What to run |
|-----------|-------------|
| First time | bootstrap → harvest → download |
| Session expired (404 / terms page) | `npm run fetch:egazette:bootstrap` then retry harvest or download |
| Harvest stopped midway | `node scripts/fetch-egazette-street-pdfs.mjs --harvest-only` |
| Download stopped midway | `npm run fetch:egazette` (skips completed) |
| Fresh manifest (re-harvest from scratch) | `npm run fetch:egazette:harvest` (uses `--no-resume`) |
| Re-download everything | delete or rename `completed.csv`, then `npm run fetch:egazette` |

#### Troubleshooting

**Turnstile `600010` or widgets not clickable**

- Close any Chrome window opened by a previous bootstrap
- Run `npm run fetch:egazette:bootstrap` again
- Or: `npm run fetch:egazette:bootstrap:chrome` (Playwright Inspector + system Chrome)
- Disable VPN/ad blockers for `egazette.gld.gov.hk` and `challenges.cloudflare.com`

**`404 | NOT FOUND` during download**

- Session expired. Re-run bootstrap, then `npm run fetch:egazette` again.

**Harvest only finds 50 notices per period**

- Usually stale session or pagination not advancing — re-bootstrap and re-harvest.

**Downloads show `skipped: 4` (or similar)**

- Normal: those EN/ZH pairs are already in `completed.csv` from an earlier run.

**Offline check (no network):**

```bash
npm run fetch:egazette:test
```

### eGazette PDF parsing (street naming from gazette PDFs)

Parse harvested PDFs into street events and merge with LandsD data. Requires extracted text under `data/egazette/raw-pdfs/` (from harvest + download above).

**Prerequisites:**

```bash
npm install
export OPENROUTER_API_KEY=your_key   # for LLM parsing (recommended)
```

**No-LLM mapping (Stage 1 text + regex parser):**

```bash
# 1. Extract text from all PDFs (free; cached under data/egazette/extractions/)
npm run parse:egazette:extract:all

# 2. Structure events from extracted text (no API key)
npm run parse:egazette:regex

# 3. Merge into GeoJSON
npm run merge:egazette
npm run report:pending-years
```

Or one command after extraction: `npm run parse:egazette:map`

**LLM for notices regex missed** (~70 of 200):

```bash
# .env.local in project root:
# OPENROUTER_API_KEY=sk-or-...

npm run parse:egazette:llm-remaining:merge
```

Keeps existing regex events and adds LLM-parsed events for notices with no regex rows, then regenerates `hk-streets.geojson`.

**Self-hosted gazette PDFs (dashboard links):**

```bash
npm run publish:egazette-pdfs    # copy PDFs → public/egazette/{en,zh}/
npm run report:pending-years     # inject /street-naming-map/egazette/... URLs
```

Or: `npm run prepare:egazette-links`. The Street Naming Directory shows **中文 PDF** / **EN PDF** for eGazette-mapped streets.

**Pilot workflow (~10 notices, cross-check vs LandsD 2016+):**

```bash
# 1. Extract PDF text (free, cached under data/egazette/extractions/)
node scripts/parse-egazette-pdfs.mjs --pilot --extract-only --no-resume

# 2a. Structure with OpenRouter (cheap model, ~$0.01–0.05 for pilot)
npm run parse:egazette:pilot

# 2b. Or regex-only fallback (no API cost, lower accuracy)
npm run parse:egazette:pilot:regex

# 3. Compare against LandsD ground truth
npm run validate:egazette:pilot

# 4. Merge into GeoJSON + master aggregates
npm run merge:egazette:pilot
npm run report:pending-years
```

**Full batch (all ~200 notices):**

```bash
npm run parse:egazette
npm run merge:egazette
npm run report:pending-years
```

Outputs:

- `data/egazette/extractions/{notice_key}.json` — cached PDF text
- `data/egazette/parsed/egazette-street-events-pilot.json` — pilot events
- `data/egazette/pilot-qa-report.json` — accuracy vs LandsD
- `public/data/master/street-events-combined.json` — merged events
- `public/data/master/street-aggregates-combined.json` — per-street canonical dates
- `public/data/hk-streets.geojson` — enriched with `naming_year`, `naming_date`, `naming_source`

### Naming date semantics

- Every LandsD row is stored as an event record (notice history is preserved).
- Canonical naming date is derived as the earliest event categorized as `declaration` per street.
- Streets with no declaration event keep `canonical_naming_date = null` and are listed in the QA report.
- Enriched GeoJSON fields added per feature:
  - `naming_year`
  - `naming_date`
  - `naming_source`
  - `naming_derivation_reason`
  - `naming_event_count`

## Run Locally

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Deploy to GitHub Pages

This project is configured for GitHub Pages on:

- Repository: `cswbrian/street-naming-map`
- Branch: `main`
- Vite base path: `/street-naming-map/`

Deployment is automated with GitHub Actions in `.github/workflows/deploy-pages.yml`.

One-time setup in GitHub:

1. Open repository settings: [https://github.com/cswbrian/street-naming-map/settings/pages](https://github.com/cswbrian/street-naming-map/settings/pages)
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Push to `main` and wait for the workflow to finish

Your site will be served at:

- [https://cswbrian.github.io/street-naming-map/](https://cswbrian.github.io/street-naming-map/)
