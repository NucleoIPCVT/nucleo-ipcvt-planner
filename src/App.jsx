import { useEffect, useMemo, useRef, useState } from 'react'
import { browserLocalPersistence, GoogleAuthProvider, onAuthStateChanged, setPersistence, signInWithPopup, signOut } from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import PersonCard from './components/PersonCard.jsx'
import RoleBox from './components/RoleBox.jsx'
import { people as initialPeople } from './data/people.js'
import { areas } from './data/areas.js'
import { initialAssignments } from './data/initialAssignments.js'
import { auth, db } from './firebase.js'

const STORAGE_KEY = 'nucleo-ipcvt-planner-v1'
const BOARD_DOCUMENT = doc(db, 'app_ipcvt', 'planner_dados')
const SCALE_DOCUMENT = doc(db, 'app_ipcvt', 'escala_geral_dados')
const ACCESS_COLLECTION = 'tatico_acessos'
const THEME_STORAGE_KEY = 'ipcvt-estrategico-tema'
const PORTAL_URL = 'https://nucleoipcvt.github.io/Portal/'
const COMMISSION_URL = PORTAL_URL + 'comissao.html'
const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

function getInitialTheme() {
  try {
    const preference = localStorage.getItem(THEME_STORAGE_KEY)
    if (preference === 'dark' || preference === 'light') return preference
  } catch { /* O tema continua disponível mesmo sem armazenamento. */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function loginErrorMessage(error) {
  switch (error?.code) {
    case 'auth/popup-closed-by-user': return 'O login foi cancelado. Você pode tentar novamente.'
    case 'auth/popup-blocked': return 'Autorize a janela de login do Google no seu navegador.'
    case 'auth/unauthorized-domain': return 'Este endereço precisa ser autorizado no Firebase Authentication.'
    case 'auth/operation-not-allowed': return 'O acesso com Google precisa ser ativado no Firebase.'
    default: return 'Não foi possível entrar com Google. Tente novamente.'
  }
}

function PortalNavigation() {
  return (
    <nav className="portal-navigation" aria-label="Portais IPCVT">
      <a href={PORTAL_URL}>← Portal IPCVT</a>
      <a href={COMMISSION_URL}>← Portal Comissão IPCVT</a>
    </nav>
  )
}

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
  const [accessState, setAccessState] = useState('checking')
  const [accessEmail, setAccessEmail] = useState('')
  const [accessError, setAccessError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [theme, setTheme] = useState(getInitialTheme)
  const hasAccess = accessState === 'allowed'
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
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#20252a' : '#173f35')
    try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* Preferência opcional. */ }
  }, [theme])

  useEffect(() => {
    let sequence = 0
    let stopAuthorization = null
    const stopAuth = onAuthStateChanged(auth, async (user) => {
      const current = ++sequence
      stopAuthorization?.()
      stopAuthorization = null
      setCloudReady(false)
      setAccessState('checking')
      setAccessError('')
      setAccessEmail('')

      if (!user) {
        setAccessState('signed-out')
        return
      }

      try {
        const token = await user.getIdTokenResult()
        if (current !== sequence) return
        if (!user.email || !user.emailVerified || token.claims.firebase?.sign_in_provider !== 'google.com') {
          setAccessState('invalid-provider')
          return
        }

        const email = user.email.trim().toLowerCase()
        setAccessEmail(email)
        stopAuthorization = onSnapshot(doc(db, ACCESS_COLLECTION, email), (snapshot) => {
          if (current !== sequence) return
          setAccessState(snapshot.exists() && snapshot.data().ativo === true ? 'allowed' : 'pending')
        }, (error) => {
          if (current !== sequence) return
          setAccessState('error')
          setAccessError(error.code === 'permission-denied'
            ? 'Falta liberar a leitura das autorizações nas regras do Firebase.'
            : 'Não foi possível conferir sua autorização. Tente novamente.')
        })
      } catch {
        if (current !== sequence) return
        setAccessState('error')
        setAccessError('Não foi possível validar sua conta Google.')
      }
    }, () => {
      setAccessState('error')
      setAccessError('Não foi possível verificar sua sessão.')
    })

    return () => {
      ++sequence
      stopAuthorization?.()
      stopAuth()
    }
  }, [])

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

  async function loginWithGoogle() {
    setAuthBusy(true)
    setAccessError('')
    try {
      await setPersistence(auth, browserLocalPersistence)
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      setAccessError(loginErrorMessage(error))
    } finally {
      setAuthBusy(false)
    }
  }

  async function logout() {
    setAuthBusy(true)
    try {
      await signOut(auth)
    } catch {
      setAccessError('Não foi possível sair da conta. Tente novamente.')
    } finally {
      setAuthBusy(false)
    }
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
      <div className="access-shell">
        <header className="topbar">
          <a className="tactical-brand" href="./" aria-label="Início do Planejamento Estratégico">Planejamento Estratégico</a>
          <button className="theme-switch" type="button" aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo noturno'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span> {theme === 'dark' ? 'Modo claro' : 'Modo noturno'}
          </button>
        </header>
        <div className="portal-links-bar"><PortalNavigation /></div>
        <main className="access-page">
        <section className="access-card" aria-labelledby="access-title">
          <p className="eyebrow access-eyebrow">IPCVT</p>
          <h1 id="access-title">Planejamento Estratégico</h1>
          <p>Organize as equipes, experimente combinações e distribua integrantes entre funções.</p>
          {accessState === 'checking' && <p className="access-message" role="status">Verificando seu acesso…</p>}
          {accessState === 'pending' && <div className="access-pending" role="status"><strong>Aguardando autorização</strong><span>{accessEmail}</span><p>Peça à coordenação para liberar seu e-mail em “Administrar autorizações” → “Planejamento Estratégico”.</p></div>}
          {accessState === 'invalid-provider' && <p className="access-message">Entre com uma conta Google que tenha e-mail verificado.</p>}
          {accessError && <p className="password-error" role="alert">{accessError}</p>}
          {accessState === 'signed-out' && <button type="button" className="access-button" disabled={authBusy} onClick={loginWithGoogle}><span className="google-mark" aria-hidden="true">G</span> Entrar com Google</button>}
          {accessState !== 'checking' && accessState !== 'signed-out' && <button type="button" className="access-switch" disabled={authBusy} onClick={logout}>Usar outra conta Google</button>}
        </section>
        </main>
      </div>
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
        <a className="tactical-brand" href="./" aria-label="Início do Planejamento Estratégico">Planejamento Estratégico</a>
        <div className="session-actions">
          <span className="session-email" title={accessEmail}>{accessEmail}</span>
          <button type="button" className="theme-switch" aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo noturno'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span> {theme === 'dark' ? 'Claro' : 'Noturno'}</button>
          <button type="button" className="session-logout" disabled={authBusy} onClick={logout}>Sair</button>
        </div>
      </header>
      <div className="portal-links-bar"><PortalNavigation /></div>

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
