import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DISTRICT_OPTIONS } from '../src/config/regions.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const OUTPUT_PATH = path.resolve(__dirname, '../src/config/subdistrictCenters.json')
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

function buildSubdistrictList() {
  const result = []

  DISTRICT_OPTIONS.forEach((district) => {
    district.subDistricts.forEach((subDistrict, index) => {
      result.push({
        id: `${district.id}-${index}`,
        label: subDistrict,
        districtName: `${district.nameEn} (${district.nameZh})`,
      })
    })
  })

  return result
}

function buildQuery(item) {
  const subdistrictName = item.label.split(' (')[0]
  const districtName = item.districtName.split(' (')[0]
  return `${subdistrictName}, ${districtName}, Hong Kong`
}

async function geocodeItem(item) {
  const query = buildQuery(item)
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'hk-street-naming-map/1.0 (one-off geocoding script)',
    },
  })

  if (!response.ok) {
    console.warn(`Failed to geocode "${item.id}" (${response.status})`)
    return null
  }

  const data = await response.json()
  if (!Array.isArray(data) || data.length === 0) {
    console.warn(`No results for "${item.id}" (${query})`)
    return null
  }

  const first = data[0]
  const lng = Number(first.lon)
  const lat = Number(first.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    console.warn(`Invalid coordinates for "${item.id}"`)
    return null
  }

  return [lng, lat]
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const subdistricts = buildSubdistrictList()
  console.log(`Geocoding ${subdistricts.length} sub-districts...`)

  const centers = {}
  let successCount = 0

  for (let i = 0; i < subdistricts.length; i += 1) {
    const item = subdistricts[i]
    console.log(`[${i + 1}/${subdistricts.length}] Geocoding ${item.id} - ${item.label}`)

    try {
      const center = await geocodeItem(item)
      if (center) {
        centers[item.id] = center
        successCount += 1
      }
    } catch (error) {
      console.error(`Error geocoding "${item.id}":`, error?.message ?? error)
    }

    // Be nice to Nominatim: at most 1 request per second.
    await delay(1100)
  }

  const sortedEntries = Object.entries(centers).sort(([a], [b]) => a.localeCompare(b))
  const sortedObject = Object.fromEntries(sortedEntries)

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(sortedObject, null, 2)}\n`, 'utf8')

  console.log(`\nDone. Successfully geocoded ${successCount}/${subdistricts.length} sub-districts.`)
  console.log(`Output written to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error('Fatal error during geocoding run:', error)
  process.exitCode = 1
})

