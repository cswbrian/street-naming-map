import { useEffect, useState } from 'react'
import { useLocale } from '../i18n/LocaleContext'
import { trackTimelinePlay, trackTimelineYear } from '../lib/analytics.js'

function TimelineSlider({ minYear, maxYear, selectedYear, onYearChange, isCollapsed, onToggle }) {
  const { t } = useLocale()
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
      onYearChange(selectedYear + 1, 'play')
    }, 300)

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
        <p className="legend-title">{t('timeline')}</p>
        <div className="panel-header-actions">
          {!isCollapsed ? <strong className="timeline-year-value">{selectedYear}</strong> : null}
          {!isCollapsed ? (
            <button
              type="button"
              className="timeline-play-toggle"
              onClick={(event) => {
                event.stopPropagation()
                setIsPlaying((prev) => {
                  const next = !prev
                  trackTimelinePlay(next ? 'start' : 'stop', selectedYear)
                  return next
                })
              }}
              aria-label={isPlaying ? t('timelinePause') : t('timelinePlay')}
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
            onChange={(event) => onYearChange(Number(event.target.value), 'slider')}
            onPointerUp={(event) => trackTimelineYear(Number(event.target.value), 'slider')}
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
