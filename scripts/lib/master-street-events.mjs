import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { pipelinePaths, projectRoot } from './data-paths.mjs'
import { eventDedupeKey } from './street-naming-core.mjs'

export const MASTER_STREET_EVENTS_PATH = pipelinePaths.streetEvents

/** @deprecated alias */
export const COMBINED_EVENTS_PATH = MASTER_STREET_EVENTS_PATH

export function sortMasterEvents(events) {
  return [...events].toSorted((a, b) => {
    const dateCmp = String(a.publication_date ?? '').localeCompare(String(b.publication_date ?? ''))
    if (dateCmp !== 0) return dateCmp
    return String(a.event_id ?? '').localeCompare(String(b.event_id ?? ''))
  })
}

export function normalizeMasterEvents(raw) {
  if (Array.isArray(raw)) return sortMasterEvents(raw)
  if (raw && typeof raw === 'object' && Array.isArray(raw.events)) {
    return sortMasterEvents(raw.events)
  }
  return []
}

export async function loadMasterEvents(options = {}) {
  const filePath = options.path ?? MASTER_STREET_EVENTS_PATH
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8'))
    return normalizeMasterEvents(raw)
  } catch (error) {
    if (error?.code === 'ENOENT' && options.fallbackPath) {
      const raw = JSON.parse(await readFile(options.fallbackPath, 'utf8'))
      return normalizeMasterEvents(raw)
    }
    if (options.allowMissing) return []
    throw error
  }
}

export async function saveMasterEvents(events, options = {}) {
  const filePath = options.path ?? MASTER_STREET_EVENTS_PATH
  const sorted = sortMasterEvents(events)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        schema_version: 1,
        updated_at: new Date().toISOString(),
        events: sorted,
      },
      null,
      2,
    )}\n`,
  )
  return sorted
}

/** Master rows win; incoming lists only add events with new dedupe keys. */
export function mergeMasterEvents(masterEvents, ...incomingLists) {
  const merged = new Map()
  for (const event of masterEvents) {
    merged.set(eventDedupeKey(event), event)
  }
  for (const list of incomingLists) {
    for (const event of list) {
      const key = eventDedupeKey(event)
      if (!merged.has(key)) merged.set(key, event)
    }
  }
  return sortMasterEvents([...merged.values()])
}

/** Insert new events or replace by event_id. Skips incoming rows that duplicate an existing dedupe key. */
export function upsertMasterEvents(masterEvents, incoming) {
  let events = [...masterEvents]
  for (const event of incoming) {
    if (!event || typeof event !== 'object') continue
    const id = String(event.event_id ?? '').trim()
    const idIdx = id ? events.findIndex((row) => row.event_id === id) : -1
    if (idIdx >= 0) {
      events[idIdx] = { ...events[idIdx], ...event }
      continue
    }
    const dedupe = eventDedupeKey(event)
    if (!events.some((row) => eventDedupeKey(row) === dedupe)) {
      events.push(event)
    }
  }
  return sortMasterEvents(events)
}

export function patchMasterEventById(events, eventId, patch) {
  let found = false
  const next = events.map((event) => {
    if (event.event_id !== eventId) return event
    found = true
    return { ...event, ...patch }
  })
  return { events: sortMasterEvents(next), found }
}

export function removeMasterEventById(events, eventId) {
  const before = events.length
  const next = events.filter((event) => event.event_id !== eventId)
  return { events: sortMasterEvents(next), removed: before - next.length }
}

/** Resolve events for a centreline code via street-centreline-map.json (preferred). */
export function findMasterEventsByStreetCode(events, streetCode, centrelineMap) {
  const code = String(streetCode ?? '').trim()
  if (!code) return []

  const links = centrelineMap?.links ?? []
  const link = links.find((row) => String(row.street_code ?? '').trim() === code)
  if (link?.event_ids?.length) {
    const ids = new Set(link.event_ids.map(String))
    return events.filter((event) => ids.has(String(event.event_id ?? '')))
  }

  return events.filter((event) => String(event.street_code ?? '').trim() === code)
}

export async function appendMasterEvents(incoming, options = {}) {
  const events = await loadMasterEvents({ allowMissing: options.allowMissing })
  const before = events.length
  const next = upsertMasterEvents(events, incoming)
  await saveMasterEvents(next, options)
  return next.length - before
}

export async function patchMasterEventsByDate(publicationDate, patchFn) {
  const events = await loadMasterEvents()
  let patched = 0
  const next = events.map((event) => {
    if (event.publication_date !== publicationDate) return event
    patchFn(event)
    patched += 1
    return event
  })
  if (patched) await saveMasterEvents(next)
  return patched
}

export async function updateMasterEventUrls(stemMap) {
  const events = await loadMasterEvents()
  let updated = 0

  for (const event of events) {
    const noticeNo = String(event.notice_no ?? '').replace(/^GN/i, '')
    let stemEntry = null
    for (const entry of stemMap.values()) {
      if (entry.notice_no === noticeNo) {
        stemEntry = entry
        break
      }
    }
    if (!stemEntry) {
      const submissionId = String(event.submission_id ?? '')
      const batchHint = submissionId.match(/(\d{4}-gn\d+)/i)?.[1]
      if (batchHint) {
        for (const entry of stemMap.values()) {
          if (entry.batch_ids?.has(batchHint)) {
            stemEntry = entry
            break
          }
        }
      }
    }
    if (!stemEntry) continue

    const nextEn = stemEntry.urls.en
    const nextZh = stemEntry.urls.zh
    if (nextEn !== event.government_notice_url_en || nextZh !== event.government_notice_url_zh) {
      event.government_notice_url_en = nextEn
      event.government_notice_url_zh = nextZh
      event.notice_stem = stemEntry.stem
      updated += 1
    }
  }

  if (updated) await saveMasterEvents(events)
  return updated
}

export async function loadMasterEventsBySource(source, options = {}) {
  const events = await loadMasterEvents(options)
  return events.filter((event) => event.source === source)
}

/** One-time: read legacy flat combined file if master is missing. */
export async function loadMasterEventsWithLegacyFallback() {
  try {
    return await loadMasterEvents()
  } catch {
    const legacyCombined = path.join(projectRoot, 'data', 'master', 'street-events-combined.json')
    return loadMasterEvents({ path: legacyCombined, allowMissing: true })
  }
}
