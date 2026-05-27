import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppNav from '../components/AppNav'
import MapView from '../components/MapView'
import TimelineSlider from '../components/TimelineSlider'
import { useLocale } from '../i18n/LocaleContext'
import { COLOR_GROUP_DEFS } from '../i18n/translations'
import { REGION_OPTIONS, DISTRICT_OPTIONS } from '../config/regions.mjs'
import subdistrictCentersConfig from '../config/subdistrictCenters.json'
import { buildSingleStreetFormUrl } from '../lib/contributeForm.js'
import { buildNoticeLookup, resolveNoticeLink } from '../lib/governmentNotice.js'
import { getDefaultMapPanelCollapse } from '../lib/mapViewport.js'
import { buildRoadKey, normalizeRoadName, parseRoadKey } from '../lib/roadKey'

const ROADS_URL = `${import.meta.env.BASE_URL}data/hk-streets.geojson`
const PENDING_URL = `${import.meta.env.BASE_URL}data/master/pending-naming-years.json`

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

function MapPage() {
  const { locale, t, formatStreetName } = useLocale()
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
  const [noticeLookup, setNoticeLookup] = useState(() => new Map())
  const [isRoadIndexLoading, setIsRoadIndexLoading] = useState(true)
  const [activeRoadId, setActiveRoadId] = useState(null)
  const [selectedRoadKey, setSelectedRoadKey] = useState(null)
  const [clickedRoadCenter, setClickedRoadCenter] = useState(null)
  const [pickedRoadMeta, setPickedRoadMeta] = useState(null)
  const [collapsedPanels, setCollapsedPanels] = useState(getDefaultMapPanelCollapse)

  const colorGroups = useMemo(
    () =>
      COLOR_GROUP_DEFS.map((group) =>
        group.id === 'g6' ? { ...group, end: currentYear } : group,
      ),
    [currentYear],
  )

  const activeGroup = colorGroups.find((group) => group.id === activeGroupId) ?? null
  const filteredDistricts = useMemo(() => {
    if (!activeRegionId) return DISTRICT_OPTIONS
    return DISTRICT_OPTIONS.filter((district) => district.regionId === activeRegionId)
  }, [activeRegionId])
  const subDistrictOptions = useMemo(() => {
    return filteredDistricts.flatMap((district) =>
      district.subDistricts.map((subDistrict, index) => {
        const parsed = parseBilingualLabel(subDistrict)
        const localeLabel =
          locale === 'zh'
            ? parsed.zh || parsed.en || subDistrict
            : parsed.en || parsed.zh || subDistrict
        return {
          id: `${district.id}-${index}`,
          label: subDistrict,
          localeLabel,
          queryLabel: parsed.en || subDistrict,
          searchText: `${subDistrict} ${parsed.zh} ${parsed.en}`.toLowerCase(),
          districtNameEn: district.nameEn,
          districtBbox: district.bbox,
        }
      }),
    )
  }, [filteredDistricts, locale])
  const filteredSubDistrictOptions = useMemo(() => {
    const keyword = subDistrictSearch.trim().toLowerCase()
    if (!keyword) return subDistrictOptions
    const selectedOption = subDistrictOptions.find((item) => item.id === activeSubDistrictId)
    if (selectedOption && keyword === selectedOption.localeLabel.toLowerCase()) {
      return subDistrictOptions
    }
    return subDistrictOptions.filter((item) => item.searchText.includes(keyword))
  }, [subDistrictOptions, subDistrictSearch, activeSubDistrictId])
  const activeSubDistrict = subDistrictOptions.find((item) => item.id === activeSubDistrictId) ?? null
  const activeRoad = roadIndex.find((item) => item.id === activeRoadId) ?? null

  const selectedContributeMeta = useMemo(() => {
    if (!selectedRoadKey) return { url: null, show: false }
    const parsed = parseRoadKey(selectedRoadKey)
    const enName = activeRoad?.enName || pickedRoadMeta?.enName || parsed.enName
    const zhName = activeRoad?.zhName || pickedRoadMeta?.zhName || parsed.zhName
    const streetCode = parsed.type === 'code' ? parsed.streetCode : pickedRoadMeta?.streetCode
    const year = activeRoad?.year ?? pickedRoadMeta?.year
    const namingDate = activeRoad?.namingDate || pickedRoadMeta?.namingDate
    const hasDate = Boolean(namingDate) || (Number.isFinite(year) && year > 0)
    const show = !hasDate
    const url = buildSingleStreetFormUrl({
      streetCode,
      englishName: enName,
      chineseName: zhName,
    })
    return { url, show, roadKey: selectedRoadKey }
  }, [selectedRoadKey, activeRoad, pickedRoadMeta])
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

  useEffect(() => {
    if (!activeSubDistrictId) return
    const active = subDistrictOptions.find((item) => item.id === activeSubDistrictId)
    if (active) setSubDistrictSearch(active.localeLabel)
  }, [locale, activeSubDistrictId, subDistrictOptions])

  const formatRoadLabel = (road) => {
    if (road.enName || road.zhName) {
      return formatStreetName(road.zhName, road.enName)
    }
    if (road.streetCode) {
      return t('unnamedStreetCode', { code: road.streetCode })
    }
    return '-'
  }

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

  const resolveRoadFromCode = (roads, streetCode) => {
    const code = String(streetCode ?? '').trim()
    if (!code) return null
    return roads.find((road) => road.id === `code:${code}`) ?? null
  }

  const applyRoadSelection = (road, { namingYear } = {}) => {
    if (!road) return
    setActiveRoadId(road.id)
    setSelectedRoadKey(road.id)
    setClickedRoadCenter(null)
    setPickedRoadMeta(null)
    setRoadSearch(formatRoadLabel(road))
    const year = Number.isFinite(namingYear) ? namingYear : road.year
    if (year && Number.isFinite(year)) {
      setSelectedYear((prev) => Math.max(prev, year))
    }
  }

  useEffect(() => {
    let isMounted = true
    const en = searchParams.get('en')
    const zh = searchParams.get('zh')
    const code = searchParams.get('code')
    const yearParam = searchParams.get('year')
    const hasDeepLink = Boolean(en || zh || code)

    const loadRoadIndex = async () => {
      try {
        const [roadsResponse, pendingResponse] = await Promise.all([
          fetch(ROADS_URL),
          fetch(PENDING_URL),
        ])
        if (!roadsResponse.ok) throw new Error('Unable to load roads data')
        const geojson = await roadsResponse.json()
        if (pendingResponse.ok) {
          const pending = await pendingResponse.json()
          if (isMounted) setNoticeLookup(buildNoticeLookup(pending?.roads ?? []))
        }
        const features = Array.isArray(geojson?.features) ? geojson.features : []
        const roadsMap = new Map()

        features.forEach((feature) => {
          const props = feature?.properties ?? {}
          const enName = normalizeRoadName(props.ENGLISHSTREETNAME)
          const zhName = normalizeRoadName(props.CHINESESTREETNAME)
          const streetCode = String(props.STREETCODE ?? '').trim()
          const key = buildRoadKey(enName, zhName, streetCode)
          if (!key) return
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
              streetCode: streetCode || null,
              year,
              namingDate: normalizeRoadName(props.naming_date),
              center: [Number(firstCoord[0]), Number(firstCoord[1])],
              count: 1,
              searchText: enName || zhName ? `${enName} ${zhName}`.toLowerCase() : streetCode.toLowerCase(),
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
          const matched = code ? resolveRoadFromCode(roads, code) : resolveRoadFromNames(roads, en, zh)
          if (matched) {
            setActiveRoadId(matched.id)
            setSelectedRoadKey(matched.id)
            setClickedRoadCenter(null)
            setPickedRoadMeta(null)
            setRoadSearch(formatRoadLabel(matched))
            const year = Number.isFinite(namingYear) ? namingYear : matched.year
            if (year && Number.isFinite(year)) {
              setSelectedYear((prev) => Math.max(prev, year))
            }
          } else {
            setActiveRoadId(null)
            setSelectedRoadKey(null)
            setClickedRoadCenter(null)
            setPickedRoadMeta(null)
            setRoadSearch(formatStreetName(normalizeRoadName(zh), normalizeRoadName(en)))
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

  const selectedGazetteLink = useMemo(() => {
    if (!selectedRoadKey) return null
    const parsed = parseRoadKey(selectedRoadKey)
    const enName = activeRoad?.enName || pickedRoadMeta?.enName || parsed.enName || ''
    const zhName = activeRoad?.zhName || pickedRoadMeta?.zhName || parsed.zhName || ''
    const streetCode =
      parsed.type === 'code' ? parsed.streetCode : pickedRoadMeta?.streetCode || activeRoad?.streetCode
    return resolveNoticeLink({
      roadKey: selectedRoadKey,
      enName,
      zhName,
      streetCode,
      lookup: noticeLookup,
      locale,
    })
  }, [selectedRoadKey, activeRoad, pickedRoadMeta, noticeLookup, locale])

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
        locale={locale}
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
                const parsed = parseRoadKey(selectedRoadKey)
                if (parsed.type === 'code') {
                  return {
                    enName:
                      activeRoad?.enName ||
                      t('unnamedStreetCode', { code: parsed.streetCode }),
                    zhName: activeRoad?.zhName || '',
                    year: activeRoad?.year ?? pickedRoadMeta?.year ?? null,
                    namingDate: activeRoad?.namingDate || pickedRoadMeta?.namingDate || null,
                    gazetteLink: selectedGazetteLink,
                  }
                }
                return {
                  enName: activeRoad?.enName || parsed.enName,
                  zhName: activeRoad?.zhName || parsed.zhName,
                  year: activeRoad?.year ?? pickedRoadMeta?.year ?? null,
                  namingDate: activeRoad?.namingDate || pickedRoadMeta?.namingDate || null,
                  gazetteLink: selectedGazetteLink,
                }
              })()
            : null
        }
        contributeFormUrl={selectedContributeMeta.show ? selectedContributeMeta.url : null}
        contributeLabel={t('mapSubmitProof')}
        onRoadPick={({ key, center, year, enName, zhName, streetCode, namingDate }) => {
          setSelectedRoadKey(key)
          setClickedRoadCenter(center)
          setPickedRoadMeta({
            enName,
            zhName,
            streetCode,
            year: Number.isFinite(year) ? year : null,
            namingDate: normalizeRoadName(namingDate),
          })
          const matched = roadIndex.find((road) => road.id === key)
          setRoadSearch(
            matched
              ? formatRoadLabel(matched)
              : streetCode
                ? t('unnamedStreetCode', { code: streetCode })
                : formatStreetName(zhName, enName),
          )
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
              placeholder={isRoadIndexLoading ? t('searchRoadIndexing') : t('searchRoad')}
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
                    {formatRoadLabel(road)}
                  </span>
                  <span className="road-search-year">
                    ({road.year ?? t('unknownYear')})
                  </span>
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
            <p>{t('mapLoading')}</p>
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
            <p className="legend-title">{t('evolution')}</p>
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
                  <span>{t(group.rangeKey)}</span>
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
            <p className="legend-title">{t('selectDistrict')}</p>
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
                  {locale === 'zh' ? region.nameZh : region.nameEn}
                </button>
              ))}
            </div>
            <input
              className="district-search-input"
              type="text"
              value={subDistrictSearch}
              placeholder={t('searchDistrict')}
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
                      setSubDistrictSearch(subDistrict.localeLabel)
                      setSelectedRoadKey(null)
                      setClickedRoadCenter(null)
                      setPickedRoadMeta(null)
                      geocodeSubDistrict(subDistrict.id)
                    }}
                  >
                    {subDistrict.localeLabel}
                  </button>
                ))
              ) : (
                <p className="subdistrict-empty">{t('noMatchingSubDistrict')}</p>
              )}
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
