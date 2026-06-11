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
  const opts = { ids: [], all: false, processes: 4, optimize: true }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--all') opts.all = true
    else if (arg === '--no-optimize') opts.optimize = false
    else if (arg === '--id' && argv[i + 1]) {
      opts.ids.push(argv[++i])
    } else if (arg === '--processes' && argv[i + 1]) {
      opts.processes = Number(argv[++i])
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node scripts/build-historical-map-tiles.mjs --id hk-1957
  node scripts/build-historical-map-tiles.mjs --all
  node scripts/build-historical-map-tiles.mjs --id hk-1927 --processes 8
  node scripts/build-historical-map-tiles.mjs --all --no-optimize`)
      process.exit(0)
    }
  }
  return opts
}

function requireGdal() {
  for (const cmd of ['gdalinfo', 'gdalwarp', 'gdaltransform', 'gdalbuildvrt', 'gdal_translate']) {
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

function tileVersionFromGeneratedAt(iso) {
  return String(iso ?? '')
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14)
}

function applyTileVersionToManifest(manifest) {
  const version = tileVersionFromGeneratedAt(manifest.generatedAt)
  if (!version) return

  for (const map of manifest.maps) {
    const base = String(map.tileUrlTemplate ?? '').split('?')[0]
    map.tileUrlTemplate = `${base}?v=${version}`
  }
}

function writeManifest(manifest) {
  manifest.generatedAt = new Date().toISOString()
  applyTileVersionToManifest(manifest)
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

function resolveTfwForTif(tifPath) {
  const candidates = [
    tifPath.replace(/\.tiff?$/i, '.tfw'),
    tifPath.replace(/\.tiff?$/i, '.TFW'),
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}

function resolveSourceSheets(entry) {
  const dir = join(sourceRoot, entry.id)
  if (!existsSync(dir)) return []

  if (entry.sourceGlob) {
    const prefix = entry.sourceGlob.includes('*') ? entry.sourceGlob.split('*')[0] : ''
    const suffix = entry.sourceGlob.includes('*')
      ? entry.sourceGlob.slice(entry.sourceGlob.indexOf('*') + 1)
      : entry.sourceGlob

    return readdirSync(dir)
      .filter((name) => /\.tiff?$/i.test(name))
      .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((name) => join(dir, name))
  }

  const single = resolveSourceTif(entry)
  return single ? [single] : []
}

function resolveSourceTfw(entry, tifPath) {
  const fromPair = resolveTfwForTif(tifPath)
  if (fromPair) return fromPair

  const base = entry.sourceBasename
  const dir = dirname(tifPath)
  const candidates = [
    join(dir, `${base}.tfw`),
    join(dir, `${base}.TFW`),
    join(dir, `${base}.tifw`),
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}

function buildSourceVrt(entry, sheetPaths) {
  if (sheetPaths.length === 1) return sheetPaths[0]

  mkdirSync(buildDir, { recursive: true })
  const vrtPath = join(buildDir, `${entry.id}-source.vrt`)
  run(
    'gdalbuildvrt',
    ['-overwrite', '-allow_projection_difference', vrtPath, ...sheetPaths],
    `Mosaic ${entry.id} (${sheetPaths.length} sheets)`,
  )
  return vrtPath
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

function expandPaletteToRgbIfNeeded(sourcePath, label) {
  const info = gdalJson([sourcePath])
  const hasPalette = info.bands?.some((band) => band.colorInterpretation === 'Palette')
  if (!hasPalette) return sourcePath

  const rgbPath = sourcePath.replace(/\.tif$/i, '-rgb.tif')
  if (existsSync(rgbPath)) rmSync(rgbPath)
  run(
    'gdal_translate',
    [
      '-expand',
      'rgb',
      '-co',
      'COMPRESS=DEFLATE',
      '-co',
      'TILED=YES',
      sourcePath,
      rgbPath,
    ],
    `${label}: expand palette → RGB`,
  )
  return rgbPath
}

function buildMap(entry, manifest, processes, optimize) {
  const sheetPaths = resolveSourceSheets(entry)
  if (!sheetPaths.length) {
    console.warn(`Skip ${entry.id}: no GeoTIFF sheets in ${join(sourceRoot, entry.id)}`)
    return false
  }

  for (const tifPath of sheetPaths) {
    const tfwPath = resolveSourceTfw(entry, tifPath)
    if (!tfwPath) {
      console.warn(`Skip ${entry.id}: missing .tfw for ${tifPath}`)
      return false
    }
  }

  const tifPath = buildSourceVrt(entry, sheetPaths)

  mkdirSync(buildDir, { recursive: true })
  const warpedPath = join(buildDir, `${entry.id}-3857.tif`)
  const outputDir = join(tilesRoot, entry.id)

  run(
    'gdalwarp',
    [
      '-s_srs',
      'EPSG:2326',
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

  const tileSourcePath = expandPaletteToRgbIfNeeded(warpedPath, entry.id)

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
      tileSourcePath,
      outputDir,
    ],
    `Tile ${entry.id} z${min}–${max}`,
  )

  optimizePngTiles(outputDir, { enabled: optimize })

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

function collectPngPaths(dir) {
  const paths = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      paths.push(...collectPngPaths(entryPath))
    } else if (entry.name.endsWith('.png')) {
      paths.push(entryPath)
    }
  }
  return paths
}

function hasCommand(cmd) {
  return spawnSync('which', [cmd], { encoding: 'utf8' }).status === 0
}

function optimizePngTiles(dir, { enabled }) {
  if (!enabled) return

  const pngs = collectPngPaths(dir)
  if (!pngs.length) return

  if (hasCommand('oxipng')) {
    const chunkSize = 64
    console.log(`\n→ Optimizing ${pngs.length} PNG tiles with oxipng`)
    for (let i = 0; i < pngs.length; i += chunkSize) {
      const chunk = pngs.slice(i, i + chunkSize)
      run(
        'oxipng',
        ['-o', '4', '--strip', 'safe', ...chunk],
        `oxipng ${i + 1}–${Math.min(i + chunk.length, pngs.length)} / ${pngs.length}`,
      )
    }
    return
  }

  if (hasCommand('pngquant')) {
    console.log(`\n→ Optimizing ${pngs.length} PNG tiles with pngquant`)
    run(
      'pngquant',
      ['--force', '--ext', '.png', '--quality', '65-90', '--speed', '1', ...pngs],
      'pngquant tile compression',
    )
    return
  }

  console.warn(
    'Skipping tile optimization: install oxipng (brew install oxipng) or pngquant (brew install pngquant)',
  )
}

function discoverBuildableIds() {
  return HISTORICAL_MAP_CATALOG.filter((entry) => {
    const sheets = resolveSourceSheets(entry)
    return sheets.length > 0 && sheets.every((tifPath) => resolveSourceTfw(entry, tifPath))
  }).map((e) => e.id)
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
    {
      id: 'kowloon-1947',
      basename: 'HIST-HD28-1947',
      dirs: ['/Users/coolsunwind/Downloads/Kowloon-Peninsula-(Batch-1)'],
    },
    {
      id: 'kowloon-1963',
      basename: 'HIST-HD25-1963',
      dirs: ['/Users/coolsunwind/Downloads/Kowloon-Peninsula-(Batch-1)'],
    },
    {
      id: 'kowloon-1892',
      basename: 'HIST-HG11-1892',
      dirs: ['/Users/coolsunwind/Downloads/Kowloon-Peninsula-(Batch-2)'],
    },
    {
      id: 'kowloon-1970',
      basename: 'HIST-HE08-1970',
      dirs: ['/Users/coolsunwind/Downloads/Kowloon-Peninsula-(Batch-2)'],
    },
    {
      id: 'victoria-1897',
      glob: 'HH45_*-1897',
      dirs: ['/Users/coolsunwind/Downloads/1897-Hong-Kong-Map'],
    },
    {
      id: 'central-1938',
      basename: 'HIST-HG36-1938',
      dirs: ['/Users/coolsunwind/Downloads/Central-(1938)'],
    },
    {
      id: 'shatin-1904',
      basename: 'HIST-HD12A-1904',
      dirs: ['/Users/coolsunwind/Downloads/Sha-Tin-(1904)'],
    },
    {
      id: 'wanchai-1947',
      basename: 'HIST-HD30-1947',
      dirs: ['/Users/coolsunwind/Downloads/Wan-Chai-(1947)'],
    },
    {
      id: 'tsuenwan-1958',
      basename: 'HIST-HG41-1958',
      dirs: ['/Users/coolsunwind/Downloads/Tsuen-Wan-(1958)'],
    },
  ]

  for (const item of downloads) {
    const targetDir = join(sourceRoot, item.id)
    mkdirSync(targetDir, { recursive: true })
    for (const dir of item.dirs) {
      if (!existsSync(dir)) continue
      if (item.glob) {
        const pattern = new RegExp(`^${item.glob.replace(/\*/g, '.*')}\\.(tif|tiff|tfw)$`, 'i')
        for (const name of readdirSync(dir)) {
          if (!pattern.test(name)) continue
          const destName = name.replace(/\.tiff$/i, '.tif')
          copyFileSync(join(dir, name), join(targetDir, destName))
        }
        continue
      }
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
    if (buildMap(entry, manifest, opts.processes, opts.optimize)) built += 1
  }

  writeManifest(manifest)
  console.log(`\nDone. Built ${built} map(s). Manifest: ${manifestPath}`)
}

main()
