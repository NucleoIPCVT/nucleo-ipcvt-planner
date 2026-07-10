export default function PersonCard({ person, count, onRemove, compact = false }) {
  const level = count >= 3 ? 'danger' : count === 2 ? 'warning' : 'safe'

  function handleDragStart(event) {
    event.dataTransfer.setData('text/plain', person.id)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <button
      type="button"
      className={`person-card ${level} ${compact ? 'compact' : ''}`}
      draggable
      onDragStart={handleDragStart}
      title={`${person.name} — ${count} ${count === 1 ? 'função' : 'funções'}`}
    >
      <span className="initials" aria-hidden="true">
        {person.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
      </span>
      <span className="person-name">{person.name}</span>
      <span className="function-count">{count}</span>
      {onRemove && (
        <span
          className="remove-button"
          role="button"
          tabIndex={0}
          aria-label={`Remover ${person.name} desta função`}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onRemove()
          }}
        >
          ×
        </span>
      )}
    </button>
  )
}
