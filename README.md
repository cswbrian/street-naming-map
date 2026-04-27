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
