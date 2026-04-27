# Hong Kong Streets Timeline PWA

Interactive React PWA that visualizes the history of Hong Kong street development by animating roads over time using `naming_year`.

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
- App dataset: `public/data/hk-streets.geojson` (includes mock `naming_year`)

Generate mock year data:

```bash
npm run prepare:data
```

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
