import { getPeriodLabel, PERIOD_GROUP_DEFS } from './periodGroups.js'

export function getPeriodGroupById(periodId) {
  return PERIOD_GROUP_DEFS.find((group) => group.id === periodId) ?? null
}

export function getPeriodLabelForId(periodId, locale) {
  const group = getPeriodGroupById(periodId)
  if (!group) return String(periodId ?? '')
  return getPeriodLabel(group, locale)
}
