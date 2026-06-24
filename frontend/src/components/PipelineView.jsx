import React, { useState, useRef, useCallback, useEffect } from 'react'
import JsonViewer from './JsonViewer.jsx'
import RepairLog from './RepairLog.jsx'
import RuntimeStatus from './RuntimeStatus.jsx'
import AppPreview from './AppPreview.jsx'
import RefinementPanel from './RefinementPanel.jsx'
import { MOCK_APPS } from '../mockData.js'

const STAGES = [
  { key: 'intent',      label: 'Intent Mapping',    icon: '🔍' },
  { key: 'design',      label: 'Layout Design',     icon: '🏗️' },
  { key: 'schema_gen',  label: 'Schema Synthesis',  icon: '📋' },
  { key: 'validation',  label: 'Layer Verification',icon: '🔒' },
  { key: 'repair',      label: 'Self-Repair Loop',  icon: '🔧' },
  { key: 'runtime',     label: 'Runtime Assembly',  icon: '⚡' },
]

const INITIAL_STAGE_STATE = STAGES.reduce((acc, s) => ({
  ...acc, [s.key]: { status: 'idle', duration: null, data: null }
}), {})

export default function PipelineView({ examplePrompts, selectedApp, setSelectedApp, customApps, onAppCompiled }) {
  const [prompt, setPrompt] = useState('')
  const mode = 'balanced'
  const [running, setRunning] = useState(false)
  const [stages, setStages] = useState(INITIAL_STAGE_STATE)
  const [events, setEvents] = useState([])
  const [finalOutput, setFinalOutput] = useState(null)
  const [activeStageKey, setActiveStageKey] = useState(null)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [outputTab, setOutputTab] = useState('preview')  // 'preview' | 'json' | 'debug'
  const esRef = useRef(null)

  const updateStage = useCallback((key, update) => {
    setStages(prev => ({ ...prev, [key]: { ...prev[key], ...update } }))
  }, [])

  const addEvent = useCallback((event) => {
    setEvents(prev => [...prev, { ...event, ts: Date.now() }])
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && !confirm('Prompt is empty — test with edge case behavior?')) return

    setSelectedApp(null) // Clear preset selection when starting a new custom build
    // Reset state
    setRunning(true)
    setStages(INITIAL_STAGE_STATE)
    setEvents([])
    setFinalOutput(null)

    if (esRef.current) esRef.current.close()

    const body = JSON.stringify({ prompt: prompt.trim(), mode })
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const processChunk = (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6))
            handleEvent(event)
          } catch {}
        }
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        processChunk(decoder.decode(value, { stream: true }))
      }
    } finally {
      setRunning(false)
    }
  }, [prompt, mode, updateStage, addEvent, setSelectedApp])

  useEffect(() => {
    if (selectedApp === 'new') {
      setPrompt('')
      setFinalOutput(null)
      setStages(INITIAL_STAGE_STATE)
      setSelectedApp(null)
    } else if (selectedApp) {
      const appData = MOCK_APPS[selectedApp] || customApps?.[selectedApp]
      if (appData) {
        setPrompt(appData.prompt)
        setFinalOutput(appData.output)
        // Set stages state to show fully completed compilation
        const completedStages = STAGES.reduce((acc, stage) => ({
          ...acc,
          [stage.key]: { status: 'done', duration: 120 + Math.floor(Math.random() * 200), data: {} }
        }), {})
        setStages(completedStages)
        setOutputTab('preview')
      }
    }
  }, [selectedApp, setSelectedApp, customApps])

  const handleEvent = useCallback((event) => {
    const type = event.type
    if (type === 'ping') return  // keepalive — ignore silently
    addEvent(event)

    if (type === 'stage_start') {
      updateStage(event.stage, { status: 'active' })
      setActiveStageKey(event.stage)
    }
    else if (type === 'stage_complete') {
      updateStage(event.stage, {
        status: 'done',
        duration: event.duration_ms,
        data: event.data,
      })
    }
    else if (type === 'validation_errors' || type === 'cross_layer_errors') {
      updateStage('validation', { status: 'active' })
    }
    else if (type === 'repair_start') {
      updateStage('repair', { status: 'active' })
    }
    else if (type === 'repair_complete') {
      updateStage('repair', { status: 'done' })
    }
    else if (type === 'validation_passed') {
      updateStage('validation', { status: 'done' })
      updateStage('repair', { status: 'done' })
    }
    else if (type === 'runtime_result') {
      updateStage('runtime', { status: 'active' })
    }
    else if (type === 'complete') {
      updateStage('runtime', { status: 'done' })
      setFinalOutput(event.data)
      setOutputTab('preview')  // auto-switch to preview on completion
      if (onAppCompiled) {
        const name = event.data?.app_name || event.data?.intent?.app_name || 'App_' + Date.now()
        onAppCompiled(name, prompt, event.data)
      }
    }
    else if (type === 'error') {
      const stageKey = event.stage || activeStageKey
      if (stageKey) updateStage(stageKey, { status: 'error' })
    }
    else if (type === 'clarification_needed') {
      setFinalOutput({ status: 'clarification_needed', questions: event.questions })
    }
  }, [updateStage, addEvent, activeStageKey, prompt, onAppCompiled])

  const copyOutput = () => {
    if (finalOutput) {
      navigator.clipboard.writeText(JSON.stringify(finalOutput, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const downloadZip = async () => {
    if (!finalOutput || exporting) return
    setExporting(true)
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_output: finalOutput }),
      })
      if (!response.ok) throw new Error('Failed to export project')
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const name = finalOutput.app_name || finalOutput.intent?.app_name || 'Application'
      const nameSafe = name.replace(/[^a-zA-Z0-9-_]/g, '')
      a.download = `${nameSafe}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (e) {
      alert('Error downloading ZIP: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  const assumptions = finalOutput?.intent?.assumptions || []
  const ambiguityFlags = finalOutput?.intent?.ambiguity_flags || []
  const metrics = finalOutput?.metrics || null
  const runtimeProof = finalOutput?.runtime_proof || null
  const repairEvents = events.filter(e =>
    ['cross_layer_errors', 'validation_errors', 'repair_start', 'repair_complete', 'validation_passed'].includes(e.type)
  )

  // ─── Landing Mode (Before generation) ───────────────────────
  if (!running && !finalOutput) {
    return (
      <div className="main-scrollable blueprint-mesh animate-in">
        <div className="landing-split">
          {/* Left Column: Intro */}
          <div className="landing-intro">
            <span className="landing-tag">Visual Compiler</span>
            <h1 className="landing-title">Translate Prompts Into Working Applications</h1>
            <p className="landing-subtitle">
              Describe your software idea. The multi-stage AI pipeline synthesizes strict database tables, API routes, and user page components, then validates and repairs execution layers on the fly.
            </p>
            <div className="landing-intro-steps">
              <div className="intro-step">
                <span className="intro-step-num">1</span>
                <span>Map instructions to structural schemas</span>
              </div>
              <div className="intro-step">
                <span className="intro-step-num">2</span>
                <span>Verify dependencies across layouts and DB constraints</span>
              </div>
              <div className="intro-step">
                <span className="intro-step-num">3</span>
                <span>Assemble runtime logic & boot server sandbox</span>
              </div>
            </div>
          </div>

          {/* Right Column: Editor Box */}
          <div className="landing-editor-card">
            <div className="editor-header">
              <div className="editor-tab">
                <span>📄</span> prompt.txt
              </div>
              <span className="editor-meta">PLAINTEXT EDITOR</span>
            </div>

            <div className="editor-body">
              <div className="editor-line-numbers">
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
                <span>6</span>
              </div>
              <div className="editor-textarea-wrap">
                <textarea
                  id="prompt-input"
                  className="prompt-textarea"
                  placeholder="Describe your app... e.g. 'Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics.'"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleGenerate() }}
                  disabled={running}
                />
              </div>
            </div>
            <div className="editor-footer">
              <button
                id="generate-btn"
                className="generate-btn"
                onClick={handleGenerate}
                disabled={running}
              >
                {running ? (
                  <><div className="spinner" /> Compiling...</>
                ) : (
                  <><span>⚡</span> Compile App</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Chips row */}
        <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '0 2rem' }}>
          <div className="examples-row" style={{ justifyContent: 'flex-start' }}>
            {examplePrompts.map((ex, i) => (
              <button
                key={i}
                className="example-chip"
                onClick={() => setPrompt(ex)}
                disabled={running}
              >
                {ex.length > 55 ? ex.slice(0, 55) + '…' : ex}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── Active Workspace Mode (Compiling or Complete) ──────────
  const pages = finalOutput?.schemas?.ui?.pages || finalOutput?.ui?.pages || []
  const endpoints = finalOutput?.schemas?.api?.endpoints || finalOutput?.api?.endpoints || []
  const tables = finalOutput?.schemas?.db?.tables || finalOutput?.db?.tables || []

  return (
    <div className="workspace-split animate-in">
      {/* ── Left Sidebar (Progress, IDE Directory Explorer, Refinement) ── */}
      <aside className="workspace-left">
        <div className="workspace-left-header">
          <span className="workspace-app-title">
            {finalOutput?.schemas?.ui?.name || finalOutput?.ui?.name || 'Workspace Build'}
          </span>
          <span className={`build-status-badge ${!running ? 'success' : ''}`}>
            {running ? '⚡ Compiling' : '✓ Active'}
          </span>
        </div>

        <div className="workspace-left-scroll">
          {/* Pipeline progress stepper */}
          <div className="pipeline-track">
            {STAGES.map(stage => {
              const s = stages[stage.key]
              return (
                <div key={stage.key} className={`pipeline-step ${s.status}`}>
                  <div className="step-icon">
                    {s.status === 'done' ? '✓' :
                     s.status === 'error' ? '✗' :
                     s.status === 'active' ? '●' :
                     '·'}
                  </div>
                  <span className="step-label">{stage.label}</span>
                  {s.duration && (
                    <span className="step-duration">{s.duration}ms</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* IDE Directory Explorer Tree */}
          {finalOutput && (
            <div className="tree-explorer">
              <div className="tree-explorer-title">Project Explorer</div>
              <div className="tree-node">
                {tables.length > 0 && (
                  <div>
                    <div className="tree-folder">
                      <span>📂</span> database
                      <span className="tree-badge">{tables.length}</span>
                    </div>
                    <div className="tree-file-list">
                      {tables.map((t, idx) => (
                        <div key={idx} className="tree-file">
                          <span>🗄️</span> {t.name}.sql
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {endpoints.length > 0 && (
                  <div>
                    <div className="tree-folder">
                      <span>📂</span> endpoints
                      <span className="tree-badge">{endpoints.length}</span>
                    </div>
                    <div className="tree-file-list">
                      {endpoints.slice(0, 6).map((ep, idx) => (
                        <div key={idx} className="tree-file" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span>🔌</span> {ep.path.replace(/^\//, '') || 'root'}.js
                        </div>
                      ))}
                      {endpoints.length > 6 && (
                        <div className="tree-file" style={{ fontStyle: 'italic', paddingLeft: '1.5rem', fontSize: '0.7rem' }}>
                          and {endpoints.length - 6} more...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {pages.length > 0 && (
                  <div>
                    <div className="tree-folder">
                      <span>📂</span> views
                      <span className="tree-badge">{pages.length}</span>
                    </div>
                    <div className="tree-file-list">
                      {pages.map((p, idx) => (
                        <div key={idx} className="tree-file">
                          <span>📄</span> {p.name || p.id}.jsx
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Clarification questions */}
          {finalOutput?.status === 'clarification_needed' && (
            <div className="ambiguity-panel animate-in">
              <h4>💬 Clarification Needed</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                Answer the following questions to resolve underspecified constraints:
              </p>
              {finalOutput.questions?.map((q, i) => (
                <div key={i} style={{ marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                  <strong>❓ Q{i + 1}:</strong> {q}
                </div>
              ))}
            </div>
          )}

          {/* Collapsible Assumptions & Ambiguities */}
          {finalOutput && (assumptions.length > 0 || ambiguityFlags.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {assumptions.length > 0 && (
                <div className="assumptions-panel">
                  <h4>💡 Assumptions Made ({assumptions.length})</h4>
                  <ul>
                    {assumptions.slice(0, 3).map((a, i) => <li key={i}>{a}</li>)}
                    {assumptions.length > 3 && <li style={{ listStyleType: 'none', fontStyle: 'italic', fontSize: '0.7rem' }}>and {assumptions.length - 3} more...</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Refinement Panel at the bottom */}
          {finalOutput && finalOutput.status === 'success' && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: 'auto' }}>
              <RefinementPanel
                finalOutput={finalOutput}
                mode={mode}
                onPatchApplied={(patchedOutput) => {
                  setFinalOutput(patchedOutput)
                  if (onAppCompiled && selectedApp) {
                    onAppCompiled(selectedApp, prompt, patchedOutput)
                  }
                }}
              />
            </div>
          )}
        </div>
      </aside>

      {/* ── Right Panel (Live Preview, Code, Logs) ──────────────── */}
      <div className="workspace-right blueprint-mesh">
        <div className="workspace-right-tabs">
          <button
            className={`workspace-tab-btn ${outputTab === 'preview' ? 'active' : ''}`}
            onClick={() => setOutputTab('preview')}
          >
            🖥️ Live App Preview
          </button>
          <button
            className={`workspace-tab-btn ${outputTab === 'json' ? 'active' : ''}`}
            onClick={() => setOutputTab('json')}
          >
            📄 Config Schema (JSON)
          </button>
          <button
            className={`workspace-tab-btn ${outputTab === 'debug' ? 'active' : ''}`}
            onClick={() => setOutputTab('debug')}
          >
            🔧 Compiler Logs
          </button>
          {finalOutput && finalOutput.status === 'success' && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button 
                className="workspace-tab-btn" 
                onClick={downloadZip} 
                disabled={exporting}
                style={{ borderBottom: 'none', fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <span>{exporting ? '⏳' : '📦'}</span>
                <span>{exporting ? 'Packaging...' : 'Download ZIP'}</span>
              </button>
              <button className="workspace-tab-btn" onClick={copyOutput} style={{ borderBottom: 'none', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {copied ? '✓ Copied' : '📋 Copy Output'}
              </button>
            </div>
          )}
        </div>

        {/* Tab contents */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {outputTab === 'preview' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              {finalOutput ? (
                <AppPreview output={finalOutput} />
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', margin: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
                  <div className="spinner" style={{ width: 24, height: 24, border: '3px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Compiling application blueprint...
                  </p>
                </div>
              )}
            </div>
          )}

          {outputTab === 'json' && finalOutput && (
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <div className="content-grid">
                <div className="card animate-in">
                  <div className="card-header">
                    <span>📄</span>
                    <span className="card-title">Generated Configuration</span>
                  </div>
                  <JsonViewer output={finalOutput} />
                </div>
                {runtimeProof && (
                  <div className="card animate-in">
                    <div className="card-header">
                      <span>⚡</span>
                      <span className="card-title">Execution Proof</span>
                    </div>
                    <div className="card-body">
                      <RuntimeStatus proof={runtimeProof} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {outputTab === 'debug' && (
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Metrics cards */}
              {metrics && (
                <div className="metrics-grid animate-in">
                  <div className="metric-card">
                    <div className="metric-value">{(metrics.total_duration_ms / 1000).toFixed(1)}s</div>
                    <div className="metric-label">Total Time</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-value">{metrics.tokens?.input + metrics.tokens?.output || 0}</div>
                    <div className="metric-label">Total Tokens</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-value">${metrics.cost_estimate_usd?.toFixed(4) || '0'}</div>
                    <div className="metric-label">Est. Cost</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-value" style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                      {metrics.runtime?.overall_executable ? '✅ Executable' : '⚠️ Unresolved'}
                    </div>
                    <div className="metric-label">Runtime Safety</div>
                  </div>
                </div>
              )}

              <div className="card animate-in">
                <div className="card-header">
                  <span>🔧</span>
                  <span className="card-title">Validation & Repair Log</span>
                </div>
                <div className="card-body">
                  <RepairLog events={repairEvents} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
