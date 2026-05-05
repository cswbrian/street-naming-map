import { useEffect, useState } from 'react'

function TimelineSlider({ minYear, maxYear, selectedYear, onYearChange, isCollapsed, onToggle }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const milestoneYears = [minYear, 1945, maxYear]
  const toPercent = (year) => ((year - minYear) / (maxYear - minYear)) * 100

  useEffect(() => {
    if (!isPlaying) return undefined

    const interval = window.setInterval(() => {
      if (selectedYear >= maxYear) {
        setIsPlaying(false)
        return
      }
      onYearChange(selectedYear + 1)
    }, 1000)

    return () => window.clearInterval(interval)
  }, [isPlaying, selectedYear, maxYear, onYearChange])

  useEffect(() => {
    if (isCollapsed) {
      setIsPlaying(false)
    }
  }, [isCollapsed])

  return (
    <section className={`timeline-shell ${isCollapsed ? 'is-collapsed' : ''}`}>
      <div
        className="panel-header timeline-header"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
      >
        <span>時間軸 Timeline</span>
        <div className="panel-header-actions">
          {!isCollapsed ? <strong>{selectedYear}</strong> : null}
          {!isCollapsed ? (
            <button
              type="button"
              className="timeline-play-toggle"
              onClick={(event) => {
                event.stopPropagation()
                setIsPlaying((prev) => !prev)
              }}
              aria-label={isPlaying ? 'Pause timeline animation' : 'Play timeline animation'}
            >
              {isPlaying ? '❚❚' : '▶'}
            </button>
          ) : null}
          <button
            type="button"
            className="panel-toggle"
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
          >
            {isCollapsed ? '+' : '−'}
          </button>
        </div>
      </div>
      <div className={`panel-content ${isCollapsed ? 'is-collapsed' : ''}`}>
        <div className="timeline-slider-wrap">
          <input
            className="timeline-slider"
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={selectedYear}
            onChange={(event) => onYearChange(Number(event.target.value))}
          />
          {milestoneYears.map((year) => (
            <span
              key={year}
              className={`timeline-milestone ${
                year === minYear ? 'is-start' : year === maxYear ? 'is-end' : 'is-middle'
              }`}
              style={{ left: `${toPercent(year)}%` }}
            >
              {year}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

export default TimelineSlider
