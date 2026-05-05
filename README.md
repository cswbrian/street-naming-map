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
