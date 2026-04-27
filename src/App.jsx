import { useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView'
import TimelineSlider from './components/TimelineSlider'
import './styles/app.css'

const REGION_OPTIONS = [
  { id: 'hk-island', nameEn: 'Hong Kong Island', nameZh: '港島', bbox: [114.103, 22.207, 114.292, 22.303] },
  { id: 'kowloon', nameEn: 'Kowloon', nameZh: '九龍', bbox: [114.133, 22.275, 114.247, 22.368] },
  { id: 'new-territories', nameEn: 'New Territories', nameZh: '新界', bbox: [113.835, 22.278, 114.449, 22.566] },
]

const DISTRICT_OPTIONS = [
  { id: 'central-western', nameEn: 'Central and Western', nameZh: '中西區', regionId: 'hk-island', bbox: [114.12, 22.26, 114.17, 22.295], subDistricts: ['Kennedy Town (堅尼地城)', 'Shek Tong Tsui (石塘咀)', 'Sai Ying Pun (西營盤)', 'Sheung Wan (上環)', 'Central (中環)', 'Admiralty (金鐘)', 'Mid-levels (半山區)', 'Peak (山頂)'] },
  { id: 'wan-chai', nameEn: 'Wan Chai', nameZh: '灣仔', regionId: 'hk-island', bbox: [114.163, 22.261, 114.201, 22.287], subDistricts: ['Wan Chai (灣仔)', 'Causeway Bay (銅鑼灣)', 'Happy Valley (跑馬地)', 'Tai Hang (大坑)', 'So Kon Po (掃桿埔)', "Jardine's Lookout (渣甸山)"] },
  { id: 'eastern', nameEn: 'Eastern', nameZh: '東區', regionId: 'hk-island', bbox: [114.18, 22.255, 114.294, 22.303], subDistricts: ['Tin Hau (天后)', 'Braemar Hill (寶馬山)', 'North Point (北角)', 'Quarry Bay (鰂魚涌)', 'Sai Wan Ho (西灣河)', 'Shau Kei Wan (筲箕灣)', 'Chai Wan (柴灣)', 'Siu Sai Wan (小西灣)'] },
  { id: 'southern', nameEn: 'Southern', nameZh: '南區', regionId: 'hk-island', bbox: [114.12, 22.203, 114.255, 22.275], subDistricts: ['Pok Fu Lam (薄扶林)', 'Aberdeen (香港仔)', 'Ap Lei Chau (鴨脷洲)', 'Wong Chuk Hang (黃竹坑)', 'Shouson Hill (壽臣山)', 'Repulse Bay (淺水灣)', 'Chung Hom Kok (舂磡角)', 'Stanley (赤柱)', 'Tai Tam (大潭)', 'Shek O (石澳)'] },
  { id: 'yau-tsim-mong', nameEn: 'Yau Tsim Mong', nameZh: '油尖旺', regionId: 'kowloon', bbox: [114.152, 22.294, 114.177, 22.327], subDistricts: ['Tsim Sha Tsui (尖沙咀)', 'Yau Ma Tei (油麻地)', 'West Kowloon Reclamation (西九龍填海區)', "King's Park (京士柏)", 'Mong Kok (旺角)', 'Tai Kok Tsui (大角咀)'] },
  { id: 'sham-shui-po', nameEn: 'Sham Shui Po', nameZh: '深水埗', regionId: 'kowloon', bbox: [114.138, 22.318, 114.179, 22.353], subDistricts: ['Mei Foo (美孚)', 'Lai Chi Kok (荔枝角)', 'Cheung Sha Wan (長沙灣)', 'Sham Shui Po (深水埗)', 'Shek Kip Mei (石硤尾)', 'Yau Yat Tsuen (又一村)', 'Tai Wo Ping (大窩坪)', 'Stonecutters Island (昂船洲)'] },
  { id: 'kowloon-city', nameEn: 'Kowloon City', nameZh: '九龍城', regionId: 'kowloon', bbox: [114.17, 22.304, 114.214, 22.344], subDistricts: ['Hung Hom (紅磡)', 'To Kwa Wan (土瓜灣)', 'Ma Tau Kok (馬頭角)', 'Ma Tau Wai (馬頭圍)', 'Kai Tak (啟德)', 'Kowloon City (九龍城)', 'Ho Man Tin (何文田)', 'Kowloon Tong (九龍塘)', 'Beacon Hill (筆架山)'] },
  { id: 'wong-tai-sin', nameEn: 'Wong Tai Sin', nameZh: '黃大仙', regionId: 'kowloon', bbox: [114.179, 22.329, 114.224, 22.367], subDistricts: ['San Po Kong (新蒲崗)', 'Wong Tai Sin (黃大仙)', 'Tung Tau (東頭)', 'Wang Tau Hom (橫頭磡)', 'Lok Fu (樂富)', 'Diamond Hill (鑽石山)', 'Tsz Wan Shan (慈雲山)', 'Ngau Chi Wan (牛池灣)'] },
  { id: 'kwun-tong', nameEn: 'Kwun Tong', nameZh: '觀塘', regionId: 'kowloon', bbox: [114.204, 22.294, 114.249, 22.332], subDistricts: ['Ping Shek (坪石)', 'Kowloon Bay (九龍灣)', 'Ngau Tau Kok (牛頭角)', 'Jordan Valley (佐敦谷)', 'Kwun Tong (觀塘)', 'Sau Mau Ping (秀茂坪)', 'Lam Tin (藍田)', 'Yau Tong (油塘)', 'Lei Yue Mun (鯉魚門)'] },
  { id: 'kwai-tsing', nameEn: 'Kwai Tsing', nameZh: '葵青', regionId: 'new-territories', bbox: [114.089, 22.304, 114.156, 22.384], subDistricts: ['Kwai Chung (葵涌)', 'Tsing Yi (青衣)'] },
  { id: 'tsuen-wan', nameEn: 'Tsuen Wan', nameZh: '荃灣', regionId: 'new-territories', bbox: [114.07, 22.333, 114.152, 22.404], subDistricts: ['Tsuen Wan (荃灣)', 'Lei Muk Shue (梨木樹)', 'Ting Kau (汀九)', 'Sham Tseng (深井)', 'Tsing Lung Tau (青龍頭)', 'Ma Wan (馬灣)', 'Sunny Bay (欣澳)'] },
  { id: 'tuen-mun', nameEn: 'Tuen Mun', nameZh: '屯門', regionId: 'new-territories', bbox: [113.886, 22.323, 114.052, 22.438], subDistricts: ['Tai Lam Chung (大欖涌)', 'So Kwun Wat (掃管笏)', 'Tuen Mun (屯門)', 'Lam Tei (藍地)'] },
  { id: 'yuen-long', nameEn: 'Yuen Long', nameZh: '元朗', regionId: 'new-territories', bbox: [113.895, 22.361, 114.076, 22.53], subDistricts: ['Hung Shui Kiu (洪水橋)', 'Ha Tsuen (厦村)', 'Lau Fau Shan (流浮山)', 'Tin Shui Wai (天水圍)', 'Yuen Long (元朗)', 'San Tin (新田)', 'Lok Ma Chau (落馬洲)', 'Kam Tin (錦田)', 'Shek Kong (石崗)', 'Pat Heung (八鄉)'] },
  { id: 'north', nameEn: 'North', nameZh: '北區', regionId: 'new-territories', bbox: [114.08, 22.463, 114.267, 22.568], subDistricts: ['Fanling (粉嶺)', 'Luen Wo Hui (聯和墟)', 'Sheung Shui (上水)', 'Shek Wu Hui (石湖墟)', 'Sha Tau Kok (沙頭角)', 'Luk Keng (鹿頸)', 'Wu Kau Tang (烏蛟騰)'] },
  { id: 'tai-po', nameEn: 'Tai Po', nameZh: '大埔', regionId: 'new-territories', bbox: [114.104, 22.412, 114.264, 22.525], subDistricts: ['Tai Po Market (大埔墟)', 'Tai Po (大埔)', 'Tai Po Kau (大埔滘)', 'Tai Mei Tuk (大尾篤)', 'Shuen Wan (船灣)', 'Cheung Muk Tau (樟木頭)', 'Kei Ling Ha (企嶺下)'] },
  { id: 'sha-tin', nameEn: 'Sha Tin', nameZh: '沙田', regionId: 'new-territories', bbox: [114.15, 22.356, 114.249, 22.441], subDistricts: ['Tai Wai (大圍)', 'Sha Tin (沙田)', 'Fo Tan (火炭)', 'Ma Liu Shui (馬料水)', 'Wu Kai Sha (烏溪沙)', 'Ma On Shan (馬鞍山)'] },
  { id: 'sai-kung', nameEn: 'Sai Kung', nameZh: '西貢', regionId: 'new-territories', bbox: [114.227, 22.285, 114.386, 22.452], subDistricts: ['Clear Water Bay (清水灣)', 'Sai Kung (西貢)', 'Tai Mong Tsai (大網仔)', 'Tseung Kwan O (將軍澳)', 'Hang Hau (坑口)', 'Tiu Keng Leng (調景嶺)', 'Ma Yau Tong (馬游塘)'] },
  { id: 'islands', nameEn: 'Islands', nameZh: '離島', regionId: 'new-territories', bbox: [113.835, 22.153, 114.34, 22.351], subDistricts: ['Cheung Chau (長洲)', 'Peng Chau (坪洲)', 'Lantau Island including Tung Chung (大嶼山包括東涌)', 'Lamma Island (南丫島)'] },
]

function App() {
  const currentYear = new Date().getFullYear()
  const minYear = 1842
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [isMapLoading, setIsMapLoading] = useState(true)
  const [activeRegionId, setActiveRegionId] = useState(null)
  const [activeSubDistrictId, setActiveSubDistrictId] = useState('')
  const [subDistrictCenters, setSubDistrictCenters] = useState({})
  const [roadSearch, setRoadSearch] = useState('')
  const [roadIndex, setRoadIndex] = useState([])
  const [isRoadIndexLoading, setIsRoadIndexLoading] = useState(true)
  const [activeRoadId, setActiveRoadId] = useState(null)
  const [selectedRoadKey, setSelectedRoadKey] = useState(null)
  const [clickedRoadCenter, setClickedRoadCenter] = useState(null)

  const yearRangeLabel = useMemo(
    () => `${minYear} - ${currentYear}`,
    [currentYear, minYear],
  )
  const colorGroups = [
    { id: 'g1', range: '1842-1898', color: '#5B6CFF', start: 1842, end: 1898 },
    { id: 'g2', range: '1899-1945', color: '#3FA9FF', start: 1899, end: 1945 },
    { id: 'g3', range: '1946-1969', color: '#2ED3FF', start: 1946, end: 1969 },
    { id: 'g4', range: '1970-1989', color: '#35F2C3', start: 1970, end: 1989 },
    { id: 'g5', range: '1990-2009', color: '#C6FF4D', start: 1990, end: 2009 },
    { id: 'g6', range: '2010-Now', color: '#FF5FD2', start: 2010, end: currentYear },
  ]

  const activeGroup = colorGroups.find((group) => group.id === activeGroupId) ?? null
  const filteredDistricts = useMemo(() => {
    return DISTRICT_OPTIONS.filter((district) => district.regionId === activeRegionId)
  }, [activeRegionId])
  const subDistrictOptions = useMemo(() => {
    return filteredDistricts.flatMap((district) =>
      district.subDistricts.map((subDistrict, index) => ({
        id: `${district.id}-${index}`,
        label: subDistrict,
        districtName: `${district.nameEn} (${district.nameZh})`,
        districtBbox: district.bbox,
      })),
    )
  }, [filteredDistricts])
  const activeSubDistrict = subDistrictOptions.find((item) => item.id === activeSubDistrictId) ?? null
  const activeRoad = roadIndex.find((item) => item.id === activeRoadId) ?? null
  const roadResults = useMemo(() => {
    const keyword = roadSearch.trim().toLowerCase()
    if (!keyword) return []
    return roadIndex
      .filter((item) => item.searchText.includes(keyword))
      .slice(0, 10)
  }, [roadIndex, roadSearch])
  const viewportTarget = useMemo(() => {
    if (clickedRoadCenter) {
      return { center: clickedRoadCenter, zoom: 16 }
    }
    if (activeRoad) {
      return { center: activeRoad.center, zoom: 16 }
    }
    if (activeSubDistrict) {
      const center = subDistrictCenters[activeSubDistrict.id]
      if (center) {
        return { center, zoom: 14.4 }
      }
      return null
    }
    if (activeRegionId) {
      const region = REGION_OPTIONS.find((item) => item.id === activeRegionId)
      if (region) {
        return { bbox: region.bbox, maxZoom: 12.2 }
      }
    }
    return null
  }, [activeRoad, activeSubDistrict, activeRegionId, subDistrictCenters, clickedRoadCenter])

  useEffect(() => {
    let isMounted = true
    const loadRoadIndex = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/hk-streets.geojson`)
        if (!response.ok) throw new Error('Unable to load roads data')
        const geojson = await response.json()
        const features = Array.isArray(geojson?.features) ? geojson.features : []
        const roadsMap = new Map()

        features.forEach((feature) => {
          const props = feature?.properties ?? {}
          const en = String(props.ENGLISHSTREETNAME ?? '').trim()
          const zh = String(props.CHINESESTREETNAME ?? '').trim()
          if (!en && !zh) return

          const key = `${en}|${zh}`
          const namingYear = Number(props.naming_year)
          const year = Number.isFinite(namingYear) ? namingYear : null
          const coords = feature?.geometry?.coordinates
          const firstCoord =
            Array.isArray(coords) && Array.isArray(coords[0]) && coords[0].length >= 2
              ? coords[0]
              : null
          if (!firstCoord) return

          if (!roadsMap.has(key)) {
            roadsMap.set(key, {
              id: key,
              enName: en,
              zhName: zh,
              year,
              center: [Number(firstCoord[0]), Number(firstCoord[1])],
              count: 1,
              searchText: `${en} ${zh}`.toLowerCase(),
            })
            return
          }

          const existing = roadsMap.get(key)
          existing.center = [
            (existing.center[0] * existing.count + Number(firstCoord[0])) / (existing.count + 1),
            (existing.center[1] * existing.count + Number(firstCoord[1])) / (existing.count + 1),
          ]
          existing.count += 1
          if (year && (!existing.year || year < existing.year)) {
            existing.year = year
          }
        })

        if (!isMounted) return
        setRoadIndex(Array.from(roadsMap.values()))
      } catch {
        if (isMounted) setRoadIndex([])
      } finally {
        if (isMounted) setIsRoadIndexLoading(false)
      }
    }

    loadRoadIndex()
    return () => {
      isMounted = false
    }
  }, [])

  const geocodeSubDistrict = async (subDistrictId) => {
    const target = subDistrictOptions.find((item) => item.id === subDistrictId)
    if (!target || subDistrictCenters[subDistrictId]) {
      return
    }

    const query = `${target.label.split(' (')[0]}, ${target.districtName.split(' (')[0]}, Hong Kong`
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`

    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!response.ok) return
      const data = await response.json()
      if (!Array.isArray(data) || !data.length) return
      const first = data[0]
      const lng = Number(first.lon)
      const lat = Number(first.lat)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return

      setSubDistrictCenters((prev) => ({
        ...prev,
        [subDistrictId]: [lng, lat],
      }))
    } catch {
      // Keep district fallback if geocoding is unavailable.
    }
  }

  return (
    <main className="app-shell">
      <MapView
        selectedYear={selectedYear}
        minYear={minYear}
        activeGroup={activeGroup}
        onMapReady={() => setIsMapLoading(false)}
        viewportTarget={viewportTarget}
        selectedRoadKey={selectedRoadKey}
        onRoadPick={({ key, center, year, enName, zhName }) => {
          setSelectedRoadKey(key)
          setClickedRoadCenter(center)
          setRoadSearch(`${enName ?? ''} ${zhName ?? ''}`.trim())
          const matched = roadIndex.find((road) => road.id === key)
          setActiveRoadId(matched ? matched.id : null)
          if (year && Number.isFinite(year)) {
            setSelectedYear((prev) => Math.max(prev, year))
          }
        }}
      />
      <section className="road-search-panel">
        <p className="legend-title">Road Search</p>
        <input
          className="road-search-input"
          type="text"
          value={roadSearch}
          placeholder={isRoadIndexLoading ? 'Indexing roads...' : 'Search road / 搜尋街道'}
          disabled={isRoadIndexLoading}
          onChange={(event) => {
            setRoadSearch(event.target.value)
            setActiveRoadId(null)
            setSelectedRoadKey(null)
            setClickedRoadCenter(null)
          }}
        />
        {roadSearch.trim() && roadResults.length ? (
          <div className="road-search-results">
            {roadResults.map((road) => (
              <button
                type="button"
                className={`road-search-item ${activeRoadId === road.id ? 'is-active' : ''}`}
                key={road.id}
                onClick={() => {
                  setActiveRoadId(road.id)
                  setSelectedRoadKey(road.id)
                  setClickedRoadCenter(null)
                  setRoadSearch(`${road.enName} ${road.zhName}`.trim())
                  if (road.year && Number.isFinite(road.year)) {
                    setSelectedYear((prev) => Math.max(prev, road.year))
                  }
                }}
              >
                <span className="road-search-main">
                  {road.enName || '-'} / {road.zhName || '-'}
                </span>
                <span className="road-search-year">({road.year ?? 'Unknown year'})</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
      {isMapLoading ? (
        <section className="map-loading-overlay" role="status" aria-live="polite">
          <div className="map-loading-card">
            <span className="map-loading-spinner" />
            <p>Loading Hong Kong streets map...</p>
          </div>
        </section>
      ) : null}
      <TimelineSlider
        minYear={minYear}
        maxYear={currentYear}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
      />
      <section className="navigator-panel">
        <p className="legend-title">Area Navigator</p>
        <div className="region-buttons">
          {REGION_OPTIONS.map((region) => (
            <button
              key={region.id}
              type="button"
              className={`region-button ${activeRegionId === region.id ? 'is-active' : ''}`}
              onClick={() => {
                setActiveRegionId(region.id)
                setActiveSubDistrictId('')
                setSelectedRoadKey(null)
                setClickedRoadCenter(null)
              }}
            >
              {region.nameEn} ({region.nameZh})
            </button>
          ))}
        </div>
        <select
          className="district-select"
          value={activeSubDistrictId}
          disabled={!activeRegionId}
          onChange={(event) => {
            const value = event.target.value
            setActiveSubDistrictId(value)
            setSelectedRoadKey(null)
            setClickedRoadCenter(null)
            if (value) {
              geocodeSubDistrict(value)
            }
          }}
        >
          <option value="">{activeRegionId ? 'Select sub-district' : 'Select region first'}</option>
          {subDistrictOptions.map((subDistrict) => (
            <option key={subDistrict.id} value={subDistrict.id}>
              {subDistrict.label} - {subDistrict.districtName}
            </option>
          ))}
        </select>
        {activeSubDistrict ? (
          <div className="subdistrict-panel">
            <p className="subdistrict-title">
              Selected sub-district
            </p>
            <p className="subdistrict-list">
              {activeSubDistrict.label} - {activeSubDistrict.districtName}
            </p>
          </div>
        ) : null}
        <div className="navigator-actions">
          <button
            type="button"
            className="navigator-link"
            onClick={() => setActiveSubDistrictId('')}
            disabled={!activeSubDistrictId}
          >
            Clear sub-district
          </button>
          <button
            type="button"
            className="navigator-link"
            onClick={() => {
              setActiveRegionId(null)
              setActiveSubDistrictId('')
              setSelectedRoadKey(null)
              setClickedRoadCenter(null)
            }}
            disabled={!activeRegionId}
          >
            Reset HK view
          </button>
        </div>
      </section>
      <section className="legend-panel">
        <p className="legend-title">Hong Kong Street Evolution</p>
        <p className="legend-subtitle">Visible roads named on or before {selectedYear}</p>
        <p className="legend-range">{yearRangeLabel}</p>
        <p className="legend-subtitle">
          {activeGroup ? `Focus period: ${activeGroup.range}` : 'Focus period: All'}
        </p>
        <div className="legend-groups">
          {colorGroups.map((group) => (
            <button
              className={`legend-item ${activeGroupId === group.id ? 'is-active' : ''}`}
              key={group.id}
              type="button"
              onClick={() =>
                setActiveGroupId((prev) => {
                  if (prev === group.id) return null
                  return group.id
                })
              }
            >
              <span className="legend-swatch" style={{ backgroundColor: group.color }} />
              <span>{group.range}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
