import React from 'react'

const LAYER_CONFIG = {
  db: {
    icon: '🗄️',
    label: 'Database Schema',
    detail: (d) => d?.tables_created?.length
      ? `${d.tables_created.length} tables created in SQLite`
      : 'No tables created',
  },
  api: {
    icon: '🔌',
    label: 'API Endpoints',
    detail: (d) => d?.endpoints_passed !== undefined
      ? `${d.endpoints_passed}/${d.endpoints_tested} endpoints responded`
      : 'Not tested',
  },
  ui: {
    icon: '🖥️',
    label: 'UI Schema',
    detail: (d) => d?.pages_validated !== undefined
      ? `${d.pages_validated} pages, ${d.components_validated} components validated`
      : 'Not validated',
  },
}

export default function RuntimeStatus({ proof }) {
  if (!proof) return null

  const layers = ['db', 'api', 'ui']

  return (
    <div className="runtime-grid">
      {layers.map(key => {
        const config = LAYER_CONFIG[key]
        const data = proof[key]
        const success = data?.success

        return (
          <div key={key} className={`runtime-layer ${success ? 'success' : 'failure'}`}>
            <div className="runtime-layer-icon">{config.icon}</div>
            <div className="runtime-layer-name">{config.label}</div>
            <div className="runtime-layer-status">
              {success
                ? <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>✓ Executable</span>
                : <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>✗ Issues Found</span>
              }
            </div>
            <div className="runtime-layer-proof">{config.detail(data)}</div>
          </div>
        )
      })}
    </div>
  )
}
