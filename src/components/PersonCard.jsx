export default function PersonCard({
  person,
  count,
  onRemove,
  compact = false,
  selected = false,
  onSelect,
}) {
  const level = count >= 3 ? 'danger' : count === 2 ? 'warning' : count === 1 ? 'safe' : 'idle'
  const isPossible = person.status === 'possivel'

  function handleDragStart(event) {
    event.dataTransfer.setData('text/plain', person.id)
    event.dataTransfer.effectAllowed = 'copy'
  }

  function handleSelect(event) {
    if (event.defaultPrevented) return
    onSelect?.(person.id)
  }

  return (
    <button
      type="button"
      className={`person-card ${level} ${compact ? 'compact' : 'palette'} ${selected ? 'selected' : ''} ${isPossible ? 'possible' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onClick={handleSelect}
      title={`${person.name} — ${count} ${count === 1 ? 'função' : 'funções'}`}
      aria-pressed={selected}
    >
      <span className="workload-dot" aria-hidden="true" />
      <span className="person-name">{person.name}</span>
      <span className="function-count" aria-label={`${count} funções`}>{count}</span>
      {onRemove && (
        <span
          className="remove-button"
          role="button"
          tabIndex={0}
          aria-label={`Remover ${person.name} desta função`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onRemove()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              onRemove()
            }
          }}
        >
          ×
        </span>
      )}
    </button>
  )
}
