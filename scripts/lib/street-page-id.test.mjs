import test from 'node:test'
import assert from 'node:assert/strict'
import { buildStreetPageId, isValidPageId } from './street-page-id.mjs'

test('buildStreetPageId prefers code and english slug', () => {
  const used = new Set()
  const id = buildStreetPageId(
    {
      streetCode: '10003',
      streetNameEn: 'A Kung Ngam Road',
      streetNameZh: '阿公岩道',
    },
    used,
  )
  assert.equal(id, '10003-a-kung-ngam-road')
  assert.equal(isValidPageId(id), true)
})

test('buildStreetPageId uses hash for zh-only streets', () => {
  const used = new Set()
  const id = buildStreetPageId(
    {
      streetNameEn: '',
      streetNameZh: '仁東里',
      eventIds: ['crowd|example-event'],
    },
    used,
  )
  assert.match(id, /^tl-[a-f0-9]{8}$/)
})
