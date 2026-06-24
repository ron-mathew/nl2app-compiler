import React from 'react'

const EVENT_CONFIG = {
  cross_layer_errors: {
    icon: '⚠️',
    className: 'error',
    title: (e) => `${e.count || e.errors?.length || 0} Cross-Layer Inconsistencies Found`,
    detail: (e) => e.errors?.map(err => `[${err.error_type}] ${err.message}`).join('\n') || e.message,
  },
  validation_errors: {
    icon: '❌',
    className: 'error',
    title: (e) => `Schema Validation Errors`,
    detail: (e) => `Layers with errors: ${Object.keys(e.errors || {}).join(', ')}`,
  },
  repair_start: {
    icon: '🔧',
    className: 'repair',
    title: (e) => `Repair Engine Activated (${e.count} issues)`,
    detail: (e) => e.message || 'Performing surgical repair of specific config slices...',
  },
  repair_complete: {
    icon: '✅',
    className: 'success',
    title: (e) => `Repair Complete: ${e.repairs_successful}/${e.repairs_attempted} Fixed`,
    detail: (e) => {
      const clarifications = e.clarifications_needed || []
      if (clarifications.length > 0) {
        return `${clarifications.length} issue(s) could not be auto-resolved and need clarification.`
      }
      return 'All detected inconsistencies resolved via targeted LLM repair.'
    },
  },
  validation_passed: {
    icon: '✅',
    className: 'success',
    title: () => 'All Validation Checks Passed',
    detail: () => 'JSON schema validation ✓ | Cross-layer consistency ✓ | No repairs needed.',
  },
}

export default function RepairLog({ events }) {
  if (!events || events.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔒</div>
        <p>Validation and repair events will appear here in real-time</p>
      </div>
    )
  }

  return (
    <div className="repair-log">
      {events.map((event, i) => {
        const config = EVENT_CONFIG[event.type]
        if (!config) return null

        return (
          <div key={i} className={`repair-event ${config.className}`}>
            <div className="repair-event-icon">{config.icon}</div>
            <div className="repair-event-content">
              <div className="repair-event-title">{config.title(event)}</div>
              <div className="repair-event-detail">
                {config.detail(event).split('\n').map((line, j) => (
                  <div key={j} style={{ marginBottom: '0.1rem' }}>{line}</div>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
