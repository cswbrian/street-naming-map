/**
 * @typedef {Object} HistoricalMapCatalogEntry
 * @property {string} id
 * @property {number} year
 * @property {string} labelEn
 * @property {string} labelZh
 * @property {string} scale
 * @property {keyof typeof import('../config/historicalMaps.mjs').HISTORICAL_MAP_COVERAGE} coverage
 * @property {string} sourceBasename Single-sheet LandsD basename (without extension)
 * @property {string} [sourceGlob] Optional glob for multi-sheet maps (e.g. `HH45_*-1897.tif`)
 * @property {{ min: number, max: number }} tileZoom
 */

/**
 * @typedef {Object} HistoricalMapManifestEntry
 * @property {string} id
 * @property {number} year
 * @property {string} labelEn
 * @property {string} labelZh
 * @property {string} scale
 * @property {string} coverage
 * @property {string} tileUrlTemplate
 * @property {number} minZoom
 * @property {number} maxZoom
 * @property {[[number, number], [number, number]]} bounds WGS84 [[west,south],[east,north]]
 * @property {string} attribution
 */

/**
 * @typedef {Object} HistoricalMapManifest
 * @property {string} generatedAt ISO timestamp
 * @property {HistoricalMapManifestEntry[]} maps
 */

export {}
