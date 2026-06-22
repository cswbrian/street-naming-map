import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getTimelineEventTypeKey, getTimelineEventTypeLabel } from './mapSurfaceDisplay.js'

function entry(overrides) {
  return {
    change_kind: 'declare',
    event_role: 'current_name',
    evidence_kind: 'gazette_primary',
    is_declaration_event: true,
    ...overrides,
  }
}

describe('getTimelineEventTypeKey', () => {
  it('maps declare + current_name to declare', () => {
    const row = entry()
    assert.equal(getTimelineEventTypeKey(row, [row]), 'declare')
  })

  it('maps rename + current_name with prior row to rename', () => {
    const former = entry({ event_role: 'former_name', change_kind: 'declare' })
    const rename = entry({ change_kind: 'rename' })
    assert.equal(getTimelineEventTypeKey(rename, [former, rename]), 'rename')
  })

  it('maps sole rename + current_name to declare', () => {
    const rename = entry({ change_kind: 'rename' })
    assert.equal(getTimelineEventTypeKey(rename, [rename]), 'declare')
  })

  it('maps mention evidence to earliest_mention', () => {
    const row = entry({
      event_role: 'former_name',
      evidence_kind: 'gazette_mention',
      is_declaration_event: false,
    })
    assert.equal(getTimelineEventTypeKey(row, [row]), 'earliest_mention')
  })

  it('maps is_declaration_event false + gazette_primary to declare', () => {
    const row = entry({ is_declaration_event: false })
    assert.equal(getTimelineEventTypeKey(row, [row]), 'declare')
  })

  it('maps extend to extend', () => {
    const row = entry({ change_kind: 'extend' })
    assert.equal(getTimelineEventTypeKey(row, [row]), 'extend')
  })

  it('maps built role to built', () => {
    const row = entry({ event_role: 'built', change_kind: 'declare' })
    assert.equal(getTimelineEventTypeKey(row, [row]), 'built')
  })

  it('maps name_removed role to name_removed', () => {
    const row = entry({ event_role: 'name_removed', change_kind: 'delete' })
    assert.equal(getTimelineEventTypeKey(row, [row]), 'name_removed')
  })

  it('maps former_name to former_name', () => {
    const row = entry({ event_role: 'former_name' })
    assert.equal(getTimelineEventTypeKey(row, [row]), 'former_name')
  })

  it('maps gazette_inferred rename with prior row to rename', () => {
    const former = entry({ event_role: 'former_name' })
    const rename = entry({
      change_kind: 'rename',
      evidence_kind: 'gazette_inferred',
      is_declaration_event: false,
    })
    assert.equal(getTimelineEventTypeKey(rename, [former, rename]), 'rename')
  })

  it('maps key to localized label', () => {
    const labels = { eventTypeDeclare: 'Declare', eventTypeRename: 'Rename' }
    const row = entry()
    assert.equal(getTimelineEventTypeLabel(row, labels, [row]), 'Declare')
  })
})
