import PersonCard from './PersonCard.jsx'

export default function RoleBox({
  role,
  assignedPeople,
  counts,
  onDropPerson,
  onRemovePerson,
  selectedPersonId,
  onSelectPerson,
}) {
  function allowDrop(event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDrop(event) {
    event.preventDefault()
    const personId = event.dataTransfer.getData('text/plain')
    if (personId) onDropPerson(role.id, personId)
  }

  return (
    <section className="role-box" onDragOver={allowDrop} onDrop={handleDrop}>
      <header className="role-header">
        <h3>{role.name}</h3>
        <span>{assignedPeople.length}</span>
      </header>
      <div className="role-dropzone">
        {assignedPeople.length === 0 && <p className="empty-message">Solte um nome aqui</p>}
        {assignedPeople.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            count={counts[person.id] ?? 0}
            compact
            selected={selectedPersonId === person.id}
            onSelect={onSelectPerson}
            onRemove={() => onRemovePerson(role.id, person.id)}
          />
        ))}
      </div>
    </section>
  )
}
