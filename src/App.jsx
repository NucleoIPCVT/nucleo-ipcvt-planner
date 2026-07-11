import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import PersonCard from './components/PersonCard.jsx'
import RoleBox from './components/RoleBox.jsx'
import { people as initialPeople } from './data/people.js'
import { areas } from './data/areas.js'
import { initialAssignments } from './data/initialAssignments.js'
import { db } from './firebase.js'

const STORAGE_KEY = 'nucleo-ipcvt-planner-v1'
const BOARD_DOCUMENT = doc(db, 'app_ipcvt', 'planner_dados')
const SCALE_DOCUMENT = doc(db, 'app_ipcvt', 'escala_geral_dados')
const ACCESS_SESSION_KEY = 'nucleo-ipcvt-planner-access'
const ACCESS_PASSWORD = 'ipcvt0509'

function readSavedData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

function validBoardData(data) {
  return Boolean(data && Array.isArray(data.people) && data.assignments && typeof data.assignments === 'object')
}

function normalizePersonName(value) {
  if (typeof value !== 'string') return ''
  const name = value.replace(/\s+/g, ' ').trim()
  if (!name || name === '-' || name.length < 2) return ''
  return name
}

function personIdFromName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function collectNames(value, result = new Set()) {
  if (typeof value === 'string') {
    const name = normalizePersonName(value)
    if (name) result.add(name)
    return result
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectNames(item, result))
    return result
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectNames(item, result))
  }

  return result
}

export default function App() {
  const [hasAccess, setHasAccess] = useState(() => sessionStorage.getItem(ACCESS_SESSION_KEY) === 'granted')
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const localData = useMemo(() => readSavedData(), [])
  const [people, setPeople] = useState(localData?.people ?? initialPeople)
  const [assignments, setAssignments] = useState(localData?.assignments ?? initialAssignments)
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [selectedPersonId, setSelectedPersonId] = useState(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [syncStatus, setSyncStatus] = useState('connecting')
  const [syncError, setSyncError] = useState('')
  const [importing, setImporting] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const saveTimer = useRef(null)
  const applyingRemoteData = useRef(false)

  useEffect(() => {
    if (!hasAccess) return undefined

    const unsubscribe = onSnapshot(
      BOARD_DOCUMENT,
      async (snapshot) => {
        try {
          if (snapshot.exists() && validBoardData(snapshot.data())) {
            applyingRemoteData.current = true
            setPeople(snapshot.data().people)
            setAssignments(snapshot.data().assignments)
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ people: snapshot.data().people, assignments: snapshot.data().assignments }),
            )
          } else {
            const firstData = {
              people: localData?.people ?? initialPeople,
              assignments: localData?.assignments ?? initialAssignments,
              updatedAt: serverTimestamp(),
            }
            await setDoc(BOARD_DOCUMENT, firstData)
          }

          setCloudReady(true)
          setSyncStatus('saved')
          setSyncError('')
        } catch (error) {
          console.error('Falha ao preparar o painel online:', error)
          setCloudReady(true)
          setSyncStatus('error')
          setSyncError(error.message)
        }
      },
      (error) => {
        console.error('Falha ao conectar ao Firestore:', error)
        setCloudReady(true)
        setSyncStatus('error')
        setSyncError(error.message)
      },
    )

    return () => unsubscribe()
  }, [localData, hasAccess])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ people, assignments }))

    if (!hasAccess || !cloudReady) return

    if (applyingRemoteData.current) {
      applyingRemoteData.current = false
      return
    }

    window.clearTimeout(saveTimer.current)
    setSyncStatus('saving')

    saveTimer.current = window.setTimeout(async () => {
      try {
        await setDoc(
          BOARD_DOCUMENT,
          {
            people,
            assignments,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        setSyncStatus('saved')
        setSyncError('')
      } catch (error) {
        console.error('Falha ao salvar no Firestore:', error)
        setSyncStatus('error')
        setSyncError(error.message)
      }
    }, 500)

    return () => window.clearTimeout(saveTimer.current)
  }, [people, assignments, cloudReady, hasAccess])

  const peopleById = useMemo(
    () => Object.fromEntries(people.map((person) => [person.id, person])),
    [people],
  )

  const counts = useMemo(() => {
    const result = {}
    Object.values(assignments).flat().forEach((personId) => {
      result[personId] = (result[personId] ?? 0) + 1
    })
    return result
  }, [assignments])

  const filteredPeople = people.filter((person) =>
    person.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  function selectPerson(personId) {
    setSelectedPersonId((current) => (current === personId ? null : personId))
  }

  function addPersonToRole(roleId, personId) {
    setAssignments((current) => {
      const rolePeople = current[roleId] ?? []
      if (rolePeople.includes(personId)) return current
      return { ...current, [roleId]: [...rolePeople, personId] }
    })
  }

  function removePersonFromRole(roleId, personId) {
    setAssignments((current) => ({
      ...current,
      [roleId]: (current[roleId] ?? []).filter((id) => id !== personId),
    }))
  }

  function addNewPerson(event) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    const id = personIdFromName(name)

    if (people.some((person) => person.id === id)) {
      alert('Essa pessoa já está cadastrada.')
      return
    }

    setPeople((current) =>
      [...current, { id, name, status: 'possivel' }].sort((a, b) => a.name.localeCompare(b.name)),
    )
    setNewName('')
  }

  function unlock(event) {
    event.preventDefault()
    if (password === ACCESS_PASSWORD) {
      sessionStorage.setItem(ACCESS_SESSION_KEY, 'granted')
      setHasAccess(true)
      setPassword('')
      setPasswordError('')
      return
    }
    setPasswordError('Senha incorreta.')
  }

  async function importPeopleFromScale() {
    setImporting(true)
    try {
      const snapshot = await getDoc(SCALE_DOCUMENT)
      if (!snapshot.exists()) {
        alert('O documento escala_geral_dados não foi encontrado.')
        return
      }

      const data = snapshot.data()
      const source = data.members ?? data.integrantes ?? data.people ?? data
      const importedNames = [...collectNames(source)]
      const existingIds = new Set(people.map((person) => person.id))
      const newPeople = importedNames
        .map((name) => ({ id: personIdFromName(name), name, status: 'ativo' }))
        .filter((person) => person.id && !existingIds.has(person.id))

      if (!newPeople.length) {
        alert('Nenhum integrante novo foi encontrado na escala.')
        return
      }

      setPeople((current) =>
        [...current, ...newPeople].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      )
      alert(`${newPeople.length} integrante(s) novo(s) importado(s) da escala.`)
    } catch (error) {
      console.error('Falha ao importar integrantes:', error)
      alert(`Não foi possível importar os integrantes: ${error.message}`)
    } finally {
      setImporting(false)
    }
  }

  function resetBoard() {
    const confirmed = window.confirm(
      'Restaurar a organização inicial? Essa mudança também será salva online para todos os aparelhos.',
    )
    if (!confirmed) return
    setPeople(initialPeople)
    setAssignments(initialAssignments)
  }

  if (!hasAccess) {
    return (
      <main className="access-page">
        <form className="access-card" onSubmit={unlock}>
          <p className="eyebrow access-eyebrow">IPCVT</p>
          <h1>Núcleo Planner</h1>
          <p>Digite a senha compartilhada para acessar o painel de brainstorm.</p>
          <label htmlFor="access-password">Senha de acesso</label>
          <input
            id="access-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
          />
          {passwordError && <div className="password-error">{passwordError}</div>}
          <button type="submit" className="access-button">Entrar</button>
        </form>
      </main>
    )
  }

  const statusLabel = {
    connecting: 'Conectando ao Firebase…',
    saving: 'Salvando online…',
    saved: 'Salvo online',
    error: 'Erro de sincronização',
  }[syncStatus]

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          type="button"
          className="menu-button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir painel de pessoas"
          aria-expanded={sidebarOpen}
        >
          <span className="menu-icon" aria-hidden="true">☰</span>
          Pessoas
        </button>
      </header>

      {syncStatus === 'error' && (
        <div className="sync-alert" role="alert">
          Não foi possível sincronizar com o Firebase. O painel continuará salvo neste aparelho. Verifique as regras do Firestore.
        </div>
      )}

      <main className="workspace">
        {sidebarOpen && (
          <button
            type="button"
            className="sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar painel de pessoas"
          />
        )}

        <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <div className="sidebar-heading">
            <div>
              <h2>Pessoas</h2>
              <p>{people.length} nomes disponíveis</p>
            </div>
            <button
              type="button"
              className="close-sidebar-button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Fechar painel de pessoas"
            >
              ×
            </button>
          </div>

          <div className={`sidebar-sync sync-${syncStatus}`} title={syncError || 'Alterações compartilhadas pelo Cloud Firestore'}>
            <span className="sync-dot" />
            {statusLabel}
          </div>

          <div className="sidebar-tools">
            <div className="legend" aria-label="Legenda de carga">
              <span><i className="dot safe-dot" />1 função</span>
              <span><i className="dot warning-dot" />2 funções</span>
              <span><i className="dot danger-dot" />3 ou mais</span>
            </div>
            <button type="button" className="restore-button" onClick={resetBoard}>Restaurar painel</button>
          </div>

          <button
            type="button"
            className="import-button"
            onClick={importPeopleFromScale}
            disabled={importing}
          >
            {importing ? 'Importando…' : 'Puxar integrantes da escala'}
          </button>

          <input
            className="search-input"
            type="search"
            placeholder="Buscar nome..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <form className="new-person-form" onSubmit={addNewPerson}>
            <input
              type="text"
              placeholder="Possível novo integrante"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <button type="submit">Adicionar</button>
          </form>

          <p className="drag-help">Arraste um nome para qualquer função. Clique nele para destacar todas as aparições.</p>

          <div className="people-list">
            {filteredPeople.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                count={counts[person.id] ?? 0}
                selected={selectedPersonId === person.id}
                onSelect={selectPerson}
              />
            ))}
          </div>
        </aside>

        <div className="board">
          {areas.map((area) => (
            <section className={`area-section area-${area.id}`} key={area.id}>
              <div className="area-title-row">
                <h2>{area.name}</h2>
                <span>{area.roles.length} {area.roles.length === 1 ? 'função' : 'funções'}</span>
              </div>
              <div className="roles-grid">
                {area.roles.map((role) => (
                  <RoleBox
                    key={role.id}
                    role={role}
                    counts={counts}
                    assignedPeople={(assignments[role.id] ?? []).map((id) => peopleById[id]).filter(Boolean)}
                    onDropPerson={addPersonToRole}
                    onRemovePerson={removePersonFromRole}
                    selectedPersonId={selectedPersonId}
                    onSelectPerson={selectPerson}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
