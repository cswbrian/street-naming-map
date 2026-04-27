function TimelineSlider({ minYear, maxYear, selectedYear, onYearChange }) {
  return (
    <section className="timeline-shell">
      <div className="timeline-header">
        <span>Street Naming Timeline</span>
        <strong>{selectedYear}</strong>
      </div>
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
    </section>
  )
}

export default TimelineSlider
