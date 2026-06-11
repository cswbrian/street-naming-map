import {
  HISTORICAL_MAP_COVERAGE,
  HISTORICAL_MAP_DATASET_URL,
  HISTORICAL_MAP_GROUP_ORDER,
} from '../config/historicalMaps.mjs'

function groupMapsByCoverage(maps) {
  const groups = new Map()
  for (const map of maps) {
    const list = groups.get(map.coverage) ?? []
    list.push(map)
    groups.set(map.coverage, list)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.year - b.year)
  }
  return HISTORICAL_MAP_GROUP_ORDER.filter((coverage) => groups.has(coverage)).map((coverage) => [
    coverage,
    groups.get(coverage),
  ])
}

function HistoricalMapPanel({
  locale,
  maps,
  activeMapId,
  suggestedMapId,
  opacity,
  labels,
  onSelectMap,
  onOpacityChange,
}) {
  const groups = groupMapsByCoverage(maps)

  if (!maps.length) {
    return <p className="historical-map-empty">{labels.empty}</p>
  }

  return (
    <div className="historical-map-panel">
      <div className="historical-map-toolbar">
        <button
          type="button"
          className={`historical-map-item historical-map-off ${activeMapId ? '' : 'is-active'}`}
          onClick={() => onSelectMap(null)}
        >
          {labels.none}
        </button>
        <label className={`historical-map-opacity ${activeMapId ? '' : 'is-disabled'}`}>
          <span className="historical-map-opacity-label">{labels.opacity}</span>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={opacity}
            disabled={!activeMapId}
            onChange={(event) => onOpacityChange(Number(event.target.value))}
          />
          <span className="historical-map-opacity-value">{Math.round(opacity * 100)}%</span>
        </label>
      </div>

      {groups.map(([coverage, coverageMaps]) => {
        const coverageLabels = HISTORICAL_MAP_COVERAGE[coverage]
        const groupTitle =
          locale === 'zh' ? coverageLabels?.labelZh : coverageLabels?.labelEn ?? coverage

        return (
          <section key={coverage} className="historical-map-group">
            <h3 className="historical-map-group-title">{groupTitle}</h3>
            <div className="historical-map-list">
              {coverageMaps.map((map) => {
                const isActive = activeMapId === map.id
                const isSuggested = suggestedMapId === map.id && !isActive
                const title = locale === 'zh' ? map.labelZh : map.labelEn

                return (
                  <button
                    key={map.id}
                    type="button"
                    className={[
                      'historical-map-item',
                      isActive ? 'is-active' : '',
                      isSuggested ? 'is-suggested' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectMap(map.id)}
                  >
                    <span className="historical-map-item-label">
                      {title}
                      {map.scale ? (
                        <span className="historical-map-item-meta"> · {map.scale}</span>
                      ) : null}
                      {isSuggested ? (
                        <span className="historical-map-item-meta"> · {labels.suggested}</span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <p className="historical-map-attribution">
        {labels.attribution}{' '}
        <a href={HISTORICAL_MAP_DATASET_URL} target="_blank" rel="noopener noreferrer">
          {labels.datasetLink}
        </a>
      </p>
    </div>
  )
}

export default HistoricalMapPanel
