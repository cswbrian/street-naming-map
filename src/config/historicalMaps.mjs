/**
 * LandsD historical map catalog (CSDI open data).
 * Source GeoTIFF + .tfw pairs live under data/historical-maps/source/{id}/ (gitignored).
 * Built XYZ tiles are emitted to public/historical-maps/{id}/ by scripts/build-historical-map-tiles.mjs.
 */

export const HISTORICAL_MAP_COVERAGE = {
  territory: { labelEn: 'Hong Kong Full', labelZh: '香港全境' },
  hongKongIsland: { labelEn: 'Hong Kong Island', labelZh: '香港島' },
  kowloon: { labelEn: 'Kowloon', labelZh: '九龍' },
  newTerritories: { labelEn: 'New Territories', labelZh: '新界' },
}

export const HISTORICAL_MAP_GROUP_ORDER = [
  'territory',
  'hongKongIsland',
  'kowloon',
  'newTerritories',
]

/** @type {import('../lib/historicalMapTypes.js').HistoricalMapCatalogEntry[]} */
export const HISTORICAL_MAP_CATALOG = [
  {
    id: 'victoria-1889',
    year: 1889,
    labelEn: 'Plan of Victoria (1889)',
    labelZh: '維多利亞城圖 (1889)',
    scale: '1:2,500',
    coverage: 'hongKongIsland',
    sourceBasename: 'HIST-VIC-1889',
    tileZoom: { min: 12, max: 17 },
  },
  {
    id: 'victoria-1897',
    year: 1897,
    labelEn: 'Victoria Hong Kong (1897)',
    labelZh: '維多利亞城 (1897)',
    scale: '1:2,500',
    coverage: 'hongKongIsland',
    sourceBasename: 'HH45',
    sourceGlob: 'HH45_*-1897.tif',
    tileZoom: { min: 12, max: 17 },
  },
  {
    id: 'kowloon-1892',
    year: 1892,
    labelEn: 'Kowloon Peninsula (1892)',
    labelZh: '九龍半島 (1892)',
    scale: '1:10,000',
    coverage: 'kowloon',
    sourceBasename: 'HIST-HG11-1892',
    tileZoom: { min: 11, max: 16 },
  },
  {
    id: 'shatin-1904',
    year: 1904,
    labelEn: 'Sha Tin (1904)',
    labelZh: '沙田 (1904)',
    scale: '1:20,000',
    coverage: 'newTerritories',
    sourceBasename: 'HIST-HD12A-1904',
    tileZoom: { min: 11, max: 16 },
  },
  {
    id: 'hk-1927',
    year: 1927,
    labelEn: 'Hong Kong (1927)',
    labelZh: '香港 (1927)',
    scale: '1:100,000',
    coverage: 'territory',
    sourceBasename: 'HIST-HA25-1927',
    tileZoom: { min: 9, max: 14 },
  },
  {
    id: 'central-1938',
    year: 1938,
    labelEn: 'Central (1938)',
    labelZh: '中環 (1938)',
    scale: '1:2,500',
    coverage: 'hongKongIsland',
    sourceBasename: 'HIST-HG36-1938',
    tileZoom: { min: 12, max: 17 },
  },
  {
    id: 'wanchai-1947',
    year: 1947,
    labelEn: 'Wan Chai (1947)',
    labelZh: '灣仔 (1947)',
    scale: '1:2,500',
    coverage: 'hongKongIsland',
    sourceBasename: 'HIST-HD30-1947',
    tileZoom: { min: 12, max: 17 },
  },
  {
    id: 'kowloon-1947',
    year: 1947,
    labelEn: 'Kowloon Peninsula (1947)',
    labelZh: '九龍半島 (1947)',
    scale: '1:10,000',
    coverage: 'kowloon',
    sourceBasename: 'HIST-HD28-1947',
    tileZoom: { min: 11, max: 16 },
  },
  {
    id: 'hk-1957',
    year: 1957,
    labelEn: 'Hong Kong (1957)',
    labelZh: '香港 (1957)',
    scale: '1:100,000',
    coverage: 'territory',
    sourceBasename: 'HIST-HA26-1957',
    tileZoom: { min: 9, max: 14 },
  },
  {
    id: 'tsuenwan-1958',
    year: 1958,
    labelEn: 'Tsuen Wan (1958)',
    labelZh: '荃灣 (1958)',
    scale: '1:10,000',
    coverage: 'newTerritories',
    sourceBasename: 'HIST-HG41-1958',
    tileZoom: { min: 11, max: 16 },
  },
  {
    id: 'kowloon-1963',
    year: 1963,
    labelEn: 'Kowloon Peninsula (1963)',
    labelZh: '九龍半島 (1963)',
    scale: '1:10,000',
    coverage: 'kowloon',
    sourceBasename: 'HIST-HD25-1963',
    tileZoom: { min: 11, max: 16 },
  },
  {
    id: 'kowloon-1970',
    year: 1970,
    labelEn: 'Kowloon Peninsula (1970)',
    labelZh: '九龍半島 (1970)',
    scale: '1:10,000',
    coverage: 'kowloon',
    sourceBasename: 'HIST-HE08-1970',
    tileZoom: { min: 11, max: 16 },
  },
]

export const HISTORICAL_MAP_ATTRIBUTION =
  '© Lands Department, HKSAR — Historical Maps (CSDI open data)'

export const HISTORICAL_MAP_DATASET_URL =
  'https://data.gov.hk/tc-data/dataset/hk-landsd-openmap-historical-maps'

export function getHistoricalMapById(id) {
  return HISTORICAL_MAP_CATALOG.find((entry) => entry.id === id) ?? null
}
