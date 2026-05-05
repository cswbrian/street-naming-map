import { useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView'
import TimelineSlider from './components/TimelineSlider'
import { REGION_OPTIONS, DISTRICT_OPTIONS } from './config/regions.mjs'
import subdistrictCentersConfig from './config/subdistrictCenters.json'
import './styles/app.css'

function App() {
  const currentYear = new Date().getFullYear()
  const minYear = 1842
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [isMapLoading, setIsMapLoading] = useState(true)
  const [activeRegionId, setActiveRegionId] = useState(null)
  const [activeSubDistrictId, setActiveSubDistrictId] = useState('')
  const [subDistrictCenters, setSubDistrictCenters] = useState(subdistrictCentersConfig ?? {})
  const [roadSearch, setRoadSearch] = useState('')
  const [roadIndex, setRoadIndex] = useState([])
  const [isRoadIndexLoading, setIsRoadIndexLoading] = useState(true)
  const [activeRoadId, setActiveRoadId] = useState(null)
  const [selectedRoadKey, setSelectedRoadKey] = useState(null)
  const [clickedRoadCenter, setClickedRoadCenter] = useState(null)
  const [collapsedPanels, setCollapsedPanels] = useState({
    evolution: false,
    navigator: false,
    timeline: false,
  })

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
    { id: 'g-unknown', range: 'Unknown year', color: '#B0B8C9', isUnknown: true },
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

  const togglePanel = (panel) => {
    setCollapsedPanels((prev) => {
      const isCurrentlyCollapsed = prev[panel]
      if (!isCurrentlyCollapsed) {
        return {
          ...prev,
          [panel]: true,
        }
      }

      return {
        evolution: true,
        navigator: true,
        timeline: true,
        [panel]: false,
      }
    })
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
      <div className="hud-bottom-stack">
        <section className={`legend-panel ${collapsedPanels.evolution ? 'is-collapsed' : ''}`}>
          <div className="panel-header">
            <p className="legend-title">Legend</p>
            <button type="button" className="panel-toggle" onClick={() => togglePanel('evolution')}>
              {collapsedPanels.evolution ? '+' : '−'}
            </button>
          </div>
          {!collapsedPanels.evolution ? (
            <>
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
            </>
          ) : null}
        </section>

        <section className={`navigator-panel ${collapsedPanels.navigator ? 'is-collapsed' : ''}`}>
          <div className="panel-header">
            <p className="legend-title">Area Navigator</p>
            <button type="button" className="panel-toggle" onClick={() => togglePanel('navigator')}>
              {collapsedPanels.navigator ? '+' : '−'}
            </button>
          </div>
          {!collapsedPanels.navigator ? (
            <>
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
                  <p className="subdistrict-title">Selected sub-district</p>
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
            </>
          ) : null}
        </section>

        <TimelineSlider
          minYear={minYear}
          maxYear={currentYear}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          isCollapsed={collapsedPanels.timeline}
          onToggle={() => togglePanel('timeline')}
        />
      </div>
    </main>
  )
}

export default App
