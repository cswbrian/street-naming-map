import { readFile } from 'node:fs/promises'
import { makeStreetKey, normalizeStreetName } from './street-naming-core.mjs'

const normalize = (value) => String(value ?? '').trim()

export function toRoadKey(en, zh, code) {
  const streetCode = normalize(code)
  if (streetCode) return `code:${streetCode}`
  const enNorm = normalizeStreetName(en)
  const zhNorm = normalize(zh)
  if (enNorm || zhNorm) return `name:${enNorm}|${zhNorm}`
  return null
}

/** Map CSV header variants to canonical field names */
const HEADER_ALIASES = {
  street_code: ['street code', 'street_code', 'streetcode', '街道編號', '街道编号'],
  english_name: ['english street name', 'english_name', 'english name', '英文街道名稱', '英文街道名称'],
  chinese_name: ['chinese street name', 'chinese_name', 'chinese name', '中文街道名稱', '中文街道名称'],
  naming_date: [
    'proposed naming date',
    'naming date',
    'naming_date',
    'publication_date',
    '建議命名日期',
    '命名日期',
  ],
  gazette_url: ['gazette url', 'gazette_url', 'government_notice_url', '憲報連結', '宪报链接'],
  gazette_notice_label: ['gazette notice label', 'notice label', 'notice_no', 'g.n.', '憲報公告'],
  remarks: ['remarks', '備註', '备注', 'submitter_remarks'],
  status: ['status', '狀態', '状态'],
  submission_id: ['submission_id', 'submission id'],
  timestamp: ['timestamp', '時間戳記', '时间戳记'],
  proof_type: ['proof type', 'proof_type'],
}

function normalizeHeader(header) {
  return normalize(header).toLowerCase()
}

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return []

  const parseRow = (line) => {
    const cells = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    cells.push(current.trim())
    return cells
  }

  const headers = parseRow(lines[0]).map(normalizeHeader)
  const fieldIndex = new Map()

  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.some((a) => h === a || h.includes(a)))
    if (idx >= 0) fieldIndex.set(canonical, idx)
  }

  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseRow(lines[i])
    if (!cells.some((c) => c)) continue
    const row = {}
    for (const [canonical, idx] of fieldIndex.entries()) {
      row[canonical] = cells[idx] ?? ''
    }
    rows.push(row)
  }
  return rows
}

export function normalizeStatus(value) {
  const text = normalize(value).toLowerCase()
  if (text === 'approved' || text === 'approve') return 'approved'
  if (text === 'rejected' || text === 'reject') return 'rejected'
  if (text === 'pending' || text === '' || text === 'submitted') return 'pending'
  return 'pending'
}

export function normalizeNamingDate(value) {
  const text = normalize(value)
  if (!text) return null
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`
  }
  const ymd = text.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/)
  if (ymd) {
    return `${ymd[1]}-${String(ymd[2]).padStart(2, '0')}-${String(ymd[3]).padStart(2, '0')}`
  }
  // Google Sheets / HK locale: DD/MM/YYYY (e.g. 28/05/1909)
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`
  }
  return null
}

export function isEmptySheetRow(row) {
  const status = normalize(row.status)
  const hasName = normalize(row.english_name) || normalize(row.chinese_name) || normalize(row.street_code)
  return !hasName && !status
}

export async function loadPendingRoadKeys(projectRoot) {
  const path = `${projectRoot}/public/data/master/pending-naming-years.json`
  try {
    const data = JSON.parse(await readFile(path, 'utf8'))
    const map = new Map()
    for (const road of data.roads ?? []) {
      if (road.road_key) map.set(road.road_key, road)
      const code = normalize(road.street_code)
      if (code) map.set(`code:${code}`, road)
      const rk = toRoadKey(road.english_name, road.chinese_name, code)
      if (rk) map.set(rk, road)
    }
    return map
  } catch {
    return new Map()
  }
}

function roadsByCode(pendingMap) {
  const list = []
  for (const [roadKey, road] of pendingMap.entries()) {
    if (!roadKey.startsWith('code:')) continue
    list.push({ roadKey, road })
  }
  return list
}

/**
 * Resolve a batch row to pending-naming-years road_key (code:…).
 * English names repeat often (e.g. Wing Yip Street → 榮業街 / 永業街); prefer street_code or Chinese.
 */
export function matchRowToRoadKey(row, pendingMap) {
  const code = normalize(row.street_code)
  if (code && pendingMap.has(`code:${code}`)) return `code:${code}`

  const zh = normalize(row.chinese_name)
  const en = normalizeStreetName(row.english_name)
  const roads = roadsByCode(pendingMap)

  if (zh) {
    const zhHits = roads.filter(({ road }) => normalize(road.chinese_name) === zh)
    const zhEnHits = en
      ? zhHits.filter(({ road }) => normalizeStreetName(road.english_name) === en)
      : zhHits
    if (zhEnHits.length === 1) return zhEnHits[0].roadKey
    if (zhEnHits.length > 1) return null
    if (!en && zhHits.length === 1) return zhHits[0].roadKey
    if (!en && zhHits.length > 1) return null
  }

  if (en) {
    const enHits = roads.filter(({ road }) => normalizeStreetName(road.english_name) === en)
    if (enHits.length === 1) return enHits[0].roadKey
    if (enHits.length > 1) return null
  }

  const direct = toRoadKey(row.english_name, row.chinese_name, code)
  if (direct && pendingMap.has(direct)) return direct

  const streetKey = makeStreetKey(row.english_name, row.chinese_name)
  if (streetKey !== '|') {
    for (const { roadKey, road } of roads) {
      if (makeStreetKey(road.english_name, road.chinese_name) === streetKey) {
        return road.road_key ?? roadKey
      }
    }
  }

  if (code) return `code:${code}`
  return null
}
