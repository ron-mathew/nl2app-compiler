import React, { useState } from 'react'

const TABS = [
  { key: 'intent',  label: 'Intent IR',    icon: '🔍', badge: d => d?.entities?.length },
  { key: 'design',  label: 'Design',       icon: '🏗️', badge: d => d?.pages?.length + ' pages' },
  { key: 'ui',      label: 'UI Schema',    icon: '🖥️', badge: d => d?.pages?.length + ' pages' },
  { key: 'api',     label: 'API Schema',   icon: '🔌', badge: d => d?.endpoints?.length + ' endpoints' },
  { key: 'db',      label: 'DB Schema',    icon: '🗄️', badge: d => d?.tables?.length + ' tables' },
  { key: 'auth',    label: 'Auth Schema',  icon: '🔐', badge: d => d?.roles?.length + ' roles' },
]

function colorizeJson(obj) {
  const str = JSON.stringify(obj, null, 2)
  return str
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (match) => {
      if (/:$/.test(match)) {
        return `<span class="json-key">${match}</span>`
      }
      return `<span class="json-str">${match}</span>`
    })
    .replace(/\b(true|false)\b/g, '<span class="json-bool">$1</span>')
    .replace(/\bnull\b/g, '<span class="json-null">null</span>')
    .replace(/\b(-?\d+\.?\d*)\b/g, (m, n, offset, s) => {
      // don't colorize numbers inside strings
      const before = s.slice(Math.max(0, offset - 1), offset)
      if (before === '"') return m
      return `<span class="json-num">${m}</span>`
    })
}

export default function JsonViewer({ output }) {
  const [activeTab, setActiveTab] = useState('intent')

  if (!output) return null

  const dataMap = {
    intent: output.intent,
    design: output.design,
    ui:     output.schemas?.ui || output.ui,
    api:    output.schemas?.api || output.api,
    db:     output.schemas?.db || output.db,
    auth:   output.schemas?.auth || output.auth,
  }

  const activeData = dataMap[activeTab]

  return (
    <div>
      <div className="json-viewer-tabs">
        {TABS.map(tab => {
          const data = dataMap[tab.key]
          const badgeVal = data ? tab.badge?.(data) : null
          return (
            <button
              key={tab.key}
              className={`json-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon} {tab.label}
              {badgeVal && <span className="badge">{badgeVal}</span>}
            </button>
          )
        })}
      </div>
      <div className="json-content">
        {activeData ? (
          <pre dangerouslySetInnerHTML={{ __html: colorizeJson(activeData) }} />
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>No data for this tab yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
