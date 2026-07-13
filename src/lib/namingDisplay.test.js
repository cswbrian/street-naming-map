import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatDisplayDate, formatNamingDate } from './namingDisplay.js'
import { formatHistoryDate } from './nameHistory.js'

describe('formatNamingDate', () => {
  it('formats ISO dates as YYYY.MM.DD', () => {
    assert.equal(formatNamingDate('2024-03-15'), '2024.03.15')
    assert.equal(formatNamingDate('1923-11-02'), '1923.11.02')
  })

  it('normalizes single-digit month/day', () => {
    assert.equal(formatNamingDate('2024-3-5'), '2024.03.05')
  })

  it('accepts dot and slash separators', () => {
    assert.equal(formatNamingDate('2024.03.15'), '2024.03.15')
    assert.equal(formatNamingDate('2024/03/15'), '2024.03.15')
  })
})

describe('formatDisplayDate', () => {
  it('returns fallback for empty values', () => {
    assert.equal(formatDisplayDate(null, { fallback: '—' }), '—')
    assert.equal(formatDisplayDate('', { fallback: '—' }), '—')
  })

  it('passes through bare years', () => {
    assert.equal(formatDisplayDate('1956'), '1956')
  })
})

describe('formatHistoryDate', () => {
  it('uses YYYY.MM.DD for full dates including Jan 1', () => {
    assert.equal(formatHistoryDate('2000-01-01'), '2000.01.01')
    assert.equal(formatHistoryDate('1992-06-18'), '1992.06.18')
  })
})
