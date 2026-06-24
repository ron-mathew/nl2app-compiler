import React, { useState, useCallback, useMemo } from 'react'
import PipelineView from './components/PipelineView.jsx'
import EvalDashboard from './components/EvalDashboard.jsx'
import { MOCK_APPS } from './mockData.js'

const EXAMPLE_PROMPTS = [
  "Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics.",
  "Create an e-commerce platform with product catalog, cart, checkout, order tracking, and vendor management.",
  "Build a project management tool like Jira with sprints, tickets, assignees, and time tracking.",
  "Create a healthcare portal with patient records, appointments, doctor profiles, and prescriptions.",
]

export default function App() {
  const [activeTab, setActiveTab] = useState('generate')
  const [selectedApp, setSelectedApp] = useState('NexusCRM') // Default-select NexusCRM

  const [customApps, setCustomApps] = useState(() => {
    try {
      const saved = localStorage.getItem('nl2app_custom_apps')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const [deletedPresets, setDeletedPresets] = useState(() => {
    try {
      const saved = localStorage.getItem('nl2app_deleted_presets')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const allAppKeys = useMemo(() => {
    const presets = Object.keys(MOCK_APPS).filter(k => !deletedPresets.includes(k))
    const customs = Object.keys(customApps)
    return Array.from(new Set([...presets, ...customs]))
  }, [deletedPresets, customApps])

  const handleSelectApp = useCallback((appKey) => {
    setSelectedApp(appKey)
    setActiveTab('generate')
  }, [])

  const handleAppCompiled = useCallback((name, prompt, output) => {
    setCustomApps(prev => {
      const next = {
        ...prev,
        [name]: { prompt, output }
      }
      localStorage.setItem('nl2app_custom_apps', JSON.stringify(next))
      return next
    })
    setSelectedApp(name)
  }, [])

  const [deletingAppKey, setDeletingAppKey] = useState(null)
  const [isRestoringPresets, setIsRestoringPresets] = useState(false)

  const handleDeleteAppClick = useCallback((key, e) => {
    e.stopPropagation()
    setDeletingAppKey(key)
  }, [])

  const performDelete = useCallback((key) => {
    if (customApps[key]) {
      setCustomApps(prev => {
        const next = { ...prev }
        delete next[key]
        localStorage.setItem('nl2app_custom_apps', JSON.stringify(next))
        return next
      })
    }

    if (Object.keys(MOCK_APPS).includes(key)) {
      setDeletedPresets(prev => {
        const next = [...prev, key]
        localStorage.setItem('nl2app_deleted_presets', JSON.stringify(next))
        return next
      })
    }

    setDeletingAppKey(null)

    if (selectedApp === key) {
      setSelectedApp('new')
    }
  }, [customApps, selectedApp])

  const getAppDisplayName = (key) => {
    if (key === 'NexusCRM') return 'NexusCRM'
    if (key === 'KitchenDisplay') return 'KitchenDisplay (Mock)'
    if (key === 'EShop') return 'E-Shop API (Mock)'
    return key
  }

  return (
    <div className="app-layout">
      {/* ── Global Sidebar ───────────────────────────────────── */}
      <aside className="app-sidebar">
        <div className="sidebar-workspace">
          <div className="workspace-avatar">⚡</div>
          <div className="workspace-info">
            <span className="workspace-name">Ron's Workspace</span>
            <span className="workspace-role">Workspace Owner</span>
          </div>
          <span className="workspace-chevron">▾</span>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-btn ${activeTab === 'generate' && selectedApp === null ? 'active' : ''}`}
            onClick={() => { setSelectedApp('new'); setActiveTab('generate'); setDeletingAppKey(null); }}
          >
            <span>🚀</span> Create New App
          </button>
          <button
            className={`sidebar-nav-btn ${activeTab === 'eval' ? 'active' : ''}`}
            onClick={() => { setSelectedApp('new'); setActiveTab('eval'); setDeletingAppKey(null); }}
          >
            <span>📊</span> Model Evaluation
          </button>
        </nav>

        <div className="sidebar-section-title">Built Apps</div>
        <div className="sidebar-list">
          {allAppKeys.map(key => {
            const isDeleting = deletingAppKey === key
            return (
              <button 
                key={key}
                className={`sidebar-list-item ${selectedApp === key && activeTab === 'generate' ? 'active' : ''}`}
                onClick={() => { handleSelectApp(key); setDeletingAppKey(null); }}
                style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  <span className="sidebar-item-bullet" />
                  {getAppDisplayName(key)}
                </span>
                {isDeleting ? (
                  <span 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      fontSize: '0.72rem', 
                      marginLeft: 'auto', 
                      background: 'rgba(239, 68, 68, 0.08)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      animation: 'fade-in 0.15s ease-out',
                      flexShrink: 0
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>Delete?</span>
                    <span 
                      onClick={(e) => { e.stopPropagation(); performDelete(key); }}
                      style={{ color: 'var(--accent-green)', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
                      title="Confirm delete"
                    >
                      ✓
                    </span>
                    <span 
                      onClick={(e) => { e.stopPropagation(); setDeletingAppKey(null); }}
                      style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
                      title="Cancel"
                    >
                      ✕
                    </span>
                  </span>
                ) : (
                  <span 
                    className="delete-app-btn"
                    onClick={(e) => handleDeleteAppClick(key, e)}
                    style={{
                      marginLeft: 'auto',
                      opacity: 0.4,
                      cursor: 'pointer',
                      padding: '0 4px',
                      fontSize: '0.85rem',
                      transition: 'opacity 0.2s',
                      color: 'var(--text-muted)',
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => { e.target.style.opacity = 1; e.target.style.color = 'var(--accent-red)' }}
                    onMouseLeave={(e) => { e.target.style.opacity = 0.4; e.target.style.color = 'var(--text-muted)' }}
                    title="Delete application"
                  >
                    ✕
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {deletedPresets.length > 0 && (
          isRestoringPresets ? (
            <span 
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '8px', 
                fontSize: '0.7rem', 
                padding: '0.45rem 0.75rem',
                marginTop: '0.25rem',
                background: 'rgba(37, 99, 235, 0.08)',
                borderRadius: '4px',
                animation: 'fade-in 0.15s ease-out'
              }}
            >
              <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Restore default presets?</span>
              <span 
                onClick={() => {
                  setDeletedPresets([])
                  localStorage.removeItem('nl2app_deleted_presets')
                  setIsRestoringPresets(false)
                }}
                style={{ color: 'var(--accent-green)', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
                title="Confirm restore"
              >
                ✓
              </span>
              <span 
                onClick={() => setIsRestoringPresets(false)}
                style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
                title="Cancel"
              >
                ✕
              </span>
            </span>
          ) : (
            <button
              onClick={() => setIsRestoringPresets(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-primary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
                padding: '0.45rem 0.75rem',
                textAlign: 'left',
                fontWeight: 500,
                textDecoration: 'underline',
                marginTop: '0.25rem'
              }}
            >
              Restore Default Apps
            </button>
          )
        )}

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">RM</div>
            <div className="user-info">
              <span className="user-name">Ron Mathew</span>
              <span className="user-role">Developer</span>
            </div>
          </div>
          <div className="user-status">
            <span className="status-indicator" />
            API Connected (Online)
          </div>
        </div>
      </aside>

      {/* ── Main Canvas Area ─────────────────────────────────── */}
      <main className="app-main">
        {activeTab === 'generate' ? (
          <PipelineView 
            examplePrompts={EXAMPLE_PROMPTS} 
            selectedApp={selectedApp}
            setSelectedApp={setSelectedApp}
            customApps={customApps}
            onAppCompiled={handleAppCompiled}
          />
        ) : (
          <EvalDashboard />
        )}
      </main>
    </div>
  )
}


