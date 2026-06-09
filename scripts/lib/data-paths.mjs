import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const projectRoot = path.resolve(__dirname, '../..')

/** Pipeline / merge artifacts — not served to the browser. */
export const PIPELINE_MASTER_DIR = path.join(projectRoot, 'data', 'master')

/** JSON consumed by the static site. */
export const PUBLIC_MASTER_DIR = path.join(projectRoot, 'public', 'data', 'master')

export const pipelinePaths = {
  /** Single source of truth: all street naming events. */
  streetEvents: path.join(PIPELINE_MASTER_DIR, 'street-events.json'),
  /** Links event timelines to LandsD STREETCODE (hand-edited). */
  streetCentrelineMap: path.join(PIPELINE_MASTER_DIR, 'street-centreline-map.json'),
  combinedQa: path.join(PIPELINE_MASTER_DIR, 'combined-naming-qa.json'),
}

export const publicPaths = {
  geojson: path.join(projectRoot, 'public', 'data', 'hk-streets.geojson'),
  verifiedRoads: path.join(PUBLIC_MASTER_DIR, 'verified-roads.json'),
  pendingRoads: path.join(PUBLIC_MASTER_DIR, 'pending-roads.json'),
  pendingCsv: path.join(PUBLIC_MASTER_DIR, 'pending-naming-years.csv'),
  streetTimelines: path.join(PUBLIC_MASTER_DIR, 'street-timelines.json'),
  unmappedEvents: path.join(PUBLIC_MASTER_DIR, 'unmapped-events.json'),
  noticeStems: path.join(PUBLIC_MASTER_DIR, 'egazette-notice-stems.json'),
  pdfLocales: path.join(PUBLIC_MASTER_DIR, 'egazette-pdf-locales.json'),
}
