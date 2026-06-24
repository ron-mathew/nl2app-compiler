import React, { useState, useMemo, useCallback, useRef } from 'react'

// ─── Toast notification system ───────────────────────────────────
function useToasts() {
  const [toasts, setToasts] = useState([])
  const add = useCallback((msg, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800)
  }, [])
  return { toasts, add }
}

function ToastContainer({ toasts }) {
  return (
    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {toasts.map(t => (
        <div key={t.id} className={`preview-toast preview-toast-${t.type}`}>
          {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'} {t.msg}
        </div>
      ))}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="preview-modal-backdrop" onClick={onClose}>
      <div className="preview-modal" onClick={e => e.stopPropagation()}>
        <div className="preview-modal-header">
          <span className="preview-modal-title">{title}</span>
          <button className="preview-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="preview-modal-body">{children}</div>
      </div>
    </div>
  )
}

// ─── Mock data generators ─────────────────────────────────────────
const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry']
const LAST_NAMES  = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller']
const COMPANIES   = ['Acme Corp', 'Initech', 'Globex', 'Umbrella', 'Stark Industries', 'Wayne Enterprises']
const STATUSES    = ['active', 'pending', 'inactive', 'completed', 'in_progress']

function mockValueForField(field = '', type = '', rowIndex = 0) {
  const k = (field + type).toLowerCase()
  const i = rowIndex
  if (k.includes('email'))   return `${FIRST_NAMES[i % 8].toLowerCase()}@company.com`
  if (k.includes('phone'))   return `+1 (555) ${String(200 + i * 37).padStart(3,'0')}-${String(1000 + i * 137).slice(-4)}`
  if (k.includes('first'))   return FIRST_NAMES[i % 8]
  if (k.includes('last'))    return LAST_NAMES[i % 7]
  if (k.includes('name'))    return `${FIRST_NAMES[i % 8]} ${LAST_NAMES[i % 7]}`
  if (k.includes('company')) return COMPANIES[i % 6]
  if (k.includes('title'))   return ['Q3 Campaign', 'Website Redesign', 'API Migration', 'Data Pipeline'][i % 4]
  if (k.includes('status'))  return STATUSES[i % 5]
  if (k.includes('role'))    return ['admin', 'user', 'manager', 'viewer'][i % 4]
  if (k.includes('price') || k.includes('amount') || k.includes('salary')) return `$${(1200 + i * 347).toLocaleString()}`
  if (k.includes('date') || k.includes('_at'))  return `2026-0${(i % 9) + 1}-${String(10 + i).slice(-2)}`
  if (k.includes('count') || k.includes('total')) return String(100 + i * 43)
  if (k.includes('description') || k.includes('note')) return 'Lorem ipsum dolor sit amet consectetur.'
  return `Value ${i + 1}`
}

function generateRows(columns, count = 6) {
  return Array.from({ length: count }, (_, i) => {
    const row = { _id: i + 1 }
    columns.forEach(col => {
      row[col.field || col.name] = mockValueForField(col.field || col.name, col.type || '', i)
    })
    return row
  })
}

// ─── Interactive Data Table ───────────────────────────────────────
function DataTable({ component, toast }) {
  const cols = component.columns || []
  const [rows, setRows]         = useState(() => generateRows(cols, 6))
  const [search, setSearch]     = useState('')
  const [sortCol, setSortCol]   = useState(null)
  const [sortAsc, setSortAsc]   = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [editRow, setEditRow]   = useState(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [newRow, setNewRow]     = useState({})

  const toggleSort = (field) => {
    if (sortCol === field) setSortAsc(a => !a)
    else { setSortCol(field); setSortAsc(true) }
  }

  const filtered = useMemo(() => {
    let r = rows
    if (search.trim()) {
      r = r.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(search.toLowerCase())))
    }
    if (sortCol) {
      r = [...r].sort((a, b) => {
        const av = String(a[sortCol] || '')
        const bv = String(b[sortCol] || '')
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    return r
  }, [rows, search, sortCol, sortAsc])

  const toggleSelect = (id) => setSelected(prev => {
    const s = new Set(prev)
    s.has(id) ? s.delete(id) : s.add(id)
    return s
  })

  const deleteRow = (id) => {
    setRows(prev => prev.filter(r => r._id !== id))
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
    toast('Row deleted', 'error')
  }

  const saveEdit = () => {
    setRows(prev => prev.map(r => r._id === editRow._id ? { ...r, ...editRow } : r))
    setEditRow(null)
    toast('Record updated successfully')
  }

  const addRow = () => {
    const id = Date.now()
    const filled = {}
    cols.forEach(col => {
      filled[col.field] = newRow[col.field] || mockValueForField(col.field, col.type, rows.length)
    })
    setRows(prev => [...prev, { _id: id, ...filled }])
    setShowAdd(false)
    setNewRow({})
    toast('Record added successfully')
  }

  const deleteSelected = () => {
    setRows(prev => prev.filter(r => !selected.has(r._id)))
    toast(`${selected.size} record(s) deleted`, 'error')
    setSelected(new Set())
  }

  if (!cols.length) return <div className="preview-empty">No columns defined</div>

  return (
    <>
      {editRow && (
        <Modal title="Edit Record" onClose={() => setEditRow(null)}>
          {cols.map(col => (
            <div key={col.field} className="preview-field">
              <label className="preview-label">{col.label || col.field}</label>
              <input
                className="preview-input interactive"
                value={editRow[col.field] || ''}
                onChange={e => setEditRow(prev => ({ ...prev, [col.field]: e.target.value }))}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="preview-btn-interactive primary" onClick={saveEdit}>Save Changes</button>
            <button className="preview-btn-interactive secondary" onClick={() => setEditRow(null)}>Cancel</button>
          </div>
        </Modal>
      )}
      {showAdd && (
        <Modal title="Add New Record" onClose={() => setShowAdd(false)}>
          {cols.map(col => (
            <div key={col.field} className="preview-field">
              <label className="preview-label">{col.label || col.field}</label>
              <input
                className="preview-input interactive"
                placeholder={`Enter ${col.label || col.field}…`}
                value={newRow[col.field] || ''}
                onChange={e => setNewRow(prev => ({ ...prev, [col.field]: e.target.value }))}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="preview-btn-interactive primary" onClick={addRow}>Add Record</button>
            <button className="preview-btn-interactive secondary" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </Modal>
      )}

      <div className="preview-table-wrap">
        <div className="preview-table-toolbar">
          <div className="preview-search-wrap">
            <span>🔍</span>
            <input
              className="preview-search-input"
              placeholder="Search records…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button className="preview-search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {selected.size > 0 && (
              <button className="preview-btn-interactive danger" onClick={deleteSelected}>
                🗑️ Delete ({selected.size})
              </button>
            )}
            <button className="preview-btn-interactive primary" onClick={() => setShowAdd(true)}>
              + Add New
            </button>
          </div>
        </div>

        <table className="preview-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={e => setSelected(e.target.checked ? new Set(filtered.map(r => r._id)) : new Set())}
                  className="preview-checkbox"
                />
              </th>
              {cols.map(col => (
                <th key={col.field} onClick={() => toggleSort(col.field)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  className={`preview-th ${sortCol === col.field ? 'sorted' : ''}`}>
                  {col.label || col.field}
                  {col.sortable !== false && (
                    <span style={{ marginLeft: 4, opacity: sortCol === col.field ? 1 : 0.3 }}>
                      {sortCol === col.field ? (sortAsc ? '↑' : '↓') : '↕'}
                    </span>
                  )}
                </th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={cols.length + 2} className="preview-empty">No records match your search</td></tr>
            ) : filtered.map(row => (
              <tr key={row._id} className={selected.has(row._id) ? 'selected' : ''}>
                <td>
                  <input type="checkbox"
                    checked={selected.has(row._id)}
                    onChange={() => toggleSelect(row._id)}
                    className="preview-checkbox"
                  />
                </td>
                {cols.map(col => (
                  <td key={col.field}>{row[col.field]}</td>
                ))}
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="preview-action-btn edit" title="Edit" onClick={() => setEditRow({ ...row })}>✏️</button>
                    <button className="preview-action-btn delete" title="Delete" onClick={() => deleteRow(row._id)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="preview-table-footer">
          {filtered.length} of {rows.length} records
          {selected.size > 0 && ` · ${selected.size} selected`}
        </div>
      </div>
    </>
  )
}

// ─── Interactive Form ─────────────────────────────────────────────
function FormComponent({ component, toast }) {
  const fields = component.fields || []
  const [values, setValues] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors]   = useState({})

  const validate = () => {
    const e = {}
    fields.forEach(f => {
      if (f.required && !values[f.name || f.field]) {
        e[f.name || f.field] = 'This field is required'
      }
    })
    return e
  }

  const handleSubmit = () => {
    const e = validate()
    if (Object.keys(e).length > 0) {
      setErrors(e)
      toast('Please fill in required fields', 'error')
      return
    }
    setSubmitted(true)
    toast('Form submitted successfully!')
    setTimeout(() => { setSubmitted(false); setValues({}) }, 2000)
  }

  return (
    <div className="preview-form">
      {submitted && (
        <div className="preview-success-banner">✅ Submitted successfully! Form will reset shortly.</div>
      )}
      {(fields.length > 0 ? fields : [
        { name: 'name', label: 'Full Name', type: 'text', required: true },
        { name: 'email', label: 'Email Address', type: 'email', required: true },
        { name: 'role', label: 'Role', type: 'select' },
      ]).slice(0, 6).map((f, i) => {
        const key = f.name || f.field || String(i)
        const label = f.label || key
        return (
          <div key={key} className="preview-field">
            <label className="preview-label">
              {label}
              {f.required && <span style={{ color: 'var(--accent-red)', marginLeft: 3 }}>*</span>}
            </label>
            {f.type === 'select' || f.type === 'enum' ? (
              <select className="preview-input interactive"
                value={values[key] || ''}
                onChange={e => { setValues(p => ({ ...p, [key]: e.target.value })); setErrors(p => ({ ...p, [key]: undefined })) }}>
                <option value="">Select {label}…</option>
                <option>Admin</option><option>User</option><option>Manager</option>
              </select>
            ) : f.type === 'textarea' ? (
              <textarea className="preview-input interactive" rows={2}
                placeholder={`Enter ${label}…`}
                value={values[key] || ''}
                onChange={e => { setValues(p => ({ ...p, [key]: e.target.value })); setErrors(p => ({ ...p, [key]: undefined })) }}
              />
            ) : (
              <input className="preview-input interactive"
                type={f.type === 'password' ? 'password' : f.type === 'email' ? 'email' : 'text'}
                placeholder={`Enter ${label}…`}
                value={values[key] || ''}
                onChange={e => { setValues(p => ({ ...p, [key]: e.target.value })); setErrors(p => ({ ...p, [key]: undefined })) }}
              />
            )}
            {errors[key] && <span className="preview-field-error">{errors[key]}</span>}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="preview-btn-interactive primary" onClick={handleSubmit}>Submit</button>
        <button className="preview-btn-interactive secondary"
          onClick={() => { setValues({}); setErrors({}) }}>Reset</button>
      </div>
    </div>
  )
}

// ─── Interactive Chart ────────────────────────────────────────────
function ChartComponent() {
  const [period, setPeriod]     = useState('week')
  const [hoveredBar, setHovered] = useState(null)
  const datasets = {
    week:  { labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], values: [65,80,45,90,70,55,85] },
    month: { labels: ['W1','W2','W3','W4'], values: [320,410,280,490] },
    year:  { labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], values: [120,140,90,200,180,220,195,240,170,310,280,350] },
  }
  const { labels, values } = datasets[period]
  const max = Math.max(...values)

  return (
    <div className="preview-chart-wrap">
      <div className="preview-chart-controls">
        {['week','month','year'].map(p => (
          <button key={p} className={`preview-period-btn ${period === p ? 'active' : ''}`}
            onClick={() => setPeriod(p)}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>
      <div className="preview-chart">
        {hoveredBar !== null && (
          <div className="preview-chart-tooltip">
            {labels[hoveredBar]}: <strong>{values[hoveredBar]}</strong>
          </div>
        )}
        <div className="preview-chart-bars">
          {values.map((h, i) => (
            <div key={i} className="preview-chart-col"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}>
              <div className="preview-chart-bar"
                style={{
                  height: `${(h / max) * 100}%`,
                  opacity: hoveredBar === null || hoveredBar === i ? 1 : 0.4,
                  background: hoveredBar === i
                    ? 'linear-gradient(180deg, #06b6d4, #6366f1)'
                    : 'linear-gradient(180deg, #6366f1, #8b5cf6)',
                  transform: hoveredBar === i ? 'scaleY(1.02)' : 'none',
                  transformOrigin: 'bottom',
                  transition: 'all 0.15s ease',
                }}
              />
              <div className="preview-chart-label">{labels[i]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Stats Cards ──────────────────────────────────────────────────
function StatsCard({ label, value, icon, color, toast }) {
  const [count, setCount] = useState(parseInt(value) || 0)
  return (
    <div className="preview-stat-card" style={{ borderColor: color + '40', cursor: 'pointer' }}
      onClick={() => { setCount(c => c + 1); toast(`${label} count updated`) }}>
      <div className="preview-stat-icon" style={{ background: color + '20', color }}>{icon}</div>
      <div className="preview-stat-value" style={{ color }}>{count.toLocaleString()}</div>
      <div className="preview-stat-label">{label}</div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>click to update</div>
    </div>
  )
}

// ─── Helper: derive stats ─────────────────────────────────────────
function deriveStats(dbSchema) {
  const tables = dbSchema?.tables || []
  const icons  = ['👥','📦','📋','💳','📊','🏷️','📁','⚡']
  const colors = ['#6366f1','#10b981','#f59e0b','#06b6d4','#8b5cf6','#f97316','#ef4444','#3b82f6']
  return tables.slice(0, 4).map((t, i) => ({
    label: (t.name || 'Table').replace(/_/g,'').replace(/\b\w/g,c=>c.toUpperCase()),
    value: String(100 + i * 73 + Math.floor(i * 37)),
    icon:  icons[i % icons.length],
    color: colors[i % colors.length],
  }))
}

// ─── Page icon map ────────────────────────────────────────────────
const PAGE_ICONS = {
  login:'🔐', dashboard:'🏠', home:'🏠', analytics:'📊', contacts:'👥',
  users:'👤', settings:'⚙️', profile:'👤', products:'📦', orders:'📋',
  reports:'📈', tasks:'✅', tickets:'🎫', projects:'📁', employees:'👷',
  payroll:'💵', appointments:'📅', patients:'🏥', courses:'📚', chat:'💬',
  listings:'🏠', properties:'🏡', invoices:'🧾', payments:'💳',
  kitchen:'🍳', reservation:'📅', menu:'🍽️', staff:'👔', sales:'💹', default:'📄',
}
function getPageIcon(page) {
  const name = (page.name || page.id || '').toLowerCase()
  for (const [k, v] of Object.entries(PAGE_ICONS)) if (name.includes(k)) return v
  return PAGE_ICONS.default
}

// ─── Kitchen Order / Kanban Display ────────────────────────────────
const FOOD_STATUSES = ['New', 'Preparing', 'Ready', 'Served']
const JIRA_STATUSES = ['To Do', 'In Progress', 'In Review', 'Done']

const FOOD_COLORS = { New: '#6366f1', Preparing: '#f59e0b', Ready: '#10b981', Served: '#6b7280' }
const JIRA_COLORS = { 'To Do': '#6b7280', 'In Progress': '#f59e0b', 'In Review': '#8b5cf6', Done: '#10b981' }

const DISHES = ['Margherita Pizza', 'Caesar Salad', 'Grilled Salmon', 'Beef Burger', 'Pasta Carbonara', 'Club Sandwich', 'Veggie Bowl', 'Fish Tacos']

const JIRA_TASKS = [
  'Implement OAuth redirect logic',
  'Design interactive sprint board',
  'Connect time tracking DB layer',
  'Fix workspace refresh state bug',
  'Integrate team permissions checks',
  'Write validation tests for tickets',
  'Optimize sandbox load speeds',
  'Configure automated release pipeline'
]

const JIRA_ASSIGNEES = ['Alice Smith', 'Bob Johnson', 'Carol Williams', 'David Brown', 'Emma Jones', 'Frank Garcia']

function KitchenDisplay({ toast, appName }) {
  const nameLower = (appName || '').toLowerCase()
  const isFoodApp = nameLower.includes('kitchen') || 
                    nameLower.includes('kds') || 
                    nameLower.includes('restaurant') || 
                    nameLower.includes('order') || 
                    nameLower.includes('food') || 
                    nameLower.includes('cafe') || 
                    nameLower.includes('pizza') || 
                    nameLower.includes('dining') ||
                    nameLower.includes('eat')
  
  const statuses = isFoodApp ? FOOD_STATUSES : JIRA_STATUSES
  const statusColors = isFoodApp ? FOOD_COLORS : JIRA_COLORS
  
  const [tickets, setTickets] = useState(() => {
    if (isFoodApp) {
      return Array.from({ length: 6 }, (_, i) => ({
        id: `ORD-${100 + i}`,
        label: `Table ${i + 1}`,
        status: FOOD_STATUSES[i % 3],
        items: DISHES.slice(i % 5, (i % 5) + 2),
        time: `${5 + i * 3}m ago`,
        priority: i < 2 ? 'high' : 'normal',
      }))
    } else {
      return Array.from({ length: 6 }, (_, i) => ({
        id: `JIRA-${100 + i}`,
        label: JIRA_ASSIGNEES[i % JIRA_ASSIGNEES.length],
        status: JIRA_STATUSES[i % 3],
        items: [JIRA_TASKS[i % JIRA_TASKS.length]],
        time: `${12 + i * 8}m ago`,
        priority: i < 2 ? 'high' : 'normal',
      }))
    }
  })

  const advance = (id) => {
    setTickets(prev => prev.map(t => {
      if (t.id !== id) return t
      const curIndex = statuses.indexOf(t.status)
      if (curIndex >= statuses.length - 1) return t
      const next = statuses[curIndex + 1]
      toast(`${id} moved to ${next}`)
      return { ...t, status: next }
    }))
  }

  const getButtonText = (status) => {
    if (isFoodApp) {
      if (status === 'New') return 'Mark Preparing →'
      if (status === 'Preparing') return 'Mark Ready →'
      if (status === 'Ready') return 'Mark Served →'
    } else {
      if (status === 'To Do') return 'Start Progress →'
      if (status === 'In Progress') return 'Submit for Review →'
      if (status === 'In Review') return 'Approve & Close →'
    }
    return 'Advance →'
  }

  const grouped = statuses.reduce((acc, s) => ({ ...acc, [s]: tickets.filter(t => t.status === s) }), {})

  return (
    <div className="preview-kitchen">
      {statuses.map(status => (
        <div key={status} className="preview-kitchen-col">
          <div className="preview-kitchen-col-header" style={{ borderColor: statusColors[status] }}>
            <span style={{ color: statusColors[status] }}>●</span> {status}
            <span className="preview-kitchen-count">{grouped[status].length}</span>
          </div>
          <div className="preview-kitchen-tickets">
            {grouped[status].map(t => (
              <div key={t.id} className={`preview-kitchen-ticket ${t.priority === 'high' ? 'urgent' : ''}`}>
                <div className="preview-kitchen-ticket-header">
                  <span className="preview-kitchen-ticket-id">{t.id}</span>
                  <span className="preview-kitchen-ticket-table">👤 {t.label}</span>
                  <span className="preview-kitchen-ticket-time">{t.time}</span>
                </div>
                <div className="preview-kitchen-items">
                  {t.items.map((item, i) => <div key={i} className="preview-kitchen-item">{item}</div>)}
                </div>
                {status !== statuses[statuses.length - 1] && (
                  <button className="preview-btn-interactive primary" style={{ width: '100%', marginTop: 6, fontSize: '0.72rem' }}
                    onClick={() => advance(t.id)}>
                    {getButtonText(status)}
                  </button>
                )}
              </div>
            ))}
            {grouped[status].length === 0 && <div className="preview-empty">No items</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Reservations Calendar ─────────────────────────────────────────
const TIMES  = ['12:00','12:30','13:00','13:30','14:00','14:30','18:00','18:30','19:00','19:30','20:00','20:30']
const TABLES_LIST = ['Table 1','Table 2','Table 3','Table 4','Table 5']
const GUEST_NAMES = ['Smith family','Johnson party','Williams','Brown & co','Jones group']

function ReservationsView({ toast }) {
  const today = new Date()
  const [selectedDate, setSelectedDate] = useState(today.toISOString().slice(0, 10))
  const [reservations, setReservations] = useState([
    { id: 1, time: '12:30', table: 'Table 1', guests: 4, name: 'Smith family', status: 'confirmed' },
    { id: 2, time: '13:00', table: 'Table 3', guests: 2, name: 'Johnson party', status: 'confirmed' },
    { id: 3, time: '18:30', table: 'Table 2', guests: 6, name: 'Williams', status: 'pending' },
    { id: 4, time: '19:00', table: 'Table 5', guests: 3, name: 'Brown & co', status: 'confirmed' },
    { id: 5, time: '20:00', table: 'Table 4', guests: 8, name: 'Jones group', status: 'pending' },
  ])
  const [showNew, setShowNew] = useState(false)
  const [newRes, setNewRes] = useState({ time: '19:00', table: 'Table 1', guests: '2', name: '' })

  const confirm = (id) => {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status: 'confirmed' } : r))
    toast('Reservation confirmed')
  }
  const cancel = (id) => {
    setReservations(prev => prev.filter(r => r.id !== id))
    toast('Reservation cancelled', 'error')
  }
  const addRes = () => {
    if (!newRes.name) { toast('Please enter guest name', 'error'); return }
    setReservations(prev => [...prev, { id: Date.now(), ...newRes, guests: parseInt(newRes.guests)||2, status: 'pending' }])
    setShowNew(false)
    setNewRes({ time: '19:00', table: 'Table 1', guests: '2', name: '' })
    toast('Reservation added')
  }
  return (
    <div style={{ padding: '0.85rem' }}>
      {showNew && (
        <Modal title="New Reservation" onClose={() => setShowNew(false)}>
          {[['name','Guest Name','text'],['time','Time','text'],['table','Table','text'],['guests','Guests','number']].map(([k,l,t]) => (
            <div key={k} className="preview-field">
              <label className="preview-label">{l}</label>
              <input className="preview-input interactive" type={t} value={newRes[k]}
                placeholder={`Enter ${l}…`}
                onChange={e => setNewRes(p => ({ ...p, [k]: e.target.value }))} />
            </div>
          ))}
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button className="preview-btn-interactive primary" onClick={addRes}>Add Reservation</button>
            <button className="preview-btn-interactive secondary" onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </Modal>
      )}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
        <input type="date" className="preview-input interactive" style={{ width:'auto' }}
          value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
        <button className="preview-btn-interactive primary" onClick={() => setShowNew(true)}>+ New Reservation</button>
      </div>
      <table className="preview-table">
        <thead>
          <tr>
            {['Time','Table','Guests','Name','Status','Actions'].map(h => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {reservations.sort((a,b) => a.time.localeCompare(b.time)).map(r => (
            <tr key={r.id}>
              <td style={{ fontFamily:'var(--font-mono)', color:'var(--accent-cyan)' }}>{r.time}</td>
              <td>{r.table}</td>
              <td>{r.guests} guests</td>
              <td>{r.name}</td>
              <td>
                <span style={{
                  padding:'0.15rem 0.5rem', borderRadius:20, fontSize:'0.7rem', fontWeight:600,
                  background: r.status==='confirmed' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                  color: r.status==='confirmed' ? '#10b981' : '#f59e0b',
                }}>{r.status}</span>
              </td>
              <td>
                <div style={{ display:'flex', gap:4 }}>
                  {r.status === 'pending' && (
                    <button className="preview-action-btn edit" onClick={() => confirm(r.id)} title="Confirm">✓</button>
                  )}
                  <button className="preview-action-btn delete" onClick={() => cancel(r.id)} title="Cancel">✕</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="preview-table-footer">{reservations.length} reservations</div>
    </div>
  )
}

// ─── Smart page-type detection ─────────────────────────────────────
function detectPagePurpose(page) {
  const n = (page?.name || page?.id || '').toLowerCase()
  if (n.includes('kitchen') || n.includes('cook') || n.includes('order_display') || n.includes('kds')) return 'kitchen'
  if (n.includes('reserv') || n.includes('booking') || n.includes('appointment')) return 'reservations'
  if (n.includes('report') || n.includes('analytic') || n.includes('sales') || n.includes('stat')) return 'chart'
  if (n.includes('menu') || n.includes('catalog') || n.includes('product')) return 'table'
  return null
}

function renderComponent(comp, toast, appName) {
  const type = (comp.type || '').toLowerCase()
  if (type.includes('table') || type.includes('list') || type.includes('grid') || type.includes('data_table'))
    return <DataTable component={comp} toast={toast} />
  if (type.includes('form') || type.includes('input'))
    return <FormComponent component={comp} toast={toast} />
  if (type.includes('chart') || type.includes('graph') || type.includes('analytic') || type.includes('report'))
    return <ChartComponent />
  if (type.includes('kitchen') || type.includes('order_display') || type.includes('kds') || type.includes('ticket'))
    return <KitchenDisplay toast={toast} appName={appName} />
  if (type.includes('calendar') || type.includes('reserv') || type.includes('booking') || type.includes('schedule'))
    return <ReservationsView toast={toast} />
  if (type.includes('kanban') || type.includes('board'))
    return <KitchenDisplay toast={toast} appName={appName} />  // reuse kanban-style display
  if (type.includes('button'))
    return (
      <div style={{ padding: '0.85rem' }}>
        <button className="preview-btn-interactive primary" onClick={() => toast(`${comp.label || 'Action'} triggered`)}>
          {comp.label || 'Action'}
        </button>
      </div>
    )
  return null
}

// ─── Main AppPreview ──────────────────────────────────────────────
export default function AppPreview({ output }) {
  const ui     = output?.schemas?.ui || output?.ui
  const api    = output?.schemas?.api || output?.api
  const db     = output?.schemas?.db || output?.db
  const auth   = output?.schemas?.auth || output?.auth
  const intent = output?.intent
  const design = output?.design

  const pages    = ui?.pages || design?.pages || []
  const roles    = auth?.roles || design?.roles || []
  const appName  = intent?.app_name || output?.app_name || 'My App'
  const { toasts, add: toast } = useToasts()

  const defaultPage = useMemo(() =>
    pages.find(p => !['login','register','signup','forgot'].includes((p.id||'').toLowerCase())) || pages[0]
  , [pages])

  const [activePage, setActivePage] = useState(null)
  const currentPage = activePage || defaultPage
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const stats       = useMemo(() => deriveStats(db), [db])
  const endpoints   = api?.endpoints || []
  const tables      = db?.tables || []
  const isDashboard = (p) => { const n = (p?.id||p?.name||'').toLowerCase(); return n.includes('dashboard')||n.includes('home') }

  if (!pages.length && !tables.length) {
    return (
      <div className="preview-empty-state">
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🖥️</div>
        <p>No UI pages generated yet.<br />Run a prompt to see the app preview.</p>
      </div>
    )
  }

  const currentComponents = currentPage?.components || []

  const [viewportMode, setViewportMode] = useState('desktop')
  const isMobile = viewportMode === 'mobile'

  return (
    <div className="browser-frame animate-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <ToastContainer toasts={toasts} />

      {/* Browser Chrome Header */}
      <div className="browser-chrome">
        <div className="browser-dots">
          <span className="browser-dot red" />
          <span className="browser-dot yellow" />
          <span className="browser-dot green" />
        </div>
        
        <div className="browser-nav-actions">
          <button className="browser-nav-btn" onClick={() => toast('Backward history is disabled in preview', 'info')}>‹</button>
          <button className="browser-nav-btn" onClick={() => toast('Forward history is disabled in preview', 'info')}>›</button>
          <button className="browser-nav-btn" onClick={() => toast('Data refreshed')}>↻</button>
        </div>

        <div className="browser-address">
          <span className="browser-address-domain">localhost:3000</span>
          <span className="browser-address-input">{currentPage?.route || '/'}</span>
        </div>

        <div className="browser-responsive-controls">
          <button 
            className={`browser-responsive-btn ${viewportMode === 'desktop' ? 'active' : ''}`}
            onClick={() => setViewportMode('desktop')}
          >
            🖥️ Desktop
          </button>
          <button 
            className={`browser-responsive-btn ${viewportMode === 'tablet' ? 'active' : ''}`}
            onClick={() => setViewportMode('tablet')}
          >
            📟 Tablet
          </button>
          <button 
            className={`browser-responsive-btn ${viewportMode === 'mobile' ? 'active' : ''}`}
            onClick={() => setViewportMode('mobile')}
          >
            📱 Mobile
          </button>
        </div>
      </div>

      {/* Browser Body Area */}
      <div className="browser-body">
        <div 
          className="preview-app-shell" 
          style={
            viewportMode === 'desktop' ? { width: '100%', height: '100%', display: 'flex', flexDirection: 'column' } :
            viewportMode === 'tablet' ? { width: '768px', margin: '1.25rem auto', minHeight: 'calc(100% - 2.5rem)', background: '#FFFFFF', display: 'flex', flexDirection: 'column', borderRadius: '8px', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' } :
            { width: '375px', margin: '1.25rem auto', minHeight: 'calc(100% - 2.5rem)', background: '#FFFFFF', display: 'flex', flexDirection: 'column', borderRadius: '8px', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }
          }
        >
          {/* App shell layout */}
          {isMobile ? (
            <div className="mobile-app-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
              {/* Mobile Header */}
              <header className="mobile-app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 1rem', borderBottom: '1px solid rgba(0,0,0,0.05)', background: '#FFFFFF', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--accent-secondary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.65rem' }}>
                    {appName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)' }}>{appName}</span>
                </div>
                <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  {getPageIcon(currentPage)} {currentPage?.name || currentPage?.id}
                </h3>
                <button 
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  style={{ background: 'transparent', border: 'none', fontSize: '1.15rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}
                >
                  {mobileMenuOpen ? '✕' : '☰'}
                </button>
              </header>

              {/* Mobile Main Content */}
              <main className="preview-main" style={{ flex: 1, overflowY: 'auto', padding: '1rem', background: '#FFFFFF' }}>
                {/* Stats cards in a single column or 2-column grid for mobile */}
                {isDashboard(currentPage) && stats.length > 0 && (
                  <div className="preview-stats-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {stats.map((s, i) => <StatsCard key={i} {...s} toast={toast} />)}
                  </div>
                )}

                {/* Page Components */}
                {(() => {
                  const validComps = currentComponents.filter(comp => {
                    const type = (comp.type || '').toLowerCase()
                    return !type.includes('stat') && !type.includes('metric')
                  })
                  const renderedComps = validComps
                    .map((comp, i) => ({ comp, i, el: renderComponent(comp, toast, appName) }))
                    .filter(({ el }) => el !== null)

                  if (renderedComps.length > 0) {
                    return (
                      <div className="preview-components" style={{ gap: '0.85rem' }}>
                        {renderedComps.map(({ comp, i, el }) => (
                          <div key={comp.id || i} className="preview-component-block">
                            <div className="preview-component-label" style={{ padding: '0.35rem 0.6rem', fontSize: '0.62rem' }}>
                              <span>{comp.type}</span>
                              {comp.id && <code>{comp.id}</code>}
                            </div>
                            <div style={{ padding: comp.type.toLowerCase().includes('table') ? 0 : '0.5rem' }}>
                              {el}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  }

                  // Fallbacks
                  const purpose = detectPagePurpose(currentPage)
                  if (purpose === 'kitchen') {
                    return (
                      <div className="preview-component-block">
                        <div className="preview-component-label"><span>kitchen_display</span><code>KDS Board</code></div>
                        <KitchenDisplay toast={toast} appName={appName} />
                      </div>
                    )
                  }
                  if (purpose === 'reservations') {
                    return (
                      <div className="preview-component-block">
                        <div className="preview-component-label"><span>reservation_table</span><code>Bookings</code></div>
                        <ReservationsView toast={toast} />
                      </div>
                    )
                  }
                  if (purpose === 'chart') {
                    return (
                      <div className="preview-component-block">
                        <div className="preview-component-label"><span>chart</span><code>Analytics</code></div>
                        <ChartComponent />
                      </div>
                    )
                  }

                  const pageName = (currentPage?.name || currentPage?.id || '').toLowerCase()
                  const relevantTable = tables.find(t => pageName.split(/[_\s]/).some(word => word.length > 3 && t.name?.toLowerCase().includes(word)))
                    || tables[0]

                  if (!relevantTable) return null
                  const cols = relevantTable.columns
                    ?.filter(c => !['id','created_at','updated_at','password_hash','password'].includes(c.name))
                    .slice(0, 5)
                    .map(c => ({ field: c.name, label: c.name.replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase()), sortable: true })) || []
                  if (!cols.length) return null
                  return (
                    <div className="preview-component-block">
                      <div className="preview-component-label">
                        <span>data_table</span><code>{relevantTable.name}</code>
                      </div>
                      <DataTable component={{ columns: cols, actions: ['edit','delete'] }} toast={toast} />
                    </div>
                  )
                })()}
              </main>

              {/* Mobile Navigation Menu Drawer Overlay */}
              {mobileMenuOpen && (
                <div 
                  className="mobile-nav-drawer animate-in" 
                  style={{ 
                    position: 'absolute', 
                    top: '38px', // height of mobile header
                    left: 0, 
                    right: 0, 
                    bottom: '41px', // height of bottom tab bar
                    background: '#FFFFFF', 
                    zIndex: 90, 
                    display: 'flex', 
                    flexDirection: 'column',
                    padding: '1rem',
                    borderTop: '1px solid rgba(0,0,0,0.05)',
                  }}
                >
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Navigate Pages</div>
                  <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', overflowY: 'auto', flex: 1 }}>
                    {pages.map(page => (
                      <button 
                        key={page.id}
                        onClick={() => { setActivePage(page); setMobileMenuOpen(false); toast(`Navigated to ${page.name || page.id}`, 'info') }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.6rem 0.85rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: currentPage?.id === page.id ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                          color: currentPage?.id === page.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                          fontWeight: currentPage?.id === page.id ? '600' : '500',
                          textAlign: 'left',
                          fontSize: '0.78rem',
                          width: '100%',
                          cursor: 'pointer'
                        }}
                      >
                        <span>{getPageIcon(page)}</span>
                        <span>{page.name || page.id}</span>
                      </button>
                    ))}
                  </nav>

                  {roles.length > 0 && (
                    <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '0.75rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Roles</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {roles.map(r => (
                          <span key={r} style={{ display: 'inline-block', padding: '2px 6px', fontSize: '0.62rem', borderRadius: '4px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <div className="user-avatar" style={{ width: 28, height: 28, fontSize: '0.75rem' }}>JD</div>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>John Doe</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{roles[0] || 'admin'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile Bottom Tab Bar */}
              <nav className="mobile-bottom-bar" style={{ display: 'flex', borderTop: '1px solid rgba(0,0,0,0.05)', background: '#F8FAFC', padding: '0.25rem 0', flexShrink: 0 }}>
                {pages
                  .slice(0, 4)
                  .map(page => (
                    <button
                      key={page.id}
                      onClick={() => { setActivePage(page); setMobileMenuOpen(false); }}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        background: 'transparent',
                        padding: '0.25rem 0',
                        color: currentPage?.id === page.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      <span style={{ fontSize: '1rem' }}>{getPageIcon(page)}</span>
                      <span style={{ fontSize: '0.58rem', fontWeight: currentPage?.id === page.id ? 600 : 500, marginTop: '2px' }}>{page.name || page.id}</span>
                    </button>
                  ))}
                {pages.length > 4 && (
                  <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      background: 'transparent',
                      padding: '0.25rem 0',
                      color: mobileMenuOpen ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '1rem' }}>☰</span>
                    <span style={{ fontSize: '0.58rem', fontWeight: mobileMenuOpen ? 600 : 500, marginTop: '2px' }}>Menu</span>
                  </button>
                )}
              </nav>
            </div>
          ) : (
            <div className="preview-content-wrap">
              {/* Sidebar */}
              <aside className="preview-sidebar">
                <div className="preview-sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <div className="preview-app-logo" style={{ width: 26, height: 26, borderRadius: 4, background: 'var(--accent-secondary)', color: 'white', display: 'flex', alignItems: 'center', justifyCenter: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.75rem' }}>
                    {appName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <span className="preview-app-name" style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{appName}</span>
                </div>

                <nav className="preview-nav" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {pages
                    .filter(p => !['login','register','signup','forgot'].includes((p.id||'').toLowerCase()))
                    .slice(0, 8)
                    .map(page => (
                      <button 
                        key={page.id}
                        className={`preview-sidebar-btn ${currentPage?.id === page.id ? 'active' : ''}`}
                        onClick={() => { setActivePage(page); toast(`Navigated to ${page.name || page.id}`, 'info') }}
                        style={currentPage?.id === page.id ? {
                          background: 'rgba(37, 99, 235, 0.08)',
                          color: 'var(--accent-primary)',
                          fontWeight: '600',
                        } : {}}
                      >
                        <span>{getPageIcon(page)}</span>
                        <span>{page.name || page.id}</span>
                      </button>
                    ))}
                </nav>

                {roles.length > 0 && (
                  <div className="preview-roles" style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: '0.75rem' }}>
                    <div className="preview-roles-label" style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Roles</div>
                    <div className="preview-roles-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {roles.map(r => (
                        <span 
                          key={r} 
                          style={{ display: 'inline-block', padding: '1px 6px', fontSize: '0.62rem', borderRadius: '4px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-secondary)', fontWeight: 500 }}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="preview-sidebar-footer" style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                  <div className="user-avatar" style={{ width: 28, height: 28, fontSize: '0.75rem' }}>JD</div>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>John Doe</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{roles[0] || 'admin'}</div>
                  </div>
                </div>
              </aside>

              {/* Main content */}
              <main className="preview-main">
                {/* Page header */}
                <div className="preview-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: '0.75rem' }}>
                  <div>
                    <h2 className="preview-page-title" style={{ fontSize: '1.15rem', fontWeight: 700 }}>{getPageIcon(currentPage)} {currentPage?.name || 'Dashboard'}</h2>
                    <p className="preview-page-subtitle" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {currentPage?.route || '/'}
                      {currentPage?.access_roles?.length > 0 && (
                        <span style={{ color: 'var(--accent-secondary)', marginLeft: 8 }}>
                          🔐 {Array.isArray(currentPage.access_roles)
                            ? currentPage.access_roles.join(', ')
                            : currentPage.access_roles}
                        </span>
                      )}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="preview-btn-interactive secondary" onClick={() => toast('Data refreshed')}>↻ Refresh</button>
                    <button className="preview-btn-interactive primary" style={{ background: 'var(--accent-primary)' }} onClick={() => toast(`New ${currentPage?.name || 'record'} created`)}>+ New</button>
                  </div>
                </div>

                {/* Stats — only on dashboard/home pages */}
                {isDashboard(currentPage) && stats.length > 0 && (
                  <div className="preview-stats-row">
                    {stats.map((s, i) => <StatsCard key={i} {...s} toast={toast} />)}
                  </div>
                )}

                {/* Components */}
                {(() => {
                  const validComps = currentComponents.filter(comp => {
                    const type = (comp.type || '').toLowerCase()
                    return !type.includes('stat') && !type.includes('metric')
                  })
                  const renderedComps = validComps
                    .map((comp, i) => ({ comp, i, el: renderComponent(comp, toast, appName) }))
                    .filter(({ el }) => el !== null)

                  if (renderedComps.length > 0) {
                    return (
                      <div className="preview-components">
                        {renderedComps.map(({ comp, i, el }) => (
                          <div key={comp.id || i} className="preview-component-block">
                            <div className="preview-component-label">
                              <span>{comp.type}</span>
                              {comp.id && <code>{comp.id}</code>}
                              {comp.data_source && (
                                <span className="preview-endpoint-tag" style={{ color: 'var(--accent-secondary)', fontSize: '0.62rem' }}>🔌 {comp.data_source}</span>
                              )}
                            </div>
                            {el}
                          </div>
                        ))}
                      </div>
                    )
                  }

                  // Fallbacks
                  const purpose = detectPagePurpose(currentPage)
                  if (purpose === 'kitchen') {
                    return (
                      <div className="preview-component-block">
                        <div className="preview-component-label"><span>kitchen_display</span><code>KDS Board</code></div>
                        <KitchenDisplay toast={toast} appName={appName} />
                      </div>
                    )
                  }
                  if (purpose === 'reservations') {
                    return (
                      <div className="preview-component-block">
                        <div className="preview-component-label"><span>reservation_table</span><code>Bookings</code></div>
                        <ReservationsView toast={toast} />
                      </div>
                    )
                  }
                  if (purpose === 'chart') {
                    return (
                      <div className="preview-component-block">
                        <div className="preview-component-label"><span>chart</span><code>Analytics</code></div>
                        <ChartComponent />
                      </div>
                    )
                  }

                  const pageName = (currentPage?.name || currentPage?.id || '').toLowerCase()
                  const relevantTable = tables.find(t => pageName.split(/[_\s]/).some(word => word.length > 3 && t.name?.toLowerCase().includes(word)))
                    || tables[0]

                  if (!relevantTable) return null
                  const cols = relevantTable.columns
                    ?.filter(c => !['id','created_at','updated_at','password_hash','password'].includes(c.name))
                    .slice(0, 5)
                    .map(c => ({ field: c.name, label: c.name.replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase()), sortable: true })) || []
                  if (!cols.length) return null
                  return (
                    <div className="preview-component-block">
                      <div className="preview-component-label">
                        <span>data_table</span><code>{relevantTable.name}</code>
                      </div>
                      <DataTable component={{ columns: cols, actions: ['edit','delete'] }} toast={toast} />
                    </div>
                  )
                })()}
              </main>
            </div>
          )}
        </div>
      </div>

      {/* Summary bar */}
      <div className="preview-summary-bar">
        <div className="preview-summary-item"><span className="preview-summary-icon">📄</span><strong>{pages.length}</strong> Pages</div>
        <div className="preview-summary-item"><span className="preview-summary-icon">🔌</span><strong>{endpoints.length}</strong> Endpoints</div>
        <div className="preview-summary-item"><span className="preview-summary-icon">🗄️</span><strong>{tables.length}</strong> Tables</div>
        <div className="preview-summary-item"><span className="preview-summary-icon">🔐</span><strong>{roles.length}</strong> Roles</div>
        <div className="preview-summary-item" style={{ marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--accent-green)', fontWeight: 600 }}>✅ Executable Config</span>
        </div>
      </div>
    </div>
  )
}
