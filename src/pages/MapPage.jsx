import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppNav from '../components/AppNav'
import MapView from '../components/MapView'
import TimelineSlider from '../components/TimelineSlider'
import { REGION_OPTIONS, DISTRICT_OPTIONS } from '../config/regions.mjs'
import subdistrictCentersConfig from '../config/subdistrictCenters.json'

const parseBilingualLabel = (value) => {
  const text = String(value ?? '').trim()
  const match = text.match(/^(.+?)\s*\((.+)\)$/)
  if (!match) {
    return { en: text, zh: '' }
  }
  return {
    en: match[1].trim(),
    zh: match[2].trim(),
  }
}

const normalizeRoadName = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const lowered = text.toLowerCase()
  if (['null', 'undefined', 'n/a', 'na', '-', '--'].includes(lowered)) {
    return ''
  }
  return text
}

function MapPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentYear = new Date().getFullYear()
  const minYear = 1842
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [isMapLoading, setIsMapLoading] = useState(true)
  const [activeRegionId, setActiveRegionId] = useState(null)
  const [activeSubDistrictId, setActiveSubDistrictId] = useState('')
  const [subDistrictSearch, setSubDistrictSearch] = useState('')
  const [subDistrictCenters, setSubDistrictCenters] = useState(subdistrictCentersConfig ?? {})
  const [roadSearch, setRoadSearch] = useState('')
  const [roadIndex, setRoadIndex] = useState([])
  const [isRoadIndexLoading, setIsRoadIndexLoading] = useState(true)
  const [activeRoadId, setActiveRoadId] = useState(null)
  const [selectedRoadKey, setSelectedRoadKey] = useState(null)
  const [clickedRoadCenter, setClickedRoadCenter] = useState(null)
  const [pickedRoadMeta, setPickedRoadMeta] = useState(null)
  const [collapsedPanels, setCollapsedPanels] = useState({
    evolution: false,
    navigator: false,
    timeline: false,
  })

  const colorGroups = [
    { id: 'g1', range: '1842-1898', color: '#5B6CFF', start: 1842, end: 1898 },
    { id: 'g2', range: '1899-1945', color: '#3FA9FF', start: 1899, end: 1945 },
    { id: 'g3', range: '1946-1969', color: '#2ED3FF', start: 1946, end: 1969 },
    { id: 'g4', range: '1970-1989', color: '#35F2C3', start: 1970, end: 1989 },
    { id: 'g5', range: '1990-2009', color: '#C6FF4D', start: 1990, end: 2009 },
    { id: 'g6', range: '2010-Now', color: '#FF5FD2', start: 2010, end: currentYear },
    { id: 'g-unknown', range: '未知 Unknown', color: '#B0B8C9', isUnknown: true },
  ]

  const activeGroup = colorGroups.find((group) => group.id === activeGroupId) ?? null
  const filteredDistricts = useMemo(() => {
    if (!activeRegionId) return DISTRICT_OPTIONS
    return DISTRICT_OPTIONS.filter((district) => district.regionId === activeRegionId)
  }, [activeRegionId])
  const subDistrictOptions = useMemo(() => {
    return filteredDistricts.flatMap((district) =>
      district.subDistricts.map((subDistrict, index) => {
        const parsed = parseBilingualLabel(subDistrict)
        const displayLabel = `${parsed.zh} ${parsed.en}`.trim() || subDistrict
        return {
          id: `${district.id}-${index}`,
          label: subDistrict,
          displayLabel,
          queryLabel: parsed.en || subDistrict,
          searchText: `${subDistrict} ${displayLabel}`.toLowerCase(),
          districtNameEn: district.nameEn,
          districtBbox: district.bbox,
        }
      }),
    )
  }, [filteredDistricts])
  const filteredSubDistrictOptions = useMemo(() => {
    const keyword = subDistrictSearch.trim().toLowerCase()
    if (!keyword) return subDistrictOptions
    const selectedOption = subDistrictOptions.find((item) => item.id === activeSubDistrictId)
    if (selectedOption && keyword === selectedOption.displayLabel.toLowerCase()) {
      return subDistrictOptions
    }
    return subDistrictOptions.filter((item) => item.searchText.includes(keyword))
  }, [subDistrictOptions, subDistrictSearch, activeSubDistrictId])
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
    if (activeRoad) {
      if (Array.isArray(activeRoad.bbox) && activeRoad.bbox.length === 4) {
        return {
          bbox: activeRoad.bbox,
          maxZoom: 15.2,
          padding: { top: 120, right: 70, bottom: 210, left: 70 },
        }
      }
      return { center: activeRoad.center, zoom: 14.8 }
    }
    if (clickedRoadCenter) {
      return { center: clickedRoadCenter, zoom: 14.8 }
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

  const resolveRoadFromNames = (roads, englishName, chineseName) => {
    const en = normalizeRoadName(englishName)
    const zh = normalizeRoadName(chineseName)
    const exactId = `${en}|${zh}`
    const exact = roads.find((road) => road.id === exactId)
    if (exact) return exact

    const keyword = `${en} ${zh}`.trim().toLowerCase()
    if (!keyword) return null
    return roads.find((item) => item.searchText.includes(keyword)) ?? null
  }

  const applyRoadSelection = (road, { namingYear } = {}) => {
    if (!road) return
    setActiveRoadId(road.id)
    setSelectedRoadKey(road.id)
    setClickedRoadCenter(null)
    setPickedRoadMeta(null)
    setRoadSearch(`${road.zhName} ${road.enName}`.trim())
    const year = Number.isFinite(namingYear) ? namingYear : road.year
    if (year && Number.isFinite(year)) {
      setSelectedYear((prev) => Math.max(prev, year))
    }
  }

  useEffect(() => {
    let isMounted = true
    const en = searchParams.get('en')
    const zh = searchParams.get('zh')
    const yearParam = searchParams.get('year')
    const hasDeepLink = Boolean(en || zh)

    const loadRoadIndex = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/hk-streets.geojson`)
        if (!response.ok) throw new Error('Unable to load roads data')
        const geojson = await response.json()
        const features = Array.isArray(geojson?.features) ? geojson.features : []
        const roadsMap = new Map()

        features.forEach((feature) => {
          const props = feature?.properties ?? {}
          const enName = normalizeRoadName(props.ENGLISHSTREETNAME)
          const zhName = normalizeRoadName(props.CHINESESTREETNAME)
          if (!enName && !zhName) return

          const key = `${enName}|${zhName}`
          const namingYear = Number(props.naming_year)
          const year = Number.isFinite(namingYear) && namingYear > 0 ? namingYear : null
          const coords = feature?.geometry?.coordinates
          const firstCoord =
            Array.isArray(coords) && Array.isArray(coords[0]) && coords[0].length >= 2
              ? coords[0]
              : null
          if (!firstCoord) return

          if (!roadsMap.has(key)) {
            roadsMap.set(key, {
              id: key,
              enName,
              zhName,
              year,
              namingDate: normalizeRoadName(props.naming_date),
              center: [Number(firstCoord[0]), Number(firstCoord[1])],
              count: 1,
              searchText: `${enName} ${zhName}`.toLowerCase(),
              bbox: [Number(firstCoord[0]), Number(firstCoord[1]), Number(firstCoord[0]), Number(firstCoord[1])],
            })
          }

          const existing = roadsMap.get(key)

          const updateBounds = (lng, lat) => {
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
            existing.bbox = [
              Math.min(existing.bbox[0], lng),
              Math.min(existing.bbox[1], lat),
              Math.max(existing.bbox[2], lng),
              Math.max(existing.bbox[3], lat),
            ]
          }

          if (feature?.geometry?.type === 'LineString' && Array.isArray(coords)) {
            coords.forEach((coord) => {
              if (Array.isArray(coord) && coord.length >= 2) {
                updateBounds(Number(coord[0]), Number(coord[1]))
              }
            })
          } else if (feature?.geometry?.type === 'MultiLineString' && Array.isArray(coords)) {
            coords.forEach((line) => {
              if (!Array.isArray(line)) return
              line.forEach((coord) => {
                if (Array.isArray(coord) && coord.length >= 2) {
                  updateBounds(Number(coord[0]), Number(coord[1]))
                }
              })
            })
          } else {
            updateBounds(Number(firstCoord[0]), Number(firstCoord[1]))
          }

          existing.center = [
            (existing.center[0] * existing.count + Number(firstCoord[0])) / (existing.count + 1),
            (existing.center[1] * existing.count + Number(firstCoord[1])) / (existing.count + 1),
          ]
          existing.count += 1
          if (year && (!existing.year || year < existing.year)) {
            existing.year = year
          }
          if (!existing.namingDate) {
            existing.namingDate = normalizeRoadName(props.naming_date)
          }
        })

        if (!isMounted) return
        const roads = Array.from(roadsMap.values())
        setRoadIndex(roads)

        if (hasDeepLink) {
          const namingYear = Number(yearParam)
          const matched = resolveRoadFromNames(roads, en, zh)
          if (matched) {
            setActiveRoadId(matched.id)
            setSelectedRoadKey(matched.id)
            setClickedRoadCenter(null)
            setPickedRoadMeta(null)
            setRoadSearch(`${matched.zhName} ${matched.enName}`.trim())
            const year = Number.isFinite(namingYear) ? namingYear : matched.year
            if (year && Number.isFinite(year)) {
              setSelectedYear((prev) => Math.max(prev, year))
            }
          } else {
            setActiveRoadId(null)
            setSelectedRoadKey(null)
            setClickedRoadCenter(null)
            setPickedRoadMeta(null)
            setRoadSearch(`${normalizeRoadName(zh)} ${normalizeRoadName(en)}`.trim())
            if (Number.isFinite(namingYear)) {
              setSelectedYear((prev) => Math.max(prev, namingYear))
            }
          }
          setSearchParams({}, { replace: true })
        }
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
    // Mount-only: deep-link params are read once; including searchParams would refetch on clear.
  }, [])

  const geocodeSubDistrict = async (subDistrictId) => {
    const target = subDistrictOptions.find((item) => item.id === subDistrictId)
    if (!target || subDistrictCenters[subDistrictId]) {
      return
    }

    const query = `${target.queryLabel}, ${target.districtNameEn}, Hong Kong`
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
    <>
      <MapView
        selectedYear={selectedYear}
        minYear={minYear}
        activeGroup={activeGroup}
        onMapReady={() => setIsMapLoading(false)}
        viewportTarget={viewportTarget}
        selectedRoadKey={selectedRoadKey}
        selectedRoadCenter={clickedRoadCenter ?? activeRoad?.center ?? null}
        selectedRoadInfo={
          selectedRoadKey
            ? (() => {
                const [enName = '', zhName = ''] = selectedRoadKey.split('|')
                return {
                  enName: activeRoad?.enName || enName,
                  zhName: activeRoad?.zhName || zhName,
                  year: activeRoad?.year ?? null,
                  namingDate: activeRoad?.namingDate || pickedRoadMeta?.namingDate || null,
                }
              })()
            : null
        }
        onRoadPick={({ key, center, year, enName, zhName, namingDate }) => {
          setSelectedRoadKey(key)
          setClickedRoadCenter(center)
          setPickedRoadMeta({
            enName,
            zhName,
            year: Number.isFinite(year) ? year : null,
            namingDate: normalizeRoadName(namingDate),
          })
          setRoadSearch(`${zhName ?? ''} ${enName ?? ''}`.trim())
          const matched = roadIndex.find((road) => road.id === key)
          setActiveRoadId(matched ? matched.id : null)
          if (year && Number.isFinite(year)) {
            setSelectedYear((prev) => Math.max(prev, year))
          }
        }}
      />
      <header className="map-top-bar">
        <section className="road-search-panel">
          <div className="road-search-row">
            <input
              className="road-search-input"
              type="text"
              value={roadSearch}
              placeholder={isRoadIndexLoading ? 'Indexing roads...' : '搜尋街道 Search road'}
              disabled={isRoadIndexLoading}
              onChange={(event) => {
                setRoadSearch(event.target.value)
                setActiveRoadId(null)
                setSelectedRoadKey(null)
                setClickedRoadCenter(null)
                setPickedRoadMeta(null)
              }}
            />
          </div>
          {roadSearch.trim() && roadResults.length ? (
            <div className="road-search-results">
              {roadResults.map((road) => (
                <button
                  type="button"
                  className={`road-search-item ${activeRoadId === road.id ? 'is-active' : ''}`}
                  key={road.id}
                  onClick={() => applyRoadSelection(road)}
                >
                  <span className="road-search-main">
                    {road.zhName || '-'} {road.enName || '-'}
                  </span>
                  <span className="road-search-year">({road.year ?? 'Unknown'})</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
        <AppNav />
      </header>
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
          <div
            className="panel-header"
            role="button"
            tabIndex={0}
            onClick={() => togglePanel('evolution')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                togglePanel('evolution')
              }
            }}
          >
            <p className="legend-title">Evolution</p>
            <button
              type="button"
              className="panel-toggle"
              onClick={(event) => {
                event.stopPropagation()
                togglePanel('evolution')
              }}
            >
              {collapsedPanels.evolution ? '+' : '−'}
            </button>
          </div>
          <div className={`panel-content ${collapsedPanels.evolution ? 'is-collapsed' : ''}`}>
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
          </div>
        </section>

        <section className={`navigator-panel ${collapsedPanels.navigator ? 'is-collapsed' : ''}`}>
          <div
            className="panel-header"
            role="button"
            tabIndex={0}
            onClick={() => togglePanel('navigator')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                togglePanel('navigator')
              }
            }}
          >
            <p className="legend-title">Select district</p>
            <button
              type="button"
              className="panel-toggle"
              onClick={(event) => {
                event.stopPropagation()
                togglePanel('navigator')
              }}
            >
              {collapsedPanels.navigator ? '+' : '−'}
            </button>
          </div>
          <div className={`panel-content ${collapsedPanels.navigator ? 'is-collapsed' : ''}`}>
            <div className="region-buttons">
              {REGION_OPTIONS.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  className={`region-button ${activeRegionId === region.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveRegionId((prev) => (prev === region.id ? null : region.id))
                    setActiveSubDistrictId('')
                    setSubDistrictSearch('')
                    setSelectedRoadKey(null)
                    setClickedRoadCenter(null)
                    setPickedRoadMeta(null)
                  }}
                >
                  {region.nameZh} {region.nameEn}
                </button>
              ))}
            </div>
            <input
              className="district-search-input"
              type="text"
              value={subDistrictSearch}
              placeholder="搜尋地區 Search district"
              onChange={(event) => {
                setSubDistrictSearch(event.target.value)
                setActiveSubDistrictId('')
                setSelectedRoadKey(null)
                setClickedRoadCenter(null)
                setPickedRoadMeta(null)
              }}
            />
            <div className="subdistrict-search-results">
              {filteredSubDistrictOptions.length ? (
                filteredSubDistrictOptions.map((subDistrict) => (
                  <button
                    key={subDistrict.id}
                    type="button"
                    className={`subdistrict-search-item ${activeSubDistrictId === subDistrict.id ? 'is-active' : ''}`}
                    onClick={() => {
                      setActiveSubDistrictId(subDistrict.id)
                      setSubDistrictSearch(subDistrict.displayLabel)
                      setSelectedRoadKey(null)
                      setClickedRoadCenter(null)
                      setPickedRoadMeta(null)
                      geocodeSubDistrict(subDistrict.id)
                    }}
                  >
                    {subDistrict.displayLabel}
                  </button>
                ))
              ) : (
                <p className="subdistrict-empty">No matching sub-district</p>
              )}
            </div>
            <div className="navigator-actions">
              <button
                type="button"
                className="navigator-link"
                onClick={() => {
                  setActiveRegionId(null)
                  setActiveSubDistrictId('')
                  setSubDistrictSearch('')
                  setSelectedRoadKey(null)
                  setClickedRoadCenter(null)
                  setPickedRoadMeta(null)
                }}
                disabled={!activeRegionId && !activeSubDistrictId}
              >
                Reset HK view
              </button>
            </div>
          </div>
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
    </>
  )
}

export default MapPage
