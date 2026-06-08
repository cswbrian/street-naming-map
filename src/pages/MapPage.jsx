import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import AppNav from '../components/AppNav'
import MapBottomSheet from '../components/MapBottomSheet.jsx'
import {
  MapDistrictNavigatorPanel,
  MapEraLegendPanel,
  MapYearRemarksPanel,
} from '../components/MapHudPanels.jsx'
import MapHudToolbar from '../components/MapHudToolbar.jsx'
import MapView from '../components/MapView'
import TimelineSlider from '../components/TimelineSlider'
import { useMapMobileViewport } from '../hooks/useMapMobileViewport.js'
import { useLocale } from '../i18n/LocaleContext'
import { useTheme } from '../theme/ThemeContext'
import { getThemedLegendColor } from '../theme/theme.js'
import { COLOR_GROUP_DEFS, getRoadTypeLabel } from '../i18n/translations'
import { REGION_OPTIONS, DISTRICT_OPTIONS } from '../config/regions.mjs'
import subdistrictCentersConfig from '../config/subdistrictCenters.json'
import { loadNamingRoads } from '../lib/loadNamingRoads.js'
import { buildSingleStreetFormUrl } from '../lib/contributeForm.js'
import {
  trackEraFilter,
  trackRegionFilter,
  trackSelectRoad,
  trackSubdistrictSelect,
  trackTimelineYear,
} from '../lib/analytics.js'
import { buildNoticeLookup, getNoticeLink, resolveNoticeLink } from '../lib/governmentNotice.js'
import { getNamingDisplay, hasRowNamingDate } from '../lib/namingDisplay.js'
import { getEvidenceKindBadge, resolveDisplayEvidenceKind } from '../lib/evidenceKindBadge.js'
import { buildNameHistoryTimelineItems, buildNamingRemarks } from '../lib/nameHistory.js'
import { buildPendingRoadLookup, resolvePendingRoadRow } from '../lib/pendingRoadLookup.js'
import { getDefaultMapPanelCollapse } from '../lib/mapViewport.js'
import { buildRoadKey, hasStreetName, normalizeRoadName, parseRoadKey } from '../lib/roadKey'
import {
  applyRoadParamsToSearchParams,
  buildRoadSearchParams,
  buildRoadShareUrl,
  roadParamsMatch,
} from '../lib/roadShareUrl'

const ROADS_URL = `${import.meta.env.BASE_URL}data/hk-streets.geojson`
const NOTICE_STEMS_URL = `${import.meta.env.BASE_URL}data/master/egazette-notice-stems.json`
const PDF_LOCALES_URL = `${import.meta.env.BASE_URL}data/master/egazette-pdf-locales.json`

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
  const { theme } = useTheme()
  const location = useLocation()
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
  const [noticeStemIndex, setNoticeStemIndex] = useState(null)
  const [pdfLocales, setPdfLocales] = useState(null)
  const [pendingRoadLookup, setPendingRoadLookup] = useState(() => new Map())
  const [isRoadIndexLoading, setIsRoadIndexLoading] = useState(true)
  const [activeRoadId, setActiveRoadId] = useState(null)
  const [selectedRoadKey, setSelectedRoadKey] = useState(null)
  const [clickedRoadCenter, setClickedRoadCenter] = useState(null)
  const [pickedRoadMeta, setPickedRoadMeta] = useState(null)
  const [collapsedPanels, setCollapsedPanels] = useState(getDefaultMapPanelCollapse)
  const [mobileSheet, setMobileSheet] = useState(null)
  const isMobileHud = useMapMobileViewport()

  useEffect(() => {
    if (!isMobileHud) setMobileSheet(null)
  }, [isMobileHud])

  const colorGroups = useMemo(
    () =>
      COLOR_GROUP_DEFS.map((group) => ({
        ...group,
        color: getThemedLegendColor(group, theme),
      })),
    [theme],
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
    if (!selectedRoadKey) return { url: null }
    const parsed = parseRoadKey(selectedRoadKey)
    const enName = activeRoad?.enName || pickedRoadMeta?.enName || parsed.enName
    const zhName = activeRoad?.zhName || pickedRoadMeta?.zhName || parsed.zhName
    const streetCode =
      parsed.type === 'code' ? parsed.streetCode : pickedRoadMeta?.streetCode || activeRoad?.streetCode
    const url = buildSingleStreetFormUrl({
      streetCode,
      englishName: enName,
      chineseName: zhName,
    })
    return { url, roadKey: selectedRoadKey }
  }, [selectedRoadKey, activeRoad, pickedRoadMeta])

  const selectedRoadInfo = useMemo(() => {
    if (!selectedRoadKey) return null
    const parsed = parseRoadKey(selectedRoadKey)
    const enName = activeRoad?.enName || pickedRoadMeta?.enName || parsed.enName || ''
    const zhName = activeRoad?.zhName || pickedRoadMeta?.zhName || parsed.zhName || ''
    const streetCode =
      parsed.type === 'code' ? parsed.streetCode : pickedRoadMeta?.streetCode || activeRoad?.streetCode
    const pendingRow = resolvePendingRoadRow({
      lookup: pendingRoadLookup,
      roadKey: selectedRoadKey,
      enName,
      zhName,
      streetCode,
    })
    const displayRow = pendingRow ?? {
      english_name: enName,
      chinese_name: zhName,
      street_code: streetCode,
      street_type: activeRoad?.streetType || pickedRoadMeta?.streetType || null,
      naming_year: activeRoad?.year ?? pickedRoadMeta?.year ?? null,
      naming_date: activeRoad?.namingDate || pickedRoadMeta?.namingDate || null,
    }
    const noticeLink = pendingRow?.naming_details
      ? getNoticeLink(pendingRow.naming_details, locale, {
          noticeIndex: noticeStemIndex,
          pdfLocales,
        })
      : resolveNoticeLink({
          roadKey: selectedRoadKey,
          enName,
          zhName,
          streetCode,
          lookup: noticeLookup,
          locale,
          noticeIndex: noticeStemIndex,
          pdfLocales,
        })
    const rowForDisplay = pendingRow ?? displayRow
    const displayNames = {
      en: pendingRow?.english_name || enName,
      zh: pendingRow?.chinese_name || zhName,
    }
    const evidenceKind = resolveDisplayEvidenceKind(pendingRow?.naming_details)
    const evidenceBadgeKey = evidenceKind ? getEvidenceKindBadge(evidenceKind, t) : null
    const isNamingPending = !hasRowNamingDate(rowForDisplay)
    const nameHistory = buildNameHistoryTimelineItems(
      pendingRow?.naming_details,
      locale,
      {
        historyGazettePending: t('historyGazettePending'),
        historyGazetteInferred: t('historyGazetteInferred'),
        evidenceNews: t('evidenceNews'),
        evidenceHearsay: t('evidenceHearsay'),
        evidenceLegalOther: t('evidenceLegalOther'),
        evidenceResearch: t('evidenceResearch'),
        eventRoleBuilt: t('eventRoleBuilt'),
        eventRoleNameRemoved: t('eventRoleNameRemoved'),
        eventRoleCurrentName: t('eventRoleCurrentName'),
        eventRoleFormerName: t('eventRoleFormerName'),
        eventTypeRename: t('eventTypeRename'),
        eventTypeFormerName: t('eventTypeFormerName'),
        eventTypeCurrentName: t('eventTypeCurrentName'),
        eventTypeBuilt: t('eventTypeBuilt'),
        eventTypeNameRemoved: t('eventTypeNameRemoved'),
      },
      displayNames,
      {
        pendingDisplay: isNamingPending
          ? getNamingDisplay(rowForDisplay, t) || t('pending')
          : null,
        t,
      },
    )
    const namingRemarks = buildNamingRemarks(pendingRow?.naming_details, displayNames, locale)
    const namingYear = activeRoad?.year ?? pickedRoadMeta?.year ?? displayRow.naming_year ?? null
    const shareUrl =
      typeof window !== 'undefined'
        ? buildRoadShareUrl({
            origin: window.location.origin,
            pathname: location.pathname,
            roadKey: selectedRoadKey,
            year: namingYear,
          })
        : null
    return {
      enName: pendingRow?.english_name || enName,
      zhName: pendingRow?.chinese_name || zhName,
      streetType: getRoadTypeLabel(locale, displayRow.street_type) || null,
      namingDisplay: getNamingDisplay(rowForDisplay, t),
      isNamingPending,
      nameHistory,
      namingRemarks,
      noticeLink,
      evidenceBadge: evidenceBadgeKey,
      contributeUrl: selectedContributeMeta.url,
      contributeLabel: t('contributeFillGap'),
      contributeVariant: hasRowNamingDate(rowForDisplay) ? 'edit' : 'add',
      shareUrl,
      shareLabel: t('mapRoadShare'),
      shareAriaLabel: t('mapRoadShareAria'),
      shareCopiedLabel: t('mapRoadShareCopied'),
    }
  }, [
    selectedRoadKey,
    activeRoad,
    pickedRoadMeta,
    pendingRoadLookup,
    noticeLookup,
    noticeStemIndex,
    pdfLocales,
    locale,
    t,
    selectedContributeMeta.url,
    location.pathname,
  ])
  const roadResults = useMemo(() => {
    const keyword = roadSearch.trim().toLowerCase()
    if (!keyword) return []
    return roadIndex
      .filter((item) => item.searchText.includes(keyword))
      .slice(0, 10)
  }, [roadIndex, roadSearch])
  const roadViewportTarget = useMemo(() => {
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
    return null
  }, [activeRoad, clickedRoadCenter])

  const viewportTarget = useMemo(() => {
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
  }, [activeSubDistrict, activeRegionId, subDistrictCenters])

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
    return roads.find((road) => road.streetCode === code) ?? null
  }

  const resolvePickedRoad = (roads, { key, enName, zhName, streetCode }) =>
    roads.find((road) => road.id === key) ??
    resolveRoadFromCode(roads, streetCode) ??
    resolveRoadFromNames(roads, enName, zhName)

  const formatPickedRoadSearchLabel = ({ matched, enName, zhName, streetCode }) => {
    if (matched) return formatRoadLabel(matched)
    if (enName || zhName) return formatStreetName(zhName, enName)
    if (streetCode) return t('unnamedStreetCode', { code: streetCode })
    return '-'
  }

  useEffect(() => {
    if (isRoadIndexLoading || !selectedRoadKey) return
    const parsed = parseRoadKey(selectedRoadKey)
    const enName = pickedRoadMeta?.enName || parsed.enName || ''
    const zhName = pickedRoadMeta?.zhName || parsed.zhName || ''
    const streetCode =
      pickedRoadMeta?.streetCode || (parsed.type === 'code' ? parsed.streetCode : '')
    const matched = resolvePickedRoad(roadIndex, {
      key: selectedRoadKey,
      enName,
      zhName,
      streetCode,
    })
    if (matched) setActiveRoadId(matched.id)
    setRoadSearch(formatPickedRoadSearchLabel({ matched, enName, zhName, streetCode }))
  }, [isRoadIndexLoading, roadIndex, selectedRoadKey, pickedRoadMeta, locale])

  const applyRoadSelection = (road, { namingYear, method = 'search' } = {}) => {
    if (!road) return
    setActiveRoadId(road.id)
    setSelectedRoadKey(road.id)
    setClickedRoadCenter(null)
    setPickedRoadMeta(null)
    setRoadSearch(formatRoadLabel(road))
    const year = Number.isFinite(namingYear) ? namingYear : road.year
    trackSelectRoad({
      method,
      hasYear: Number.isFinite(year) && year > 0,
      isPending: !Number.isFinite(year) || year <= 0,
      englishName: road.enName,
      chineseName: road.zhName,
    })
    if (year && Number.isFinite(year)) {
      setSelectedYear((prev) => {
        const nextYear = Math.max(prev, year)
        trackTimelineYear(nextYear, 'road')
        return nextYear
      })
    }
  }

  const clearRoadSelection = () => {
    setSelectedRoadKey(null)
    setClickedRoadCenter(null)
    setPickedRoadMeta(null)
    setActiveRoadId(null)
  }

  useEffect(() => {
    if (isRoadIndexLoading) return

    if (!selectedRoadKey) {
      const nextParams = applyRoadParamsToSearchParams(searchParams, new URLSearchParams())
      if (nextParams.toString() !== searchParams.toString()) {
        setSearchParams(nextParams, { replace: true })
      }
      return
    }

    const namingYear = activeRoad?.year ?? pickedRoadMeta?.year ?? null
    const roadParams = buildRoadSearchParams({ roadKey: selectedRoadKey, year: namingYear })
    if (roadParamsMatch(searchParams, roadParams)) return

    setSearchParams(applyRoadParamsToSearchParams(searchParams, roadParams), { replace: true })
  }, [
    isRoadIndexLoading,
    selectedRoadKey,
    activeRoad,
    pickedRoadMeta,
    searchParams,
    setSearchParams,
  ])

  useEffect(() => {
    let isMounted = true
    const en = searchParams.get('en')
    const zh = searchParams.get('zh')
    const code = searchParams.get('code')
    const yearParam = searchParams.get('year')
    const hasDeepLink = Boolean(en || zh || code)

    const loadRoadIndex = async () => {
      try {
        const [roadsResponse, namingRoads, stemsResponse, localesResponse] =
          await Promise.all([
            fetch(ROADS_URL),
            loadNamingRoads(),
            fetch(NOTICE_STEMS_URL),
            fetch(PDF_LOCALES_URL),
          ])
        if (!roadsResponse.ok) throw new Error('Unable to load roads data')
        const geojson = await roadsResponse.json()
        let stemIndex = null
        if (stemsResponse.ok) {
          stemIndex = await stemsResponse.json()
        }
        let localesIndex = null
        if (localesResponse.ok) {
          localesIndex = await localesResponse.json()
        }
        const pendingRoads = namingRoads?.roads ?? []
        if (isMounted) {
          setNoticeStemIndex(stemIndex)
          setPdfLocales(localesIndex)
          setNoticeLookup(buildNoticeLookup(pendingRoads, { noticeIndex: stemIndex }))
          setPendingRoadLookup(buildPendingRoadLookup(pendingRoads))
        }
        const features = Array.isArray(geojson?.features) ? geojson.features : []
        const roadsMap = new Map()

        features.forEach((feature) => {
          const props = feature?.properties ?? {}
          const enName = normalizeRoadName(props.ENGLISHSTREETNAME)
          const zhName = normalizeRoadName(props.CHINESESTREETNAME)
          if (!hasStreetName(enName, zhName)) return
          const streetCode = String(props.STREETCODE ?? '').trim()
          const key = `${enName}|${zhName}`
          const mapYear = Number(props.map_year)
          const namingYear = Number(props.naming_year)
          const year =
            Number.isFinite(mapYear) && mapYear > 0
              ? mapYear
              : Number.isFinite(namingYear) && namingYear > 0
                ? namingYear
                : null
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
              streetType: normalizeRoadName(props.STREETTYPE) || null,
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
          if (!existing.streetType) {
            existing.streetType = normalizeRoadName(props.STREETTYPE) || null
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
            setRoadSearch(normalizeRoadName(en) || normalizeRoadName(zh) || '-')
            if (Number.isFinite(namingYear)) {
              setSelectedYear((prev) => Math.max(prev, namingYear))
            }
          }
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
        yearRemarks: true,
        [panel]: false,
      }
    })
  }

  const toggleMobileSheet = (sheet) => {
    setMobileSheet((prev) => (prev === sheet ? null : sheet))
  }

  const closeMobileSheet = () => setMobileSheet(null)

  const handleEraGroupChange = (groupId) => {
    setActiveGroupId((prev) => {
      const next = prev === groupId ? null : groupId
      trackEraFilter(groupId, next !== null)
      return next
    })
  }

  const handleRegionChange = (regionId) => {
    setActiveRegionId((prev) => {
      const next = prev === regionId ? null : regionId
      trackRegionFilter(regionId, next !== null)
      return next
    })
    setActiveSubDistrictId('')
    setSubDistrictSearch('')
    clearRoadSelection()
  }

  const handleSubDistrictSearchChange = (value) => {
    setSubDistrictSearch(value)
    setActiveSubDistrictId('')
    clearRoadSelection()
  }

  const handleSubDistrictSelect = (subDistrict) => {
    clearRoadSelection()
    setActiveSubDistrictId(subDistrict.id)
    setSubDistrictSearch(subDistrict.localeLabel)
    trackSubdistrictSelect(subDistrict.id)
    geocodeSubDistrict(subDistrict.id)
  }

  const yearRemarksLabels = {
    intro: t('mapYearRemarksIntro'),
    built: t('mapYearRemarksBuilt'),
    naming: t('mapYearRemarksNaming'),
    timeline: t('mapYearRemarksTimeline'),
    pending: t('mapYearRemarksPending'),
  }

  const districtNavigatorLabels = {
    searchDistrict: t('searchDistrict'),
    noMatchingSubDistrict: t('noMatchingSubDistrict'),
  }

  const mobileSheetTitles = {
    evolution: t('evolution'),
    navigator: t('selectDistrict'),
    timeline: t('timeline'),
    yearRemarks: t('mapYearRemarksTitle'),
  }

  return (
    <>
      <MapView
        locale={locale}
        theme={theme}
        selectedYear={selectedYear}
        minYear={minYear}
        activeGroup={activeGroup}
        onMapReady={() => setIsMapLoading(false)}
        viewportTarget={viewportTarget}
        roadViewportTarget={roadViewportTarget}
        selectedRoadKey={selectedRoadKey}
        selectedRoadCenter={clickedRoadCenter ?? activeRoad?.center ?? null}
        selectedRoadInfo={selectedRoadInfo}
        onRoadPick={({ key, center, year, enName, zhName, streetCode, streetType, namingDate }) => {
          setSelectedRoadKey(key)
          setClickedRoadCenter(center)
          setPickedRoadMeta({
            enName,
            zhName,
            streetCode,
            streetType,
            year: Number.isFinite(year) ? year : null,
            namingDate: normalizeRoadName(namingDate),
          })
          const matched = resolvePickedRoad(roadIndex, { key, enName, zhName, streetCode })
          setRoadSearch(formatPickedRoadSearchLabel({ matched, enName, zhName, streetCode }))
          setActiveRoadId(matched ? matched.id : null)
          trackSelectRoad({
            method: 'map',
            hasYear: Number.isFinite(year) && year > 0,
            isPending: !Number.isFinite(year) || year <= 0,
            englishName: enName,
            chineseName: zhName,
          })
          if (year && Number.isFinite(year)) {
            setSelectedYear((prev) => {
              const nextYear = Math.max(prev, year)
              trackTimelineYear(nextYear, 'road')
              return nextYear
            })
          }
        }}
        onRoadClear={clearRoadSelection}
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
      {isMobileHud ? (
        <>
          <MapHudToolbar
            labels={{
              evolution: t('evolution'),
              district: t('mapHudDistrict'),
              yearRemarks: t('mapYearRemarksTitle'),
              toolbarAria: t('mapHudToolbarAria'),
            }}
            selectedYear={selectedYear}
            activeSheet={mobileSheet}
            onSelect={toggleMobileSheet}
          />
          {(['evolution', 'navigator', 'timeline', 'yearRemarks']).map((sheetId) => (
            <MapBottomSheet
              key={sheetId}
              isOpen={mobileSheet === sheetId}
              title={mobileSheetTitles[sheetId]}
              closeLabel={t('mapHudCloseSheet')}
              onClose={closeMobileSheet}
            >
              {sheetId === 'evolution' ? (
                <MapEraLegendPanel
                  colorGroups={colorGroups}
                  activeGroupId={activeGroupId}
                  locale={locale}
                  currentYear={currentYear}
                  onGroupChange={handleEraGroupChange}
                />
              ) : null}
              {sheetId === 'navigator' ? (
                <MapDistrictNavigatorPanel
                  locale={locale}
                  regionOptions={REGION_OPTIONS}
                  activeRegionId={activeRegionId}
                  subDistrictSearch={subDistrictSearch}
                  filteredSubDistrictOptions={filteredSubDistrictOptions}
                  activeSubDistrictId={activeSubDistrictId}
                  labels={districtNavigatorLabels}
                  onRegionChange={handleRegionChange}
                  onSubDistrictSearchChange={handleSubDistrictSearchChange}
                  onSubDistrictSelect={handleSubDistrictSelect}
                />
              ) : null}
              {sheetId === 'timeline' ? (
                <TimelineSlider
                  embedded
                  minYear={minYear}
                  maxYear={currentYear}
                  selectedYear={selectedYear}
                  onYearChange={setSelectedYear}
                />
              ) : null}
              {sheetId === 'yearRemarks' ? <MapYearRemarksPanel labels={yearRemarksLabels} /> : null}
            </MapBottomSheet>
          ))}
        </>
      ) : (
        <div className="hud-bottom-stack hud-bottom-stack--desktop">
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
              <MapEraLegendPanel
                colorGroups={colorGroups}
                activeGroupId={activeGroupId}
                locale={locale}
                currentYear={currentYear}
                onGroupChange={handleEraGroupChange}
              />
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
              <MapDistrictNavigatorPanel
                locale={locale}
                regionOptions={REGION_OPTIONS}
                activeRegionId={activeRegionId}
                subDistrictSearch={subDistrictSearch}
                filteredSubDistrictOptions={filteredSubDistrictOptions}
                activeSubDistrictId={activeSubDistrictId}
                labels={districtNavigatorLabels}
                onRegionChange={handleRegionChange}
                onSubDistrictSearchChange={handleSubDistrictSearchChange}
                onSubDistrictSelect={handleSubDistrictSelect}
              />
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

          <section
            className={`map-year-remarks-panel legend-panel ${collapsedPanels.yearRemarks ? 'is-collapsed' : ''}`}
          >
            <div
              className="panel-header"
              role="button"
              tabIndex={0}
              onClick={() => togglePanel('yearRemarks')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  togglePanel('yearRemarks')
                }
              }}
            >
              <p className="legend-title">{t('mapYearRemarksTitle')}</p>
              <button
                type="button"
                className="panel-toggle"
                onClick={(event) => {
                  event.stopPropagation()
                  togglePanel('yearRemarks')
                }}
                aria-expanded={!collapsedPanels.yearRemarks}
              >
                {collapsedPanels.yearRemarks ? '+' : '−'}
              </button>
            </div>
            <div className={`panel-content ${collapsedPanels.yearRemarks ? 'is-collapsed' : ''}`}>
              <MapYearRemarksPanel labels={yearRemarksLabels} />
            </div>
          </section>
        </div>
      )}
    </>
  )
}

export default MapPage
