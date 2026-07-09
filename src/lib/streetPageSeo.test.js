import test from 'node:test'
import assert from 'node:assert/strict'
import { buildStreetPagePath, getPageIdFromPath, isStreetRoutePath } from './streetPageUrl.js'
import { buildStreetTimelinesIndex, resolveTimelineFromRoadKey } from './streetTimelinesIndex.js'

test('buildStreetPagePath encodes page id', () => {
  assert.equal(buildStreetPagePath('zh', '10003-a-kung-ngam-road'), '/zh/streets/10003-a-kung-ngam-road')
})

test('getPageIdFromPath parses street routes', () => {
  assert.equal(getPageIdFromPath('/zh/streets/bel-air-peak-avenue'), 'bel-air-peak-avenue')
  assert.equal(isStreetRoutePath('/en/streets/bel-air-peak-avenue'), true)
})

test('street timelines index resolves by code road key', () => {
  const index = buildStreetTimelinesIndex([
    {
      page_id: '10003-a-kung-ngam-road',
      street_code: '10003',
      street_name_en: 'A Kung Ngam Road',
      street_name_zh: '阿公岩道',
    },
  ])
  const row = resolveTimelineFromRoadKey(index, 'code:10003')
  assert.equal(row?.page_id, '10003-a-kung-ngam-road')
})
