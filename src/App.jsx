import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://m-motors-backend-copa.onrender.com'

const statusLabels = {
  SUBMITTED: 'Déposé',
  IN_PROGRESS: 'En cours',
  INCOMPLETE: 'Incomplet',
  APPROVED: 'Validé',
  REJECTED: 'Refusé',
}

function buildAuthHeader(email, password) {
  return `Basic ${btoa(`${email}:${password}`)}`
}

function formatPrice(value, suffix = '€') {
  if (value === null || value === undefined) return 'Non renseigné'
  return `${new Intl.NumberFormat('fr-FR').format(value)} ${suffix}`
}

function formatDate(value) {
  if (!value) return 'Non renseignée'
  return new Date(value).toLocaleDateString('fr-FR')
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options)

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Erreur HTTP ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

function App() {
  const [page, setPage] = useState('catalogue')

  const [vehicles, setVehicles] = useState([])
  const [adminVehicles, setAdminVehicles] = useState([])
  const [mode, setMode] = useState('ALL')
  const [search, setSearch] = useState('')
  const [maxBudget, setMaxBudget] = useState('')
  const [selectedVehicle, setSelectedVehicle] = useState(null)

  const [clientEmail, setClientEmail] = useState('')
  const [clientPassword, setClientPassword] = useState('')
  const [clientConnected, setClientConnected] = useState(false)
  const [clientFiles, setClientFiles] = useState([])
  const [pendingVehicle, setPendingVehicle] = useState(null)

  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminConnected, setAdminConnected] = useState(false)
  const [adminFiles, setAdminFiles] = useState([])

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadVehicles()
  }, [mode])

  async function loadVehicles() {
    try {
      setLoading(true)
      setError('')

      const query = mode === 'ALL' ? '' : `?mode=${mode}`
      const data = await apiRequest(`/api/vehicles${query}`)

      setVehicles(data)
    } catch {
      setError("Impossible de charger les véhicules depuis l'API.")
    } finally {
      setLoading(false)
    }
  }

  async function loadAdminVehicles() {
    const data = await apiRequest('/api/vehicles')
    setAdminVehicles(data)
  }

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const vehicleText = `${vehicle.brand} ${vehicle.model} ${vehicle.energy}`.toLowerCase()
      const referencePrice =
        vehicle.mode === 'RENTAL' ? vehicle.monthlyPrice : vehicle.price

      const matchesText = vehicleText.includes(search.toLowerCase())
      const matchesBudget =
        maxBudget === '' || Number(referencePrice || 0) <= Number(maxBudget)

      return vehicle.available && matchesText && matchesBudget
    })
  }, [vehicles, search, maxBudget])

  function resetFeedback() {
    setMessage('')
    setError('')
  }

  function goToPage(nextPage) {
    resetFeedback()
    setPage(nextPage)
  }

  async function submitApplicationFile(vehicle, email, password) {
    const type = vehicle.mode === 'RENTAL' ? 'RENTAL' : 'PURCHASE'

    await apiRequest('/api/application-files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildAuthHeader(email, password),
      },
      body: JSON.stringify({
        type,
        vehicleId: vehicle.id,
      }),
    })
  }

  async function loginClient(event) {
    event.preventDefault()

    try {
      resetFeedback()
      setLoading(true)

      if (pendingVehicle) {
        await submitApplicationFile(pendingVehicle, clientEmail, clientPassword)
        setPendingVehicle(null)
      }

      const files = await apiRequest('/api/application-files/my', {
        headers: {
          Authorization: buildAuthHeader(clientEmail, clientPassword),
        },
      })

      setClientFiles(files)
      setClientConnected(true)
      setMessage('Connexion client réussie.')
    } catch {
      setClientConnected(false)
      setError('Connexion client impossible. Vérifiez le login et le mot de passe.')
    } finally {
      setLoading(false)
    }
  }

  async function loadClientFiles() {
    if (!clientConnected) return

    try {
      resetFeedback()

      const files = await apiRequest('/api/application-files/my', {
        headers: {
          Authorization: buildAuthHeader(clientEmail, clientPassword),
        },
      })

      setClientFiles(files)
      setMessage('Dossiers client actualisés.')
    } catch {
      setError('Impossible de récupérer les dossiers client.')
    }
  }

  async function createApplicationFile(vehicle) {
    if (!clientConnected) {
      setPendingVehicle(vehicle)
      setSelectedVehicle(vehicle)
      setPage('client')
      setMessage('Connectez-vous à l’espace client pour déposer le dossier.')
      return
    }

    try {
      resetFeedback()

      await submitApplicationFile(vehicle, clientEmail, clientPassword)

      const files = await apiRequest('/api/application-files/my', {
        headers: {
          Authorization: buildAuthHeader(clientEmail, clientPassword),
        },
      })

      setClientFiles(files)
      setPage('client')
      setMessage('Dossier dématérialisé créé avec succès.')
    } catch {
      setError('Impossible de créer le dossier.')
    }
  }

  async function loginAdmin(event) {
    event.preventDefault()

    try {
      resetFeedback()
      setLoading(true)

      const files = await apiRequest('/api/application-files/admin', {
        headers: {
          Authorization: buildAuthHeader(adminEmail, adminPassword),
        },
      })

      const vehicleList = await apiRequest('/api/vehicles')

      setAdminFiles(files)
      setAdminVehicles(vehicleList)
      setAdminConnected(true)
      setMessage('Connexion administrateur réussie.')
    } catch {
      setAdminConnected(false)
      setError('Connexion administrateur impossible. Vérifiez le login et le mot de passe.')
    } finally {
      setLoading(false)
    }
  }

  async function loadAdminFiles() {
    if (!adminConnected) return

    try {
      resetFeedback()

      const files = await apiRequest('/api/application-files/admin', {
        headers: {
          Authorization: buildAuthHeader(adminEmail, adminPassword),
        },
      })

      setAdminFiles(files)
      setMessage('Dossiers back-office actualisés.')
    } catch {
      setError('Impossible de récupérer les dossiers administrateur.')
    }
  }

  async function updateApplicationStatus(id, status) {
    try {
      resetFeedback()

      await apiRequest(`/api/application-files/admin/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: buildAuthHeader(adminEmail, adminPassword),
        },
        body: JSON.stringify({
          status,
          adminComment:
            status === 'APPROVED'
              ? 'Dossier validé par le back-office M-Motors.'
              : 'Dossier refusé par le back-office M-Motors.',
        }),
      })

      const files = await apiRequest('/api/application-files/admin', {
        headers: {
          Authorization: buildAuthHeader(adminEmail, adminPassword),
        },
      })

      setAdminFiles(files)
      setMessage(`Dossier mis à jour : ${statusLabels[status]}.`)
    } catch {
      setError('Impossible de modifier le statut du dossier.')
    }
  }

  async function switchVehicleMode(vehicle) {
    const newMode = vehicle.mode === 'SALE' ? 'RENTAL' : 'SALE'

    try {
      resetFeedback()
      setLoading(true)

      await apiRequest(`/api/vehicles/${vehicle.id}/mode?mode=${newMode}`, {
        method: 'PATCH',
        headers: {
          Authorization: buildAuthHeader(adminEmail, adminPassword),
        },
      })

      await loadVehicles()
      await loadAdminVehicles()

      setMessage(
        `${vehicle.brand} ${vehicle.model} est maintenant disponible en ${
          newMode === 'RENTAL' ? 'location' : 'achat'
        }.`
      )
    } catch {
      setError('Impossible de basculer le mode du véhicule.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <button className="brand" onClick={() => goToPage('catalogue')} aria-label="Retour au catalogue">
          <span className="brand-mark">M</span>
          <span>
            <strong>M-Motors</strong>
            <small>Premium mobility platform</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="Navigation principale">
          <button className={page === 'catalogue' ? 'active' : ''} onClick={() => goToPage('catalogue')}>
            Catalogue
          </button>
          <button className={page === 'client' ? 'active' : ''} onClick={() => goToPage('client')}>
            Espace client
          </button>
          <button className={page === 'admin' ? 'active' : ''} onClick={() => goToPage('admin')}>
            Administration
          </button>
        </nav>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Sélection premium de véhicules</p>
          <h1>Acheter ou louer votre prochain véhicule en toute simplicité</h1>
          <p>
            Recherchez un véhicule disponible, consultez sa fiche détaillée et
            déposez votre dossier depuis un espace client sécurisé. Les équipes
            M-Motors suivent ensuite chaque demande depuis le back-office.
          </p>

          <div className="hero-actions">
            <button className="primary" onClick={() => goToPage('catalogue')}>
              Voir les véhicules
            </button>
            <button className="ghost" onClick={() => goToPage('client')}>
              Accéder à mon espace
            </button>
          </div>
        </div>

        <div className="status-card">
          <span>Depuis 1987</span>
          <strong>M-Motors</strong>
          <small>Vente de véhicules d’occasion et location longue durée avec option d’achat.</small>
        </div>
      </section>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      {loading && <p className="info">Chargement...</p>}

      {page === 'catalogue' && (
        <>
          <section className="filters">
            <div>
              <label>Mode</label>
              <div className="segmented">
                <button className={mode === 'ALL' ? 'active' : ''} onClick={() => setMode('ALL')}>
                  Tous
                </button>
                <button className={mode === 'SALE' ? 'active' : ''} onClick={() => setMode('SALE')}>
                  Achat
                </button>
                <button className={mode === 'RENTAL' ? 'active' : ''} onClick={() => setMode('RENTAL')}>
                  Location
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="search">Recherche</label>
              <input
                id="search"
                type="search"
                placeholder="Marque, modèle, énergie..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div>
              <label htmlFor="budget">Budget maximum</label>
              <input
                id="budget"
                type="number"
                placeholder="Prix ou mensualité"
                value={maxBudget}
                onChange={(event) => setMaxBudget(event.target.value)}
              />
            </div>
          </section>

          <section className="layout">
            <div>
              <div className="section-title">
                <h2>Véhicules disponibles</h2>
                <span>{filteredVehicles.length} résultat(s)</span>
              </div>

              <div className="vehicle-grid">
                {filteredVehicles.map((vehicle) => (
                  <article className="vehicle-card" key={vehicle.id}>
                    <div className="vehicle-media">
                      <span>{vehicle.brand.charAt(0)}</span>
                    </div>

                    <div className="vehicle-content">
                      <span className={`badge ${vehicle.mode.toLowerCase()}`}>
                        {vehicle.mode === 'RENTAL' ? 'Location' : 'Achat'}
                      </span>

                      <h3>{vehicle.brand} {vehicle.model}</h3>
                      <p>{vehicle.description}</p>

                      <dl>
                        <div>
                          <dt>Énergie</dt>
                          <dd>{vehicle.energy}</dd>
                        </div>
                        <div>
                          <dt>Kilométrage</dt>
                          <dd>{formatPrice(vehicle.mileage, 'km')}</dd>
                        </div>
                        <div>
                          <dt>{vehicle.mode === 'RENTAL' ? 'Mensualité' : 'Prix'}</dt>
                          <dd>
                            {vehicle.mode === 'RENTAL'
                              ? formatPrice(vehicle.monthlyPrice, '€/mois')
                              : formatPrice(vehicle.price)}
                          </dd>
                        </div>
                      </dl>

                      <div className="actions">
                        <button onClick={() => setSelectedVehicle(vehicle)}>
                          Consulter la fiche
                        </button>
                        <button className="primary" onClick={() => createApplicationFile(vehicle)}>
                          Déposer un dossier
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <aside className="side-panel">
              <h2>Fiche véhicule</h2>

              {selectedVehicle ? (
                <>
                  <h3>{selectedVehicle.brand} {selectedVehicle.model}</h3>
                  <p>{selectedVehicle.description}</p>
                  <ul>
                    <li>Mode : {selectedVehicle.mode === 'RENTAL' ? 'Location' : 'Achat'}</li>
                    <li>Énergie : {selectedVehicle.energy}</li>
                    <li>Kilométrage : {formatPrice(selectedVehicle.mileage, 'km')}</li>
                    <li>
                      Budget : {selectedVehicle.mode === 'RENTAL'
                        ? formatPrice(selectedVehicle.monthlyPrice, '€/mois')
                        : formatPrice(selectedVehicle.price)}
                    </li>
                  </ul>
                  <button className="primary full" onClick={() => createApplicationFile(selectedVehicle)}>
                    Déposer un dossier
                  </button>
                </>
              ) : (
                <p>Sélectionnez un véhicule pour afficher sa fiche détaillée.</p>
              )}
            </aside>
          </section>
        </>
      )}

      {page === 'client' && (
        <section className="workspace">
          <div className="workspace-header">
            <div>
              <p className="eyebrow dark">Espace sécurisé</p>
              <h2>Espace client</h2>
            </div>

            {clientConnected && (
              <button className="secondary" onClick={loadClientFiles}>
                Actualiser mes dossiers
              </button>
            )}
          </div>

          {!clientConnected ? (
            <form className="login-card" onSubmit={loginClient}>
              <h3>Connexion client</h3>
              <p>
                Les identifiants de démonstration sont fournis dans le dossier
                de rendu, conformément aux consignes.
              </p>

              <label htmlFor="client-email">Email</label>
              <input
                id="client-email"
                type="email"
                value={clientEmail}
                onChange={(event) => setClientEmail(event.target.value)}
                placeholder="email client"
                required
              />

              <label htmlFor="client-password">Mot de passe</label>
              <input
                id="client-password"
                type="password"
                value={clientPassword}
                onChange={(event) => setClientPassword(event.target.value)}
                placeholder="mot de passe"
                required
              />

              {pendingVehicle && (
                <p className="pending">
                  Dossier en attente pour : {pendingVehicle.brand} {pendingVehicle.model}
                </p>
              )}

              <button className="primary full" type="submit">
                Se connecter
              </button>
            </form>
          ) : (
            <div className="panel">
              <h3>Mes dossiers</h3>

              {clientFiles.length === 0 ? (
                <p className="empty">Aucun dossier client pour le moment.</p>
              ) : (
                <div className="table">
                  {clientFiles.map((file) => (
                    <div className="row" key={file.id}>
                      <span>#{file.id}</span>
                      <span>{file.vehicleBrand} {file.vehicleModel}</span>
                      <span>{file.type === 'RENTAL' ? 'Location' : 'Achat'}</span>
                      <strong>{statusLabels[file.status] || file.status}</strong>
                      <small>{formatDate(file.createdAt)}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {page === 'admin' && (
        <section className="workspace">
          <div className="workspace-header">
            <div>
              <p className="eyebrow dark">Back-office</p>
              <h2>Administration M-Motors</h2>
            </div>

            {adminConnected && (
              <button className="secondary" onClick={() => { loadAdminFiles(); loadAdminVehicles(); }}>
                Actualiser
              </button>
            )}
          </div>

          {!adminConnected ? (
            <form className="login-card" onSubmit={loginAdmin}>
              <h3>Connexion administrateur</h3>
              <p>
                Cette zone représente le back-office M-Motors pour consulter,
                valider ou refuser les dossiers et gérer le mode commercial des véhicules.
              </p>

              <label htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="email administrateur"
                required
              />

              <label htmlFor="admin-password">Mot de passe</label>
              <input
                id="admin-password"
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="mot de passe"
                required
              />

              <button className="primary full" type="submit">
                Se connecter au back-office
              </button>
            </form>
          ) : (
            <>
              <div className="panel">
                <h3>Dossiers à traiter</h3>

                {adminFiles.length === 0 ? (
                  <p className="empty">Aucun dossier à afficher.</p>
                ) : (
                  <div className="table">
                    {adminFiles.map((file) => (
                      <div className="row admin-row" key={file.id}>
                        <span>#{file.id}</span>
                        <span>{file.clientEmail}</span>
                        <span>{file.vehicleBrand} {file.vehicleModel}</span>
                        <strong>{statusLabels[file.status] || file.status}</strong>
                        <div className="mini-actions">
                          <button
                            disabled={file.status === 'APPROVED'}
                            onClick={() => updateApplicationStatus(file.id, 'APPROVED')}
                          >
                            Valider
                          </button>
                          <button
                            disabled={file.status === 'REJECTED'}
                            onClick={() => updateApplicationStatus(file.id, 'REJECTED')}
                          >
                            Refuser
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel vehicle-management">
                <div className="vehicle-management-header">
                  <div>
                    <h3>Gestion des véhicules</h3>
                    <p>
                      Le back-office permet de basculer un véhicule du mode achat vers
                      la location, ou inversement.
                    </p>
                  </div>
                </div>

                <div className="admin-vehicle-grid">
                  {adminVehicles.map((vehicle) => (
                    <article className="admin-vehicle-card" key={vehicle.id}>
                      <div>
                        <span className={`mode-pill ${vehicle.mode.toLowerCase()}`}>
                          {vehicle.mode === 'RENTAL' ? 'Location' : 'Achat'}
                        </span>
                        <h4>{vehicle.brand} {vehicle.model}</h4>
                        <p>{vehicle.energy} · {formatPrice(vehicle.mileage, 'km')}</p>
                      </div>

                      <button className="secondary" onClick={() => switchVehicleMode(vehicle)}>
                        {vehicle.mode === 'SALE'
                          ? 'Basculer en location'
                          : 'Basculer en achat'}
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  )
}

export default App
