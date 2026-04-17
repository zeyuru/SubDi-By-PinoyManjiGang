// ══════════════════════════════════════════════════════════════════════════════
// VILLA PURITA — FRONTEND  (Database-connected via REST API)
// All CRUD → /api/* endpoints.  Falls back gracefully if API unavailable.
// ══════════════════════════════════════════════════════════════════════════════

const API = 'api'; // No leading slash!        // Change to your server path if needed
const CENTER = [10.258089561887017, 123.8020430653793];
// Exact Villa Purita marker location. Change these coordinates to move the Villa Purita label.
const VILLA_PURITA_COORDS = [10.257339, 123.801205];

// ─── Session ─────────────────────────────────────────────────────────────────
let SESSION = { role:'', username:'', name:'', email:'', status:'', userId:0, loggedIn:false };

// ─── Map instances ────────────────────────────────────────────────────────────
let dashMap=null, fullMap=null, guardMap=null;
let fullMapMarkers=[], guardMapMarkers=[];
let currentDirectionLine=null; // stores the direction polyline

// ─── Local state (filled from API) ────────────────────────────────────────────
let STATE = {
  residents:[], visitors:[], payments:[], incidents:[],
  announcements:[], users:[], shifts:[], dashStats:{}, shift:{}
};

// ══════════════════════════════════════════════════════════════════════════════
// API HELPER
// ══════════════════════════════════════════════════════════════════════════════
async function api(path, method='GET', body=null) {
  const opts = { method, credentials:'include', headers:{'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(API + path, opts);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'API error');
    return json.data;
  } catch(e) {
    console.error('API error:', path, e.message);
    throw e;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════════════
function toast(msg, type='success') {
  const C = {success:'#10b981', error:'#ef4444', info:'#3b82f6', warning:'#f59e0b'};
  const I = {success:'✅', error:'❌', info:'🔔', warning:'⚠️'};
  const el = document.createElement('div');
  el.style.cssText = `background:var(--card);border:1px solid var(--border);border-left:4px solid ${C[type]};
    border-radius:10px;padding:12px 16px;font-size:12px;display:flex;align-items:center;gap:10px;
    box-shadow:0 8px 24px rgba(0,0,0,.4);animation:toastIn .25s ease;min-width:280px;max-width:360px;`;
  el.innerHTML = `<span style="font-size:16px">${I[type]}</span><span style="flex:1;line-height:1.4">${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.style.animation='toastOut .3s ease forwards'; setTimeout(()=>el.remove(),300); }, 3500);
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════
let selectedRole = 'Administrator';

function selectRole(role, el) {
  selectedRole = role;
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
}

async function doLogin() {
  const username = document.getElementById('login-user')?.value.trim();
  const password = document.getElementById('login-pass')?.value;
  if (!username || !password) { showLoginError('Enter username and password.'); return; }
  const btn = document.querySelector('.login-card .btn-primary');
  btn.textContent = 'Signing in…'; btn.disabled = true;
  try {
    const user = await api('/auth/login', 'POST', { username, password });
    if (user.role !== selectedRole) {
      showLoginError(`This account is a ${user.role}, not ${selectedRole}.`);
      btn.textContent = 'Sign In →'; btn.disabled = false; return;
    }
    SESSION = { role:user.role, username:user.username, name:user.full_name, userId:user.user_id, loggedIn:true };
    await completeLogin(user);
  } catch(e) {
    showLoginError(e.message || 'Login failed.');
    btn.textContent = 'Sign In →'; btn.disabled = false;
  }
}

function showLoginError(msg) {
  let el = document.getElementById('login-error-msg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'login-error-msg';
    el.style.cssText='color:var(--red);font-size:12px;margin-bottom:12px;padding:9px;background:rgba(239,68,68,.1);border-radius:7px;text-align:center;border:1px solid rgba(239,68,68,.2)';
    document.querySelector('.login-card .btn-primary').before(el);
  }
  el.textContent = msg; el.style.display = 'block';
}

async function completeLogin(user) {
  closeModal('forgot-password-modal');
  resetForgotForm();
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('sidebar-role').textContent = user.role;
  document.getElementById('sidebar-name').textContent = user.full_name || user.first_name + ' ' + user.last_name;
  document.querySelector('.avatar').textContent = (user.first_name||user.full_name||'U')[0].toUpperCase();
  applyRoleAccess(user.role);
  // Load initial data
  await loadAllData();
  await loadUserProfile();
  populatePaymentResidents();
  // Show role dashboard
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const dashId = user.role==='Administrator' ? 'panel-dashboard-admin'
               : user.role==='Guard'         ? 'panel-dashboard-guard'
                                              : 'panel-dashboard-homeowner';
  document.getElementById(dashId)?.classList.add('active');
  document.querySelector('[onclick*="dashboard"]')?.classList.add('active');
  refreshDashboardStats();
  renderAllDashboards();
  if (user.role === 'Homeowner') prepareHomeownerPayModal();
  setTimeout(initMaps, 400);
  setInterval(pollLiveData, 30000); // refresh every 30s
  updateBadges();
}

async function doLogout() {
  if (!confirm('Sign out of Villa Purita Management System?')) return;
  try { await api('/auth/logout', 'POST'); } catch(e) {}
  SESSION.loggedIn = false;
  destroyMaps();
  STATE = { residents:[], visitors:[], payments:[], incidents:[], announcements:[], users:[], dashStats:{} };
  document.getElementById('login-screen').style.display = 'flex';
  const btn = document.querySelector('.login-card .btn-primary');
  if (btn) { btn.textContent = 'Sign In →'; btn.disabled = false; }
  if (document.getElementById('login-user')) document.getElementById('login-user').value = '';
  if (document.getElementById('login-pass')) document.getElementById('login-pass').value = '';
}

function applyRoleAccess(role) {
  document.querySelectorAll('.nav-item').forEach(el => el.style.display = '');
  document.getElementById('new-record-btn').style.display = '';
  const annBtn = document.getElementById('announcement-add-btn');
  if (annBtn) annBtn.style.display = '';
  if (role === 'Homeowner') {
    document.querySelectorAll('.nav-admin,.nav-guard').forEach(el => el.style.display='none');
    document.querySelectorAll('.nav-admin-section,.nav-guard-section').forEach(el => el.style.display='none');
    document.getElementById('new-record-btn').style.display = 'none';
    if (annBtn) annBtn.style.display = 'none';
    // Show homeowner-only action items that were hidden by nav-guard sweep
    document.querySelectorAll('.ho-action').forEach(el => el.style.display='flex');
  } else if (role === 'Guard') {
    document.querySelectorAll('.nav-admin:not(.nav-guard)').forEach(el => el.style.display='none');
    document.querySelectorAll('.nav-admin-section').forEach(el => el.style.display='none');
    // Hide homeowner-only actions from guard
    document.querySelectorAll('.ho-action').forEach(el => el.style.display='none');
    document.getElementById('new-record-btn').style.display = 'none';
    // Guards cannot post announcements — hide the button
    if (annBtn) annBtn.style.display = 'none';
  } else {
    // Admin — hide homeowner-only actions
    document.querySelectorAll('.ho-action').forEach(el => el.style.display='none');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════════════════════════════════════════
async function loadAllData() {
  const role = SESSION.role;
  const tasks = [
    api('/residents').then(d => STATE.residents = d || []).catch(()=>{}),
    api('/visitors').then(d => STATE.visitors   = d || []).catch(()=>{}),
    api('/dues').then(d     => STATE.payments   = d || []).catch(()=>{}),
    api('/incidents').then(d => STATE.incidents = d || []).catch(()=>{}),
    api('/announcements').then(d => STATE.announcements = d || []).catch(()=>{}),
  ];
  if (role === 'Administrator') {
    tasks.push(api('/users').then(d => STATE.users = d || []).catch(()=>{}));
    tasks.push(api('/shifts').then(d => STATE.shifts = d || []).catch(()=>{}));
  }
  await Promise.allSettled(tasks);
}

async function pollLiveData() {
  if (!SESSION.loggedIn) return;
  try {
    const promises = [
      api('/visitors'),
      api('/incidents'),
      api('/announcements'),
    ];
    if (SESSION.role === 'Guard') {
      promises.push(api('/shifts/status'));
    }
    if (SESSION.role === 'Administrator') {
      promises.push(api('/shifts'));
    }
    const results = await Promise.all(promises);
    STATE.visitors     = results[0] || STATE.visitors;
    STATE.incidents    = results[1] || STATE.incidents;
    STATE.announcements = results[2] || STATE.announcements;
    if (SESSION.role === 'Guard' && results[3]) STATE.shift = results[3];
    if (SESSION.role === 'Administrator' && results[3]) STATE.shifts = results[3];
    updateBadges();
    refreshDashboardStats();
    renderAllDashboards();
  } catch(e) {}
}

// ══════════════════════════════════════════════════════════════════════════════
// PANELS
// ══════════════════════════════════════════════════════════════════════════════
function showPanel(id, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  let panelId = 'panel-' + id;
  if (id === 'dashboard') {
    panelId = SESSION.role==='Administrator' ? 'panel-dashboard-admin'
            : SESSION.role==='Guard'         ? 'panel-dashboard-guard'
                                             : 'panel-dashboard-homeowner';
  }
  document.getElementById(panelId)?.classList.add('active');
  if (el) el.classList.add('active');
  const titles = {
    dashboard:'Dashboard', map:'Live Map', residents:'Residents', blocklot:'Block & Lot',
    visitors:'Visitors', dues:'Dues & Payment', incidents:'Incidents',
    announcements:'Announcements', users:'User Management', reports:'Reports', guard:'Guard Console'
  };
  document.querySelector('.topbar-title') &&
    (document.querySelector('.topbar-title').innerHTML = (titles[id]||id) + ' <span>— Villa Purita</span>');

  // Lazy-init maps
  if (id==='map'   && !fullMap)   setTimeout(initFullMap, 200);
  if (id==='guard' && !guardMap)  setTimeout(initGuardMap, 200);
  if (id==='map'   && fullMap)    setTimeout(()=>fullMap.invalidateSize(), 100);
  if (id==='guard' && guardMap)   setTimeout(()=>guardMap.invalidateSize(), 100);

  // Render panels
  if (id==='residents')     renderResidents();
  if (id==='visitors')      renderVisitors();
  if (id==='dues')          renderDues();
  if (id==='incidents')     renderIncidents();
  if (id==='announcements') renderAnnouncements();
  if (id==='users')         renderUsers();
  if (id==='reports')       renderReports();
  if (id==='blocklot')      renderBlockLot();
  if (id==='guard')         renderGuardVisitors();
  if (id==='dashboard')     { refreshDashboardStats(); setTimeout(initMaps, 350); }
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.addEventListener('keydown', e => {
  if (e.key==='Escape') document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
  if (e.ctrlKey && e.key==='k' && SESSION.loggedIn) {
    e.preventDefault(); openModal('search-modal');
    setTimeout(()=>document.getElementById('global-search-input')?.focus(), 100);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MAPS
// ══════════════════════════════════════════════════════════════════════════════
function makeIcon(color) {
  return L.divIcon({
    className:'',
    html:`<div style="width:13px;height:13px;background:${color};border:2px solid rgba(255,255,255,.85);border-radius:3px;box-shadow:0 2px 6px rgba(0,0,0,.5);"></div>`,
    iconSize:[13,13], iconAnchor:[6,6]
  });
}

function resColor(r) {
  const dues = r.dues_status || r.dues_status;
  if (r.status==='Pending')   return '#f59e0b';
  if (dues==='Overdue')       return '#ef4444';
  if (dues==='Partial')       return '#f59e0b';
  if (dues==='Paid')          return '#10b981';
  return '#f59e0b'; // unpaid/occupied shown as orange
}

const BLOCK_OFFSETS = {
  'Block A': [+0.0012, +0.002], 'Block B': [+0.0022, +0.0005],
  'Block C': [-0.0012, +0.003], 'Block D': [-0.0022, -0.002],
};
const RESIDENT_COORD_ADJUSTMENTS = {
  'Block A|1': [0.00100, -0.00000],       // manually adjust Block A Lot 1 coordinates here
  'Block B|1': [0.0022, -0.001],     // manually adjust Block B Lot 1 coordinates here
  'Block C|1': [0.00080, -0.00018],  // manually adjust Block C Lot 1 coordinates here
};
function resCoords(r, i) {
  const key = `${r.block}|${String(r.lot_number).trim()}`;
  const custom = RESIDENT_COORD_ADJUSTMENTS[key];
  if (custom) {
    return [CENTER[0] + custom[0], CENTER[1] + custom[1]];
  }
  const [dlat,dlng] = BLOCK_OFFSETS[r.block] || [0,0];
  return [CENTER[0]+dlat+(i%4)*0.00025, CENTER[1]+dlng+Math.floor(i/4)*0.00025];
}

function popupHtml(r) {
  const col = resColor(r);
  return `<div style="font-family:'DM Sans',sans-serif;min-width:160px;padding:2px 0;">
    <div style="font-weight:700;font-size:13px;">${r.last_name}, ${r.first_name}</div>
    <div style="font-size:11px;color:#64748b;margin-bottom:6px;">${r.block} · Lot ${r.lot_number}</div>
    <span style="padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;background:${col}22;color:${col};border:1px solid ${col}55;">${r.status}</span>
    <span style="padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;background:${col}22;color:${col};border:1px solid ${col}55;margin-left:4px;">Dues:${r.dues_status||'?'}</span>
  </div>`;
}

function tiles() {
  return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { attribution:'© OpenStreetMap © CARTO', subdomains:'abcd', maxZoom:20 });
}

function initMaps() {
  const mapIds = {Administrator:'admin-dash-map', Guard:'guard-dash-map', Homeowner:'homeowner-dash-map'};
  const mid = mapIds[SESSION.role];
  const cont = mid && document.getElementById(mid);
  if (cont && !cont._leaflet_id) {
    dashMap = L.map(mid, {zoomControl:false, attributionControl:false}).setView(CENTER, 17);
    tiles().addTo(dashMap);
    STATE.residents.forEach((r,i) => {
      L.marker(resCoords(r,i), {icon:makeIcon(resColor(r))}).addTo(dashMap).bindPopup(popupHtml(r));
    });
    addSubdivisionLabel(dashMap);
  }
}

function initFullMap() {
  if (fullMap) { fullMap.invalidateSize(); return; }
  const cont = document.getElementById('full-map');
  if (!cont) return;
  fullMap = L.map('full-map', {zoomControl:true, attributionControl:false}).setView(CENTER, 17);
  tiles().addTo(fullMap);
  addSubdivisionLabel(fullMap);
  STATE.residents.forEach((r,i) => {
    const coords = resCoords(r,i);
    const m = L.marker(coords, {icon:makeIcon(resColor(r))}).addTo(fullMap);
    m.bindPopup(popupHtml(r));
    m.on('click', () => showMapDetail(r, m, coords));
    fullMapMarkers.push({r, m, coords});
  });
  // Active incident markers
  STATE.incidents.filter(i=>i.status!=='Resolved').forEach(inc => {
    const [dlat,dlng] = BLOCK_OFFSETS[inc.block] || [0,0];
    L.marker([CENTER[0]+dlat, CENTER[1]+dlng], {
      icon: L.divIcon({className:'', html:'<div style="width:16px;height:16px;background:#ef4444;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px #ef4444;animation:pulse 1.5s infinite;"></div>', iconSize:[16,16], iconAnchor:[8,8]})
    }).addTo(fullMap).bindPopup(`<b>🚨 INC-${inc.id}</b><br>${inc.incident_type}<br>${inc.block}${inc.lot_number?' Lot '+inc.lot_number:''}`);
  });
}

function initGuardMap() {
  if (guardMap) { guardMap.invalidateSize(); return; }
  const cont = document.getElementById('guard-map');
  if (!cont) return;
  guardMap = L.map('guard-map', {zoomControl:true, attributionControl:false}).setView(CENTER, 17);
  tiles().addTo(guardMap);
  addSubdivisionLabel(guardMap);
  STATE.residents.forEach((r,i) => {
    const coords = resCoords(r,i);
    const m = L.marker(coords, {icon:makeIcon(resColor(r))}).addTo(guardMap);
    m.bindPopup(`<b>${r.last_name}, ${r.first_name}</b><br>${r.block} · Lot ${r.lot_number}`);
    guardMapMarkers.push({r, m, coords});
  });
}

function addSubdivisionLabel(map) {
  L.circleMarker(VILLA_PURITA_COORDS, {
    radius: 10,
    color: '#fff',
    fillColor: '#fff',
    fillOpacity: 0.95,
    weight: 2,
    interactive: false,
    pane: 'markerPane'
  }).addTo(map);

  L.circleMarker(VILLA_PURITA_COORDS, {
    radius: 5,
    color: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 1,
    weight: 0,
    interactive: false,
    pane: 'markerPane'
  }).addTo(map);

  L.marker(VILLA_PURITA_COORDS, {
    icon: L.divIcon({
      className: '',
      iconSize: [130, 32],
      iconAnchor: [65, 42],
      html: '<div style="background:rgba(59,130,246,.92);color:#fff;font-family:sans-serif;font-size:11px;font-weight:700;padding:6px 12px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4);">🏘️ Villa Purita</div>'
    })
  }).addTo(map);
}

function destroyMaps() {
  clearDirectionLine();
  if (dashMap)  { dashMap.remove();  dashMap=null; }
  if (fullMap)  { fullMap.remove();  fullMap=null;  fullMapMarkers=[]; }
  if (guardMap) { guardMap.remove(); guardMap=null; guardMapMarkers=[]; }
}

function refreshMapMarkers() {
  fullMapMarkers.forEach(({r,m}) => {
    const updated = STATE.residents.find(x=>x.id===r.id);
    if (updated) { r.dues_status=updated.dues_status; r.status=updated.status; }
    m.setIcon(makeIcon(resColor(r)));
  });
  guardMapMarkers.forEach(({r,m}) => m.setIcon(makeIcon(resColor(r))));
}

function showMapDetail(r, m, coords) {
  const col = resColor(r);
  const bk = c => `<span style="padding:3px 8px;border-radius:5px;font-size:10px;font-weight:600;background:${c}22;color:${c};border:1px solid ${c}55;">`;
  document.getElementById('map-detail').innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:15px;">${r.last_name}, ${r.first_name}</div>
      <div style="font-size:12px;color:#94a3b8;">${r.block} · Lot ${r.lot_number} · Since ${r.year_of_residency}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="padding:9px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);text-align:center;">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">STATUS</div>${bk(col)}${r.status}</span>
      </div>
      <div style="padding:9px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);text-align:center;">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">DUES</div>${bk(col)}${r.dues_status||'Unpaid'}</span>
      </div>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px;">${r.occupancy_status} · ${SESSION.role==='Administrator'?(r.contact_number||'No contact'):'Admin only'}</div>
    <button class="btn btn-primary" style="width:100%;font-size:12px;" onclick="highlightOnMap(${r.id})">📍 Highlight on Map</button>`;
}

function highlightOnMap(rid) {
  const e = fullMapMarkers.find(m=>m.r.id===rid);
  if (!e||!fullMap) return;
  fullMap.setView(e.coords, 19, {animate:true});
  e.m.setIcon(L.divIcon({className:'',html:'<div style="width:22px;height:22px;background:#3b82f6;border:3px solid #fff;border-radius:5px;box-shadow:0 0 14px #3b82f6;animation:pulse 1.5s infinite;"></div>',iconSize:[22,22],iconAnchor:[11,11]}));
  e.m.openPopup();
  setTimeout(()=>e.m.setIcon(makeIcon(resColor(e.r))), 3000);
}

function mapSearch(q) {
  const res = document.getElementById('map-search-results');
  if (!q||!res) { if(res) res.innerHTML=''; return; }
  const matches = STATE.residents.filter(r => (r.first_name+' '+r.last_name+' '+r.block+' lot '+r.lot_number).toLowerCase().includes(q.toLowerCase()));
  if (!matches.length) { res.innerHTML='<div style="font-size:12px;color:var(--text3);padding:8px 0">No results</div>'; return; }
  res.innerHTML = matches.slice(0,6).map(r =>
    `<div onclick="locateOnMap(${r.id})" style="padding:9px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="font-size:13px;font-weight:600;">${r.last_name}, ${r.first_name}</div>
      <div style="font-size:11px;color:var(--text3);">${r.block} · Lot ${r.lot_number}</div>
    </div>`).join('');
}

function clearDirectionLine() {
  if (currentDirectionLine && fullMap) {
    fullMap.removeLayer(currentDirectionLine);
    currentDirectionLine = null;
  }
}

function drawDirectionLine(toCoords) {
  clearDirectionLine();
  if (!fullMap || !toCoords) return;
  
  const from = VILLA_PURITA_COORDS;
  const to = toCoords;
  const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
  
  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.routes && data.routes[0]) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        currentDirectionLine = L.polyline(coords, {
          color: '#3b82f6',
          weight: 3,
          opacity: 0.75,
          dashArray: '5, 5',
          lineCap: 'round'
        }).addTo(fullMap);
      }
    })
    .catch(() => {
      currentDirectionLine = L.polyline([from, to], {
        color: '#3b82f6',
        weight: 2,
        opacity: 0.7,
        dashArray: '5, 5',
        lineCap: 'round'
      }).addTo(fullMap);
    });
}

function locateOnMap(rid) {
  const e = fullMapMarkers.find(m=>m.r.id===rid);
  if (!e) return;
  drawDirectionLine(e.coords);
  fullMap.setView(e.coords, 19, {animate:true});
  e.m.openPopup();
  showMapDetail(e.r, e.m, e.coords);
}

function locateOnMapByBlockLot(block, lot) {
  const normalizedLot = String(lot || '').replace(/^Lot\s*/i, '').trim();
  const match = STATE.residents.find(r => r.block === block && String(r.lot_number || '').replace(/^Lot\s*/i, '').trim() === normalizedLot);
  if (!match) return;
  locateOnMap(match.id);
}

// ══════════════════════════════════════════════════════════════════════════════
// BADGE HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function badge(text, cls) {
  const map = {
    Active:'badge-green', Paid:'badge-green', Inside:'badge-green', Resolved:'badge-blue',
    Open:'badge-red', Overdue:'badge-red', Left:'badge-blue', Pending:'badge-yellow',
    Partial:'badge-yellow', 'In Progress':'badge-yellow', Unpaid:'',
    High:'badge-red', Medium:'badge-yellow', Low:'badge-blue', New:'badge-blue',
    Administrator:'badge-purple', Guard:'badge-blue', Homeowner:'badge-green',
    Active_user:'badge-green', Inactive:'badge-yellow',
  };
  const c = cls || map[text] || '';
  return `<span class="badge ${c}"><span class="badge-dot"></span>${text}</span>`;
}

function updateBadges() {
  const openInc = STATE.incidents.filter(i=>i.status==='Open').length;
  const inside  = STATE.visitors.filter(v=>v.status==='Inside').length;
  const overdue = STATE.payments.filter(p=>p.status==='Overdue').length;
  document.querySelectorAll('.nav-item').forEach(item => {
    const nb = item.querySelector('.nav-badge');
    if (!nb) return;
    if (item.getAttribute('onclick')?.includes('incidents')) nb.textContent = openInc||'';
    if (item.getAttribute('onclick')?.includes('visitors'))  nb.textContent = inside||'';
    if (item.getAttribute('onclick')?.includes('dues'))      nb.textContent = overdue||'';
  });
  const dot = document.querySelector('.notif-dot');
  if (dot) dot.style.display = openInc>0 ? 'block' : 'none';
}

async function loadUserProfile() {
  try {
    const profile = await api('/auth/me');
    SESSION.email = profile.email || '';
    SESSION.username = profile.username || SESSION.username;
    SESSION.status = profile.status || SESSION.status;
    SESSION.name = profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : (profile.full_name || SESSION.name);
    SESSION.userId = profile.id || SESSION.userId;
    return profile;
  } catch(e) {
    console.warn('Unable to load user profile:', e.message);
    return null;
  }
}

function openHomeownerAccountModal() {
  const fullnameEl = document.getElementById('acct-fullname');
  const usernameEl = document.getElementById('acct-username');
  const roleEl     = document.getElementById('acct-role');
  const statusEl   = document.getElementById('acct-status');
  const emailEl    = document.getElementById('acct-email');
  const propEl     = document.getElementById('acct-property');
  const errEl      = document.getElementById('acct-error');
  if (fullnameEl) fullnameEl.textContent = SESSION.name || '—';
  if (usernameEl) usernameEl.textContent = SESSION.username || '—';
  if (roleEl) roleEl.textContent = SESSION.role || '—';
  if (statusEl) statusEl.textContent = SESSION.status || 'Active';
  if (emailEl) emailEl.value = SESSION.email || '';
  const myResident = STATE.residents.find(r => r.user_id === SESSION.userId) || STATE.residents.find(r => (r.username && r.username===SESSION.username));
  if (propEl) propEl.textContent = myResident ? `${myResident.block.replace('Block ','B-')} / L-${String(myResident.lot_number).padStart(2,'0')}` : 'N/A';
  if (errEl) errEl.style.display = 'none';
  ['acct-pass','acct-pass2'].forEach(id=>{if(document.getElementById(id))document.getElementById(id).value='';});
  openModal('account-settings-modal');
}

async function saveAccountSettings() {
  const email = document.getElementById('acct-email')?.value.trim();
  const pass  = document.getElementById('acct-pass')?.value;
  const pass2 = document.getElementById('acct-pass2')?.value;
  const errEl = document.getElementById('acct-error');
  if (pass && pass !== pass2) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
  const btn = document.querySelector('#account-settings-modal .btn-primary');
  btn.textContent = 'Saving…'; btn.disabled = true;
  try {
    await api('/users/account', 'POST', { email: email || null, password: pass || null });
    SESSION.email = email || '';
    closeModal('account-settings-modal');
    toast('✅ Account settings updated.');
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  }
  btn.textContent = 'Save Changes'; btn.disabled = false;
}

// ══════════════════════════════════════════════════════════════════════════════
// RESIDENTS
// ══════════════════════════════════════════════════════════════════════════════
function renderResidents() {
  const tbody = document.getElementById('residents-tbody');
  if (!tbody) return;
  const list = STATE.residents;
  const total = STATE.residents.length;
  const visible = list.length;
  const summary = document.getElementById('resident-panel-summary');
  const pagination = document.getElementById('resident-panel-pagination');

  if (summary) summary.textContent = `${total} occupied units registered`;
  if (pagination) pagination.textContent = `Showing ${visible} of ${total} residents`;

  tbody.innerHTML = list.map((r,i) => `
    <tr>
      <td>${String(i+1).padStart(3,'0')}</td>
      <td class="td-name">${r.last_name}, ${r.first_name}</td>
      <td>${r.block}</td>
      <td>Lot ${r.lot_number}</td>
      <td>${r.year_of_residency}</td>
      <td style="font-size:11px;color:var(--text3);">${SESSION.role==='Administrator'?(r.contact_number||'—'):'Admin only'}</td>
      <td>${badge(r.status)}</td>
      <td>${badge(r.dues_status||'Unpaid')}</td>
      <td style="display:flex;gap:4px;">
        <button class="btn btn-ghost" style="padding:4px 8px;font-size:11px;" onclick="viewResident(${r.id})">View</button>
        ${SESSION.role==='Administrator'?`<button class="btn btn-ghost" style="padding:4px 8px;font-size:11px;color:var(--red);" onclick="deleteResident(${r.id})">Remove</button>`:''}
      </td>
    </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3);">No residents found.</td></tr>';
}

async function viewResident(id) {
  try {
    const r = await api(`/residents/show?id=${id}`);
    const pay = r.payment_history || [];
    document.getElementById('view-resident-body').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <div><label class="form-label">Full Name</label><div style="padding:8px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);font-size:13px;">${r.first_name} ${r.last_name}</div></div>
        <div><label class="form-label">Block & Lot</label><div style="padding:8px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);font-size:13px;">${r.block} · Lot ${r.lot_number}</div></div>
        <div><label class="form-label">Since</label><div style="padding:8px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);font-size:13px;">${r.year_of_residency}</div></div>
        <div><label class="form-label">Occupancy</label><div style="padding:8px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);font-size:13px;">${r.occupancy_status}</div></div>
        <div><label class="form-label">Status</label><div style="padding:8px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);">${badge(r.status)}</div></div>
        ${SESSION.role==='Administrator'?`<div><label class="form-label">Contact</label><div style="padding:8px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);font-size:13px;">${r.contact_number||'—'}</div></div>`:''}
      </div>
      <label class="form-label">Payment History</label>
      ${pay.length ? pay.map(p=>`<div style="padding:9px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;font-size:12px;">
        <span>${p.billing_month}</span><span>₱${parseFloat(p.amount||0).toLocaleString()}</span><span>${p.payment_method||'—'}</span>${badge(p.status)}</div>`).join('') :
      '<div style="color:var(--text3);font-size:12px;padding:10px 0;">No payment records.</div>'}`;
    openModal('view-resident-modal');
  } catch(e) { toast('Failed to load resident: ' + e.message, 'error'); }
}

async function saveResident() {
  const fname   = document.getElementById('res-fname')?.value.trim();
  const lname   = document.getElementById('res-lname')?.value.trim();
  const block   = document.getElementById('res-block')?.value;
  const lot     = document.getElementById('res-lot')?.value.trim();
  const year    = document.getElementById('res-year')?.value || new Date().getFullYear();
  const occ     = document.getElementById('res-occ')?.value;
  const userId  = document.getElementById('res-user')?.value;
  const contact = document.getElementById('res-contact')?.value.trim();
  const errEl   = document.getElementById('res-error');
  if (!fname||!lname||!lot) { errEl.textContent='First name, last name and lot are required.'; errEl.style.display='block'; return; }
  const btn = document.querySelector('#add-resident-modal .btn-primary');
  btn.textContent='Saving…'; btn.disabled=true;
  try {
    await api('/residents', 'POST', {
      first_name: fname,
      last_name: lname,
      block,
      lot_number: lot,
      year_of_residency: parseInt(year),
      occupancy_status: occ,
      contact_number: contact||null,
      user_id: userId ? parseInt(userId) : null
    });
    closeModal('add-resident-modal');
    ['res-fname','res-lname','res-lot','res-year','res-contact','res-user'].forEach(id=>{if(document.getElementById(id))document.getElementById(id).value='';});
    errEl.style.display='none';
    STATE.residents = await api('/residents');
    populatePaymentResidents();
    renderResidents(); refreshDashboardStats(); refreshMapMarkers();
    toast(`✅ ${lname}, ${fname} added to ${block} Lot ${lot}!`);
  } catch(e) { errEl.textContent=e.message; errEl.style.display='block'; }
  btn.textContent='Save Resident'; btn.disabled=false;
}

async function deleteResident(id) {
  const r = STATE.residents.find(x=>x.id===id);
  if (!r||!confirm(`Remove ${r.last_name}, ${r.first_name}?`)) return;
  try {
    await api(`/residents?id=${id}`, 'DELETE');
    STATE.residents = STATE.residents.filter(x=>x.id!==id);
    renderResidents(); refreshDashboardStats(); populatePaymentResidents();
    toast(`${r.last_name} removed.`, 'info');
  } catch(e) { toast('Remove failed: '+e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// VISITORS
// ══════════════════════════════════════════════════════════════════════════════
function renderVisitors() {
  const tbody = document.querySelector('#panel-visitors table tbody');
  if (!tbody) return;
  tbody.innerHTML = STATE.visitors.map((v,i) => `
    <tr>
      <td>V-${String(v.id).padStart(3,'0')}</td>
      <td class="td-name">${v.visitor_name}</td>
      <td>${v.purpose}</td>
      <td>${v.visiting_block} Lot ${v.visiting_lot}</td>
      <td>${v.id_type||'—'}</td>
      <td>${v.time_in_fmt||v.time_in||'—'}</td>
      <td>${v.time_out_fmt||v.time_out||'<span style="color:var(--text3)">—</span>'}</td>
      <td>${badge(v.status)}</td>
      <td style="font-size:11px;color:var(--text3);">${v.guard_name||'Guard'}</td>
      ${v.status==='Inside'?`<td><button class="btn btn-danger" style="padding:4px 8px;font-size:11px;" onclick="logExit(${v.id})">Log Exit</button></td>`:'<td></td>'}
    </tr>`).join('') || '<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--text3)">No visitors logged.</td></tr>';
  // Update stats
  const total   = STATE.visitors.length;
  const inside  = STATE.visitors.filter(v=>v.status==='Inside').length;
  const left    = STATE.visitors.filter(v=>v.status==='Left').length;
  const deliver = STATE.visitors.filter(v=>v.purpose==='Delivery').length;
  const sv = document.querySelectorAll('#panel-visitors .stat-value');
  if(sv[0]) sv[0].textContent=total; if(sv[1]) sv[1].textContent=left;
  if(sv[2]) sv[2].textContent=inside; if(sv[3]) sv[3].textContent=deliver;
  updateBadges();
}

async function saveVisitor() {
  const name      = document.getElementById('vis-name')?.value.trim();
  const block     = document.getElementById('vis-block')?.value;
  const lot       = document.getElementById('vis-lot')?.value.trim();
  const purpose   = document.getElementById('vis-purpose')?.value;
  const idType    = document.getElementById('vis-id-type')?.value.trim();
  const idNum     = document.getElementById('vis-id-num')?.value.trim();
  const plate     = document.getElementById('vis-plate')?.value.trim();
  const hoId      = document.getElementById('vis-homeowner')?.value;
  const errEl     = document.getElementById('vis-error');
  if (!name||!lot||!idType) { errEl.textContent='Name, lot, and ID type are required.'; errEl.style.display='block'; return; }
  const btn = document.querySelector('#add-visitor-modal .btn-success');
  btn.textContent='Logging…'; btn.disabled=true;
  try {
    await api('/visitors/entry', 'POST', {
      visitor_name:name, block, lot, purpose, id_type:idType,
      id_number:idNum||null, vehicle_plate:plate||null,
      visiting_homeowner_id: hoId ? parseInt(hoId) : null
    });
    closeModal('add-visitor-modal');
    ['vis-name','vis-lot','vis-id-type','vis-id-num','vis-plate'].forEach(id=>{if(document.getElementById(id))document.getElementById(id).value='';});
    if (document.getElementById('vis-homeowner')) document.getElementById('vis-homeowner').value='';
    if (document.getElementById('vis-homeowner-notif')) document.getElementById('vis-homeowner-notif').style.display='none';
    errEl.style.display='none';
    STATE.visitors = await api('/visitors');
    renderVisitors(); refreshDashboardStats(); updateBadges();
    // Show notification hint if homeowner was selected
    const hoRes = hoId ? STATE.residents.find(r=>r.id===parseInt(hoId)) : null;
    const hoName = hoRes ? hoRes.last_name + ', ' + hoRes.first_name : '';
    toast(`🚗 ${name} logged in — ${block} Lot ${lot}${hoName?' · Notified: '+hoName:''}`);
  } catch(e) { errEl.textContent=e.message; errEl.style.display='block'; }
  btn.textContent='✓ Log Entry'; btn.disabled=false;
}

async function logExit(id) {
  try {
    await api('/visitors/exit', 'POST', { id });
    STATE.visitors = await api('/visitors');
    renderVisitors(); renderGuardVisitors(); updateBadges();
    const v = STATE.visitors.find(x=>x.id===id);
    toast(`${v?.visitor_name||'Visitor'} has exited.`, 'info');
  } catch(e) { toast('Exit log failed: '+e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// DUES & PAYMENTS
// ══════════════════════════════════════════════════════════════════════════════
function populatePaymentResidents() {
  const opts = STATE.residents.map(r =>
    `<option value="${r.id}">${r.last_name}, ${r.first_name} — ${r.block} Lot ${r.lot_number}</option>`
  ).join('');
  const sel = document.getElementById('pay-resident');
  if (sel) sel.innerHTML = opts;
  const iss = document.getElementById('issue-resident');
  if (iss) iss.innerHTML = opts;
  const userSelect = document.getElementById('res-user');
  if (userSelect) {
    const owners = STATE.users.filter(u => u.role === 'Homeowner' && !STATE.residents.some(r => r.user_id === u.id));
    userSelect.innerHTML = '<option value="">— None —</option>' + owners.map(u =>
      `<option value="${u.id}">${u.username} — ${u.first_name} ${u.last_name}${u.email?` (${u.email})`:''}</option>`
    ).join('');
  }
  // Visitor modal: homeowner dropdown
  const visHo = document.getElementById('vis-homeowner');
  if (visHo) {
    visHo.innerHTML = '<option value="">— Select homeowner (optional) —</option>' +
      STATE.residents.map(r =>
        `<option value="${r.id}">${r.last_name}, ${r.first_name} — ${r.block} Lot ${r.lot_number}</option>`
      ).join('');
    visHo.onchange = () => {
      const notif = document.getElementById('vis-homeowner-notif');
      if (notif) notif.style.display = visHo.value ? '' : 'none';
    };
  }
}

function renderDues() {
  const role = SESSION.role;
  const isAdmin = role === 'Administrator';
  const isGuard = role === 'Guard';
  const isHO    = role === 'Homeowner';

  // Show/hide buttons based on role
  const issueBtn   = document.getElementById('issue-bill-btn');
  const recordBtn  = document.getElementById('record-payment-btn');
  const statsRow   = document.getElementById('dues-stats-row');
  const allCard    = document.getElementById('dues-all-card');
  const hoCard     = document.getElementById('ho-pending-bills');

  if (issueBtn)  issueBtn.style.display  = isAdmin ? '' : 'none';
  if (recordBtn) recordBtn.style.display = isAdmin ? '' : 'none';
  if (statsRow)  statsRow.style.display  = isHO    ? 'none' : '';
  if (allCard)   allCard.style.display   = isHO    ? 'none' : '';
  if (hoCard)    hoCard.style.display    = isHO    ? '' : 'none';

  if (isHO) {
    // Homeowner: show bills issued to them
    const myResident = STATE.residents.find(r =>
      (r.user_id && r.user_id === SESSION.userId) ||
      (r.username && r.username === SESSION.username) ||
      (r.first_name + ' ' + r.last_name).toLowerCase() === SESSION.name.toLowerCase()
    ) || STATE.residents[0];

    const myBills = myResident
      ? STATE.payments.filter(p =>
          p.resident_id === myResident.id ||
          (p.last_name === myResident.last_name && p.first_name === myResident.first_name))
      : [];

    const tbody = document.getElementById('ho-bills-tbody');
    const countEl = document.getElementById('ho-pending-count');
    const pending = myBills.filter(p => p.status !== 'Paid').length;
    if (countEl) countEl.textContent = pending > 0
      ? `${pending} pending bill${pending>1?'s':''}`
      : 'All paid ✓';
    if (tbody) {
      tbody.innerHTML = myBills.length
        ? myBills.map(p => `
          <tr>
            <td>${p.billing_month}</td>
            <td style="font-size:11px;color:var(--text2);max-width:180px;">${p.notes||'Monthly association dues'}</td>
            <td><strong>₱${parseFloat(p.amount||0).toLocaleString()}</strong></td>
            <td style="font-size:11px;color:var(--text3);">${p.issued_by_name||'Admin'}</td>
            <td>${badge(p.status)}</td>
            <td>
              ${p.status!=='Paid'
                ? `<span style="font-size:11px;color:var(--yellow);">📌 Come to office to pay</span>`
                : `<span style="font-size:11px;color:var(--green);">✅ Paid ${p.date_paid_fmt||''}</span>`}
            </td>
          </tr>`).join('')
        : '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text3);">No bills issued to you yet.</td></tr>';
    }
    return;
  }

  // Admin / Guard: full payment records table
  const filterVal = document.getElementById('dues-filter')?.value || '';
  const tbody = document.getElementById('dues-tbody');
  if (!tbody) return;

  const rows = filterVal
    ? STATE.payments.filter(p => p.status === filterVal)
    : STATE.payments;

  tbody.innerHTML = rows.map(p => {
    const isPending = p.status !== 'Paid';
    return `<tr>
      <td style="font-size:11px;color:var(--text3);">PAY-${String(p.id).padStart(3,'0')}</td>
      <td class="td-name">${p.last_name}, ${p.first_name}</td>
      <td>${p.block} / ${p.lot_number}</td>
      <td>${p.billing_month}</td>
      <td>₱${parseFloat(p.amount||0).toLocaleString()}</td>
      <td style="font-size:11px;color:var(--text3);">${p.issued_by_name||'<span style="color:var(--text3)">—</span>'}</td>
      <td>${p.date_paid_fmt||p.date_paid||'<span style="color:var(--text3)">—</span>'}</td>
      <td>${p.payment_method||'<span style="color:var(--text3)">—</span>'}</td>
      <td>${badge(p.status)}</td>
      <td style="display:flex;gap:4px;">
        ${p.status==='Paid'
          ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;" onclick="showReceipt(${p.id})">Receipt</button>`
          : isAdmin
            ? `<button class="btn btn-success" style="padding:3px 8px;font-size:11px;" onclick="openConfirmPayment(${p.id})">✅ Confirm</button>`
            : `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;" onclick="sendReminder(${p.id})">Remind</button>`}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--text3)">No payment records.</td></tr>';

  // Live stats
  api('/dues/summary').then(s => {
    if (!s) return;
    const sv = document.querySelectorAll('#dues-stats-row .stat-value');
    if(sv[0]) sv[0].textContent = s.paid_count||0;
    if(sv[1]) sv[1].textContent = s.overdue_count||0;
    if(sv[2]) sv[2].textContent = s.unpaid_count||0;
    const sc = document.querySelectorAll('#dues-stats-row .stat-change');
    if(sc[0]) sc[0].textContent = '₱'+(parseInt(s.total_collected||0)).toLocaleString()+' collected';
    if(sc[1]) sc[1].textContent = '₱'+(parseInt(s.total_overdue||0)).toLocaleString()+' pending';
  }).catch(()=>{});
  updateBadges();
}

// ── Issue Bill (Admin only) ────────────────────────────────────────────────
function openIssueBillModal() {
  populatePaymentResidents();
  // Pre-fill current month
  const monthEl = document.getElementById('issue-month');
  if (monthEl && !monthEl.value) monthEl.value = new Date().toISOString().slice(0,7);
  const descEl = document.getElementById('issue-desc');
  if (descEl && !descEl.value) {
    const m = document.getElementById('issue-month')?.value || new Date().toISOString().slice(0,7);
    descEl.value = `Monthly association dues for ${m}`;
  }
  document.getElementById('issue-error').style.display = 'none';
  openModal('issue-bill-modal');
}

async function saveIssueBill() {
  const resId  = document.getElementById('issue-resident')?.value;
  const month  = document.getElementById('issue-month')?.value;
  const amount = document.getElementById('issue-amount')?.value;
  const desc   = document.getElementById('issue-desc')?.value.trim();
  const notes  = document.getElementById('issue-notes')?.value.trim();
  const errEl  = document.getElementById('issue-error');
  errEl.style.display = 'none';
  if (!resId || !month || !amount) {
    errEl.textContent = 'Resident, billing month, and amount are required.';
    errEl.style.display = 'block'; return;
  }
  const btn = document.querySelector('#issue-bill-modal .btn-primary');
  btn.textContent = 'Issuing…'; btn.disabled = true;
  try {
    await api('/dues/issue', 'POST', {
      resident_id: parseInt(resId),
      billing_month: month,
      amount: parseFloat(amount),
      description: desc || `Monthly association dues for ${month}`,
      notes: notes || null
    });
    closeModal('issue-bill-modal');
    // Reset fields
    document.getElementById('issue-desc').value = '';
    document.getElementById('issue-notes').value = '';
    STATE.payments = await api('/dues');
    renderDues(); refreshDashboardStats();
    const r = STATE.residents.find(x => x.id === parseInt(resId));
    toast(`📋 Bill issued to ${r?.last_name||'resident'} for ${month}. They will see it on their dashboard.`);
  } catch(e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  btn.textContent = '📋 Issue Bill'; btn.disabled = false;
}

// ── Confirm Payment at Office (Admin only) ────────────────────────────────
function openConfirmPayment(payId) {
  const p = STATE.payments.find(x => x.id === payId);
  if (!p) return;
  document.getElementById('confirm-due-id').value       = p.id;
  document.getElementById('confirm-resident-id').value  = p.resident_id;
  document.getElementById('confirm-billing-month').value = p.billing_month;
  document.getElementById('confirm-amount-val').value   = p.amount;
  document.getElementById('confirm-amount').value       = p.amount;
  document.getElementById('confirm-ref').value          = '';
  document.getElementById('confirm-notes').value        = '';
  document.getElementById('confirm-error').style.display = 'none';
  document.getElementById('confirm-bill-info').innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:6px;">
      ${p.last_name}, ${p.first_name}
    </div>
    <div style="display:flex;gap:20px;font-size:12px;color:var(--text2);">
      <span>🏠 ${p.block} Lot ${p.lot_number}</span>
      <span>📅 ${p.billing_month}</span>
      <span>💰 ₱${parseFloat(p.amount||0).toLocaleString()}</span>
    </div>
    <div style="margin-top:8px;font-size:11px;color:var(--text3);">${p.notes||'Monthly association dues'}</div>`;
  openModal('confirm-payment-modal');
}

async function confirmPayment() {
  const resId   = document.getElementById('confirm-resident-id')?.value;
  const month   = document.getElementById('confirm-billing-month')?.value;
  const amount  = document.getElementById('confirm-amount')?.value;
  const method  = document.getElementById('confirm-method')?.value;
  const ref     = document.getElementById('confirm-ref')?.value.trim();
  const notes   = document.getElementById('confirm-notes')?.value.trim();
  const errEl   = document.getElementById('confirm-error');
  errEl.style.display = 'none';
  if (!amount || parseFloat(amount) <= 0) {
    errEl.textContent = 'Please enter the amount received.';
    errEl.style.display = 'block'; return;
  }
  const btn = document.querySelector('#confirm-payment-modal .btn-success');
  btn.textContent = 'Confirming…'; btn.disabled = true;
  try {
    await api('/dues/payment', 'POST', {
      resident_id: parseInt(resId),
      billing_month: month,
      amount: parseFloat(amount),
      payment_method: method,
      reference_number: ref || null,
      notes: notes || null
    });
    closeModal('confirm-payment-modal');
    STATE.payments = await api('/dues');
    renderDues(); refreshDashboardStats(); refreshMapMarkers();
    const p = STATE.payments.find(x => x.billing_month === month && x.resident_id === parseInt(resId));
    const name = p ? p.last_name + ', ' + p.first_name : 'Resident';
    toast(`✅ Payment confirmed! ₱${parseFloat(amount).toLocaleString()} received from ${name} for ${month}.`);
  } catch(e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  btn.textContent = '✅ Confirm Payment'; btn.disabled = false;
}

async function recordPayment() {
  const resId  = document.getElementById('pay-resident')?.value;
  const month  = document.getElementById('pay-month')?.value;
  const amount = document.getElementById('pay-amount')?.value;
  const method = document.getElementById('pay-method')?.value;
  const ref    = document.getElementById('pay-ref')?.value.trim();
  const notes  = document.getElementById('pay-notes')?.value.trim();
  const errEl  = document.getElementById('pay-error');
  if (!resId||!month||!amount) { errEl.textContent='Resident, month and amount are required.'; errEl.style.display='block'; return; }
  const btn = document.querySelector('#add-payment-modal .btn-primary');
  btn.textContent='Saving…'; btn.disabled=true;
  try {
    await api('/dues/payment', 'POST', { resident_id:parseInt(resId), billing_month:month, amount:parseFloat(amount), payment_method:method, reference_number:ref||null, notes:notes||null });
    closeModal('add-payment-modal');
    errEl.style.display='none';
    STATE.payments = await api('/dues');
    renderDues(); refreshDashboardStats(); refreshMapMarkers();
    const r = STATE.residents.find(x=>x.id===parseInt(resId));
    toast(`💰 ₱${parseFloat(amount).toLocaleString()} payment confirmed for ${r?.last_name||'resident'}!`);
  } catch(e) { errEl.textContent=e.message; errEl.style.display='block'; }
  btn.textContent='✓ Confirm Payment'; btn.disabled=false;
}

async function quickPay(payId) {
  const p = STATE.payments.find(x=>x.id===payId);
  if (!p||!confirm(`Mark ₱${parseFloat(p.amount||0).toLocaleString()} as paid for ${p.last_name}?`)) return;
  try {
    await api('/dues/payment', 'POST', { resident_id:p.resident_id, billing_month:p.billing_month, amount:p.amount, payment_method:'Cash' });
    STATE.payments = await api('/dues');
    renderDues(); refreshDashboardStats(); refreshMapMarkers();
    toast(`💰 Payment confirmed for ${p.last_name}, ${p.first_name}!`);
  } catch(e) { toast('Payment failed: '+e.message,'error'); }
}

function showReceipt(payId) {
  const p = STATE.payments.find(x=>x.id===payId);
  if (!p) return;
  toast(`🧾 Receipt: ${p.last_name}, ${p.first_name} — ₱${parseFloat(p.amount||0).toLocaleString()} — ${p.billing_month} — ${p.payment_method||'Cash'} ${p.reference_number?'('+p.reference_number+')':''}`, 'info');
}

function sendReminder(payId) {
  const p = STATE.payments.find(x=>x.id===payId);
  if (!p) return;
  toast(`📱 Reminder sent to ${p.last_name}, ${p.first_name} for ${p.billing_month} dues.`, 'info');
}

// ══════════════════════════════════════════════════════════════════════════════
// INCIDENTS
// ══════════════════════════════════════════════════════════════════════════════
function renderIncidents() {
  const tbody = document.querySelector('#panel-incidents .table-wrap table tbody');
  if (tbody) {
    tbody.innerHTML = STATE.incidents.map(inc => `
      <tr>
        <td>INC-${inc.id}</td>
        <td>${inc.incident_type}</td>
        <td>${inc.block}${inc.lot_number?' Lot '+inc.lot_number:''}</td>
        <td>${badge(inc.priority)}</td>
        <td>${badge(inc.status)}</td>
      </tr>`).join('');
  }
  const leftCol = document.querySelector('#panel-incidents .grid-2 > div:first-child');
  if (leftCol) {
    const cls  = {Open:'alert-red','In Progress':'alert-yellow',Resolved:'alert-green',Closed:'alert-blue'};
    const icon = {Open:'🚨','In Progress':'⚠️',Resolved:'✅',Closed:'📁'};
    leftCol.innerHTML = STATE.incidents.map(inc => `
      <div class="alert ${cls[inc.status]||'alert-blue'}" style="margin-bottom:10px;">
        <span class="alert-icon">${icon[inc.status]||'🔔'}</span>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
            <strong>INC-${inc.id} — ${inc.priority.toUpperCase()}</strong>${badge(inc.status)}
          </div>
          <div style="font-size:12px;">${inc.description.substring(0,80)}${inc.description.length>80?'...':''}</div>
          <div style="font-size:10px;opacity:.7;margin-top:4px;">Reported by: ${inc.reporter_name||'Unknown'} · ${inc.created_fmt||inc.created_at||''}</div>
          ${SESSION.role!=='Homeowner'&&inc.status!=='Resolved'&&inc.status!=='Closed'?`
          <div style="margin-top:8px;display:flex;gap:6px;">
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;" onclick="updateIncidentStatus(${inc.id},'In Progress')">In Progress</button>
            <button class="btn btn-success" style="padding:3px 8px;font-size:11px;" onclick="updateIncidentStatus(${inc.id},'Resolved')">Resolve</button>
          </div>`:''}
        </div>
      </div>`).join('');
  }
  const sub = document.querySelector('#panel-incidents div[style*="font-size:12px"]');
  if (sub) sub.textContent = STATE.incidents.filter(i=>i.status==='Open').length + ' active open incidents';
  updateBadges();
}

async function saveIncident() {
  const type     = document.getElementById('inc-type')?.value;
  const priority = document.getElementById('inc-priority')?.value;
  const block    = document.getElementById('inc-block')?.value;
  const lot      = document.getElementById('inc-lot')?.value.trim();
  const desc     = document.getElementById('inc-desc')?.value.trim();
  const errEl    = document.getElementById('inc-error');
  if (!desc) { errEl.textContent='Please describe the incident.'; errEl.style.display='block'; return; }
  const btn = document.querySelector('#incident-modal .btn-danger');
  btn.textContent='Sending…'; btn.disabled=true;
  try {
    await api('/incidents', 'POST', { incident_type:type, description:desc, priority, block, lot_number:lot||null });
    closeModal('incident-modal');
    document.getElementById('inc-desc').value='';
    document.getElementById('inc-lot').value='';
    errEl.style.display='none';
    STATE.incidents = await api('/incidents');
    renderIncidents(); refreshDashboardStats(); updateBadges();
    toast(`🚨 Incident reported: ${type} at ${block}${lot?' Lot '+lot:''}. Guards notified!`, 'error');
  } catch(e) { errEl.textContent=e.message; errEl.style.display='block'; }
  btn.textContent='🚨 Send Alert'; btn.disabled=false;
}

async function updateIncidentStatus(id, newStatus) {
  try {
    await api('/incidents/status', 'POST', { id, status:newStatus });
    const inc = STATE.incidents.find(i=>i.id===id);
    if (inc) inc.status = newStatus;
    renderIncidents(); updateBadges();
    toast(`INC-${id} → ${newStatus}`, newStatus==='Resolved'?'success':'info');
  } catch(e) { toast('Update failed: '+e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ══════════════════════════════════════════════════════════════════════════════
function renderAnnouncements() {
  const listEl = document.querySelector('#panel-announcements .grid-2 > div:first-child .card-body');
  const tlEl   = document.querySelector('#panel-announcements .timeline');
  const catColors = {General:'badge-green',Urgent:'badge-red',Event:'badge-blue',Maintenance:'badge-yellow','Payment Reminder':'badge-purple'};
  const catBg    = {Urgent:'var(--red)',Event:'var(--accent)',General:'var(--green)',Maintenance:'var(--yellow)','Payment Reminder':'var(--purple)'};
  if (listEl) {
    listEl.innerHTML = STATE.announcements.map(a => `
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;transition:border-color .2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:8px;">
          <strong style="font-size:13px;">${a.title}</strong>
          <span class="badge ${catColors[a.category]||'badge-blue'}">${a.category}</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px;line-height:1.5;">${a.content}</div>
        <div style="font-size:11px;color:var(--text3);">Posted by ${a.posted_by_name||a.posted_by_username||'Admin'} · ${a.post_date} · ${a.target_audience}</div>
        ${SESSION.role==='Administrator'?`<div style="margin-top:8px;"><button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;" onclick="archiveAnnouncement(${a.id})">Archive</button></div>`:''}
      </div>`).join('') || '<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px;">No active announcements.</div>';
  }
  if (tlEl) {
    tlEl.innerHTML = STATE.announcements.map(a => `
      <div class="tl-item">
        <div class="tl-dot" style="background:${catBg[a.category]||'var(--accent)'}"></div>
        <div class="tl-time">${a.post_date}</div>
        <div class="tl-text"><strong>${a.title}</strong><br><span style="font-size:10px;">${a.target_audience}</span></div>
      </div>`).join('');
  }
}

async function saveAnnouncement() {
  const title    = document.getElementById('ann-title')?.value.trim();
  const content  = document.getElementById('ann-content')?.value.trim();
  const category = document.getElementById('ann-category')?.value;
  const notify   = document.getElementById('ann-notify')?.value;
  const postDate = document.getElementById('ann-postdate')?.value;
  const expiry   = document.getElementById('ann-expiry')?.value;
  const errEl    = document.getElementById('ann-error');
  if (!title||!content) { errEl.textContent='Title and content are required.'; errEl.style.display='block'; return; }
  const btn = document.querySelector('#announcement-modal .btn-primary');
  btn.textContent='Posting…'; btn.disabled=true;
  try {
    await api('/announcements', 'POST', { title, content, category, target_audience:notify, post_date:postDate||new Date().toISOString().split('T')[0], expiry_date:expiry||null });
    closeModal('announcement-modal');
    ['ann-title','ann-content','ann-postdate','ann-expiry'].forEach(id=>{if(document.getElementById(id))document.getElementById(id).value='';});
    errEl.style.display='none';
    STATE.announcements = await api('/announcements');
    renderAnnouncements();
    toast(`📢 "${title}" posted and sent to ${notify}!`);
  } catch(e) { errEl.textContent=e.message; errEl.style.display='block'; }
  btn.textContent='📢 Post & Notify'; btn.disabled=false;
}

async function archiveAnnouncement(id) {
  if (!confirm('Archive this announcement?')) return;
  try {
    await api('/announcements/archive', 'POST', { id });
    STATE.announcements = STATE.announcements.filter(a=>a.id!==id);
    renderAnnouncements();
    toast('Announcement archived.', 'info');
  } catch(e) { toast('Archive failed: '+e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════════════════════
function renderUsers() {
  const tbody = document.querySelector('#panel-users table tbody');
  if (!tbody) return;
  tbody.innerHTML = STATE.users.map(u => `
    <tr>
      <td>USR-${String(u.id).padStart(3,'0')}</td>
      <td class="td-name">${u.username}</td>
      <td>${u.first_name} ${u.last_name}</td>
      <td>${badge(u.role)}</td>
      <td>${u.last_login||'Never'}</td>
      <td>${badge(u.status)}</td>
      <td style="display:flex;gap:4px;">
        <button class="btn btn-ghost" style="padding:4px 8px;font-size:11px;" onclick="toggleUserStatus(${u.id},'${u.status==='Active'?'Inactive':'Active'}')">${u.status==='Active'?'Deactivate':'Activate'}</button>
        ${u.id!==SESSION.userId?`<button class="btn btn-ghost" style="padding:4px 8px;font-size:11px;color:var(--red);" onclick="deleteUser(${u.id})">Remove</button>`:''}
      </td>
    </tr>`).join('');
}

function renderBlockLot() {
  const overviewBody = document.getElementById('blocklot-overview-tbody');
  const detailsBody = document.getElementById('blocklot-lot-details-tbody');
  const blockSelect = document.getElementById('blocklot-block-filter');
  if (!overviewBody || !detailsBody) return;

  const blocks = ['Block A', 'Block B', 'Block C', 'Block D'];
  const selectedBlock = blockSelect?.value || 'Block A';
  const totalLots = 8;

  overviewBody.innerHTML = blocks.map(block => {
    const residents = STATE.residents.filter(r => r.block === block);
    const occupied = residents.length;
    const vacant = Math.max(0, totalLots - occupied);
    const occupancy = totalLots > 0 ? Math.round((occupied / totalLots) * 100) : 0;
    const fillColor = occupancy >= 80 ? 'var(--green)' : occupancy >= 60 ? 'var(--accent)' : 'var(--yellow)';
    return `
      <tr>
        <td class="td-name">${block}</td>
        <td>${totalLots}</td>
        <td>${occupied}</td>
        <td>${vacant}</td>
        <td><div style="display:flex;align-items:center;gap:8px;"><div class="progress-bar" style="width:80px;"><div class="progress-fill" style="width:${occupancy}%;background:${fillColor}"></div></div>${occupancy}%</div></td>
      </tr>
    `;
  }).join('');

  const blockResidents = STATE.residents
    .filter(r => r.block === selectedBlock)
    .sort((a, b) => (a.lot_number || 0) - (b.lot_number || 0));

  const lotRows = [];
  for (let lot = 1; lot <= totalLots; lot++) {
    const resident = blockResidents.find(r => Number(r.lot_number) === lot);
    if (resident) {
      const residentName = `${resident.last_name || ''}${resident.first_name ? ', ' + resident.first_name : ''}`;
      const statusClass = resident.occupancy_status === 'Pending' ? 'badge badge-yellow' : 'badge badge-green';
      const statusText = resident.occupancy_status || 'Occupied';
      lotRows.push(`
        <tr>
          <td>Lot ${String(lot).padStart(2, '0')}</td>
          <td>${resident.lot_area || '—'}</td>
          <td class="td-name">${residentName}</td>
          <td><span class="${statusClass}">${statusText}</span></td>
        </tr>
      `);
    } else {
      lotRows.push(`
        <tr>
          <td>Lot ${String(lot).padStart(2, '0')}</td>
          <td>—</td>
          <td style="color:var(--text3)">—</td>
          <td><span class="badge" style="background:rgba(71,85,105,.2);color:#94a3b8;border:1px solid #334155;">Vacant</span></td>
        </tr>
      `);
    }
  }

  const detailsTitle = document.getElementById('blocklot-details-title');
  if (detailsTitle) detailsTitle.innerText = selectedBlock;
  detailsBody.innerHTML = lotRows.join('');
}

function viewLotDetails(block, lot) {
  const resident = STATE.residents.find(r => r.block === `Block ${block}` && r.lot_number == lot);
  const content = document.getElementById('lot-details-content');
  if (!content) return;

  if (resident) {
    const payments = STATE.payments.filter(p => p.resident_id === resident.id);
    const latestPayment = payments.sort((a,b) => new Date(b.date_paid || b.created_at) - new Date(a.date_paid || a.created_at))[0];
    const outstanding = payments.filter(p => p.status !== 'Paid').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    content.innerHTML = `
      <div class="lot-info">
        <div class="lot-header">
          <h4>Block ${block}, Lot ${lot}</h4>
          <span class="badge badge-green">Occupied</span>
        </div>
        <div class="lot-resident">
          <div class="resident-avatar">${resident.first_name[0]}${resident.last_name[0]}</div>
          <div class="resident-info">
            <div class="resident-name">${resident.last_name}, ${resident.first_name}</div>
            <div class="resident-details">Owner since ${resident.year_of_residency || 'N/A'} • ${resident.occupancy_status || 'N/A'}</div>
          </div>
        </div>
        <div class="lot-stats">
          <div class="stat-item">
            <span class="stat-label">Monthly Dues</span>
            <span class="stat-value">₱500</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Last Payment</span>
            <span class="stat-value">${latestPayment ? (latestPayment.date_paid_fmt || latestPayment.date_paid || 'N/A') : 'None'}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Outstanding</span>
            <span class="stat-value">₱${outstanding.toLocaleString()}</span>
          </div>
        </div>
      </div>
    `;
  } else {
    content.innerHTML = `
      <div class="lot-info">
        <div class="lot-header">
          <h4>Block ${block}, Lot ${lot}</h4>
          <span class="badge badge-gray">Vacant</span>
        </div>
        <div class="lot-resident">
          <div class="resident-info">
            <div class="resident-name">No Resident Assigned</div>
            <div class="resident-details">This lot is currently vacant.</div>
          </div>
        </div>
      </div>
    `;
  }
  openModal('lot-details-modal');
}

async function saveUser() {
  const fname    = document.getElementById('usr-fname')?.value.trim();
  const lname    = document.getElementById('usr-lname')?.value.trim();
  const username = document.getElementById('usr-username')?.value.trim();
  const email    = document.getElementById('usr-email')?.value.trim();
  const role     = document.getElementById('usr-role')?.value;
  const status   = document.getElementById('usr-status')?.value;
  const errEl    = document.getElementById('usr-error');
  errEl.style.display = 'none';
  if (!fname || !lname || !username) {
    errEl.textContent = 'First name, last name and username are required.';
    errEl.style.display = 'block'; return;
  }
  if (!email) {
    errEl.textContent = 'Email is required — the login password will be sent there.';
    errEl.style.display = 'block'; return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Please enter a valid email address.';
    errEl.style.display = 'block'; return;
  }
  const btn = document.querySelector('#add-user-modal .btn-primary');
  btn.textContent = 'Creating…'; btn.disabled = true;
  try {
    const result = await api('/users', 'POST', { first_name:fname, last_name:lname, username, email, role, status });
    closeModal('add-user-modal');
    ['usr-fname','usr-lname','usr-username','usr-email'].forEach(id => {
      if (document.getElementById(id)) document.getElementById(id).value = '';
    });
    STATE.users = await api('/users');
    renderUsers();
    const emailOk = result?.email_sent !== false;
    if (emailOk) {
      toast(`✅ Account "${username}" created! Credentials emailed to ${email}.`);
    } else {
      toast(`✅ Account "${username}" created. ⚠️ Email could not be sent — check SMTP config.`, 'warning');
    }
  } catch(e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  btn.textContent = '✓ Create Account'; btn.disabled = false;
}

// ── Forgot Password ───────────────────────────────────────────────────────────
async function doForgotPassword() {
  const email = document.getElementById('forgot-email')?.value.trim();
  const errEl = document.getElementById('forgot-error');
  errEl.style.display = 'none';
  if (!email) { errEl.textContent = 'Please enter your email address.'; errEl.style.display='block'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Please enter a valid email address.'; errEl.style.display='block'; return;
  }
  const btn = document.getElementById('forgot-submit-btn');
  btn.textContent = 'Sending…'; btn.disabled = true;
  try {
    await api('/auth/forgot-password', 'POST', { email });
    // Show success view
    document.getElementById('forgot-form-view').style.display  = 'none';
    document.getElementById('forgot-success-view').style.display = '';
    document.getElementById('forgot-footer').innerHTML =
      `<button class="btn btn-primary" onclick="closeModal('forgot-password-modal');resetForgotForm()">Done</button>`;
  } catch(e) {
    errEl.textContent = e.message || 'Something went wrong. Please try again.';
    errEl.style.display = 'block';
    btn.textContent = '📧 Send New Password'; btn.disabled = false;
  }
}

function resetForgotForm() {
  const emailEl = document.getElementById('forgot-email');
  const errEl   = document.getElementById('forgot-error');
  const form    = document.getElementById('forgot-form-view');
  const success = document.getElementById('forgot-success-view');
  const footer  = document.getElementById('forgot-footer');
  if (emailEl)  emailEl.value = '';
  if (errEl)    errEl.style.display = 'none';
  if (form)     form.style.display  = '';
  if (success)  success.style.display = 'none';
  if (footer)   footer.innerHTML = `
    <button class="btn btn-ghost" onclick="closeModal('forgot-password-modal');resetForgotForm()">Cancel</button>
    <button class="btn btn-primary" id="forgot-submit-btn" onclick="doForgotPassword()">📧 Send New Password</button>`;
}

async function toggleShift() {
  console.log('toggleShift called, SESSION:', SESSION);
  if (SESSION.role !== 'Guard') {
    console.log('Not a guard, returning');
    return;
  }
  try {
    const active = STATE.shift && STATE.shift.status === 'Active';
    console.log('Current shift state:', STATE.shift, 'active:', active);
    if (active) {
      console.log('Ending shift...');
      await api('/shifts/end', 'POST');
      toast('Shift ended successfully', 'success');
    } else {
      console.log('Starting shift...');
      await api('/shifts/start', 'POST');
      toast('Shift started successfully', 'success');
    }
    // Refresh shift status
    console.log('Refreshing shift status...');
    const shift = await api('/shifts/status');
    console.log('New shift status:', shift);
    STATE.shift = shift;
    renderGuardDashboard();
  } catch(e) {
    console.error('Shift toggle error:', e);
    toast(e.message || 'Failed to toggle shift', 'error');
  }
}

async function toggleUserStatus(id, newStatus) {
  try {
    await api('/users/status', 'POST', { id, status:newStatus });
    const u = STATE.users.find(x=>x.id===id);
    if (u) u.status=newStatus;
    renderUsers();
    toast(`User ${STATE.users.find(x=>x.id===id)?.username} ${newStatus==='Active'?'activated':'deactivated'}.`, 'info');
  } catch(e) { toast(e.message,'error'); }
}

async function deleteUser(id) {
  const u = STATE.users.find(x=>x.id===id);
  if (!u||!confirm(`Delete user "${u.username}"?`)) return;
  try {
    await api(`/users?id=${id}`, 'DELETE');
    STATE.users = STATE.users.filter(x=>x.id!==id);
    renderUsers();
    toast(`User ${u.username} removed.`, 'info');
  } catch(e) { toast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS (real CSV from STATE)
// ══════════════════════════════════════════════════════════════════════════════
function renderReports() {
  const cards = document.querySelectorAll('#panel-reports .card');
  const fns = [dlResidents, dlVisitors, dlDues, dlIncidents, dlActivity, dlBlockLot];
  cards.forEach((c,i)=>{ if(fns[i]) c.onclick=fns[i]; });
}

function dlCSV(rows, name) {
  const csv = rows.map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
  toast(`📥 ${name} downloaded!`);
}

function dlResidents() {
  const rows=[['ID','Last Name','First Name','Block','Lot','Since','Occupancy','Status','Contact']];
  STATE.residents.forEach(r=>rows.push([r.id,r.last_name,r.first_name,r.block,r.lot_number,r.year_of_residency,r.occupancy_status,r.status,SESSION.role==='Administrator'?r.contact_number||'':'Admin only']));
  dlCSV(rows,'villa_purita_residents_'+new Date().toISOString().split('T')[0]+'.csv');
}
function dlVisitors() {
  const rows=[['ID','Name','Block','Lot','Purpose','ID Type','Time In','Time Out','Status','Guard']];
  STATE.visitors.forEach(v=>rows.push([v.id,v.visitor_name,v.visiting_block,v.visiting_lot,v.purpose,v.id_type,v.time_in_fmt||v.time_in,v.time_out_fmt||v.time_out||'',v.status,v.guard_name||'']));
  dlCSV(rows,'villa_purita_visitors_'+new Date().toISOString().split('T')[0]+'.csv');
}
function dlDues() {
  const rows=[['Pay ID','Resident','Block','Lot','Month','Amount','Date Paid','Method','Ref','Status']];
  STATE.payments.forEach(p=>rows.push([p.id,p.last_name+' '+p.first_name,p.block,p.lot_number,p.billing_month,p.amount,p.date_paid_fmt||p.date_paid||'',p.payment_method||'',p.reference_number||'',p.status]));
  dlCSV(rows,'villa_purita_dues_'+new Date().toISOString().split('T')[0]+'.csv');
}
function dlIncidents() {
  const rows=[['ID','Type','Block','Lot','Priority','Status','Reporter','Time','Description']];
  STATE.incidents.forEach(i=>rows.push([i.id,i.incident_type,i.block,i.lot_number||'',i.priority,i.status,i.reporter_name||'',i.created_fmt||i.created_at,i.description]));
  dlCSV(rows,'villa_purita_incidents_'+new Date().toISOString().split('T')[0]+'.csv');
}
function dlActivity()  { dlCSV([['User','Action','Time'],
  [SESSION.name,'Session export',new Date().toLocaleString('en-PH')]],
  'villa_purita_activity.csv'); }
function dlBlockLot() {
  const rows=[['Block','Last Name','First Name','Lot','Status','Occupancy']];
  STATE.residents.forEach(r=>rows.push([r.block,r.last_name,r.first_name,r.lot_number,r.status,r.occupancy_status]));
  dlCSV(rows,'villa_purita_blocklot.csv');
}

// ══════════════════════════════════════════════════════════════════════════════
// GUARD CONSOLE
// ══════════════════════════════════════════════════════════════════════════════
function guardSearch(q) {
  const res = document.getElementById('guard-results');
  if (!q||!res) { if(res) res.innerHTML=''; return; }
  const m = STATE.residents.filter(r=>(r.first_name+' '+r.last_name+' '+r.block+' lot '+r.lot_number).toLowerCase().includes(q.toLowerCase()));
  res.innerHTML = m.slice(0,5).map(r =>
    `<div style="padding:9px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <div><div style="font-size:13px;font-weight:600;">${r.last_name}, ${r.first_name}</div>
      <div style="font-size:11px;color:var(--text3);">${r.block} · Lot ${r.lot_number} · ${r.occupancy_status}</div></div>
      <button class="btn btn-primary" style="padding:4px 10px;font-size:11px;" onclick="guardLocate(${r.id})">📍 Locate</button>
    </div>`).join('') || '<div style="font-size:12px;color:var(--text3);">No residents found.</div>';
}

function guardLocate(rid) {
  if (!guardMap) { initGuardMap(); setTimeout(()=>guardLocate(rid), 600); return; }
  const e = guardMapMarkers.find(m=>m.r.id===rid);
  if (!e) return;
  guardMap.setView(e.coords, 19, {animate:true});
  e.m.setIcon(L.divIcon({className:'',html:'<div style="width:20px;height:20px;background:#3b82f6;border:3px solid #fff;border-radius:4px;box-shadow:0 0 12px #3b82f6;animation:pulse 1.5s infinite;"></div>',iconSize:[20,20],iconAnchor:[10,10]}));
  e.m.openPopup();
  setTimeout(()=>e.m.setIcon(makeIcon(resColor(e.r))), 3000);
  toast(`📍 Navigating to: ${e.r.last_name}, ${e.r.first_name}`, 'info');
}

async function guardLogEntry() {
  const nameEl    = document.querySelector('#panel-guard .card:nth-child(2) input[placeholder="Full name"]');
  const destEl    = document.querySelector('#panel-guard .card:nth-child(2) input[placeholder="Block & Lot or Resident name"]');
  const purposeEl = document.querySelector('#panel-guard .card:nth-child(2) select');
  const idEl      = document.querySelector('#panel-guard .card:nth-child(2) input[placeholder="ID type"]');
  const name = nameEl?.value.trim(); const dest = destEl?.value.trim(); const idType = idEl?.value.trim();
  if (!name||!dest||!idType) { toast('Fill in visitor name, destination, and ID type.','error'); return; }
  const parts = dest.match(/Block ([A-D])\s+(?:Lot\s*)?(\w+)/i);
  const block = parts ? 'Block '+parts[1] : dest;
  const lot   = parts ? parts[2] : '?';
  try {
    await api('/visitors/entry', 'POST', { visitor_name:name, block, lot, purpose:purposeEl?.value||'Guest Visit', id_type:idType });
    if(nameEl) nameEl.value=''; if(destEl) destEl.value=''; if(idEl) idEl.value='';
    STATE.visitors = await api('/visitors');
    renderGuardVisitors(); renderVisitors(); updateBadges();
    toast(`✅ ${name} logged in at ${new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}`);
  } catch(e) { toast('Log failed: '+e.message,'error'); }
}

function renderGuardVisitors() {
  const tbody = document.getElementById('guard-inside-tbody');
  if (!tbody) return;
  const inside = STATE.visitors.filter(v=>v.status==='Inside');
  tbody.innerHTML = inside.map(v =>
    `<tr>
      <td class="td-name">${v.visitor_name}</td>
      <td>${v.purpose}</td>
      <td>${v.visiting_block} Lot ${v.visiting_lot}</td>
      <td>${v.time_in_fmt||v.time_in||'—'}</td>
      <td><button class="btn btn-danger" style="padding:4px 8px;font-size:11px;" onclick="logExit(${v.id})">Exit</button></td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text3);">No visitors inside.</td></tr>';
}

// ══════════════════════════════════════════════════════════════════════════════
// LIVE DASHBOARD RENDERING — All 3 roles
// ══════════════════════════════════════════════════════════════════════════════

function renderAllDashboards() {
  if (SESSION.role === 'Administrator') renderAdminDashboard();
  else if (SESSION.role === 'Guard')    renderGuardDashboard();
  else                                  renderHomeownerDashboard();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relDate(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return diff + ' days ago';
  if (diff < 14) return '1 week ago';
  if (diff < 30) return Math.floor(diff/7) + ' weeks ago';
  return Math.floor(diff/30) + ' month(s) ago';
}

const CAT_ALERT = { General:'alert-blue', Urgent:'alert-red', Event:'alert-green', Maintenance:'alert-yellow', 'Payment Reminder':'alert-purple' };
const CAT_ICON  = { General:'📢', Urgent:'🚨', Event:'🎉', Maintenance:'🚧', 'Payment Reminder':'💰' };
const CAT_TC    = { 'alert-blue':'#93c5fd','alert-red':'#f87171','alert-green':'#6ee7b7','alert-yellow':'#fbbf24','alert-purple':'#c084fc' };
const PUR_ICON  = { Delivery:'📦', 'Guest Visit':'🧑', 'Utility/Repair':'🔧', Family:'👨‍👩‍👧', Business:'💼', Other:'🚗' };
const INC_CLS   = { Open:'alert-red','In Progress':'alert-yellow', Resolved:'alert-green', Closed:'alert-blue' };
const INC_ICON  = { Open:'🚨','In Progress':'⚠️', Resolved:'✅', Closed:'📁' };

function annCard(a, limit=60) {
  const cls = CAT_ALERT[a.category]||'alert-blue';
  return `<div class="alert ${cls}" style="margin-bottom:8px;">
    <span class="alert-icon">${CAT_ICON[a.category]||'📢'}</span>
    <div>
      <strong>${a.title}</strong><br>
      <span style="font-size:11px;">${a.content.substring(0,limit)}${a.content.length>limit?'…':''}</span><br>
      <span style="font-size:10px;color:${CAT_TC[cls]||'#93c5fd'}">${relDate(a.post_date)}</span>
    </div>
  </div>`;
}

function visitorRow(v) {
  const icon = PUR_ICON[v.purpose]||'🚗';
  const tin  = v.time_in_fmt||v.time_in||'';
  const tout = v.time_out_fmt||v.time_out||'';
  return `<div class="visitor-row">
    <div class="visitor-avatar">${icon}</div>
    <div class="visitor-info">
      <div class="visitor-name">${v.visitor_name}</div>
      <div class="visitor-detail">${v.visiting_block} Lot ${v.visiting_lot} · ${v.purpose}${tin?' · IN: '+tin:''}${tout?' OUT: '+tout:''}</div>
    </div>
    ${badge(v.status)}
  </div>`;
}

function incidentRow(inc) {
  const cls  = INC_CLS[inc.status]||'alert-blue';
  const icon = INC_ICON[inc.status]||'🔔';
  return `<div class="alert ${cls}" style="margin-bottom:8px;">
    <span class="alert-icon">${icon}</span>
    <div style="flex:1;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
        <strong style="font-size:12px;">INC-${inc.id} — ${inc.incident_type}</strong>${badge(inc.priority)}
      </div>
      <div style="font-size:11px;opacity:.85;">${inc.description.substring(0,60)}${inc.description.length>60?'…':''}</div>
      <div style="font-size:10px;opacity:.6;margin-top:3px;">${inc.block}${inc.lot_number?' Lot '+inc.lot_number:''} · ${inc.reporter_name||'—'}</div>
    </div>
  </div>`;
}

// ── ADMIN Dashboard ───────────────────────────────────────────────────────────
function renderAdminDashboard() {
  // Alerts feed: open incidents + visitors inside + overdue dues
  const alertsFeed = document.getElementById('admin-alerts-feed');
  if (alertsFeed) {
    const openInc  = STATE.incidents.filter(i=>i.status==='Open').slice(0,2);
    const insideVis= STATE.visitors.filter(v=>v.status==='Inside').slice(0,2);
    const overdueP = STATE.payments.filter(p=>p.status==='Overdue').slice(0,1);
    let html = '';
    openInc.forEach(inc => {
      html += `<div class="alert alert-red" style="margin-bottom:8px;"><span class="alert-icon">🚨</span><div>
        <strong>INC-${inc.id} — ${inc.incident_type}</strong><br>
        <span style="font-size:11px;">${inc.block}${inc.lot_number?' Lot '+inc.lot_number:''} · ${inc.priority} priority</span><br>
        <span style="font-size:10px;color:#f87171">${relDate(inc.created_at||inc.created_fmt)}</span>
      </div></div>`;
    });
    insideVis.forEach(v => {
      html += `<div class="alert alert-blue" style="margin-bottom:8px;"><span class="alert-icon">🔔</span><div>
        <strong>Visitor Inside: ${v.visitor_name}</strong><br>
        <span style="font-size:11px;">${v.visiting_block} Lot ${v.visiting_lot} · ${v.purpose}</span><br>
        <span style="font-size:10px;color:#93c5fd">IN: ${v.time_in_fmt||v.time_in||'—'}</span>
      </div></div>`;
    });
    overdueP.forEach(p => {
      html += `<div class="alert alert-yellow" style="margin-bottom:8px;"><span class="alert-icon">⚠️</span><div>
        <strong>Overdue Dues: ${p.last_name}, ${p.first_name}</strong><br>
        <span style="font-size:11px;">${p.block} Lot ${p.lot_number} · ${p.billing_month}</span><br>
        <span style="font-size:10px;color:#fbbf24">₱${parseFloat(p.amount||0).toLocaleString()} outstanding</span>
      </div></div>`;
    });
    if (!html) html = '<div class="alert alert-green"><span class="alert-icon">✅</span><div><strong>All Clear</strong><br><span style="font-size:11px;">No open incidents or urgent alerts.</span></div></div>';
    alertsFeed.innerHTML = html;
  }

  // Duty status feed - show current active shifts
  const dutyFeed = document.getElementById('admin-duty-status');
  if (dutyFeed && STATE.shifts) {
    const activeShifts = STATE.shifts.filter(s => s.status === 'Active');
    if (activeShifts.length > 0) {
      let html = '';
      activeShifts.forEach(shift => {
        const startTime = new Date(shift.start_time);
        const timeString = startTime.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        html += `<div class="alert alert-blue" style="margin-bottom:8px;">
          <span class="alert-icon">🛡️</span>
          <div>
            <strong>${shift.first_name} ${shift.last_name}</strong><br>
            <span style="font-size:11px;">On duty since ${timeString}</span><br>
            <span style="font-size:10px;color:#93c5fd">Shift ID: ${shift.id}</span>
          </div>
        </div>`;
      });
      dutyFeed.innerHTML = html;
    } else {
      dutyFeed.innerHTML = '<div class="alert alert-yellow"><span class="alert-icon">⚠️</span><div><strong>No Active Shifts</strong><br><span style="font-size:11px;">No guards currently on duty.</span></div></div>';
    }
  }

  // Announcements feed
  const annFeed = document.getElementById('admin-ann-feed');
  if (annFeed) {
    annFeed.innerHTML = STATE.announcements.length
      ? STATE.announcements.slice(0,4).map(a=>annCard(a,80)).join('')
      : '<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px;">No announcements yet.</div>';
  }

  // Visitors feed
  const visFeed = document.getElementById('admin-visitors-feed');
  if (visFeed) {
    const recent = STATE.visitors.slice(0,5);
    visFeed.innerHTML = recent.length
      ? recent.map(visitorRow).join('')
      : '<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px;">No visitors logged.</div>';
  }
}

// ── GUARD Dashboard ───────────────────────────────────────────────────────────
function renderGuardDashboard() {
  // Alerts feed: open + in-progress incidents
  const alertsFeed = document.getElementById('guard-alerts-feed');
  if (alertsFeed) {
    const active = STATE.incidents.filter(i=>i.status==='Open'||i.status==='In Progress').slice(0,4);
    alertsFeed.innerHTML = active.length
      ? active.map(incidentRow).join('')
      : '<div class="alert alert-green"><span class="alert-icon">✅</span><div><strong>No active incidents</strong><br><span style="font-size:11px;">All clear on patrol.</span></div></div>';
  }

  // Visitors feed (currently inside first)
  const visFeed = document.getElementById('guard-visitors-feed');
  if (visFeed) {
    const sorted = [...STATE.visitors].sort((a,b)=>(a.status==='Inside'?-1:1)).slice(0,5);
    visFeed.innerHTML = sorted.length
      ? sorted.map(visitorRow).join('')
      : '<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px;">No visitors logged today.</div>';
  }

  // Recent incidents feed
  const incFeed = document.getElementById('guard-incidents-feed');
  if (incFeed) {
    const recent = STATE.incidents.slice(0,4);
    incFeed.innerHTML = recent.length
      ? recent.map(incidentRow).join('')
      : '<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px;">No incidents recorded.</div>';
  }

  // Refresh stat cards
  const gv = document.querySelectorAll('#panel-dashboard-guard .stat-value');
  if (gv[0]) gv[0].textContent = STATE.visitors.length;
  if (gv[1]) gv[1].textContent = STATE.incidents.filter(i=>i.status==='Open').length;
  if (gv[3]) gv[3].textContent = STATE.visitors.length; // Entries logged = total visitors today

  // Update shift start time
  const shiftEl = document.getElementById('guard-shift-start');
  const shiftStatusEl = document.getElementById('guard-shift-status');
  if (shiftEl && shiftStatusEl) {
    if (STATE.shift && STATE.shift.start_time) {
      const startTime = new Date(STATE.shift.start_time);
      shiftEl.textContent = startTime.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});
      shiftStatusEl.textContent = STATE.shift.status === 'Active' ? 'On duty' : 'Off duty';
    } else {
      shiftEl.textContent = '--:--';
      shiftStatusEl.textContent = 'Off duty';
    }
  }

  // Add click handler for shift card
  const shiftCard = document.getElementById('guard-shift-start')?.closest('.stat-card');
  if (shiftCard) {
    shiftCard.onclick = function(event) {
      // Only trigger if clicking on the shift card itself, not child elements
      if (event.target.closest('.stat-card') === shiftCard) {
        toggleShift();
      }
    };
  }
}

// ── HOMEOWNER Dashboard ───────────────────────────────────────────────────
function renderHomeownerDashboard() {
  const myResident = STATE.residents.find(r =>
    (r.user_id && r.user_id === SESSION.userId) ||
    (r.username && r.username === SESSION.username) ||
    (r.first_name + ' ' + r.last_name).toLowerCase() === SESSION.name.toLowerCase()
  );

  // Stat: property
  const propEl = document.getElementById('ho-stat-property');
  if (propEl) {
    propEl.textContent = myResident
      ? myResident.block.replace('Block ','B-') + ' / L-' + String(myResident.lot_number).padStart(2,'0')
      : 'N/A';
  }

  // Stat: dues — show pending bill count if any
  const myPayments = myResident
    ? STATE.payments.filter(p => p.resident_id === myResident.id || (p.last_name === myResident.last_name && p.first_name === myResident.first_name))
    : [];
  const pendingBills = myPayments.filter(p => p.status !== 'Paid');
  const latestPay = [...myPayments].sort((a,b)=>new Date(b.billing_month)-new Date(a.billing_month))[0];
  const duesEl    = document.getElementById('ho-stat-dues');
  const duesSubEl = document.getElementById('ho-stat-dues-sub');
  if (duesEl)    duesEl.textContent    = pendingBills.length > 0 ? pendingBills.length : (latestPay ? '✓' : '—');
  if (duesSubEl) duesSubEl.textContent = pendingBills.length > 0
    ? `${pendingBills.length} bill${pendingBills.length>1?'s':''} pending — visit office`
    : (latestPay ? 'All paid · '+latestPay.billing_month : 'No records');

  // Pending bills alert banner — show if any unpaid bills issued
  const existingBanner = document.getElementById('ho-bills-banner');
  if (existingBanner) existingBanner.remove();
  if (pendingBills.length > 0) {
    const qActions = document.querySelector('#panel-dashboard-homeowner > div:nth-child(2)');
    if (qActions) {
      const banner = document.createElement('div');
      banner.id = 'ho-bills-banner';
      banner.className = 'alert alert-yellow';
      banner.style.cssText = 'margin-bottom:14px;cursor:pointer;';
      banner.onclick = () => showPanel('dues', document.querySelector('[onclick*=dues]'));
      banner.innerHTML = `<span class="alert-icon">📋</span><div>
        <strong>${pendingBills.length} pending bill${pendingBills.length>1?'s':''} issued by Admin</strong><br>
        <span style="font-size:11px;">Total due: ₱${pendingBills.reduce((s,p)=>s+parseFloat(p.amount||0),0).toLocaleString()} — Please come to the office to pay. Click to view.</span>
      </div>`;
      qActions.before(banner);
    }
  }

  // Stat: visitors
  const myBlock    = myResident?.block;
  const myLot      = myResident?.lot_number;
  const myVisitors = STATE.visitors.filter(v => v.visiting_block===myBlock && String(v.visiting_lot)===String(myLot));
  const insideCount= myVisitors.filter(v=>v.status==='Inside').length;
  const visEl    = document.getElementById('ho-stat-visitors');
  const visSubEl = document.getElementById('ho-stat-visitors-sub');
  if (visEl)    visEl.textContent    = insideCount;
  if (visSubEl) visSubEl.textContent = insideCount===0?'None inside':'Currently inside';

  // Stat: announcements
  const annEl = document.getElementById('ho-stat-ann');
  if (annEl) annEl.textContent = STATE.announcements.length;

  // Community Announcements feed
  const annFeed = document.getElementById('ho-announcements-feed');
  if (annFeed) {
    annFeed.innerHTML = STATE.announcements.length
      ? STATE.announcements.slice(0,5).map(a=>annCard(a,60)).join('')
      : '<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px;">No announcements.</div>';
  }

  // Payment history table
  const payTbody = document.getElementById('ho-payments-tbody');
  if (payTbody) {
    payTbody.innerHTML = myPayments.length
      ? [...myPayments].slice(0,6).map(p=>`
          <tr>
            <td>${p.billing_month}</td>
            <td>₱${parseFloat(p.amount||0).toLocaleString()}</td>
            <td>${badge(p.status)}</td>
            <td>${p.date_paid_fmt||p.date_paid||'<span style="color:var(--text3)">—</span>'}</td>
          </tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text3);">No payment records found.</td></tr>';
  }

  // Recent visitors for this property (also shows visitor notifications)
  const visFeed = document.getElementById('ho-visitors-feed');
  if (visFeed) {
    // Highlight visitors currently inside
    const inside = myVisitors.filter(v=>v.status==='Inside');
    const rest   = myVisitors.filter(v=>v.status!=='Inside').slice(0,3);
    const allShow = [...inside, ...rest];
    visFeed.innerHTML = allShow.length
      ? allShow.map(v => {
          const isNew = v.status === 'Inside';
          return `<div class="visitor-row" style="${isNew?'background:rgba(59,130,246,.05);border-radius:8px;':''}">
            <div class="visitor-avatar">${({Delivery:'📦','Guest Visit':'🧑','Utility/Repair':'🔧',Family:'👨‍👩‍👧',Business:'💼',Other:'🚗'})[v.purpose]||'🚗'}</div>
            <div class="visitor-info">
              <div class="visitor-name">${v.visitor_name}${isNew?' <span style="font-size:10px;color:var(--accent);font-weight:600;">● INSIDE</span>':''}</div>
              <div class="visitor-detail">${v.purpose} · IN: ${v.time_in_fmt||v.time_in||'—'}${v.time_out_fmt?' OUT: '+v.time_out_fmt:''}</div>
            </div>
            ${badge(v.status)}
          </div>`;
        }).join('')
      : '<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px;">No recent visitors for your property.</div>';
  }
}

// ── Homeowner Pay Modal: pre-fill resident info ───────────────────────────────
function prepareHomeownerPayModal() {
  const modal = document.getElementById('ho-pay-modal');
  if (!modal) return;
  modal.addEventListener('click', e => { if(e.target===modal) closeModal('ho-pay-modal'); });

  // Set current month
  const today = new Date().toISOString().slice(0,7);
  const monthEl = document.getElementById('ho-pay-month');
  if (monthEl) monthEl.value = today;

  // Find this homeowner's resident record
  const myResident = STATE.residents.find(r =>
    (r.user_id && r.user_id === SESSION.userId) ||
    (r.username && r.username === SESSION.username) ||
    (r.first_name + ' ' + r.last_name).toLowerCase() === SESSION.name.toLowerCase()
  );

  if (myResident) {
    document.getElementById('ho-pay-resident-id').value = myResident.id;
    document.getElementById('ho-pay-resident-name').textContent = myResident.last_name + ', ' + myResident.first_name;
    document.getElementById('ho-pay-resident-lot').textContent  = myResident.block + ' · Lot ' + myResident.lot_number;
    // Latest dues status
    const myPayments = STATE.payments.filter(p =>
      p.resident_id === myResident.id || (p.last_name===myResident.last_name && p.first_name===myResident.first_name)
    );
    const latest = [...myPayments].sort((a,b)=>new Date(b.billing_month)-new Date(a.billing_month))[0];
    const statusEl = document.getElementById('ho-pay-current-status');
    if (statusEl && latest) {
      const color = {Paid:'var(--green)',Overdue:'var(--red)',Partial:'var(--yellow)',Unpaid:'var(--text3)'}[latest.status]||'var(--text3)';
      statusEl.innerHTML = `Last payment: <strong style="color:${color}">${latest.status}</strong> — ${latest.billing_month} · ₱${parseFloat(latest.amount||0).toLocaleString()}`;
    }
  } else {
    const nameEl = document.getElementById('ho-pay-resident-name');
    const lotEl = document.getElementById('ho-pay-resident-lot');
    if (nameEl) nameEl.textContent = 'No registered property';
    if (lotEl) lotEl.textContent = 'N/A';
    const statusEl = document.getElementById('ho-pay-current-status');
    if (statusEl) statusEl.textContent = 'Add your lot record to view dues information.';
  }
}

async function saveHomeownerPayment() {
  const resId  = document.getElementById('ho-pay-resident-id')?.value;
  const month  = document.getElementById('ho-pay-month')?.value;
  const amount = document.getElementById('ho-pay-amount')?.value;
  const method = document.getElementById('ho-pay-method')?.value;
  const ref    = document.getElementById('ho-pay-ref')?.value.trim();
  const notes  = document.getElementById('ho-pay-notes')?.value.trim();
  const errEl  = document.getElementById('ho-pay-error');
  if (!resId||!month||!amount) { errEl.textContent='Month and amount are required.'; errEl.style.display='block'; return; }
  const btn = document.querySelector('#ho-pay-modal .btn-success');
  btn.textContent='Submitting…'; btn.disabled=true;
  try {
    await api('/dues/payment', 'POST', { resident_id:parseInt(resId), billing_month:month, amount:parseFloat(amount), payment_method:method, reference_number:ref||null, notes:notes||null });
    closeModal('ho-pay-modal');
    errEl.style.display='none';
    STATE.payments = await api('/dues');
    renderAllDashboards(); refreshDashboardStats();
    toast(`✅ Payment of ₱${parseFloat(amount).toLocaleString()} submitted for ${month}!`);
  } catch(e) { errEl.textContent=e.message; errEl.style.display='block'; }
  btn.textContent='💳 Submit Payment'; btn.disabled=false;
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS (from STATE)
// ══════════════════════════════════════════════════════════════════════════════
function refreshDashboardStats() {
  const totalRes  = STATE.residents.length;
  const insideVis = STATE.visitors.filter(v=>v.status==='Inside').length;
  const todayVis  = STATE.visitors.length;
  const openInc   = STATE.incidents.filter(i=>i.status==='Open').length;
  const paid      = STATE.payments.filter(p=>p.status==='Paid');
  const overdue   = STATE.payments.filter(p=>p.status==='Overdue').length;
  const collected = paid.reduce((s,p)=>s+parseFloat(p.amount||0),0);
  const sv = document.querySelectorAll('#panel-dashboard-admin .stat-value');
  const sc = document.querySelectorAll('#panel-dashboard-admin .stat-change');
  if(sv[0]) sv[0].textContent=totalRes;
  if(sv[1]) sv[1].textContent=totalRes;
  if(sv[2]) sv[2].textContent='₱'+collected.toLocaleString();
  if(sv[3]) sv[3].textContent=overdue;
  if(sv[4]) sv[4].textContent=todayVis;
  if(sv[5]) sv[5].textContent=openInc;
  if(sc[3]) sc[3].textContent=overdue+' need follow-up';
  if(sc[4]) sc[4].textContent=insideVis+' currently inside';
  if(sc[5]) sc[5].textContent=openInc>0?'⚠ Needs attention':'All clear ✓';
  const gv = document.querySelectorAll('#panel-dashboard-guard .stat-value');
  if(gv[0]) gv[0].textContent=todayVis;
  if(gv[1]) gv[1].textContent=openInc;
  updateBadges();
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL SEARCH
// ══════════════════════════════════════════════════════════════════════════════
function globalSearch(q) {
  const res = document.getElementById('global-search-results');
  if (!q) { res.innerHTML='<div style="font-size:12px;color:var(--text3);">Start typing to search…</div>'; return; }
  const ql=q.toLowerCase();
  const rm=STATE.residents.filter(r=>(r.first_name+' '+r.last_name+' '+r.block+' lot '+r.lot_number).toLowerCase().includes(ql));
  const vm=STATE.visitors.filter(v=>v.visitor_name.toLowerCase().includes(ql));
  const im=STATE.incidents.filter(i=>(i.incident_type+' '+i.block).toLowerCase().includes(ql));
  let html='';
  if(rm.length){ html+=`<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Residents (${rm.length})</div>`;
    html+=rm.slice(0,4).map(r=>`<div style="padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="closeModal('search-modal');showPanel('residents',document.querySelector('[onclick*=residents]'));setTimeout(()=>viewResident(${r.id}),300)">
      <span style="font-size:20px;">🏠</span><div><div style="font-size:13px;font-weight:600;">${r.last_name}, ${r.first_name}</div><div style="font-size:11px;color:var(--text3);">${r.block}·Lot ${r.lot_number}·${r.status}</div></div></div>`).join('');}
  if(vm.length){ html+=`<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin:10px 0 6px;">Visitors (${vm.length})</div>`;
    html+=vm.slice(0,3).map(v=>`<div style="padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="closeModal('search-modal');showPanel('visitors',document.querySelector('[onclick*=visitors]'))">
      <span style="font-size:20px;">🚗</span><div><div style="font-size:13px;font-weight:600;">${v.visitor_name}</div><div style="font-size:11px;color:var(--text3);">${v.visiting_block} Lot ${v.visiting_lot}·${v.purpose}·${v.status}</div></div></div>`).join('');}
  if(im.length){ html+=`<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin:10px 0 6px;">Incidents (${im.length})</div>`;
    html+=im.slice(0,3).map(i=>`<div style="padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="closeModal('search-modal');showPanel('incidents',document.querySelector('[onclick*=incidents]'))">
      <span style="font-size:20px;">🚨</span><div><div style="font-size:13px;font-weight:600;">INC-${i.id}: ${i.incident_type}</div><div style="font-size:11px;color:var(--text3);">${i.block}·${i.priority}·${i.status}</div></div></div>`).join('');}
  res.innerHTML = html || `<div style="font-size:12px;color:var(--text3);padding:10px 0;">No results for "${q}"</div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// CLOCK + INIT
// ══════════════════════════════════════════════════════════════════════════════
function updateClock() {
  let c = document.getElementById('tclock');
  if (!c) {
    c = document.createElement('span'); c.id='tclock';
    c.style.cssText='font-size:11px;color:var(--text3);font-family:monospace;padding:4px 8px;background:var(--bg3);border-radius:6px;white-space:nowrap;';
    const tbar = document.querySelector('.topbar-actions')||document.getElementById('topbar');
    if (tbar) tbar.insertBefore(c, tbar.firstChild);
  }
  const now = new Date();
  c.textContent = now.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric'})
    + ' ' + now.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

document.addEventListener('DOMContentLoaded', () => {
  // Extra CSS
  const s = document.createElement('style');
  s.textContent = `
    @keyframes toastIn{from{transform:translateX(110%);opacity:0;}to{transform:translateX(0);opacity:1;}}
    @keyframes toastOut{from{transform:translateX(0);}to{transform:translateX(110%);opacity:0;}}
    @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.4);}50%{box-shadow:0 0 0 10px rgba(59,130,246,0);}}
    .leaflet-popup-content-wrapper,.leaflet-popup-tip{background:#141c2e!important;border:1px solid #1e2d47!important;color:#e2e8f0!important;box-shadow:0 8px 24px rgba(0,0,0,.5)!important;}
    .leaflet-popup-close-button{color:#94a3b8!important;}
    .leaflet-control-zoom a{background:#141c2e!important;color:#94a3b8!important;border-color:#1e2d47!important;}
    .leaflet-control-zoom a:hover{background:#1a2235!important;color:#3b82f6!important;}
  `;
  document.head.appendChild(s);

  // Set today's date in date fields
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('ann-postdate') && (document.getElementById('ann-postdate').value = today);

  // Modal overlay click-to-close
  document.querySelectorAll('.modal-overlay').forEach(o =>
    o.addEventListener('click', e => { if(e.target===o) o.classList.remove('open'); }));

  // Enter key login
  document.getElementById('login-pass')?.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  document.getElementById('login-user')?.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

  // Search box open
  document.querySelector('.search-box')?.addEventListener('click', () => {
    if (SESSION.loggedIn) openModal('search-modal');
  });

  // Guard visitor inside table
  const guardPanel = document.getElementById('panel-guard');
  if (guardPanel) {
    const firstCol = guardPanel.querySelector('.grid-1-2 > div:first-child');
    if (firstCol && !document.getElementById('guard-inside-tbody')) {
      const tCard = document.createElement('div');
      tCard.className='card';
      tCard.innerHTML=`<div class="card-header"><div class="card-title">🚶 Visitors Currently Inside</div></div>
        <div class="table-wrap"><table><thead><tr><th>Visitor</th><th>Purpose</th><th>Visiting</th><th>Time In</th><th>Exit</th></tr></thead>
        <tbody id="guard-inside-tbody"><tr><td colspan="5" style="text-align:center;color:var(--text3);padding:14px;">Loading…</td></tr></tbody></table></div>`;
      firstCol.appendChild(tCard);
    }
    // Wire guard quick log button
    const logBtn = guardPanel.querySelector('.card:nth-child(2) .btn-success');
    if (logBtn) logBtn.onclick = guardLogEntry;
  }

  // Check if already logged in (session resumption)
  api('/auth/me').then(user => {
    if (user?.role) {
      selectedRole = user.role;
      SESSION = { role:user.role, username:user.username, name:user.first_name+' '+user.last_name, userId:user.id, loggedIn:true };
      completeLogin({ ...user, full_name: user.first_name+' '+user.last_name });
    }
  }).catch(() => {}); // Not logged in — show login screen normally

  // Search init text
  const sr = document.getElementById('global-search-results');
  if (sr) sr.innerHTML = '<div style="font-size:12px;color:var(--text3);">Start typing to search residents, visitors, incidents…</div>';

  setInterval(updateClock, 1000); updateClock();
});
