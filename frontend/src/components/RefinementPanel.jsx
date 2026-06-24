import React, { useState, useRef, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Suggested patches ────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { label: '💳 Add Stripe payments', value: 'Add Stripe payment integration with payment history, invoices, and subscription management' },
  { label: '📧 Add email notifications', value: 'Add email notification system for key events like new signups, password resets, and important alerts' },
  { label: '📊 Add analytics dashboard', value: 'Add a comprehensive analytics dashboard with charts showing user growth, revenue trends, and activity metrics' },
  { label: '🔔 Add real-time notifications', value: 'Add real-time in-app notification system with a notification bell, read/unread state, and notification preferences' },
  { label: '🗂️ Add file uploads', value: 'Add file upload support with document storage, preview, and attachment management' },
  { label: '💬 Add comments & activity', value: 'Add a comments and activity feed system so users can collaborate and see a history of changes' },
  { label: '🌍 Add multi-language support', value: 'Add internationalization support with language selection and localized content' },
  { label: '🔍 Add advanced search', value: 'Add advanced search and filtering across all entities with full-text search and saved filters' },
]

// ── Diff Viewer ───────────────────────────────────────────────────────────────
function DiffViewer({ diff }) {
  const { changes, stats } = diff
  const [expanded, setExpanded] = useState({})

  const toggle = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }))

  if (!changes || Object.keys(changes).length === 0) {
    return (
      <div className="diff-empty">
        <span>✓</span> No structural changes — schemas are identical
      </div>
    )
  }

  const schemaLabels = { db: '🗄️ Database', api: '🔌 API', ui: '📄 UI', auth: '🔐 Auth' }

  return (
    <div className="diff-viewer">
      {/* Stats bar */}
      <div className="diff-stats-bar">
        <div className="diff-stat added">+{stats.items_added} added</div>
        <div className="diff-stat removed">-{stats.items_removed} removed</div>
        <div className="diff-stat modified">~{stats.items_modified} modified</div>
        <div className="diff-stat neutral">{stats.schemas_changed} schema{stats.schemas_changed !== 1 ? 's' : ''} changed</div>
      </div>

      {/* Per-schema diffs */}
      {Object.entries(changes).map(([schema, schemaDiff]) => {
        const isOpen = expanded[schema] !== false  // open by default
        const label = schemaLabels[schema] || schema

        // Normalize: db/api/ui use added/removed/modified, auth uses roles_added/roles_removed
        const added    = schemaDiff.added    || schemaDiff.roles_added    || []
        const removed  = schemaDiff.removed  || schemaDiff.roles_removed  || []
        const modified = schemaDiff.modified || []
        const total    = added.length + removed.length + modified.length

        if (total === 0) return null

        return (
          <div key={schema} className="diff-schema-block">
            <button className="diff-schema-header" onClick={() => toggle(schema)}>
              <span className="diff-schema-label">{label}</span>
              <div className="diff-schema-badges">
                {added.length    > 0 && <span className="diff-badge added">+{added.length}</span>}
                {removed.length  > 0 && <span className="diff-badge removed">-{removed.length}</span>}
                {modified.length > 0 && <span className="diff-badge modified">~{modified.length}</span>}
              </div>
              <span className="diff-chevron">{isOpen ? '▾' : '▸'}</span>
            </button>

            {isOpen && (
              <div className="diff-schema-body">
                {added.map((item, i) => (
                  <div key={i} className="diff-row added">
                    <span className="diff-sign">+</span>
                    <span className="diff-name">{item.name || item.path || item.id || item}</span>
                    {item.method && <span className="diff-tag">{item.method}</span>}
                    {item.type   && <span className="diff-tag">{item.type}</span>}
                  </div>
                ))}
                {removed.map((item, i) => (
                  <div key={i} className="diff-row removed">
                    <span className="diff-sign">-</span>
                    <span className="diff-name">{item.name || item.path || item.id || item}</span>
                  </div>
                ))}
                {modified.map((item, i) => (
                  <div key={i} className="diff-row modified">
                    <span className="diff-sign">~</span>
                    <span className="diff-name">{item.key}</span>
                    <span className="diff-tag">modified</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Patch Progress ────────────────────────────────────────────────────────────
function PatchProgress({ events }) {
  return (
    <div className="patch-progress">
      {events.map((ev, i) => {
        if (ev.type === 'patch_stage') return (
          <div key={i} className="patch-event stage">
            <span className="patch-event-icon">⚙️</span>
            <span>{ev.message}</span>
          </div>
        )
        if (ev.type === 'patch_impact') return (
          <div key={i} className="patch-event impact">
            <span className="patch-event-icon">🎯</span>
            <span>
              Patching <strong>{ev.affected_schemas?.join(', ')}</strong>
              {ev.new_entities?.length > 0 && ` · New: ${ev.new_entities.join(', ')}`}
            </span>
          </div>
        )
        if (ev.type === 'patch_schema_done') return (
          <div key={i} className="patch-event done">
            <span className="patch-event-icon">✅</span>
            <span><strong>{ev.schema}</strong> schema patched</span>
          </div>
        )
        if (ev.type === 'patch_validation_errors') return (
          <div key={i} className="patch-event warn">
            <span className="patch-event-icon">⚠️</span>
            <span>{ev.count} inconsistencies found — repairing...</span>
          </div>
        )
        if (ev.type === 'patch_repair_complete') return (
          <div key={i} className="patch-event done">
            <span className="patch-event-icon">🔧</span>
            <span>{ev.repairs_successful}/{ev.repairs_attempted} repairs applied</span>
          </div>
        )
        if (ev.type === 'patch_validation_passed') return (
          <div key={i} className="patch-event done">
            <span className="patch-event-icon">✓</span>
            <span>All consistency checks passed</span>
          </div>
        )
        return null
      })}
    </div>
  )
}

// ── Main RefinementPanel ──────────────────────────────────────────────────────
export default function RefinementPanel({ finalOutput, onPatchApplied, mode }) {
  const [instruction, setInstruction]   = useState('')
  const [patching, setPatching]         = useState(false)
  const [events, setEvents]             = useState([])
  const [diff, setDiff]                 = useState(null)
  const [error, setError]               = useState(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [patchHistory, setPatchHistory] = useState([])
  const esRef = useRef(null)

  const addEvent = useCallback((ev) => {
    setEvents(prev => [...prev, ev])
  }, [])

  const applyPatch = useCallback(async () => {
    if (!instruction.trim() || patching) return
    setPatching(true)
    setEvents([])
    setDiff(null)
    setError(null)
    setShowSuggestions(false)

    if (esRef.current) esRef.current.close()

    try {
      const response = await fetch(`${API_BASE}/api/patch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch_instruction: instruction,
          current_output: finalOutput,
          mode: mode || 'balanced',
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || 'Patch failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const ev = JSON.parse(line.slice(6))
              addEvent(ev)

              if (ev.type === 'patch_complete') {
                setDiff(ev.diff)
                setPatchHistory(prev => [
                  { instruction, diff: ev.diff, affected: ev.affected_schemas, ts: new Date().toLocaleTimeString() },
                  ...prev.slice(0, 4),
                ])
                onPatchApplied(ev.data)
                setInstruction('')
                setPatching(false)
              }
              if (ev.type === 'error') {
                setError(ev.message)
                setPatching(false)
              }
            } catch (_) {}
          }
        }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setPatching(false)
    }
  }, [instruction, finalOutput, mode, onPatchApplied, patching, addEvent])

  return (
    <div className="refinement-panel">
      {/* Title */}
      <div className="refinement-title" style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
        <span className="refinement-icon">✦</span>
        Incremental Refinement
        <span className="refinement-badge">Patching</span>
      </div>

      {/* Suggestions Row */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 2 }}>
        {SUGGESTIONS.slice(0, 4).map((s, i) => (
          <button
            key={i}
            className="refinement-suggest-btn"
            style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
            onClick={() => setInstruction(s.value)}
            disabled={patching}
          >
            {s.label.split(' ')[0]} {s.label.split(' ').slice(1).join(' ')}
          </button>
        ))}
      </div>

      {/* Input Prompter */}
      <div className="refinement-input-area">
        <div className="refinement-input-wrap">
          <textarea
            className="refinement-input"
            placeholder='What changes would you like to make? e.g. "Add Stripe payments"'
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) applyPatch() }}
            disabled={patching}
            rows={2}
          />
          <div className="refinement-input-footer">
            <span className="refinement-hint">⌘↵ to patch</span>
            <button
              className="refinement-apply-btn"
              onClick={applyPatch}
              disabled={!instruction.trim() || patching}
              style={{ background: 'var(--accent-primary)' }}
            >
              {patching ? (
                <>Patching...</>
              ) : (
                <>Apply Patch</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="refinement-error">
          ❌ {error}
        </div>
      )}

      {/* Live progress */}
      {events.length > 0 && <PatchProgress events={events} />}

      {/* Diff result */}
      {diff && (
        <div className="refinement-diff-section">
          <div className="refinement-diff-title">
            <span>📊 Schema Diff</span>
            <span className="refinement-diff-subtitle">
              {diff.stats.schemas_changed} schema{diff.stats.schemas_changed !== 1 ? 's' : ''} changed
            </span>
          </div>
          <DiffViewer diff={diff} />
        </div>
      )}

      {/* Patch History */}
      {patchHistory.length > 0 && (
        <div className="refinement-history">
          <div className="refinement-history-title">🕒 Patch History</div>
          {patchHistory.map((p, i) => (
            <div key={i} className="refinement-history-item">
              <span className="refinement-history-instruction">
                {p.instruction.length > 50 ? p.instruction.slice(0, 50) + '…' : p.instruction}
              </span>
              <div className="refinement-history-meta">
                <span className="refinement-history-schemas">
                  {p.affected?.join(', ')}
                </span>
                <span className="refinement-history-stats" style={{ color: 'var(--accent-green)' }}>
                  +{p.diff?.stats?.items_added ?? 0} -{p.diff?.stats?.items_removed ?? 0}
                </span>
                <span className="refinement-history-ts">{p.ts}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
