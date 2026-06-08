function MapHudToolbar({ labels, selectedYear, activeSheet, onSelect }) {
  const items = [
    { id: 'evolution', label: labels.evolution },
    { id: 'navigator', label: labels.district },
    { id: 'timeline', label: String(selectedYear), className: 'map-hud-toolbar-year' },
    { id: 'yearRemarks', label: 'ⓘ', className: 'map-hud-toolbar-info', ariaLabel: labels.yearRemarks },
  ]

  return (
    <nav className="map-hud-toolbar" aria-label={labels.toolbarAria}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={[
            'map-hud-toolbar-btn',
            item.className,
            activeSheet === item.id ? 'is-active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={item.ariaLabel ?? item.label}
          aria-expanded={activeSheet === item.id}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}

export default MapHudToolbar
