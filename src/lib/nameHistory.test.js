import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildRenameDisplayLines } from './nameHistory.js'

describe('buildRenameDisplayLines', () => {
  it('shows old → new for Chinese-only correction', () => {
    const lines = buildRenameDisplayLines({
      previous_name_en: 'Shelter Street',
      previous_name_zh: '舒潦濤街',
      name_en: 'Shelter Street',
      name_zh: '信德街',
    })
    assert.deepEqual(lines, [{ previous: '舒潦濤街', current: '信德街' }])
  })

  it('shows one line per language when both change', () => {
    const lines = buildRenameDisplayLines({
      previous_name_en: 'Prince Edward Road',
      previous_name_zh: '太子道',
      name_en: 'Boundary Street',
      name_zh: '界限街',
    })
    assert.deepEqual(lines, [
      { previous: '太子道', current: '界限街' },
      { previous: 'Prince Edward Road', current: 'Boundary Street' },
    ])
  })

  it('returns empty when no previous names', () => {
    assert.deepEqual(buildRenameDisplayLines({ name_en: 'Foo', name_zh: '福' }), [])
  })
})
