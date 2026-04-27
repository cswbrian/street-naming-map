import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const SOURCE_PATH = path.join(
  projectRoot,
  'Transportation_RoadCentreline_20260402.gdb_converted.geojson',
)
const OUTPUT_PATH = path.join(projectRoot, 'public', 'data', 'hk-streets.geojson')

const START_YEAR = 1842
const CURRENT_YEAR = new Date().getFullYear()

const randomYear = () =>
  Math.floor(Math.random() * (CURRENT_YEAR - START_YEAR + 1)) + START_YEAR

const addNamingYear = (feature) => ({
  ...feature,
  properties: {
    ...(feature.properties ?? {}),
    naming_year: randomYear(),
  },
})

async function main() {
  const raw = await readFile(SOURCE_PATH, 'utf8')
  const sourceData = JSON.parse(raw)

  if (sourceData?.type !== 'FeatureCollection' || !Array.isArray(sourceData.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection with a features array.')
  }

  const transformed = {
    ...sourceData,
    name: 'HK_Streets_MockNamingYears',
    features: sourceData.features.map(addNamingYear),
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, JSON.stringify(transformed))

  console.log(`Generated ${transformed.features.length} mock road features`)
  console.log(`Output: ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
