// overlay.js – Picture-in-Picture overlay
// One-click logging: action button → reads clipboard helper → submits automatically

const bridge = window._bridge
const ACTIONS = bridge.getActions()
const HELPER_URL = 'http://localhost:9091/'

let mode = 'log'
let helperConnected = false
let lastLoggedTicket = null
let selectedSource = 'Expert Q'

// ── Build HTML ─────────────────────────────────────────────────────────────
document.body.innerHTML = `
<div class="ov-app">
  <div class="ov-header">
    <span class="ov-logo">⚡</span>
    <span class="ov-title">UmarDesk</span>
    <div class="ov-header-right">
      <span id="helper-dot" class="helper-dot disconnected" title="Clipboard helper status"></span>
      <button id="mode-log"    class="ov-mode-btn active" title="Log ticket">📝</button>
      <button id="mode-search" class="ov-mode-btn"        title="Search log">🔍</button>
    </div>
  </div>

  <!-- LOG MODE -->
  <div id="log-panel">
    <div id="helper-banner" class="helper-banner disconnected">
      🔴 Clipboard helper not running — run <b>start.bat</b> to enable one-click logging
    </div>

    <!-- Source selector -->
    <div class="ov-source-row" id="source-pills">
      <button class="ov-source-pill" data-source="Phone">📞 Phone</button>
      <button class="ov-source-pill" data-source="Portal">🌐 Portal</button>
      <button class="ov-source-pill active" data-source="Expert Q">⭐ Expert Q</button>
    </div>

    <!-- Read-only preview of last captured clipboard values -->
    <div class="ov-preview" id="clip-preview">
      <div class="clip-row">
        <span class="clip-tag">C3</span>
        <span class="clip-val" id="prev-c3">—</span>
      </div>
      <div class="clip-row">
        <span class="clip-tag">C2</span>
        <span class="clip-val" id="prev-c2">—</span>
      </div>
      <div class="clip-row" id="prev-c1-row">
        <span class="clip-tag">C1</span>
        <span class="clip-val" id="prev-c1">—</span>
      </div>
    </div>

    <!-- Manual override fields (collapsed by default) -->
    <details class="ov-manual" id="manual-section">
      <summary>✏ Manual override</summary>
      <div class="ov-fields">
        <div class="ov-field-row">
          <input id="c3-input" class="ov-input" placeholder="Ticket # (C3)" spellcheck="false" autocomplete="off">
          <button class="ov-clip-btn" id="btn-c3" title="Read clipboard → C3">📋</button>
        </div>
        <div class="ov-field-row">
          <input id="c2-input" class="ov-input" placeholder="Subject (C2)" spellcheck="false" autocomplete="off">
          <button class="ov-clip-btn" id="btn-c2" title="Read clipboard → C2">📋</button>
        </div>
        <div class="ov-field-row">
          <input id="c1-input" class="ov-input" placeholder="Team — dispatch only (C1)" spellcheck="false" autocomplete="off">
          <button class="ov-clip-btn" id="btn-c1" title="Read clipboard → C1">📋</button>
        </div>
      </div>
    </details>

    <div id="ov-status-bar" class="ov-status-bar"></div>

    <div class="ov-actions" id="action-buttons"></div>

    <div id="ov-result" class="ov-result"></div>
    <div id="ov-watch-row" style="display:none;padding:0 10px 6px;text-align:right">
      <button id="btn-ov-watch" class="ov-watch-btn">👀 Watch this ticket</button>
    </div>
  </div>

  <!-- SEARCH MODE -->
  <div id="search-panel" style="display:none;flex-direction:column;flex:1;min-height:0;">
    <div class="ov-field-row" style="padding:8px 10px 4px">
      <input id="search-input" class="ov-input" placeholder="🔍  Ticket #, subject, or team...">
      <button id="btn-ov-watchlist" class="ov-watchlist-btn" title="Show watched tickets only">👀</button>
    </div>
    <div id="search-results" class="ov-search-results"></div>
  </div>
</div>
`

// ── Source pill selection ──────────────────────────────────────────────────
document.querySelectorAll('.ov-source-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedSource = btn.dataset.source
    document.querySelectorAll('.ov-source-pill').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
})

// ── Build action buttons ───────────────────────────────────────────────────
const actionContainer = document.getElementById('action-buttons')
Object.entries(ACTIONS).forEach(([key, action]) => {
  const btn = document.createElement('button')
  btn.className = 'ov-action-btn'
  btn.style.borderLeftColor = action.color
  btn.dataset.action = key
  btn.textContent = action.label
  btn.addEventListener('click', () => submitAction(key, action))
  actionContainer.appendChild(btn)
})

// ── Clipboard helper fetch ─────────────────────────────────────────────────
async function fetchClipboard() {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 600)
    const res = await fetch(HELPER_URL, { signal: ctrl.signal })
    clearTimeout(t)
    return await res.json()   // { c1, c2, c3, count }
  } catch {
    return null
  }
}

// ── Submit ────────────────────────────────────────────────────────────────
async function submitAction(key, action) {
  const clips = await fetchClipboard()

  let ticketNum, subject, teamName

  if (clips) {
    // Auto-mode: C3 = ticket#, C2 = subject, C1 = team
    if (action.needsTeam) {
      // Dispatch: 3 copies — C1=team, C2=subject, C3=ticket#
      ticketNum = clips.c3 || document.getElementById('c3-input').value.trim()
      subject   = clips.c2 || document.getElementById('c2-input').value.trim()
      teamName  = clips.c1 || document.getElementById('c1-input').value.trim()
    } else {
      // Others: 2 copies — C1=subject, C2=ticket#
      ticketNum = clips.c2 || document.getElementById('c3-input').value.trim()
      subject   = clips.c1 || document.getElementById('c2-input').value.trim()
      teamName  = document.getElementById('c1-input').value.trim()
    }

    // Update preview display
    document.getElementById('prev-c3').textContent = clips.c3 || '—'
    document.getElementById('prev-c2').textContent = clips.c2 || '—'
    document.getElementById('prev-c1').textContent = clips.c1 || '—'
    document.getElementById('c3-input').value = ticketNum
    document.getElementById('c2-input').value = subject
    document.getElementById('c1-input').value = teamName
  } else {
    // Fallback: use manual fields
    ticketNum = document.getElementById('c3-input').value.trim()
    subject   = document.getElementById('c2-input').value.trim()
    teamName  = document.getElementById('c1-input').value.trim()
  }

  if (!ticketNum) { toast('No ticket # found — start clipboard helper or enter manually', 'warn'); return }
  if (action.needsTeam && !teamName) { toast('No team name — enter manually in override fields', 'warn'); return }

  // Duplicate check feedback before submit
  const existing = bridge.getAllTickets().find(t => t.tickNumber.toLowerCase() === ticketNum.toLowerCase())
  if (existing) {
    const excluded = bridge.getExcludedSources()
    const isRef = excluded && excluded.has((existing.source||'Unknown').trim())
    if (!isRef) {
      const existSt = bridge.getStatus(existing.comment)
      const newSt = bridge.getStatus(action.needsTeam ? `dispatched to ${teamName}` : action.comment)
      const sameComment = existing.comment.toLowerCase() === (action.needsTeam ? `dispatched to ${teamName} - expert q` : action.comment).toLowerCase()
      if (existSt === newSt && sameComment) {
        toast(`Already logged as "${existSt}" on ${fmtDate(existing.date)}`, 'warn')
        return
      }
    }
  }

  const result = bridge.submit(ticketNum, subject, key, selectedSource, teamName)
  const el = document.getElementById('ov-result')

  if (!result.success && result.sameStatus) {
    toast(`Already logged as "${result.existing.comment}"`, 'warn')
    return
  }

  if (result.success) {
    lastLoggedTicket = ticketNum
    el.textContent = result.isUpdate
      ? `↻ Updated: ${ticketNum}`
      : `✓ ${ticketNum} — ${action.label.replace(/[^\w\s–]/gu, '').trim()}`
    el.className = 'ov-result ' + (result.isUpdate ? 'ov-updated' : 'ov-logged')
    const watchRow = document.getElementById('ov-watch-row')
    const watchBtn = document.getElementById('btn-ov-watch')
    watchRow.style.display = ''
    watchBtn.textContent = '👀 Watch this ticket'
    watchBtn.classList.remove('ov-watch-done')
    setTimeout(() => { el.textContent = ''; el.className = 'ov-result'; watchRow.style.display = 'none' }, 4500)

    // Clear preview after logging
    setTimeout(() => {
      document.getElementById('prev-c3').textContent = '—'
      document.getElementById('prev-c2').textContent = '—'
      document.getElementById('prev-c1').textContent = '—'
    }, 4500)
  }
}

// ── Manual clipboard capture (fallback 📋 buttons) ────────────────────────
async function manualCapture(target) {
  try {
    const text = (await navigator.clipboard.readText()).trim()
    document.getElementById(`${target}-input`).value = text
    document.getElementById(`prev-${target}`).textContent = text
    toast(`${target.toUpperCase()} captured`, 'info')
    if (target === 'c3') checkDuplicate(text)
  } catch {
    toast('Clipboard blocked — paste with Ctrl+V', 'warn')
  }
}

document.getElementById('btn-c3').addEventListener('click', () => manualCapture('c3'))
document.getElementById('btn-c2').addEventListener('click', () => manualCapture('c2'))
document.getElementById('btn-c1').addEventListener('click', () => manualCapture('c1'))

// Live duplicate check when ticket# typed manually
document.getElementById('c3-input').addEventListener('input', e => checkDuplicate(e.target.value.trim()))

function checkDuplicate(ticketNum) {
  const bar = document.getElementById('ov-status-bar')
  if (!ticketNum) { bar.innerHTML = ''; bar.className = 'ov-status-bar'; return }
  const existing = bridge.getAllTickets().find(t => t.tickNumber.toLowerCase() === ticketNum.toLowerCase())
  if (!existing) {
    bar.innerHTML = '<span class="ov-st-new">✓ New ticket</span>'
    bar.className = 'ov-status-bar ov-bar-new'
  } else {
    const st = bridge.getStatus(existing.comment)
    bar.innerHTML = `<span>⚠ Existing: <b>${st}</b> on ${fmtDate(existing.date)}</span>`
    bar.className = 'ov-status-bar ov-bar-existing'
  }
}

// ── Helper status polling ──────────────────────────────────────────────────
async function checkHelperStatus() {
  const clips = await fetchClipboard()
  const dot = document.getElementById('helper-dot')
  const banner = document.getElementById('helper-banner')
  helperConnected = clips !== null
  dot.className = 'helper-dot ' + (helperConnected ? 'connected' : 'disconnected')
  dot.title = helperConnected ? 'Clipboard helper connected' : 'Clipboard helper not running'
  banner.style.display = helperConnected ? 'none' : 'block'
}

async function refreshPreview() {
  const clips = await fetchClipboard()
  if (!clips) return
  document.getElementById('prev-c3').textContent = clips.c3 || '—'
  document.getElementById('prev-c2').textContent = clips.c2 || '—'
  document.getElementById('prev-c1').textContent = clips.c1 || '—'
}

checkHelperStatus()
setInterval(checkHelperStatus, 5000)
setInterval(refreshPreview, 1000)

// ── Mode toggle ────────────────────────────────────────────────────────────
document.getElementById('mode-log').addEventListener('click',    () => setMode('log'))
document.getElementById('mode-search').addEventListener('click', () => setMode('search'))

function setMode(m) {
  mode = m
  document.getElementById('log-panel').style.display    = m === 'log'    ? 'block' : 'none'
  document.getElementById('search-panel').style.display = m === 'search' ? 'flex' : 'none'
  document.getElementById('mode-log').classList.toggle('active', m === 'log')
  document.getElementById('mode-search').classList.toggle('active', m === 'search')
  if (m === 'search') { document.getElementById('search-input').focus(); runSearch() }
}

// ── Search ────────────────────────────────────────────────────────────────
let ovWatchlistActive = false

document.getElementById('btn-ov-watchlist').addEventListener('click', () => {
  ovWatchlistActive = !ovWatchlistActive
  document.getElementById('btn-ov-watchlist').classList.toggle('active', ovWatchlistActive)
  runSearch()
})

document.getElementById('search-input').addEventListener('input', () => runSearch())

function runSearch() {
  const q = document.getElementById('search-input').value.trim()
  let results
  if (!q && ovWatchlistActive) {
    results = bridge.getAllTickets()
      .filter(t => t.watch)
      .sort((a,b)=>((b.date||'')+' '+(b.time||'')).localeCompare((a.date||'')+' '+(a.time||'')))
  } else {
    results = bridge.search(q)
    if (ovWatchlistActive) results = results.filter(t => t.watch)
  }
  renderSearchResults(results)
}

function renderSearchResults(results) {
  const el = document.getElementById('search-results')
  if (!results.length) { el.innerHTML = '<div class="ov-no-results">No matches</div>'; return }
  const scMap = { Resolve:'resolve', Dispatched:'dispatched', FCR:'fcr', Awaiting:'awaiting', OSE:'ose', Defective:'defective', Other:'other' }
  el.innerHTML = results.map(t => {
    const st = bridge.getStatus(t.comment)
    return `<div class="ov-result-row">
      <div class="ov-result-tick"><a href="https://itsm.services.sap/incident.do?sysparm_query=number=${esc(t.tickNumber)}" target="_blank" class="ov-tick-link">${esc(t.tickNumber)}</a></div>
      <div class="ov-result-desc" title="${esc(t.description)}">${esc(trunc(t.description, 44))}</div>
      <div class="ov-result-meta">
        <span class="ov-badge ov-badge-${scMap[st]||'other'}">${st}</span>
        <span class="ov-date">${fmtDate(t.date)}</span>
        <span class="ov-src">${esc(t.source||'')}</span>
      </div>
    </div>`
  }).join('')
}

// ── Watch button ──────────────────────────────────────────────────────────
document.getElementById('btn-ov-watch').addEventListener('click', () => {
  if (!lastLoggedTicket) return
  const ok = bridge.watchTicket(lastLoggedTicket)
  const btn = document.getElementById('btn-ov-watch')
  if (ok) {
    btn.textContent = '✓ Watching'
    btn.classList.add('ov-watch-done')
    btn.disabled = true
    toast(`👀 Watching ${lastLoggedTicket}`, 'info')
  } else {
    toast('Could not find ticket to watch', 'warn')
  }
})

// ── Utils ─────────────────────────────────────────────────────────────────
function fmtDate(d) { if(!d) return ''; const m=d.match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1].slice(2)}`:d }
function trunc(s, n) { return s&&s.length>n?s.slice(0,n)+'…':(s||'') }
function esc(s) { if(!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function toast(msg, type='info') {
  let el = document.getElementById('ov-toast')
  if (!el) { el=document.createElement('div'); el.id='ov-toast'; document.body.appendChild(el) }
  el.textContent = msg
  el.className = `ov-toast ov-toast-${type} show`
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), 3500)
}
