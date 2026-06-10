#!/usr/bin/env node
/**
 * Build self-hosted XYZ tiles from LandsD historical map GeoTIFF + .tfw sources.
 *
 * Prerequisites: GDAL (brew install gdal)
 *
 * Usage:
 *   npm run build:historical-maps -- --id hk-1957
 *   npm run build:historical-maps -- --all
 */

import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HISTORICAL_MAP_ATTRIBUTION,
  HISTORICAL_MAP_CATALOG,
  getHistoricalMapById,
} from '../src/config/historicalMaps.mjs'

const rootDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(rootDir, '..')
const sourceRoot = join(repoRoot, 'data/historical-maps/source')
const tilesRoot = join(repoRoot, 'public/historical-maps')
const manifestPath = join(repoRoot, 'public/data/historical-maps-manifest.json')
const buildDir = join(repoRoot, 'data/historical-maps/build')

function parseArgs(argv) {
  const opts = { ids: [], all: false, processes: 4 }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--all') opts.all = true
    else if (arg === '--id' && argv[i + 1]) {
      opts.ids.push(argv[++i])
    } else if (arg === '--processes' && argv[i + 1]) {
      opts.processes = Number(argv[++i])
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node scripts/build-historical-map-tiles.mjs --id hk-1957
  node scripts/build-historical-map-tiles.mjs --all
  node scripts/build-historical-map-tiles.mjs --id hk-1927 --processes 8`)
      process.exit(0)
    }
  }
  return opts
}

function requireGdal() {
  for (const cmd of ['gdalinfo', 'gdalwarp', 'gdaltransform']) {
    const result = spawnSync('which', [cmd], { encoding: 'utf8' })
    if (result.status !== 0) {
      console.error(`Missing ${cmd}. Install GDAL: brew install gdal`)
      process.exit(1)
    }
  }
  const tiles = spawnSync('which', ['gdal2tiles.py'], { encoding: 'utf8' })
  if (tiles.status !== 0) {
    console.error('Missing gdal2tiles.py. Install GDAL: brew install gdal')
    process.exit(1)
  }
}

function readManifest() {
  if (!existsSync(manifestPath)) {
    return { generatedAt: null, maps: [] }
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

function writeManifest(manifest) {
  manifest.generatedAt = new Date().toISOString()
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function resolveSourceTif(entry) {
  const dir = join(sourceRoot, entry.id)
  const candidates = [
    join(dir, `${entry.sourceBasename}.tif`),
    join(dir, `${entry.sourceBasename}.tiff`),
    join(dir, `${entry.sourceBasename}.TIF`),
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}

function resolveSourceTfw(entry, tifPath) {
  const dir = dirname(tifPath)
  const base = entry.sourceBasename
  const candidates = [
    join(dir, `${base}.tfw`),
    join(dir, `${base}.TFW`),
    join(dir, `${base}.tifw`),
    tifPath.replace(/\.tiff?$/i, '.tfw'),
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}

function run(cmd, args, label) {
  console.log(`\n→ ${label}`)
  execFileSync(cmd, args, { stdio: 'inherit' })
}

function gdalJson(args) {
  const out = execFileSync('gdalinfo', ['-json', ...args], { encoding: 'utf8' })
  return JSON.parse(out)
}

function computeWgs84Bounds(warpedPath) {
  const info = gdalJson([warpedPath])
  const ring = info.wgs84Extent?.coordinates?.[0]
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new Error(`Could not read WGS84 bounds from ${warpedPath}`)
  }

  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity

  for (const [lng, lat] of ring) {
    west = Math.min(west, lng)
    south = Math.min(south, lat)
    east = Math.max(east, lng)
    north = Math.max(north, lat)
  }

  return [
    [west, south],
    [east, north],
  ]
}

function buildMap(entry, manifest, processes) {
  const tifPath = resolveSourceTif(entry)
  if (!tifPath) {
    console.warn(`Skip ${entry.id}: no GeoTIFF in ${join(sourceRoot, entry.id)}`)
    return false
  }

  const tfwPath = resolveSourceTfw(entry, tifPath)
  if (!tfwPath) {
    console.warn(`Skip ${entry.id}: missing .tfw for ${tifPath}`)
    return false
  }

  mkdirSync(buildDir, { recursive: true })
  const warpedPath = join(buildDir, `${entry.id}-3857.tif`)
  const outputDir = join(tilesRoot, entry.id)

  run(
    'gdalwarp',
    [
      '-t_srs',
      'EPSG:3857',
      '-r',
      'bilinear',
      '-co',
      'COMPRESS=DEFLATE',
      '-co',
      'TILED=YES',
      '-overwrite',
      tifPath,
      warpedPath,
    ],
    `Reproject ${entry.id} → EPSG:3857`,
  )

  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true })
  }
  mkdirSync(outputDir, { recursive: true })

  const { min, max } = entry.tileZoom
  run(
    'gdal2tiles.py',
    [
      '--xyz',
      '-z',
      `${min}-${max}`,
      '--processes',
      String(processes),
      '--webviewer=none',
      '--resume',
      warpedPath,
      outputDir,
    ],
    `Tile ${entry.id} z${min}–${max}`,
  )

  const bounds = computeWgs84Bounds(warpedPath)
  const manifestEntry = {
    id: entry.id,
    year: entry.year,
    labelEn: entry.labelEn,
    labelZh: entry.labelZh,
    scale: entry.scale,
    coverage: entry.coverage,
    tileUrlTemplate: `historical-maps/${entry.id}/{z}/{x}/{y}.png`,
    minZoom: min,
    maxZoom: max,
    bounds,
    attribution: HISTORICAL_MAP_ATTRIBUTION,
  }

  const others = manifest.maps.filter((m) => m.id !== entry.id)
  manifest.maps = [...others, manifestEntry].sort((a, b) => a.year - b.year)

  const tileCount = countFiles(outputDir)
  console.log(`✓ ${entry.id}: ${tileCount} tiles, bounds ${JSON.stringify(bounds)}`)
  return true
}

function countFiles(dir) {
  let count = 0
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory()) count += countFiles(join(dir, name.name))
    else if (name.name.endsWith('.png')) count += 1
  }
  return count
}

function discoverBuildableIds() {
  return HISTORICAL_MAP_CATALOG.filter((entry) => resolveSourceTif(entry)).map((e) => e.id)
}

function seedSourceFromDownloads() {
  const downloads = [
    {
      id: 'hk-1927',
      basename: 'HIST-HA25-1927',
      dirs: [
        '/Users/coolsunwind/Downloads/Hong-Kong-(1927-&-1957)',
        '/Users/coolsunwind/Downloads/Hong-Kong-1957',
      ],
    },
    {
      id: 'hk-1957',
      basename: 'HIST-HA26-1957',
      dirs: [
        '/Users/coolsunwind/Downloads/Hong-Kong-(1927-&-1957)',
        '/Users/coolsunwind/Downloads/Hong-Kong-1957',
      ],
    },
  ]

  for (const item of downloads) {
    const targetDir = join(sourceRoot, item.id)
    mkdirSync(targetDir, { recursive: true })
    for (const dir of item.dirs) {
      if (!existsSync(dir)) continue
      for (const ext of ['.tfw', '.TFW']) {
        const src = join(dir, `${item.basename}${ext}`)
        if (existsSync(src)) {
          copyFileSync(src, join(targetDir, `${item.basename}.tfw`))
        }
      }
      for (const ext of ['.tif', '.tiff', '.TIF']) {
        const src = join(dir, `${item.basename}${ext}`)
        if (existsSync(src)) {
          copyFileSync(src, join(targetDir, `${item.basename}.tif`))
        }
      }
    }
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  requireGdal()
  seedSourceFromDownloads()

  const ids = opts.all
    ? discoverBuildableIds()
    : opts.ids.length
      ? opts.ids
      : discoverBuildableIds()

  if (!ids.length) {
    console.error(`No buildable maps found. Place GeoTIFF + .tfw under:\n  ${sourceRoot}/{id}/`)
    console.error('Example: data/historical-maps/source/hk-1957/HIST-HA26-1957.tif')
    process.exit(1)
  }

  const manifest = readManifest()
  let built = 0

  for (const id of ids) {
    const entry = getHistoricalMapById(id)
    if (!entry) {
      console.warn(`Unknown catalog id: ${id}`)
      continue
    }
    if (buildMap(entry, manifest, opts.processes)) built += 1
  }

  writeManifest(manifest)
  console.log(`\nDone. Built ${built} map(s). Manifest: ${manifestPath}`)
}

main()
