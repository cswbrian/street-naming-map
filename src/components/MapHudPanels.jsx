import { getPeriodLabel } from '../i18n/translations'

export function MapEraLegendPanel({ colorGroups, activeGroupId, locale, currentYear, onGroupChange }) {
  return (
    <div className="legend-groups map-hud-sheet-legend">
      {colorGroups.map((group) => (
        <button
          className={`legend-item ${activeGroupId === group.id ? 'is-active' : ''}`}
          key={group.id}
          type="button"
          onClick={() => onGroupChange(group.id)}
        >
          <span className="legend-swatch" style={{ backgroundColor: group.color }} />
          <span>{getPeriodLabel(group, locale, currentYear)}</span>
        </button>
      ))}
    </div>
  )
}

export function MapDistrictNavigatorPanel({
  locale,
  regionOptions,
  activeRegionId,
  subDistrictSearch,
  filteredSubDistrictOptions,
  activeSubDistrictId,
  labels,
  onRegionChange,
  onSubDistrictSearchChange,
  onSubDistrictSelect,
}) {
  return (
    <>
      <div className="region-buttons">
        {regionOptions.map((region) => (
          <button
            key={region.id}
            type="button"
            className={`region-button ${activeRegionId === region.id ? 'is-active' : ''}`}
            onClick={() => onRegionChange(region.id)}
          >
            {locale === 'zh' ? region.nameZh : region.nameEn}
          </button>
        ))}
      </div>
      <input
        className="district-search-input"
        type="text"
        value={subDistrictSearch}
        placeholder={labels.searchDistrict}
        onChange={(event) => onSubDistrictSearchChange(event.target.value)}
      />
      <div className="subdistrict-search-results">
        {filteredSubDistrictOptions.length ? (
          filteredSubDistrictOptions.map((subDistrict) => (
            <button
              key={subDistrict.id}
              type="button"
              className={`subdistrict-search-item ${activeSubDistrictId === subDistrict.id ? 'is-active' : ''}`}
              onClick={() => onSubDistrictSelect(subDistrict)}
            >
              {subDistrict.localeLabel}
            </button>
          ))
        ) : (
          <p className="subdistrict-empty">{labels.noMatchingSubDistrict}</p>
        )}
      </div>
    </>
  )
}

export function MapYearRemarksPanel({ labels }) {
  return (
    <>
      <p className="map-year-remarks-intro">{labels.intro}</p>
      <ul className="map-year-remarks-list">
        <li>{labels.built}</li>
        <li>{labels.naming}</li>
        <li>{labels.timeline}</li>
        <li>{labels.pending}</li>
      </ul>
    </>
  )
}
