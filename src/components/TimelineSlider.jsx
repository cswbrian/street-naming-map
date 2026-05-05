function TimelineSlider({ minYear, maxYear, selectedYear, onYearChange, isCollapsed, onToggle }) {
  return (
    <section className={`timeline-shell ${isCollapsed ? 'is-collapsed' : ''}`}>
      <div className="panel-header timeline-header">
        <span>Street Naming Timeline</span>
        <div className="panel-header-actions">
          {!isCollapsed ? <strong>{selectedYear}</strong> : null}
          <button type="button" className="panel-toggle" onClick={onToggle}>
            {isCollapsed ? '+' : '−'}
          </button>
        </div>
      </div>
      {!isCollapsed ? (
        <>
          <input
            className="timeline-slider"
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={selectedYear}
            onChange={(event) => onYearChange(Number(event.target.value))}
          />
          <div className="timeline-labels">
            <span>{minYear}</span>
            <span>{maxYear}</span>
          </div>
        </>
      ) : null}
    </section>
  )
}

export default TimelineSlider
