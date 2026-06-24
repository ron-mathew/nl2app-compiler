import React, { useState, useEffect } from 'react'
import { API_BASE } from '../config.js'

export default function EvalDashboard() {
  const [results, setResults] = useState(null)
  const [running, setRunning] = useState(false)
  const mode = 'balanced'
  const [error, setError] = useState(null)
  const [pollInterval, setPollInterval] = useState(null)

  const loadResults = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/eval/results`)
      if (res.ok) {
        const data = await res.json()
        setResults(data)
      }
    } catch {}
  }

  useEffect(() => {
    loadResults()
  }, [])

  const startEval = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/eval/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, delay_between: 2.0 }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to start eval')
      }

      // Poll for results every 5 seconds
      const interval = setInterval(async () => {
        const statusRes = await fetch(`${API_BASE}/api/eval/status`)
        const status = await statusRes.json()
        await loadResults()
        if (!status.running) {
          clearInterval(interval)
          setRunning(false)
        }
      }, 5000)
      setPollInterval(interval)
    } catch (e) {
      setError(e.message)
      setRunning(false)
    }
  }

  const stats = results?.overall
  const realStats = results?.real_prompts
  const edgeStats = results?.edge_cases

  return (
    <div className="main-scrollable animate-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
            Model Evaluation Framework
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            20 prompts (10 real + 10 edge cases) — actual pipeline metrics, cost estimates, and latency
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            id="run-eval-btn"
            className="generate-btn"
            onClick={startEval}
            disabled={running}
          >
            {running ? (
              <><div className="spinner" /> Running Eval...</>
            ) : (
              <>▶ Run Evaluation</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="repair-event error" style={{ marginBottom: '1rem', border: '1px solid var(--accent-red)', background: '#FEF2F2', padding: '0.75rem', borderRadius: 'var(--radius-md)', display: 'flex', gap: '0.5rem', color: 'var(--accent-red)' }}>
          <div>❌</div>
          <div>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {running && (
        <div className="assumptions-panel animate-in" style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ color: 'var(--accent-secondary)' }}>⏳ Evaluation Running</h4>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Running all 20 prompts through the active pipeline. This takes ~3-5 minutes.
            Results will appear here automatically when complete.
          </p>
        </div>
      )}

      {/* Summary Stats */}
      {stats && (
        <>
          <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="metric-card">
              <div className="metric-value">{(stats.success_rate * 100).toFixed(0)}%</div>
              <div className="metric-label">Success Rate</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{(stats.executable_rate * 100).toFixed(0)}%</div>
              <div className="metric-label">Executable Rate</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{stats.avg_retries_per_request}</div>
              <div className="metric-label">Avg Retries/Request</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{(stats.avg_latency_ms / 1000).toFixed(1)}s</div>
              <div className="metric-label">Avg Latency</div>
            </div>
          </div>

          <div className="content-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="card">
              <div className="card-header">
                <span>🟢</span>
                <span className="card-title">Real Prompts (10)</span>
              </div>
              <div className="card-body">
                <StatRow label="Success Rate" value={`${(realStats?.success_rate * 100).toFixed(0)}%`} />
                <StatRow label="Avg Latency" value={`${(realStats?.avg_latency_ms / 1000).toFixed(1)}s`} />
                <StatRow label="Avg Cost" value={`$${realStats?.avg_cost_per_request_usd?.toFixed(5)}`} />
                <StatRow label="Avg Retries" value={realStats?.avg_retries_per_request} />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span>🟠</span>
                <span className="card-title">Edge Cases (10)</span>
              </div>
              <div className="card-body">
                <StatRow label="Success Rate" value={`${(edgeStats?.success_rate * 100).toFixed(0)}%`} />
                <StatRow label="Avg Latency" value={`${(edgeStats?.avg_latency_ms / 1000).toFixed(1)}s`} />
                <StatRow label="Avg Cost" value={`$${edgeStats?.avg_cost_per_request_usd?.toFixed(5)}`} />
                <StatRow label="Avg Retries" value={edgeStats?.avg_retries_per_request} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Results Table */}
      {results?.results && (
        <div className="card">
          <div className="card-header">
            <span>📋</span>
            <span className="card-title">Per-Prompt Results</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginLeft: 'auto' }}>
              {results.run_at ? `Run at ${new Date(results.run_at).toLocaleString()}` : ''}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="eval-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Repairs</th>
                  <th>Executable</th>
                  <th>Cost</th>
                  <th>Prompt (truncated)</th>
                </tr>
              </thead>
              <tbody>
                {results.results.map(r => (
                  <tr key={r.prompt_id}>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-secondary)', fontWeight: 600 }}>
                      {r.prompt_id}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      {r.category}
                    </td>
                    <td>
                      <span className={`status-badge ${r.success ? 'success' : r.status === 'clarification_needed' ? 'clarification' : 'failure'}`}>
                        {r.success ? '✓ Pass' : r.status === 'clarification_needed' ? '💬 Clarify' : '✗ Fail'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {(r.total_duration_ms / 1000).toFixed(1)}s
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                      {r.repairs_attempted > 0 ? (
                        <span style={{ color: r.repairs_successful === r.repairs_attempted ? 'var(--accent-green)' : 'var(--accent-yellow)', fontWeight: 600 }}>
                          {r.repairs_successful}/{r.repairs_attempted}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.runtime_executable ? '✅' : '⚠️'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      ${r.cost_usd?.toFixed(5) || '0'}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                      {r.prompt.slice(0, 80)}{r.prompt.length > 80 ? '…' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!results && !running && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p style={{ color: 'var(--text-secondary)' }}>Click "Run Evaluation" to run all 20 prompts through the pipeline<br />and see actual metrics — success rate, latency, retry counts, and cost per request.</p>
        </div>
      )}
    </div>
  )
}

function StatRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>{value}</span>
    </div>
  )
}
