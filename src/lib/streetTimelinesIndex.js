import { buildRoadKey } from './roadKey.js'

export function buildStreetTimelinesIndex(timelines) {
  const byPageId = new Map()
  const byCode = new Map()
  const byRoadKey = new Map()

  for (const row of timelines ?? []) {
    const pageId = String(row.page_id ?? '').trim()
    if (pageId) byPageId.set(pageId, row)

    const code = String(row.street_code ?? '').trim()
    if (code) byCode.set(code, row)

    const roadKey = buildRoadKey(row.street_name_en, row.street_name_zh, row.street_code)
    if (roadKey) byRoadKey.set(roadKey, row)
  }

  return { byPageId, byCode, byRoadKey }
}

export function resolveTimelineFromRoadKey(index, roadKey) {
  if (!index || !roadKey) return null
  const direct = index.byRoadKey.get(roadKey)
  if (direct) return direct
  if (roadKey.startsWith('code:')) {
    return index.byCode.get(roadKey.slice(5)) ?? null
  }
  return null
}
