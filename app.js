// ── Firebase ──────────────────────────────────────────────────────────────
firebase.initializeApp({
  apiKey: "AIzaSyC6TbStfWv2lE3qvQxf8WMsUJNlhVMpc_Q",
  authDomain: "brain-refresh-db364.firebaseapp.com",
  projectId: "brain-refresh-db364",
  storageBucket: "brain-refresh-db364.firebasestorage.app",
  messagingSenderId: "179174675906",
  appId: "1:179174675906:web:0d3bfb01216a1e78e8b25b"
})
const db = firebase.firestore()
const COL = 'umardesk_tickets'
const dbAdd    = t  => db.collection(COL).doc(t.id).set(t)
const dbSet    = t  => db.collection(COL).doc(t.id).set(t)
const dbDelete = id => db.collection(COL).doc(id).delete()

// ── Constants ─────────────────────────────────────────────────────────────
const ACTIONS = {
  awaiting_ss: { label: '⏳ Awaiting – Self Service', comment: 'awaiting info',       source: 'Self service', color: '#f0883e', needsTeam: false },
  awaiting_eq: { label: '⏳ Awaiting – Expert Q',     comment: 'awaiting info',       source: 'Expert Q',    color: '#f0883e', needsTeam: false },
  resolved_ss: { label: '✅ Resolved – Self Service', comment: 'resolved',            source: 'Self service', color: '#3fb950', needsTeam: false },
  resolved:    { label: '✅ Resolved – Expert Q',     comment: 'resolved',            source: 'Expert Q',    color: '#3fb950', needsTeam: false },
  fcr:         { label: '📞 FCR – Phone',             comment: 'FCR',                 source: 'Phone',       color: '#58a6ff', needsTeam: false },
  ose:         { label: '🏢 OSE-Further Support',     comment: 'OSE-Further Support', source: 'Expert Q',    color: '#9c88ff', needsTeam: false },
  defective:   { label: '⚠️ Defective Dispatch',      comment: 'defective dispatch',  source: 'Expert Q',    color: '#f85149', needsTeam: false },
  dispatch:    { label: '🚀 Dispatched – Expert Q',   comment: 'dispatched to',       source: 'Expert Q',    color: '#63b3ed', needsTeam: true  }
}

// ── State ─────────────────────────────────────────────────────────────────
let allTickets = []
let filteredTickets = []
let currentPage = 1
const PAGE_SIZE = 50
let sortField = 'date', sortAsc = false
let searchText = '', filterStatus = '', filterSource = '', filterDateFrom = '', filterDateTo = '', filterDuplicates = false
let editingId = null
let pipWindow = null
let calYear = new Date().getFullYear()
let calMonth = new Date().getMonth()

// ── Boot ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadTickets()
  setupTabs()
  setupModal()
  setupFilters()
  setupImportExport()
  document.getElementById('btn-overlay').addEventListener('click', openOverlay)
  document.getElementById('btn-add-ticket').addEventListener('click', openAdd)
  document.getElementById('cal-prev').addEventListener('click', () => calNav(-1))
  document.getElementById('cal-next').addEventListener('click', () => calNav(1))
  document.getElementById('btn-clear-data').addEventListener('click', async () => {
    if (!allTickets.length) { showToast('No data to clear','error'); return }
    if (!confirm(`Delete all ${allTickets.length.toLocaleString()} tickets? This cannot be undone.`)) return
    const toDelete = [...allTickets]
    const chunks = []
    for (let i=0; i<toDelete.length; i+=400) chunks.push(toDelete.slice(i,i+400))
    await Promise.all(chunks.map(chunk => {
      const b = db.batch()
      chunk.forEach(t => b.delete(db.collection(COL).doc(t.id)))
      return b.commit()
    }))
    showToast('All data cleared','success')
  })
})

// ── Storage ───────────────────────────────────────────────────────────────
function loadTickets() {
  db.collection(COL).onSnapshot(snapshot => {
    allTickets = snapshot.docs.map(d => d.data())
    refreshAll()
  }, err => showToast('Firebase: ' + err.message, 'error'))
  // Migrate from localStorage if Firebase empty
  const local = JSON.parse(localStorage.getItem('tickets') || '[]')
  if (local.length) {
    db.collection(COL).limit(1).get().then(snap => {
      if (snap.empty) {
        const chunks = []
        for (let i=0; i<local.length; i+=400) chunks.push(local.slice(i,i+400))
        Promise.all(chunks.map(chunk => {
          const b = db.batch()
          chunk.forEach(t => { if(t.id) b.set(db.collection(COL).doc(t.id), t) })
          return b.commit()
        })).then(() => { localStorage.removeItem('tickets'); showToast(`Migrated ${local.length} tickets to Firebase`, 'success') })
      } else {
        localStorage.removeItem('tickets')
      }
    })
  }
}

function saveTickets() {} // no-op — Firestore handles persistence

function refreshAll() { applyFilters(); renderDashboard(); renderTable(); populateSourceFilter() }

// ── Status helpers ────────────────────────────────────────────────────────
function getStatus(comment) {
  if (!comment) return 'Other'
  const c = comment.toLowerCase()
  if (c.includes('fcr')) return 'FCR'
  if (c.includes('resolve')) return 'Resolve'
  if (c.includes('ose') || c.includes('further support')) return 'OSE'
  if (c.includes('defective')) return 'Defective'
  if (c.includes('dispatch') || c.includes('onsite')) return 'Dispatched'
  if (c.includes('await')) return 'Awaiting'
  return 'Other'
}

function getStatusClass(s) {
  return { Resolve:'resolve', Dispatched:'dispatched', FCR:'fcr', Awaiting:'awaiting', OSE:'ose', Defective:'defective', Other:'other' }[s] || 'other'
}

function normalizeSource(s) {
  if (!s) return ''
  const l = s.toLowerCase().replace(/-/g,' ').replace(/\s+/g,' ').trim()
  if (l.startsWith('self') || l === 'ss') return 'Self service'
  if (l.startsWith('expert') || l === 'eq') return 'Expert Q'
  if (l === 'phone' || l === 'ph') return 'Phone'
  return s.trim()
}

function nowTime() {
  const n=new Date()
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`
}

// ── Dashboard ─────────────────────────────────────────────────────────────
function renderDashboard() {
  const total = allTickets.length
  if (total === 0) {
    document.getElementById('empty-dashboard').style.display = 'flex'
    document.getElementById('dashboard-data').style.display = 'none'
    return
  }
  document.getElementById('empty-dashboard').style.display = 'none'
  document.getElementById('dashboard-data').style.display = 'block'

  const counts = { Dispatched:0, Resolve:0, FCR:0, Awaiting:0, OSE:0, Defective:0, Other:0 }
  const sources = {}
  allTickets.forEach(t => {
    const s = getStatus(t.comment)
    counts[s] = (counts[s]||0) + 1
    const src = (t.source||'Unknown').trim()
    sources[src] = (sources[src]||0) + 1
  })
  const dates = new Set(allTickets.map(t => t.date).filter(Boolean))
  const avg = dates.size ? (total/dates.size).toFixed(1) : '0'

  document.getElementById('stat-total').textContent      = total.toLocaleString()
  document.getElementById('stat-dispatched').textContent = counts.Dispatched.toLocaleString()
  document.getElementById('stat-resolve').textContent    = counts.Resolve.toLocaleString()
  document.getElementById('stat-fcr').textContent        = counts.FCR.toLocaleString()
  document.getElementById('stat-awaiting').textContent   = counts.Awaiting.toLocaleString()
  document.getElementById('stat-other').textContent      = counts.Other.toLocaleString()
  document.getElementById('stat-avg').textContent        = avg
  document.getElementById('stat-days').textContent       = dates.size.toLocaleString()
  document.getElementById('stat-sources').textContent    = Object.keys(sources).length
  document.getElementById('tickets-tab-count').textContent = total.toLocaleString()

  const sortedSrc = Object.entries(sources).sort((a,b)=>b[1]-a[1])
  const maxSrc = sortedSrc[0]?.[1] || 1
  document.getElementById('source-list').innerHTML = sortedSrc.map(([src,cnt]) =>
    `<div class="bar-row">
      <span class="bar-label">${escHtml(src)}</span>
      <div class="bar-track"><div class="bar-fill bar-blue" style="width:${(cnt/maxSrc*100).toFixed(1)}%"></div></div>
      <span class="bar-count">${cnt.toLocaleString()} <span class="bar-pct">(${(cnt/total*100).toFixed(1)}%)</span></span>
    </div>`).join('')

  const statusOrder = ['Dispatched','Resolve','FCR','Awaiting','OSE','Defective','Other']
  const maxStat = Math.max(...statusOrder.map(s=>counts[s])) || 1
  document.getElementById('status-chart').innerHTML = statusOrder.map(s =>
    `<div class="bar-row">
      <span class="bar-label"><span class="badge badge-${getStatusClass(s)}">${s}</span></span>
      <div class="bar-track"><div class="bar-fill bar-${getStatusClass(s)}" style="width:${(counts[s]/maxStat*100).toFixed(1)}%"></div></div>
      <span class="bar-count">${counts[s].toLocaleString()} <span class="bar-pct">(${(counts[s]/total*100).toFixed(1)}%)</span></span>
    </div>`).join('')

  renderCalendar()
}

// ── Calendar ──────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function renderCalendar() {
  const dateCounts = {}
  allTickets.forEach(t => { if(t.date) dateCounts[t.date] = (dateCounts[t.date]||0)+1 })

  const year=calYear, month=calMonth
  document.getElementById('cal-title').textContent = `${MONTH_NAMES[month]} ${year}`

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const todayStr = todayISO()

  const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  let html = dayLabels.map(d=>`<div class="cal-day-label">${d}</div>`).join('')
  for(let i=0;i<firstDay;i++) html += '<div class="cal-cell cal-empty"></div>'
  for(let d=1;d<=daysInMonth;d++) {
    const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const cnt=dateCounts[iso]||0
    const isToday=iso===todayStr
    html += `<div class="cal-cell${isToday?' cal-today':''}${cnt>0?' cal-has-data':''}"
      ${cnt>0?`onclick="jumpToDate('${iso}')" style="cursor:pointer"`:''}
      title="${cnt>0?cnt+' ticket(s) — click to view':''}">
      <span class="cal-num">${d}</span>
      ${cnt>0?`<span class="cal-cnt">${cnt}</span>`:''}
    </div>`
  }
  document.getElementById('cal-grid').innerHTML = html
}

function calNav(dir) {
  calMonth += dir
  if(calMonth > 11) { calMonth=0; calYear++ }
  if(calMonth <  0) { calMonth=11; calYear-- }
  renderCalendar()
}

function jumpToDate(iso) {
  // Switch to Tickets tab
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'))
  document.querySelectorAll('.tab-section').forEach(s=>s.classList.remove('active'))
  document.querySelector('.tab-btn[data-tab="tickets-section"]').classList.add('active')
  document.getElementById('tickets-section').classList.add('active')
  // Set date filter to that exact day
  filterDateFrom = iso; filterDateTo = iso
  document.getElementById('filter-date-from').value = iso
  document.getElementById('filter-date-to').value   = iso
  applyFilters(); renderTable()
}

// ── Filters ───────────────────────────────────────────────────────────────
function applyFilters() {
  const dupSet = filterDuplicates
    ? new Set(allTickets.map(t=>t.tickNumber).filter((v,i,a)=>a.indexOf(v)!==i))
    : null
  filteredTickets = allTickets.filter(t => {
    if (searchText) {
      const q = searchText.toLowerCase()
      if (![t.tickNumber,t.description,t.comment,t.source,t.misc].some(f=>(f||'').toLowerCase().includes(q))) return false
    }
    if (filterStatus && getStatus(t.comment) !== filterStatus) return false
    if (filterSource && !(t.source||'').toLowerCase().includes(filterSource.toLowerCase())) return false
    if (filterDateFrom && t.date && t.date < filterDateFrom) return false
    if (filterDateTo   && t.date && t.date > filterDateTo)   return false
    if (dupSet && !dupSet.has(t.tickNumber)) return false
    return true
  })
  filteredTickets.sort((a,b) => {
    let va, vb
    if (sortField === 'date') {
      va = (a.date||'') + ' ' + (a.time||'')
      vb = (b.date||'') + ' ' + (b.time||'')
    } else {
      va = (a[sortField]||'').toString()
      vb = (b[sortField]||'').toString()
    }
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
  })
  currentPage = 1
  document.getElementById('filter-count').textContent =
    `${filteredTickets.length.toLocaleString()} ticket${filteredTickets.length !== 1 ? 's' : ''}`
}

function populateSourceFilter() {
  const sources = [...new Set(allTickets.map(t=>t.source).filter(Boolean).map(s=>s.trim()))].sort()
  const sel = document.getElementById('filter-source'), cur = sel.value
  sel.innerHTML = '<option value="">All Sources</option>' +
    sources.map(s=>`<option value="${escHtml(s)}"${s===cur?' selected':''}>${escHtml(s)}</option>`).join('')
}

// ── Table ─────────────────────────────────────────────────────────────────
function renderTable() {
  const start = (currentPage-1)*PAGE_SIZE
  const items = filteredTickets.slice(start, start+PAGE_SIZE)
  let lastDate = null, dayIndex = -1
  document.getElementById('ticket-tbody').innerHTML = items.map(t => {
    const st = getStatus(t.comment), sc = getStatusClass(st)
    const updateTag = t.misc && t.misc.startsWith('Updated')
      ? `<div class="update-tag">↻ ${escHtml(t.misc)}</div>` : ''
    if (t.date !== lastDate) { lastDate = t.date; dayIndex++ }
    const rowClass = dayIndex % 2 === 0 ? '' : ' class="tr-alt-day"'
    return `<tr${rowClass}>
      <td class="td-date">${formatDate(t.date)}${t.time?`<div class="td-time">${escHtml(t.time)}</div>`:''}</td>
      <td class="td-tick"><a href="https://itsm.services.sap/incident.do?sysparm_query=number=${escHtml(t.tickNumber)}" target="_blank" class="tick-link">${escHtml(t.tickNumber)}</a></td>
      <td class="td-desc" title="${escHtml(t.description)}">${escHtml(truncate(t.description,60))}${t.misc&&!t.misc.startsWith('Updated')?`<div class="comment-sub">📝 ${escHtml(truncate(t.misc,50))}</div>`:''}</td>
      <td class="td-status">
        <span class="badge badge-${sc}">${st}</span>
        <div class="comment-sub" title="${escHtml(t.comment)}">${escHtml(truncate(t.comment,55))}</div>
        ${updateTag}
      </td>
      <td class="td-src">${escHtml(t.source)}</td>
      <td class="td-actions">
        <button class="btn-icon btn-edit"   onclick="openEdit('${t.id}')"       title="Edit">✏</button>
        <button class="btn-icon btn-delete" onclick="confirmDelete('${t.id}')"  title="Delete">🗑</button>
      </td>
    </tr>`
  }).join('')
  const end = Math.min(start+PAGE_SIZE, filteredTickets.length)
  document.getElementById('showing-text').textContent =
    filteredTickets.length ? `Showing ${start+1}–${end} of ${filteredTickets.length.toLocaleString()}` : ''
  renderPagination()
}

function renderPagination() {
  const total = Math.ceil(filteredTickets.length/PAGE_SIZE)
  const pg = document.getElementById('pagination')
  if (total <= 1) { pg.innerHTML=''; return }
  const pages = (() => { const s=new Set([1,total]); for(let i=Math.max(1,currentPage-2);i<=Math.min(total,currentPage+2);i++) s.add(i); return [...s].sort((a,b)=>a-b) })()
  let html = `<button onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`
  let prev = null
  for (const p of pages) {
    if (prev!==null && p-prev>1) html += '<span class="pg-ellipsis">…</span>'
    html += `<button class="${p===currentPage?'pg-active':''}" onclick="goPage(${p})">${p}</button>`
    prev = p
  }
  pg.innerHTML = html + `<button onclick="goPage(${currentPage+1})" ${currentPage===total?'disabled':''}>›</button>`
}

function goPage(p) {
  const total = Math.ceil(filteredTickets.length/PAGE_SIZE)
  if (p<1||p>total) return
  currentPage=p; renderTable()
  document.querySelector('.table-wrap').scrollTop = 0
}

function sortBy(field) {
  if (sortField===field) sortAsc=!sortAsc; else { sortField=field; sortAsc=true }
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.classList.remove('sort-asc','sort-desc')
    if (th.dataset.sort===field) th.classList.add(sortAsc?'sort-asc':'sort-desc')
  })
  applyFilters(); renderTable()
}

// ── CRUD ──────────────────────────────────────────────────────────────────
function openAdd() {
  editingId=null
  document.getElementById('modal-title').textContent='Add Ticket'
  clearForm()
  document.getElementById('field-date').value=todayISO()
  document.getElementById('field-time').value=nowTime()
  document.getElementById('modal-overlay').classList.add('show')
  document.getElementById('field-ticknumber').focus()
}

function openEdit(id) {
  const t=allTickets.find(x=>x.id===id); if(!t) return
  editingId=id
  document.getElementById('modal-title').textContent='Edit Ticket'
  ;['date','time','ticknumber','description','comment','source','totalperday','misc'].forEach(f => {
    const map={ticknumber:'tickNumber',description:'description',comment:'comment',source:'source',totalperday:'totalPerDay',misc:'misc',date:'date',time:'time'}
    document.getElementById('field-'+f).value=t[map[f]]||''
  })
  document.getElementById('modal-overlay').classList.add('show')
}

function closeModal() { document.getElementById('modal-overlay').classList.remove('show'); editingId=null }

function clearForm() {
  ['date','time','ticknumber','description','comment','source','totalperday','misc'].forEach(f=>{ document.getElementById('field-'+f).value='' })
}

function saveTicketForm() {
  const date=document.getElementById('field-date').value.trim()
  const tickNumber=document.getElementById('field-ticknumber').value.trim()
  if(!date||!tickNumber) { showToast('Date and Ticket Number are required','error'); return }
  const data = {
    date, tickNumber,
    time:        document.getElementById('field-time').value.trim(),
    description: document.getElementById('field-description').value.trim(),
    comment:     document.getElementById('field-comment').value.trim(),
    source:      normalizeSource(document.getElementById('field-source').value.trim()),
    totalPerDay: document.getElementById('field-totalperday').value.trim(),
    misc:        document.getElementById('field-misc').value.trim()
  }
  if (editingId) {
    const existing = allTickets.find(x=>x.id===editingId)
    dbSet({...existing,...data})
  } else {
    dbAdd({ id:`t_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, ...data })
  }
  closeModal()
  showToast(editingId?'Ticket updated':'Ticket added','success')
}

function confirmDelete(id) {
  const t=allTickets.find(x=>x.id===id)
  if(!t||!confirm(`Delete ${t.tickNumber}?`)) return
  dbDelete(id); showToast('Ticket deleted','success')
}

// ── Overlay submit (called by overlay.js via bridge) ──────────────────────
function handleOverlaySubmit(ticketNum, subject, actionKey, teamName) {
  const action=ACTIONS[actionKey]
  if(!action) return { success:false, error:'Unknown action' }
  const comment = action.needsTeam ? `dispatched to ${teamName||'?'} - Expert Q` : action.comment
  const source = normalizeSource(action.source)

  const existing = allTickets.find(t => t.tickNumber.toLowerCase()===ticketNum.toLowerCase())
  if (existing) {
    const existSt=getStatus(existing.comment), newSt=getStatus(comment)
    if (existSt===newSt) return { success:false, isDuplicate:true, sameStatus:true, existing }
    const updated={ ...existing, comment, source, misc:`Updated ${todayISO()}: ${existSt} → ${newSt}` }
    dbSet(updated)
    return { success:true, isUpdate:true, ticket:updated }
  }

  const ticket = {
    id:`t_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    date:todayISO(), time:nowTime(), tickNumber:ticketNum, description:subject,
    comment, source, totalPerDay:'', misc:''
  }
  dbAdd(ticket)
  return { success:true, isUpdate:false, ticket }
}

// ── Excel import/export ───────────────────────────────────────────────────
function setupImportExport() {
  const fi=document.getElementById('file-input')
  document.getElementById('btn-import').addEventListener('click',()=>fi.click())
  fi.addEventListener('change', e => {
    const file=e.target.files[0]; if(!file) return
    const reader=new FileReader()
    reader.onload = async evt => {
      try {
        const wb=XLSX.read(evt.target.result,{type:'array'})
        const ws=wb.Sheets[wb.SheetNames[0]]
        const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true})

        // Find header row: require string cells that include both 'tick' and 'date'
        // (excludes data rows that have Date objects or numbers, and rows with only one keyword match)
        let hdr = -1
        for (let i = 0; i < Math.min(20, raw.length); i++) {
          const strCells = (raw[i]||[]).filter(c => typeof c === 'string').map(c => c.toLowerCase())
          if (strCells.some(c => c.includes('tick')) && strCells.some(c => c.includes('date') || c === 'date')) {
            hdr = i; break
          }
        }
        if (hdr < 0) hdr = 0

        // Auto-detect column indices from header row
        const hrow=raw[hdr].map(c=>(c||'').toString().toLowerCase())
        const col=(...kw)=>{ const i=hrow.findIndex(c=>kw.some(k=>c.includes(k))); return i>=0?i:-1 }
        const cDate=col('date'), cTick=col('tick'), cDesc=col('desc','subject')
        const cCmt=col('comment','additional'), cSrc=col('source')
        const cTotal=col('total','per day'), cMisc=col('misc')

        const tickets=[]
        let n=1
        for(let i=hdr+1;i<raw.length;i++) {
          const row=raw[i]
          const tickVal=cTick>=0?row[cTick]?.toString().trim():row[2]?.toString().trim()
          if(!tickVal) continue
          const rd=cDate>=0?row[cDate]:row[1]
          let ds=''
          if(typeof rd === 'number' && rd > 1) {
            const dc=XLSX.SSF.parse_date_code(rd)
            if(dc) ds=`${dc.y}-${String(dc.m).padStart(2,'0')}-${String(dc.d).padStart(2,'0')}`
          } else if(rd instanceof Date){
            const y=rd.getFullYear(),m=String(rd.getMonth()+1).padStart(2,'0'),d=String(rd.getDate()).padStart(2,'0')
            ds=`${y}-${m}-${d}`
          } else if(rd){
            const s=rd.toString().trim()
            const m1=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
            if(m1) ds=`${m1[3]}-${m1[1].padStart(2,'0')}-${m1[2].padStart(2,'0')}`
            else { const m2=s.match(/^(\d{4})-(\d{2})-(\d{2})/); ds=m2?`${m2[1]}-${m2[2]}-${m2[3]}`:s }
          }
          tickets.push({ id:`imp_${Date.now()}_${n++}`, date:ds, time:'', tickNumber:tickVal,
            description: cDesc>=0?(row[cDesc]||'').toString().trim():(row[3]||'').toString().trim(),
            comment:     cCmt>=0 ?(row[cCmt]||'').toString().trim() :(row[4]||'').toString().trim(),
            source:      normalizeSource(cSrc>=0 ?(row[cSrc]||'').toString().trim() :(row[5]||'').toString().trim()),
            totalPerDay: cTotal>=0?(row[cTotal]||'').toString().trim():(row[6]||'').toString().trim(),
            misc:        cMisc>=0?(row[cMisc]||'').toString().trim():(row[7]||'').toString().trim() })
        }
        const existingNums = new Set(allTickets.map(t=>t.tickNumber.toLowerCase()))
        const newOnly = tickets.filter(t=>!existingNums.has(t.tickNumber.toLowerCase()))
        const doReplace = allTickets.length > 0 && confirm(
          `Found ${tickets.length.toLocaleString()} tickets in file.\n\n` +
          `MERGE: adds ${newOnly.length} new (skips ${tickets.length-newOnly.length} duplicates)\n` +
          `REPLACE: deletes all ${allTickets.length} existing tickets\n\n` +
          `Click OK to REPLACE all, Cancel to MERGE.`
        )
        const toWrite = doReplace ? tickets : [...allTickets, ...newOnly]
        const writeChunks = []
        for (let i=0; i<toWrite.length; i+=400) writeChunks.push(toWrite.slice(i,i+400))
        if (doReplace) {
          // delete all existing first, then write
          const delChunks = []
          for (let i=0; i<allTickets.length; i+=400) delChunks.push(allTickets.slice(i,i+400))
          await Promise.all(delChunks.map(chunk => {
            const b = db.batch()
            chunk.forEach(t => b.delete(db.collection(COL).doc(t.id)))
            return b.commit()
          }))
        }
        await Promise.all(writeChunks.map(chunk => {
          const b = db.batch()
          chunk.forEach(t => { if(t.id) b.set(db.collection(COL).doc(t.id), t) })
          return b.commit()
        }))
        showToast(doReplace ? `Replaced with ${tickets.length.toLocaleString()} tickets` : `Merged ${newOnly.length} new tickets`,'success')
      } catch(err) { showToast('Import failed: '+err.message,'error') }
      e.target.value=''
    }
    reader.readAsArrayBuffer(file)
  })
  document.getElementById('btn-export').addEventListener('click', () => {
    const toExport = filteredTickets.length ? filteredTickets : allTickets
    if(!toExport.length) { showToast('No tickets to export','error'); return }
    const rows=[['','Date','Tick Number','Description','Additional Comment','Source','Total per day','Misc']]
    toExport.forEach(t=>rows.push(['',t.date,t.tickNumber,t.description,t.comment,t.source,t.totalPerDay,t.misc]))
    const fmt = d => { if(!d) return ''; const m=d.match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}${m[2]}${m[1].slice(2)}`:'' }
    const dates = toExport.map(t=>t.date).filter(Boolean).sort()
    const from = fmt(dates[0]), to = fmt(dates[dates.length-1])
    const filename = from && to ? `UmardeskTicketsExport_${from}_${to}.xlsx` : 'UmardeskTicketsExport.xlsx'
    const wb=XLSX.utils.book_new(), ws=XLSX.utils.aoa_to_sheet(rows)
    ws['!cols']=[{wch:3},{wch:12},{wch:16},{wch:50},{wch:30},{wch:20},{wch:14},{wch:20}]
    XLSX.utils.book_append_sheet(wb,ws,'Tickets')
    XLSX.writeFile(wb,filename)
    showToast('Exported successfully','success')
  })
}

// ── Picture-in-Picture Overlay ────────────────────────────────────────────
async function openOverlay() {
  if(!('documentPictureInPicture' in window)) {
    showToast('Overlay needs Chrome or Edge 116+','error'); return
  }
  if(pipWindow && !pipWindow.closed) { pipWindow.focus(); return }
  try {
    pipWindow = await window.documentPictureInPicture.requestWindow({ width:320, height:530 })
    pipWindow._bridge = {
      getAllTickets: ()=>allTickets,
      getActions:   ()=>ACTIONS,
      getStatus,
      submit: handleOverlaySubmit,
      search: q => {
        if(!q) return []
        const ql=q.toLowerCase()
        return allTickets
          .filter(t=>[t.tickNumber,t.description,t.comment,t.source,t.misc].some(f=>(f||'').toLowerCase().includes(ql)))
          .slice(-30).reverse()
      }
    }
    pipWindow.document.title = 'UmarDesk'
    const cb = Date.now()
    const css=pipWindow.document.createElement('link')
    css.rel='stylesheet'; css.href=`/overlay.css?v=${cb}`
    pipWindow.document.head.appendChild(css)
    const sc=pipWindow.document.createElement('script')
    sc.src=`/overlay.js?v=${cb}`
    pipWindow.document.head.appendChild(sc)
    document.getElementById('btn-overlay').textContent='⬆ Overlay ●'
    pipWindow.addEventListener('pagehide', ()=>{ pipWindow=null; document.getElementById('btn-overlay').textContent='⬆ Overlay' })
  } catch(e) { showToast('Could not open overlay: '+e.message,'error') }
}

// ── Setup ─────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'))
    document.querySelectorAll('.tab-section').forEach(s=>s.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById(btn.dataset.tab).classList.add('active')
  }))
}

function setupModal() {
  document.getElementById('modal-overlay').addEventListener('click',e=>{ if(e.target===document.getElementById('modal-overlay')) closeModal() })
  document.getElementById('btn-save-ticket').addEventListener('click',saveTicketForm)
  document.getElementById('btn-cancel-ticket').addEventListener('click',closeModal)
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal() })
}

function setupFilters() {
  document.getElementById('search-input').addEventListener('input',e=>{ searchText=e.target.value; applyFilters(); renderTable() })
  document.getElementById('filter-status').addEventListener('change',e=>{ filterStatus=e.target.value; applyFilters(); renderTable() })
  document.getElementById('filter-source').addEventListener('change',e=>{ filterSource=e.target.value; applyFilters(); renderTable() })
  document.getElementById('filter-date-from').addEventListener('change',e=>{ filterDateFrom=e.target.value; applyFilters(); renderTable() })
  document.getElementById('filter-date-to').addEventListener('change',e=>{ filterDateTo=e.target.value; applyFilters(); renderTable() })
  document.getElementById('btn-clear-filters').addEventListener('click',()=>{
    searchText=filterStatus=filterSource=filterDateFrom=filterDateTo=''
    filterDuplicates=false
    document.getElementById('btn-duplicates').classList.remove('active')
    ;['search-input','filter-status','filter-source','filter-date-from','filter-date-to'].forEach(id=>{ document.getElementById(id).value='' })
    applyFilters(); renderTable()
  })
  document.getElementById('btn-duplicates').addEventListener('click',()=>{
    filterDuplicates=!filterDuplicates
    document.getElementById('btn-duplicates').classList.toggle('active', filterDuplicates)
    applyFilters(); renderTable()
  })
}

// ── Utils ─────────────────────────────────────────────────────────────────
function todayISO() { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}` }
function formatDate(d) { if(!d) return ''; const m=d.match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1].slice(2)}`:d }
function truncate(s,n) { return s&&s.length>n?s.slice(0,n)+'…':(s||'') }
function escHtml(s) { if(!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function showToast(msg,type='info') {
  const el=document.createElement('div'); el.className=`toast toast-${type}`; el.textContent=msg
  document.getElementById('toast-container').appendChild(el)
  setTimeout(()=>el.classList.add('show'),10)
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),300) },3500)
}
