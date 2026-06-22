import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://m-motors-backend-copa.onrender.com'

const statusLabels = {
  SUBMITTED: 'Déposé',
  IN_PROGRESS: 'En cours',
  INCOMPLETE: 'À compléter',
  APPROVED: 'Validé',
  REJECTED: 'Refusé',
}

function dossierStatusClass(status) {
  return `status-pill ${(status || 'INCOMPLETE').toLowerCase()}`
}

function clientDossierStatusTitle(status) {
  if (status === 'APPROVED') return 'Dossier validé'
  if (status === 'REJECTED') return 'Dossier refusé'
  return 'Dossier envoyé avec succès'
}

function clientDossierStatusText(status) {
  if (status === 'APPROVED') return 'Votre dossier a été validé par l’administration M-Motors.'
  if (status === 'REJECTED') return 'Votre dossier a été refusé par l’administration M-Motors. Consultez le commentaire associé ou contactez l’agence.'
  return 'Votre dossier est en attente de validation. Les documents ne sont plus modifiables depuis l’espace client.'
}

const documentTypeLabels = {
  IDENTITY_DOCUMENT: 'Pièce d’identité',
  PROOF_OF_ADDRESS: 'Justificatif de domicile',
  PAYSLIP: 'Bulletin de salaire',
  BANK_DETAILS: 'RIB',
  OTHER: 'Autre document',
}

const documentTypes = Object.keys(documentTypeLabels)

const requiredDocumentTypes = [
  'IDENTITY_DOCUMENT',
  'PROOF_OF_ADDRESS',
  'PAYSLIP',
  'BANK_DETAILS',
]

const allowedDocumentTypes = ['application/pdf', 'image/jpeg', 'image/png']
const maxDocumentSize = 5 * 1024 * 1024

const initialDocumentForm = {
  type: 'IDENTITY_DOCUMENT',
  file: null,
}

const initialVehicleForm = {
  brand: '',
  model: '',
  energy: '',
  mileage: '',
  price: '',
  monthlyPrice: '',
  mode: 'SALE',
  description: '',
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

function formatFileSize(value) {
  if (!value) return 'Taille non renseignée'
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`
  return `${(value / 1024 / 1024).toFixed(1)} Mo`
}

function validateSelectedDocument(file) {
  if (!file) return 'Veuillez sélectionner un fichier.'
  if (!allowedDocumentTypes.includes(file.type)) {
    return 'Format non autorisé. Formats acceptés : PDF, JPG, PNG.'
  }
  if (file.size > maxDocumentSize) {
    return 'Le fichier ne doit pas dépasser 5 Mo.'
  }
  return null
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options)

  if (!response.ok) {
    const text = await response.text()
    let message = text || `Une erreur est survenue. Code HTTP ${response.status}.`

    try {
      const payload = JSON.parse(text)
      message = payload.message || payload.detail || payload.error || message
    } catch {
      // Le backend peut aussi renvoyer un texte simple.
    }

    throw new Error(message)
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
  const [clientDocuments, setClientDocuments] = useState({})
  const [documentForms, setDocumentForms] = useState({})
  const [pendingVehicle, setPendingVehicle] = useState(null)

  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminConnected, setAdminConnected] = useState(false)
  const [adminFiles, setAdminFiles] = useState([])
  const [adminDocuments, setAdminDocuments] = useState({})
  const [vehicleForm, setVehicleForm] = useState(initialVehicleForm)

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

  const visibleAdminFiles = useMemo(() => {
    return adminFiles.filter((file) => file.status !== 'INCOMPLETE')
  }, [adminFiles])

  function resetFeedback() {
    setMessage('')
    setError('')
  }

  function goToPage(nextPage) {
    resetFeedback()
    setPage(nextPage)

    if (nextPage === 'admin' && adminConnected) {
      refreshAdminWorkspaceSilently()
    }
  }

  function authHeaders(email, password) {
    return { Authorization: buildAuthHeader(email, password) }
  }

  function documentFormFor(applicationFileId) {
    return documentForms[applicationFileId] || initialDocumentForm
  }

  function missingRequiredDocumentTypes(documents = []) {
    return requiredDocumentTypes.filter((type) => !documents.some((documentFile) => documentFile.type === type))
  }

  function nextAvailableDocumentType(documents = []) {
    return missingRequiredDocumentTypes(documents)[0] || 'OTHER'
  }

  function complementaryDocumentCount(documents = []) {
    return documents.filter((documentFile) => documentFile.type === 'OTHER').length
  }

  function availableDocumentTypes(documents = []) {
    return documentTypes.filter((type) => {
      if (type === 'OTHER') return complementaryDocumentCount(documents) < 2
      return !documents.some((documentFile) => documentFile.type === type)
    })
  }

  function updateDocumentForm(applicationFileId, field, value) {
    setDocumentForms((current) => ({
      ...current,
      [applicationFileId]: {
        ...documentFormFor(applicationFileId),
        [field]: value,
      },
    }))
  }

  function handleDocumentFileSelection(applicationFileId, selectedFile) {
    const form = documentFormFor(applicationFileId)
    const documents = clientDocuments[applicationFileId] || []

    if (!selectedFile) {
      updateDocumentForm(applicationFileId, 'file', null)
      return
    }

    if (form.type !== 'OTHER' && documents.some((documentFile) => documentFile.type === form.type)) {
      setError(`Le document "${documentTypeLabels[form.type]}" a déjà été ajouté. Supprimez-le avant d’en téléverser un nouveau.`)
      updateDocumentForm(applicationFileId, 'file', null)
      return
    }

    if (form.type === 'OTHER' && complementaryDocumentCount(documents) >= 2) {
      setError('Vous pouvez ajouter au maximum 2 documents complémentaires. Pour transmettre une pièce supplémentaire, contactez l’administration M-Motors.')
      updateDocumentForm(applicationFileId, 'file', null)
      return
    }

    const validationError = validateSelectedDocument(selectedFile)

    if (validationError) {
      setError(validationError)
      updateDocumentForm(applicationFileId, 'file', null)
      return
    }

    setError('')
    updateDocumentForm(applicationFileId, 'file', selectedFile)
  }

  function isApplicationEditable(applicationFile) {
    return applicationFile.status === 'INCOMPLETE'
  }

  function updateVehicleForm(field, value) {
    setVehicleForm((current) => ({
      ...current,
      [field]: value,
    }))
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
      await Promise.all(files.map((file) => loadClientDocuments(file.id)))
      setClientConnected(true)
      setMessage('Connexion client réussie.')
    } catch {
      setClientConnected(false)
      setError('Connexion client impossible. Vérifiez le login et le mot de passe.')
    } finally {
      setLoading(false)
    }
  }

  async function loadClientDocuments(applicationFileId) {
    const documents = await apiRequest(`/api/document-files/application-files/${applicationFileId}`, {
      headers: authHeaders(clientEmail, clientPassword),
    })

    setClientDocuments((current) => ({
      ...current,
      [applicationFileId]: documents,
    }))

    setDocumentForms((current) => ({
      ...current,
      [applicationFileId]: {
        type: nextAvailableDocumentType(documents),
        file: null,
      },
    }))

    return documents
  }

  async function loadClientFiles() {
    if (!clientConnected) return

    try {
      resetFeedback()

      const files = await apiRequest('/api/application-files/my', {
        headers: authHeaders(clientEmail, clientPassword),
      })

      setClientFiles(files)
      await Promise.all(files.map((file) => loadClientDocuments(file.id)))
      setMessage('Dossiers client actualisés.')
    } catch {
      setError('Impossible de récupérer les dossiers client.')
    }
  }

  async function addClientDocumentFromInputs(applicationFileId, documentsSnapshot = []) {
    const typeInput = document.getElementById(`document-type-${applicationFileId}`)
    const fileInput = document.getElementById(`document-file-${applicationFileId}`)
    const selectedType = typeInput?.value || nextAvailableDocumentType(documentsSnapshot)
    const selectedFile = fileInput?.files?.[0] || null

    await addClientDocument(applicationFileId, { type: selectedType, file: selectedFile }, documentsSnapshot)
  }

  async function addClientDocument(applicationFileId, selectedForm = null, selectedDocuments = null, event = null) {
    if (event) event.preventDefault()

    try {
      resetFeedback()
      const form = selectedForm || documentFormFor(applicationFileId)
      const applicationFile = clientFiles.find((file) => file.id === applicationFileId)
      const documents = selectedDocuments || clientDocuments[applicationFileId] || []

      if (applicationFile && !isApplicationEditable(applicationFile)) {
        setError('Ce dossier a déjà été envoyé et ne peut plus être modifié.')
        return
      }

      if (form.type !== 'OTHER' && documents.some((documentFile) => documentFile.type === form.type)) {
        setError(`Le document "${documentTypeLabels[form.type]}" a déjà été ajouté. Supprimez-le avant d’en téléverser un nouveau.`)
        return
      }

      if (form.type === 'OTHER' && complementaryDocumentCount(documents) >= 2) {
        setError('Vous pouvez ajouter au maximum 2 documents complémentaires. Pour transmettre une pièce supplémentaire, contactez l’administration M-Motors.')
        return
      }

      const validationError = validateSelectedDocument(form.file)

      if (validationError) {
        setError(validationError)
        return
      }

      setMessage('Téléversement du document en cours. Veuillez patienter...')

      const formData = new FormData()
      formData.append('type', form.type)
      formData.append('file', form.file)

      await apiRequest(`/api/document-files/application-files/${applicationFileId}/upload`, {
        method: 'POST',
        headers: authHeaders(clientEmail, clientPassword),
        body: formData,
      })

      await loadClientFiles()
      setMessage('Document ajouté au dossier.')
    } catch {
      setError('Impossible d’ajouter le document au dossier. Vérifiez le fichier sélectionné puis réessayez.')
    }
  }

  async function submitClientApplication(applicationFileId) {
    try {
      resetFeedback()

      const documents = clientDocuments[applicationFileId] || []
      const missingTypes = missingRequiredDocumentTypes(documents)

      if (missingTypes.length > 0) {
        setError(`Documents obligatoires manquants : ${missingTypes.map((type) => documentTypeLabels[type]).join(', ')}.`)
        return
      }

      setMessage('Envoi du dossier en cours. Veuillez patienter...')

      await apiRequest(`/api/application-files/my/${applicationFileId}/submit`, {
        method: 'PATCH',
        headers: authHeaders(clientEmail, clientPassword),
      })

      await loadClientFiles()

      if (adminConnected) {
        await refreshAdminWorkspaceSilently()
      }

      setMessage('Dossier envoyé avec succès. Il est maintenant en attente de validation par l’administration M-Motors.')
    } catch (exception) {
      setError(exception.message || 'Impossible d’envoyer le dossier. Vérifiez que toutes les pièces obligatoires sont bien ajoutées puis réessayez.')
    }
  }

  async function deleteClientApplicationFile(applicationFileId) {
    try {
      resetFeedback()

      await apiRequest(`/api/application-files/my/${applicationFileId}`, {
        method: 'DELETE',
        headers: authHeaders(clientEmail, clientPassword),
      })

      setClientFiles((current) => current.filter((file) => file.id !== applicationFileId))
      setClientDocuments((current) => {
        const updated = { ...current }
        delete updated[applicationFileId]
        return updated
      })
      setDocumentForms((current) => {
        const updated = { ...current }
        delete updated[applicationFileId]
        return updated
      })

      await loadClientFiles()
      setMessage('Dossier supprimé avec succès.')
    } catch (exception) {
      setError(exception.message || 'Impossible de supprimer le dossier. Seul un dossier à compléter peut être supprimé.')
    }
  }

  async function deleteClientDocument(applicationFileId, documentFileId) {
    try {
      resetFeedback()

      await apiRequest(`/api/document-files/${documentFileId}`, {
        method: 'DELETE',
        headers: authHeaders(clientEmail, clientPassword),
      })

      await loadClientFiles()
      setMessage('Document supprimé du dossier.')
    } catch {
      setError('Impossible de supprimer le document.')
    }
  }

  async function deleteAllClientDocuments(applicationFileId) {
    try {
      resetFeedback()
      const documents = clientDocuments[applicationFileId] || []

      if (documents.length === 0) {
        setError('Aucun document à supprimer.')
        return
      }

      await Promise.all(documents.map((documentFile) => apiRequest(`/api/document-files/${documentFile.id}`, {
        method: 'DELETE',
        headers: authHeaders(clientEmail, clientPassword),
      })))

      await loadClientFiles()
      setMessage('Tous les documents du dossier ont été supprimés.')
    } catch {
      setError('Impossible de supprimer tous les documents.')
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
      await Promise.all(files.map((file) => loadClientDocuments(file.id)))
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
      await Promise.all(files.map((file) => loadAdminDocuments(file.id)))
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

  async function loadAdminDocuments(applicationFileId) {
    const documents = await apiRequest(`/api/document-files/admin/application-files/${applicationFileId}`, {
      headers: authHeaders(adminEmail, adminPassword),
    })

    setAdminDocuments((current) => ({
      ...current,
      [applicationFileId]: documents,
    }))

    return documents
  }

  async function loadAdminFiles() {
    if (!adminConnected) return

    try {
      resetFeedback()

      const files = await apiRequest('/api/application-files/admin', {
        headers: authHeaders(adminEmail, adminPassword),
      })

      setAdminFiles(files)
      await Promise.all(files.map((file) => loadAdminDocuments(file.id)))
      setMessage('Dossiers back-office actualisés.')
    } catch {
      setError('Impossible de récupérer les dossiers administrateur.')
    }
  }

  async function refreshAdminWorkspaceSilently() {
    if (!adminConnected) return

    try {
      const files = await apiRequest('/api/application-files/admin', {
        headers: authHeaders(adminEmail, adminPassword),
      })

      setAdminFiles(files)
      await Promise.all(files.map((file) => loadAdminDocuments(file.id)))
      await loadAdminVehicles()
    } catch {
      setError('Impossible d’actualiser automatiquement le back-office.')
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
      await Promise.all(files.map((file) => loadAdminDocuments(file.id)))

      if (clientConnected) {
        const updatedClientFiles = await apiRequest('/api/application-files/my', {
          headers: authHeaders(clientEmail, clientPassword),
        })

        setClientFiles(updatedClientFiles)
        await Promise.all(updatedClientFiles.map((file) => loadClientDocuments(file.id)))
      }

      setMessage(`Dossier mis à jour : ${statusLabels[status]}.`)
    } catch {
      setError('Impossible de modifier le statut du dossier.')
    }
  }

  async function createVehicle(event) {
    event.preventDefault()

    try {
      resetFeedback()
      setLoading(true)

      if (vehicleForm.mode === 'SALE' && vehicleForm.price === '') {
        setError('Veuillez renseigner le prix d’achat pour un véhicule en vente.')
        setLoading(false)
        return
      }

      if (vehicleForm.mode === 'RENTAL' && vehicleForm.monthlyPrice === '') {
        setError('Veuillez renseigner la mensualité pour un véhicule en location.')
        setLoading(false)
        return
      }

      await apiRequest('/api/vehicles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(adminEmail, adminPassword),
        },
        body: JSON.stringify({
          brand: vehicleForm.brand.trim(),
          model: vehicleForm.model.trim(),
          energy: vehicleForm.energy.trim(),
          mileage: Number(vehicleForm.mileage),
          price: vehicleForm.mode === 'SALE' && vehicleForm.price !== '' ? Number(vehicleForm.price) : null,
          monthlyPrice: vehicleForm.mode === 'RENTAL' && vehicleForm.monthlyPrice !== '' ? Number(vehicleForm.monthlyPrice) : null,
          mode: vehicleForm.mode,
          available: true,
          description: vehicleForm.description.trim(),
        }),
      })

      setVehicleForm(initialVehicleForm)
      await loadVehicles()
      await loadAdminVehicles()
      setMessage('Véhicule ajouté au catalogue.')
    } catch {
      setError('Impossible de créer le véhicule.')
    } finally {
      setLoading(false)
    }
  }

  async function deleteVehicle(vehicle) {
    if (!window.confirm(`Supprimer ${vehicle.brand} ${vehicle.model} du catalogue ?`)) return

    try {
      resetFeedback()
      setLoading(true)

      await apiRequest(`/api/vehicles/${vehicle.id}`, {
        method: 'DELETE',
        headers: authHeaders(adminEmail, adminPassword),
      })

      await loadVehicles()
      await loadAdminVehicles()
      setMessage('Véhicule supprimé du catalogue.')
    } catch {
      setError('Impossible de supprimer le véhicule.')
    } finally {
      setLoading(false)
    }
  }

  function downloadApplicationSummary(file, documents = []) {
    const lines = [
      `Dossier M-Motors #${file.id}`,
      `Client : ${file.clientEmail || clientEmail}`,
      `Véhicule : ${file.vehicleBrand} ${file.vehicleModel}`,
      `Type : ${file.type === 'RENTAL' ? 'Location' : 'Achat'}`,
      `Statut : ${statusLabels[file.status] || file.status}`,
      `Date de dépôt : ${formatDate(file.createdAt)}`,
      '',
      'Documents :',
      ...(documents.length
        ? documents.map((document) => `- ${documentTypeLabels[document.type] || document.type} : ${document.fileName}`)
        : ['- Aucun document enregistré']),
    ]

    const blob = new Blob([lines.join('\\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `dossier-m-motors-${file.id}.txt`
    link.click()
    URL.revokeObjectURL(url)
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

      {(message || error) && (
        <div className={`feedback-popup ${error ? 'feedback-error' : 'feedback-success'}`} role="alert">
          <div>
            <strong>{error ? 'Action impossible' : 'Action confirmée'}</strong>
            <p>{error || message}</p>
          </div>
          <button type="button" aria-label="Fermer le message" onClick={resetFeedback}>
            ×
          </button>
        </div>
      )}
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
              <div className="panel-heading">
                <div>
                  <h3>Mes dossiers</h3>
                  <p>Suivez vos demandes et complétez chaque dossier avec les pièces justificatives attendues.</p>
                </div>
              </div>

              {clientFiles.length === 0 ? (
                <p className="empty">Aucun dossier client pour le moment.</p>
              ) : (
                <div className="dossier-grid">
                  {clientFiles.map((file) => {
                    const documents = clientDocuments[file.id] || []
                    const form = documentFormFor(file.id)
                    const canUpdateDocuments = isApplicationEditable(file)
                    const missingTypes = missingRequiredDocumentTypes(documents)
                    const selectableDocumentTypes = availableDocumentTypes(documents)

                    return (
                      <article className="dossier-card" key={file.id}>
                        <div className="dossier-header">
                          <div>
                            <span className="dossier-id">Dossier #{file.id}</span>
                            <h4>{file.vehicleBrand} {file.vehicleModel}</h4>
                            <p>{file.type === 'RENTAL' ? 'Location longue durée' : 'Achat véhicule'}</p>
                          </div>
                          <strong className={dossierStatusClass(file.status)}>
                            {statusLabels[file.status] || file.status}
                          </strong>
                        </div>

                        <div className="dossier-meta">
                          <span>Créé le {formatDate(file.createdAt)}</span>
                          <span>{documents.length} document(s)</span>
                        </div>

                        <div className="document-section">
                          <div className="document-section-header">
                            <h5>Documents du dossier</h5>
                            {canUpdateDocuments && documents.length > 0 && (
                              <button
                                className="danger subtle"
                                type="button"
                                onClick={() => window.confirm('Supprimer tous les documents de ce dossier ?') && deleteAllClientDocuments(file.id)}
                              >
                                Tout supprimer
                              </button>
                            )}
                          </div>

                          {documents.length === 0 ? (
                            <p className="empty compact">Aucun document ajouté pour le moment.</p>
                          ) : (
                            <div className="document-list">
                              {documents.map((documentFile) => (
                                <div className="document-item document-item-managed" key={documentFile.id}>
                                  <a
                                    href={`${API_BASE_URL}/api/document-files/${documentFile.id}/download`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <span>{documentTypeLabels[documentFile.type] || documentFile.type}</span>
                                    <strong>{documentFile.fileName}</strong>
                                    <small>{formatFileSize(documentFile.size)}</small>
                                  </a>

                                  {canUpdateDocuments && (
                                    <button
                                      className="delete-document-button"
                                      type="button"
                                      title={`Supprimer ${documentFile.fileName}`}
                                      aria-label={`Supprimer ${documentFile.fileName}`}
                                      onClick={() => window.confirm(`Supprimer le fichier "${documentFile.fileName}" ?`) && deleteClientDocument(file.id, documentFile.id)}
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {canUpdateDocuments && (
                          <div className="required-documents-checklist">
                            <h5>Pièces obligatoires</h5>
                            <div className="required-document-grid">
                              {requiredDocumentTypes.map((type) => {
                                const isUploaded = documents.some((documentFile) => documentFile.type === type)

                                return (
                                  <span className={isUploaded ? 'required-document uploaded' : 'required-document missing'} key={type}>
                                    {isUploaded ? '✓' : '•'} {documentTypeLabels[type]}
                                  </span>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {canUpdateDocuments ? (
                          <div className="document-form">
                            <h5>Ajouter un document</h5>

                            <div className="form-grid">
                              <div>
                                <label>Type de document</label>
                                <select
                                  id={`document-type-${file.id}`}
                                  value={form.type}
                                  onChange={(event) => updateDocumentForm(file.id, 'type', event.target.value)}
                                >
                                  {selectableDocumentTypes.map((type) => (
                                    <option key={type} value={type}>{documentTypeLabels[type]}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="wide">
                                <label>Fichier à téléverser</label>
                                <div className="file-picker">
                                  <input
                                    id={`document-file-${file.id}`}
                                    key={`${file.id}-${documents.length}-${form.type}`}
                                    className="file-input-hidden"
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                    onChange={(event) => handleDocumentFileSelection(file.id, event.target.files[0] || null)}
                                  />
                                  <label className="file-picker-button" htmlFor={`document-file-${file.id}`}>
                                    Choisir un fichier
                                  </label>
                                  <span className={form.file ? 'file-picker-name selected' : 'file-picker-name'}>
                                    {form.file ? form.file.name : 'Aucun fichier sélectionné'}
                                  </span>
                                </div>
                                <small className="field-help">
                                  Formats acceptés : PDF, JPG, PNG - 5 Mo maximum. Documents complémentaires : 2 fichiers maximum.
                                </small>
                              </div>
                            </div>

                            <button
                              className="primary add-document-button"
                              type="button"
                              onClick={() => addClientDocumentFromInputs(file.id, documents)}
                            >
                              Ajouter au dossier
                            </button>
                          </div>
                        ) : (
                          <div className={`submitted-note ${file.status.toLowerCase()}`}>
                            <strong>{clientDossierStatusTitle(file.status)}</strong>
                            <span>{clientDossierStatusText(file.status)}</span>
                          </div>
                        )}

                        <div className="dossier-actions">
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => downloadApplicationSummary(file, documents)}
                          >
                            Télécharger le récapitulatif
                          </button>

                          {canUpdateDocuments && missingTypes.length > 0 && (
                            <p className="missing-documents">
                              Documents attendus : {missingTypes.map((type) => documentTypeLabels[type]).join(', ')}.
                            </p>
                          )}

                          {canUpdateDocuments && (
                            <button
                              className="danger delete-dossier-button"
                              type="button"
                              onClick={() => window.confirm(`Supprimer définitivement le dossier #${file.id} ?`) && deleteClientApplicationFile(file.id)}
                            >
                              Supprimer le dossier
                            </button>
                          )}

                          {canUpdateDocuments && (
                            <button
                              className="primary submit-dossier-button"
                              type="button"
                              disabled={missingTypes.length > 0}
                              onClick={() => submitClientApplication(file.id)}
                            >
                              Envoyer le dossier
                            </button>
                          )}
                        </div>
                      </article>
                    )
                  })}
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
                <div className="panel-heading">
                  <div>
                    <h3>Dossiers clients</h3>
                    <p>Consultez les demandes reçues, vérifiez les documents et mettez à jour le statut de traitement.</p>
                  </div>
                  <span className="count-pill">{visibleAdminFiles.length} dossier(s)</span>
                </div>

                {visibleAdminFiles.length === 0 ? (
                  <p className="empty">Aucun dossier à afficher.</p>
                ) : (
                  <div className="admin-dossier-list">
                    {visibleAdminFiles.map((file) => {
                      const documents = adminDocuments[file.id] || []

                      return (
                        <article className="admin-dossier-card" key={file.id}>
                          <div className="dossier-header">
                            <div>
                              <span className="dossier-id">Dossier #{file.id}</span>
                              <h4>{file.vehicleBrand} {file.vehicleModel}</h4>
                              <p>{file.clientEmail}</p>
                            </div>
                            <strong className={dossierStatusClass(file.status)}>
                              {statusLabels[file.status] || file.status}
                            </strong>
                          </div>

                          <div className="dossier-meta">
                            <span>{file.type === 'RENTAL' ? 'Location' : 'Achat'}</span>
                            <span>Créé le {formatDate(file.createdAt)}</span>
                            <span>{documents.length} document(s)</span>
                            <span>{documents.length === 0 ? 'À compléter' : 'Documents transmis'}</span>
                          </div>

                          {file.adminComment && (
                            <p className="admin-comment">{file.adminComment}</p>
                          )}

                          <div className="document-section">
                            <h5>Documents transmis</h5>

                            {documents.length === 0 ? (
                              <p className="empty compact">Aucun document transmis.</p>
                            ) : (
                              <div className="document-list">
                                {documents.map((documentFile) => (
                                  <a
                                    className="document-item"
                                    key={documentFile.id}
                                    href={`${API_BASE_URL}/api/document-files/${documentFile.id}/download`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <span>{documentTypeLabels[documentFile.type] || documentFile.type}</span>
                                    <strong>{documentFile.fileName}</strong>
                                    <small>{formatFileSize(documentFile.size)}</small>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="admin-actions">
                            <button
                              disabled={file.status === 'APPROVED'}
                              onClick={() => updateApplicationStatus(file.id, 'APPROVED')}
                            >
                              Accepter
                            </button>
                            <button
                              disabled={file.status === 'REJECTED'}
                              onClick={() => updateApplicationStatus(file.id, 'REJECTED')}
                            >
                              Refuser
                            </button>
                            <button
                              className="secondary"
                              onClick={() => downloadApplicationSummary(file, documents)}
                            >
                              Télécharger le dossier
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="panel vehicle-management">
                <div className="vehicle-management-header">
                  <div>
                    <h3>Gestion des véhicules</h3>
                    <p>Ajoutez des véhicules au catalogue, basculez leur mode commercial ou retirez-les de l’offre visible.</p>
                  </div>
                  <span className="count-pill">{adminVehicles.length} véhicule(s)</span>
                </div>

                <form className="vehicle-form" onSubmit={createVehicle}>
                  <div className="form-grid">
                    <div>
                      <label>Marque</label>
                      <input
                        value={vehicleForm.brand}
                        onChange={(event) => updateVehicleForm('brand', event.target.value)}
                        placeholder="Peugeot"
                        required
                      />
                    </div>

                    <div>
                      <label>Modèle</label>
                      <input
                        value={vehicleForm.model}
                        onChange={(event) => updateVehicleForm('model', event.target.value)}
                        placeholder="308"
                        required
                      />
                    </div>

                    <div>
                      <label>Énergie</label>
                      <input
                        value={vehicleForm.energy}
                        onChange={(event) => updateVehicleForm('energy', event.target.value)}
                        placeholder="Hybride"
                        required
                      />
                    </div>

                    <div>
                      <label>Kilométrage</label>
                      <input
                        type="number"
                        value={vehicleForm.mileage}
                        onChange={(event) => updateVehicleForm('mileage', event.target.value)}
                        placeholder="42000"
                        required
                      />
                    </div>

                    <div>
                      <label>Prix achat</label>
                      <input
                        type="number"
                        value={vehicleForm.price}
                        onChange={(event) => updateVehicleForm('price', event.target.value)}
                        placeholder="18900"
                        disabled={vehicleForm.mode === 'RENTAL'}
                        required={vehicleForm.mode === 'SALE'}
                      />
                    </div>

                    <div>
                      <label>Mensualité</label>
                      <input
                        type="number"
                        value={vehicleForm.monthlyPrice}
                        onChange={(event) => updateVehicleForm('monthlyPrice', event.target.value)}
                        placeholder="299"
                        disabled={vehicleForm.mode === 'SALE'}
                        required={vehicleForm.mode === 'RENTAL'}
                      />
                    </div>

                    <div>
                      <label>Mode</label>
                      <select
                        value={vehicleForm.mode}
                        onChange={(event) => {
                          const nextMode = event.target.value

                          setVehicleForm((current) => ({
                            ...current,
                            mode: nextMode,
                            price: nextMode === 'RENTAL' ? '' : current.price,
                            monthlyPrice: nextMode === 'SALE' ? '' : current.monthlyPrice,
                          }))
                        }}
                      >
                        <option value="SALE">Achat</option>
                        <option value="RENTAL">Location</option>
                      </select>
                    </div>

                    <div className="wide">
                      <label>Description</label>
                      <input
                        value={vehicleForm.description}
                        onChange={(event) => updateVehicleForm('description', event.target.value)}
                        placeholder="Véhicule révisé, garantie incluse, disponible immédiatement."
                        required
                      />
                    </div>
                  </div>

                  <button className="primary add-vehicle-button" type="submit">
                    Ajouter le véhicule
                  </button>
                </form>

                <div className="admin-vehicle-grid">
                  {adminVehicles.map((vehicle) => (
                    <article className="admin-vehicle-card" key={vehicle.id}>
                      <div>
                        <span className={`mode-pill ${vehicle.mode.toLowerCase()}`}>
                          {vehicle.mode === 'RENTAL' ? 'Location' : 'Achat'}
                        </span>
                        <h4>{vehicle.brand} {vehicle.model}</h4>
                        <p>{vehicle.energy} · {formatPrice(vehicle.mileage, 'km')}</p>
                        <strong>
                          {vehicle.mode === 'RENTAL'
                            ? formatPrice(vehicle.monthlyPrice, '€/mois')
                            : formatPrice(vehicle.price)}
                        </strong>
                      </div>

                      <div className="vehicle-card-actions">
                        <button className="secondary" onClick={() => switchVehicleMode(vehicle)}>
                          {vehicle.mode === 'SALE'
                            ? 'Basculer en location'
                            : 'Basculer en achat'}
                        </button>
                        <button className="danger" onClick={() => deleteVehicle(vehicle)}>
                          Supprimer
                        </button>
                      </div>
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
