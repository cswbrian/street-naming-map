import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { pipelinePaths } from './data-paths.mjs'
import { isValidPageId, buildStreetPageId } from './street-page-id.mjs'

export const CENTRELINE_MAP_PATH = pipelinePaths.streetCentrelineMap

export const LINK_STATUSES = new Set(['active', 'unlinked', 'abolished', 'disputed'])

export function normalizeLink(raw) {
  if (!raw || typeof raw !== 'object') return null
  const timelineId = String(raw.timeline_id ?? '').trim()
  if (!timelineId) return null
  const status = String(raw.status ?? 'active').trim().toLowerCase()
  if (!LINK_STATUSES.has(status)) return null
  const eventIds = [...new Set((raw.event_ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))]
  const pageId = String(raw.page_id ?? '').trim() || null
  return {
    timeline_id: timelineId,
    page_id: pageId,
    street_code: raw.street_code == null || raw.street_code === '' ? null : String(raw.street_code).trim(),
    event_ids: eventIds,
    status,
    method: raw.method ?? null,
    district_hint: raw.district_hint ?? null,
    note: raw.note ?? null,
    linked_at: raw.linked_at ?? null,
    linked_by: raw.linked_by ?? null,
  }
}

export function normalizeCentrelineMap(raw) {
  if (!raw || typeof raw !== 'object') return { schema_version: 1, updated_at: null, links: [] }
  const links = (Array.isArray(raw.links) ? raw.links : []).map(normalizeLink).filter(Boolean)
  return {
    schema_version: raw.schema_version ?? 1,
    updated_at: raw.updated_at ?? null,
    links,
  }
}

export async function loadCentrelineMap(options = {}) {
  const filePath = options.path ?? CENTRELINE_MAP_PATH
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8'))
    return normalizeCentrelineMap(raw)
  } catch (error) {
    if (error?.code === 'ENOENT' && options.allowMissing) {
      return { schema_version: 1, updated_at: null, links: [] }
    }
    throw error
  }
}

export async function saveCentrelineMap(map, options = {}) {
  const filePath = options.path ?? CENTRELINE_MAP_PATH
  const normalized = normalizeCentrelineMap(map)
  await mkdir(path.dirname(filePath), { recursive: true })
  const payload = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    links: normalized.links,
  }
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`)
  return payload
}

/** event_id → link */
export function buildEventIdToLinkIndex(map) {
  const index = new Map()
  for (const link of map?.links ?? []) {
    for (const eventId of link.event_ids ?? []) {
      index.set(eventId, link)
    }
  }
  return index
}

/** street_code → active links (usually one) */
export function buildStreetCodeToLinkIndex(map) {
  const index = new Map()
  for (const link of map?.links ?? []) {
    if (link.status !== 'active') continue
    const code = String(link.street_code ?? '').trim()
    if (!code) continue
    if (!index.has(code)) index.set(code, link)
  }
  return index
}

export function collectAssignedEventIds(map) {
  const ids = new Set()
  for (const link of map?.links ?? []) {
    for (const eventId of link.event_ids ?? []) {
      ids.add(eventId)
    }
  }
  return ids
}

export function validateCentrelineMap(map) {
  const errors = []
  const warnings = []
  const seenEventIds = new Map()
  const seenTimelineIds = new Set()
  const seenPageIds = new Set()

  for (const link of map?.links ?? []) {
    if (seenTimelineIds.has(link.timeline_id)) {
      errors.push({ code: 'duplicate_timeline_id', timeline_id: link.timeline_id })
    }
    seenTimelineIds.add(link.timeline_id)

    const pageId = String(link.page_id ?? '').trim()
    if (pageId) {
      if (!isValidPageId(pageId)) {
        errors.push({ code: 'invalid_page_id', page_id: pageId, timeline_id: link.timeline_id })
      } else if (seenPageIds.has(pageId)) {
        errors.push({ code: 'duplicate_page_id', page_id: pageId })
      } else {
        seenPageIds.add(pageId)
      }
    }

    if (link.status === 'active' && !String(link.street_code ?? '').trim()) {
      warnings.push({
        code: 'active_without_code',
        timeline_id: link.timeline_id,
        message: 'active link has no street_code',
      })
    }

    for (const eventId of link.event_ids ?? []) {
      if (seenEventIds.has(eventId)) {
        errors.push({
          code: 'duplicate_event_id',
          event_id: eventId,
          timelines: [seenEventIds.get(eventId), link.timeline_id],
        })
      } else {
        seenEventIds.set(eventId, link.timeline_id)
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function enrichCentrelineLinkHints(linkHints, map, resolveNames = () => ({ en: null, zh: null })) {
  const usedPageIds = new Set(
    (map?.links ?? [])
      .map((link) => String(link.page_id ?? '').trim())
      .filter((id) => isValidPageId(id)),
  )
  const byTimeline = new Map((map?.links ?? []).map((link) => [link.timeline_id, link]))

  return (linkHints ?? []).map((raw) => {
    const existing = byTimeline.get(raw.timeline_id)
    if (existing?.page_id && isValidPageId(existing.page_id)) {
      return { ...raw, page_id: existing.page_id }
    }
    const names = resolveNames(raw)
    const pageId = buildStreetPageId(
      {
        streetCode: raw.street_code,
        streetNameEn: names.en,
        streetNameZh: names.zh,
        districtHint: raw.district_hint,
        eventIds: raw.event_ids,
      },
      usedPageIds,
    )
    return { ...raw, page_id: pageId }
  })
}

export function upsertCentrelineLinks(map, incomingLinks) {
  const byTimeline = new Map((map?.links ?? []).map((link) => [link.timeline_id, link]))
  for (const raw of incomingLinks) {
    const link = normalizeLink(raw)
    if (!link) continue
    const existing = byTimeline.get(link.timeline_id)
    if (existing) {
      const mergedIds = [...new Set([...(existing.event_ids ?? []), ...(link.event_ids ?? [])])]
      const pageId = existing.page_id ?? link.page_id ?? null
      byTimeline.set(link.timeline_id, { ...existing, ...link, page_id: pageId, event_ids: mergedIds })
    } else {
      byTimeline.set(link.timeline_id, link)
    }
  }
  return {
    schema_version: map?.schema_version ?? 1,
    updated_at: map?.updated_at ?? null,
    links: [...byTimeline.values()].toSorted((a, b) =>
      String(a.timeline_id).localeCompare(String(b.timeline_id)),
    ),
  }
}
