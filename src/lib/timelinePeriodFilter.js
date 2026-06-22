import { PERIOD_GROUP_DEFS } from './periodGroups.js'

const normalize = (value) => String(value ?? '').trim()

export function getEventYearFromDate(date) {
  const text = normalize(date)
  const match = text.match(/^(\d{4})/)
  if (!match) return null
  const year = Number(match[1])
  return Number.isFinite(year) && year > 0 ? year : null
}

export function getTimelineEventYears(row) {
  const history = row?.name_history
  if (!Array.isArray(history)) return []
  const years = new Set()
  for (const entry of history) {
    const year = getEventYearFromDate(entry?.date)
    if (year) years.add(year)
  }
  return [...years]
}

export function getTimelinePeriodGroupIdForYear(year) {
  if (!Number.isFinite(year)) return 'unknown'
  const matched = PERIOD_GROUP_DEFS.find(
    (group) =>
      group.id !== 'unknown' && year >= Number(group.start) && year <= Number(group.end),
  )
  return matched?.id ?? 'unknown'
}

/** True when the row has at least one name_history event in the period. */
export function timelineRowMatchesPeriod(row, periodId) {
  if (!periodId) return true
  const years = getTimelineEventYears(row)
  if (periodId === 'unknown') return years.length === 0
  return years.some((year) => getTimelinePeriodGroupIdForYear(year) === periodId)
}

/** Count rows per period; rows with events in multiple decades appear in each matching period. */
export function buildTimelinePeriodCounts(rows) {
  const counts = new Map(PERIOD_GROUP_DEFS.map((group) => [group.id, 0]))
  for (const row of rows) {
    const years = getTimelineEventYears(row)
    if (!years.length) {
      counts.set('unknown', (counts.get('unknown') ?? 0) + 1)
      continue
    }
    const matchedPeriods = new Set(years.map((year) => getTimelinePeriodGroupIdForYear(year)))
    for (const periodId of matchedPeriods) {
      counts.set(periodId, (counts.get(periodId) ?? 0) + 1)
    }
  }
  return counts
}
