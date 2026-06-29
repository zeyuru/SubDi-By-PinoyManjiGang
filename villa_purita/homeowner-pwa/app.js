// ══════════════════════════════════════════════════════════════════════════
// VILLA PURITA — HOMEOWNER PWA
// Talks to the SAME backend API used by the main dashboard (../api).
// Offline-first: dues / announcements / incidents / visitors are cached by
// the service worker and re-rendered from cache when the network is down.
// ══════════════════════════════════════════════════════════════════════════

console.log('%c[Villa Purita Homeowner PWA] v1', 'color:#0284c7;font-weight:bold;');

// Base path of this PWA, e.g. https://site.com/villa_purita/homeowner-pwa
const BASE_URL = window.location.pathname.replace(/\/[^/]*$/, '').replace(/\/$/, '');
// API lives one level up, at <project-root>/api  (../api relative to homeowner-pwa/)
const API = BASE_URL.replace(/\/homeowner-pwa$/, '') + '/api';

const CENTER = [10.258089561887017, 123.8020430653793];
const VILLA_PURITA_COORDS = [10.257339, 123.801205];

const BLOCK_OFFSETS = {
  'Block A': [+0.0012, +0.002], 'Block B': [+0.0022, +0.0005],
  'Block C': [-0.0012, +0.003], 'Block D': [-0.0022, -0.002],
};
const RESIDENT_COORD_ADJUSTMENTS = {
  'Block A|1': [0.00100, -0.00000],
  'Block B|1': [0.0022, -0.001],
  'Block C|1': [0.00080, -0.00018],
};

let SESSION = { role:'', username:'', name:'', email:'', status:'', userId:0, loggedIn:false };
let STATE = { residents:[], visitors:[], payments:[], incidents:[], announcements:[], myResident:null };
let IS_OFFLINE = false;

let dashMap = null, fullMap = null, incMap = null;
let incPin = null, incPinCoords = null;
let currentPayTab = 'gcash';

// ══════════════════════════════════════════════════════════════════════════
// API HELPER
// ══════════════════════════════════════════════════════════════════════════
async function api(path, method = 'GET', body = null) {
  const opts = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch(API + path, opts);
  } catch (e) {
    throw new Error('NETWORK_OFFLINE');
  }
  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error('Server returned an invalid response.');
  }
  if (!json.success) throw new Error(json.error || 'Request failed.');
  return json.data;
}

// ══════════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════════
function toast(msg, type = 'success') {
  const icons = { success: '✅', error: '❌', info: '🔔', warning: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="font-size:16px">${icons[type] || '🔔'}</span><span style="flex:1;line-height:1.4">${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 3800);
}

// ══════════════════════════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════════════════════════
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.addEventListener('click', (e) => {
  document.querySelectorAll('.modal-overlay.open').forEach((o) => {
    if (e.target === o) o.classList.remove('open');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// OFFLINE DETECTION
// ══════════════════════════════════════════════════════════════════════════
function setOfflineUI(offline) {
  IS_OFFLINE = offline;
  document.getElementById('offline-pill')?.classList.toggle('show', offline);
  ['dash', 'dues', 'incidents', 'ann'].forEach((p) => {
    document.getElementById(`${p}-cached-banner`)?.classList.toggle('show', offline);
  });
}
window.addEventListener('online', () => { setOfflineUI(false); toast('Back online — refreshing…', 'info'); refreshAllData(); });
window.addEventListener('offline', () => { setOfflineUI(true); toast("You're offline. Showing last saved data.", 'warning'); });

// ══════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════
async function doLogin() {
  const username = document.getElementById('login-user')?.value.trim();
  const password = document.getElementById('login-pass')?.value;
  const errEl = document.getElementById('login-error');
  errEl.classList.remove('show');
  if (!username || !password) {
    errEl.textContent = 'Enter your username and password.';
    errEl.classList.add('show');
    return;
  }
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Signing in…';
  btn.disabled = true;
  try {
    const user = await api('/auth/login', 'POST', { username, password });
    if (user.role !== 'Homeowner') {
      // SECURITY: the backend has no concept of "which app" is calling /auth/login, so it
      // just authenticated this non-Homeowner account and set a real, valid session cookie
      // in this browser. We must not just hide the dashboard client-side — we have to
      // actively destroy that session server-side, or a valid admin/guard session would be
      // left sitting in this browser, reachable by anything that skips this check (a JS
      // error, a stale cached script, or a future code path).
      try { await api('/auth/logout', 'POST'); } catch (e) {}
      errEl.textContent = `This account is registered as ${user.role}. This app is for Homeowner accounts only. Please use the main system instead.`;
      errEl.classList.add('show');
      btn.textContent = 'Sign In →';
      btn.disabled = false;
      return;
    }
    SESSION = { role: user.role, username: user.username, name: user.full_name, userId: user.user_id, loggedIn: true };
    await completeLogin();
  } catch (e) {
    errEl.textContent = e.message === 'NETWORK_OFFLINE'
      ? "You're offline. Connect to the internet to sign in."
      : (e.message || 'Login failed.');
    errEl.classList.add('show');
    btn.textContent = 'Sign In →';
    btn.disabled = false;
  }
}

async function completeLogin() {
  closeModal('forgot-modal');
  resetForgotForm();
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = '';
  document.getElementById('topbar-name').textContent = SESSION.name || 'Homeowner';

  await loadAllData();
  await loadUserProfile();

  renderDashboard();
  renderDues();
  renderVisitors();
  renderIncidents();
  renderAnnouncements();
  updateBadges();
  goPage('dashboard');

  setTimeout(initDashMap, 350);
  setInterval(pollLiveData, 30000);
}

async function doLogout() {
  closeModal('profile-modal');
  try { await api('/auth/logout', 'POST'); } catch (e) {}
  SESSION = { role: '', username: '', name: '', email: '', status: '', userId: 0, loggedIn: false };
  STATE = { residents: [], visitors: [], payments: [], incidents: [], announcements: [], myResident: null };
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

// ══════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════════════════════════════════════
async function loadAllData() {
  const tasks = [
    api('/residents').then((d) => { STATE.residents = d || []; }).catch(() => {}),
    api('/visitors').then((d) => { STATE.visitors = d || []; }).catch(() => {}),
    api('/dues').then((d) => { STATE.payments = d || []; }).catch(() => {}),
    api('/incidents').then((d) => { STATE.incidents = d || []; }).catch(() => {}),
    api('/announcements').then((d) => { STATE.announcements = d || []; }).catch(() => {}),
  ];
  await Promise.allSettled(tasks);
  resolveMyResident();
}

async function loadUserProfile() {
  try {
    const profile = await api('/auth/me');
    SESSION.email = profile.email || '';
    SESSION.username = profile.username || SESSION.username;
    SESSION.status = profile.status || 'Active';
    SESSION.name = profile.first_name && profile.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : (profile.full_name || SESSION.name);
    SESSION.userId = profile.id || SESSION.userId;
    document.getElementById('topbar-name').textContent = SESSION.name || 'Homeowner';
    resolveMyResident();
    return profile;
  } catch (e) {
    return null;
  }
}

function resolveMyResident() {
  STATE.myResident = STATE.residents.find((r) =>
    (r.user_id && r.user_id === SESSION.userId) ||
    (r.username && r.username === SESSION.username) ||
    (r.first_name + ' ' + r.last_name).toLowerCase() === (SESSION.name || '').toLowerCase()
  ) || null;
}

async function pollLiveData() {
  if (!SESSION.loggedIn) return;
  try {
    const [visitors, incidents, announcements, payments] = await Promise.all([
      api('/visitors'), api('/incidents'), api('/announcements'), api('/dues'),
    ]);
    STATE.visitors = visitors || STATE.visitors;
    STATE.incidents = incidents || STATE.incidents;
    STATE.announcements = announcements || STATE.announcements;
    STATE.payments = payments || STATE.payments;
    setOfflineUI(false);
    renderDashboard();
    renderDues();
    renderVisitors();
    renderIncidents();
    renderAnnouncements();
    updateBadges();
  } catch (e) {
    if (e.message === 'NETWORK_OFFLINE') setOfflineUI(true);
  }
}

async function refreshAllData() {
  try {
    await loadAllData();
    renderDashboard(); renderDues(); renderVisitors(); renderIncidents(); renderAnnouncements();
    updateBadges();
  } catch (e) {}
}

// ══════════════════════════════════════════════════════════════════════════
// NAVIGATION (bottom nav + pages)
// ══════════════════════════════════════════════════════════════════════════
function goPage(name) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById(`page-${name}`)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.page === name));
  document.getElementById('main').scrollTo({ top: 0, behavior: 'instant' });

  if (name === 'map') setTimeout(initFullMap, 150);
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS — formatting / badges
// ══════════════════════════════════════════════════════════════════════════
function badge(text) {
  const map = {
    Paid: 'badge-green', Inside: 'badge-green', Resolved: 'badge-blue',
    Open: 'badge-red', Overdue: 'badge-red', Left: 'badge-blue', Pending: 'badge-yellow',
    Partial: 'badge-yellow', 'In Progress': 'badge-yellow', Unpaid: 'badge-gray',
    High: 'badge-red', Medium: 'badge-yellow', Low: 'badge-blue',
  };
  return `<span class="badge ${map[text] || 'badge-gray'}"><span class="badge-dot"></span>${text}</span>`;
}

function peso(n) { return '₱' + parseFloat(n || 0).toLocaleString(); }

const CAT_ALERT = { General: 'alert-blue', Urgent: 'alert-red', Event: 'alert-green', Maintenance: 'alert-yellow', 'Payment Reminder': 'alert-purple' };
const CAT_ICON  = { General: '📢', Urgent: '🚨', Event: '🎉', Maintenance: '🚧', 'Payment Reminder': '💰' };
const PUR_ICON  = { Delivery: '📦', 'Guest Visit': '🧑', 'Utility/Repair': '🔧', Family: '👨‍👩‍👧', Business: '💼', Other: '🚗' };
const INC_ALERT = { Open: 'alert-red', 'In Progress': 'alert-yellow', Resolved: 'alert-green', Closed: 'alert-blue' };
const INC_ICON  = { Open: '🚨', 'In Progress': '⚠️', Resolved: '✅', Closed: '📁' };

function relDate(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return diff + ' days ago';
  if (diff < 14) return '1 week ago';
  if (diff < 30) return Math.floor(diff / 7) + ' weeks ago';
  return Math.floor(diff / 30) + ' month(s) ago';
}

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
function myBills() {
  const r = STATE.myResident;
  if (!r) return [];
  return STATE.payments.filter((p) => p.resident_id === r.id || (p.last_name === r.last_name && p.first_name === r.first_name));
}
function myVisitors() {
  const r = STATE.myResident;
  if (!r) return [];
  return STATE.visitors.filter((v) => v.visiting_block === r.block && String(v.visiting_lot) === String(r.lot_number));
}

function renderDashboard() {
  const r = STATE.myResident;

  document.getElementById('stat-property').textContent = r
    ? r.block.replace('Block ', 'B-') + ' / L-' + String(r.lot_number).padStart(2, '0')
    : 'N/A';

  const bills = myBills();
  const pending = bills.filter((p) => p.status !== 'Paid');
  const latest = [...bills].sort((a, b) => new Date(b.billing_month) - new Date(a.billing_month))[0];
  document.getElementById('stat-dues').textContent = pending.length > 0 ? pending.length : (latest ? '✓' : '—');
  document.getElementById('stat-dues-sub').textContent = pending.length > 0
    ? `${pending.length} bill${pending.length > 1 ? 's' : ''} pending`
    : (latest ? 'All paid · ' + latest.billing_month : 'No records');

  // Pending bills banner
  const bannerWrap = document.getElementById('bills-banner-wrap');
  if (pending.length > 0) {
    const total = pending.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    bannerWrap.innerHTML = `
      <div class="alert alert-yellow" style="cursor:pointer;" onclick="goPage('dues')">
        <span class="alert-icon">📋</span>
        <div><strong>${pending.length} pending bill${pending.length > 1 ? 's' : ''} issued by Admin</strong><br>
        <span style="font-size:11px;">Total due: ${peso(total)} — tap to view & pay.</span></div>
      </div>`;
  } else {
    bannerWrap.innerHTML = '';
  }

  // Pay button state
  const payable = bills.filter((p) => ['Unpaid', 'Overdue', 'Partial'].includes(p.status)).length;
  const underReview = bills.filter((p) => p.status === 'Pending').length;
  const payBtn = document.getElementById('qa-pay-btn');
  payBtn.disabled = false;
  if (payable > 0) {
    payBtn.innerHTML = '<span class="qa-icon">💳</span><span>Pay My Dues</span>';
  } else if (underReview > 0) {
    payBtn.disabled = true;
    payBtn.innerHTML = '<span class="qa-icon">⏳</span><span>Under Review</span>';
  } else {
    payBtn.disabled = true;
    payBtn.innerHTML = '<span class="qa-icon">✅</span><span>Dues Paid</span>';
  }

  // Visitors stat
  const vis = myVisitors();
  const inside = vis.filter((v) => v.status === 'Inside');
  document.getElementById('stat-visitors').textContent = inside.length;

  // Announcements stat
  document.getElementById('stat-ann').textContent = STATE.announcements.length;

  // Announcements feed (top 5)
  const annFeed = document.getElementById('dash-ann-feed');
  annFeed.innerHTML = STATE.announcements.length
    ? STATE.announcements.slice(0, 5).map((a) => annCardHtml(a, 70)).join('')
    : '<div class="empty-state">No announcements yet.</div>';

  // Payment history (top 6)
  const payTbody = document.getElementById('dash-pay-tbody');
  payTbody.innerHTML = bills.length
    ? [...bills].slice(0, 6).map((p) => `
        <tr><td>${p.billing_month}</td><td>${peso(p.amount)}</td><td>${badge(p.status)}</td>
        <td>${p.date_paid_fmt || p.date_paid || '<span class="text-muted">—</span>'}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty-state">No payment records found.</td></tr>';

  // Visitors feed
  const visFeed = document.getElementById('dash-visitors-feed');
  const rest = vis.filter((v) => v.status !== 'Inside').slice(0, 3);
  const allShow = [...inside, ...rest];
  visFeed.innerHTML = allShow.length
    ? allShow.map((v) => visitorRowHtml(v)).join('')
    : '<div class="empty-state">No recent visitors for your property.</div>';
}

function annCardHtml(a, limit) {
  const cls = CAT_ALERT[a.category] || 'alert-blue';
  return `<div class="alert ${cls}">
    <span class="alert-icon">${CAT_ICON[a.category] || '📢'}</span>
    <div><strong>${a.title}</strong><br>
    <span style="font-size:11px;">${(a.content || '').substring(0, limit)}${(a.content || '').length > limit ? '…' : ''}</span><br>
    <span style="font-size:10px;opacity:.75;">${relDate(a.created_at || a.post_date)}</span></div>
  </div>`;
}

function visitorRowHtml(v) {
  const isInside = v.status === 'Inside';
  return `<div class="row-item">
    <div class="row-avatar">${PUR_ICON[v.purpose] || '🚗'}</div>
    <div class="row-info">
      <div class="row-title">${v.visitor_name}${isInside ? ' <span style="color:var(--accent);font-size:10px;">● INSIDE</span>' : ''}</div>
      <div class="row-sub">${v.purpose} · IN: ${v.time_in_fmt || v.time_in || '—'}${v.time_out_fmt ? ' OUT: ' + v.time_out_fmt : ''}</div>
    </div>
    ${badge(v.status)}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// DUES & PAYMENT
// ══════════════════════════════════════════════════════════════════════════
function renderDues() {
  const bills = myBills();
  const pendingCount = bills.filter((p) => p.status !== 'Paid').length;
  document.getElementById('dues-count-label').textContent = pendingCount > 0
    ? `${pendingCount} pending bill${pendingCount > 1 ? 's' : ''}` : 'All paid ✓';

  const tbody = document.getElementById('dues-tbody');
  tbody.innerHTML = bills.length
    ? bills.map((p) => {
        const isPaid = p.status === 'Paid';
        const isPending = p.status === 'Pending';
        let actionBtn;
        if (isPaid) {
          actionBtn = `<span style="font-size:11px;color:var(--green);">✅ Paid</span>`;
        } else if (isPending) {
          actionBtn = `<span style="font-size:11px;color:var(--accent);">🔍 Review</span>`;
        } else {
          actionBtn = `<button class="btn btn-primary btn-sm" onclick="openPayModal(${p.id})">💳 Pay</button>`;
        }
        return `<tr>
          <td>${p.billing_month}</td>
          <td style="font-size:11px;color:var(--text2);max-width:140px;white-space:normal;">${p.description || p.notes || 'Monthly dues'}</td>
          <td><strong>${peso(p.amount)}</strong></td>
          <td>${badge(p.status)}${p.rejection_reason ? `<div style="font-size:10px;color:var(--red);margin-top:2px;">Rejected: ${p.rejection_reason}</div>` : ''}</td>
          <td>${actionBtn}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5" class="empty-state">No bills issued to you yet.</td></tr>';
}

function openPayModal(preselectDueId) {
  const bills = myBills();
  const payable = bills.filter((p) => ['Unpaid', 'Overdue', 'Partial'].includes(p.status));
  const pendingReview = bills.filter((p) => p.status === 'Pending');

  if (payable.length === 0) {
    if (pendingReview.length > 0) toast('⏳ Your payment is currently under review by the admin.', 'info');
    else toast('✅ All your dues are already paid. Nothing to pay right now.', 'info');
    return;
  }
  if (IS_OFFLINE) {
    toast("You're offline. Connect to the internet to submit a payment.", 'warning');
    return;
  }

  const sel = document.getElementById('pay-due-id');
  sel.innerHTML = '<option value="">— Select a bill —</option>' +
    payable.map((p) => `<option value="${p.id}">${p.billing_month} — ${peso(p.amount)} (${p.status})</option>`).join('');
  if (preselectDueId) sel.value = preselectDueId;

  switchPayTab('gcash');
  ['gcash-ref', 'maya-ref'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['gcash-proof', 'maya-proof'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['gcash-preview', 'maya-preview'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  ['gcash-error', 'maya-error'].forEach((id) => { const el = document.getElementById(id); if (el) el.classList.remove('show'); });
  document.getElementById('pay-bill-info').style.display = 'none';
  document.getElementById('pay-rejected-notice').style.display = 'none';
  document.getElementById('pay-submit-btn').style.display = 'none';
  onPayBillChange();
  openModal('pay-modal');
}

function onPayBillChange() {
  const dueId = parseInt(document.getElementById('pay-due-id')?.value || 0);
  const infoEl = document.getElementById('pay-bill-info');
  const rejEl = document.getElementById('pay-rejected-notice');
  const submitBtn = document.getElementById('pay-submit-btn');
  if (!dueId) {
    infoEl.style.display = 'none';
    rejEl.style.display = 'none';
    submitBtn.style.display = 'none';
    return;
  }
  const p = STATE.payments.find((x) => x.id === dueId);
  if (!p) return;
  infoEl.style.display = '';
  infoEl.innerHTML = `<strong>${p.billing_month}</strong> — ${peso(p.amount)} ${badge(p.status)}<br>
    <span style="font-size:11px;color:var(--text2);">${p.description || 'Monthly association dues'}</span>`;
  if (p.rejection_reason) {
    rejEl.style.display = '';
    rejEl.innerHTML = `<span class="alert-icon">⚠️</span><div><strong>Previously Rejected:</strong> ${p.rejection_reason}<br><span style="font-size:11px;">Please re-submit with correct proof.</span></div>`;
  } else {
    rejEl.style.display = 'none';
  }
  submitBtn.style.display = currentPayTab !== 'office' ? '' : 'none';
}

function switchPayTab(tab) {
  currentPayTab = tab;
  ['gcash', 'maya', 'office'].forEach((t) => {
    document.getElementById(`tab-${t}`)?.classList.toggle('active', t === tab);
    const pane = document.getElementById(`pane-${t}`);
    if (pane) pane.style.display = t === tab ? '' : 'none';
  });
  const dueId = document.getElementById('pay-due-id')?.value;
  document.getElementById('pay-submit-btn').style.display = (tab !== 'office' && dueId) ? '' : 'none';
}

['gcash-proof', 'maya-proof'].forEach((inputId) => {
  document.addEventListener('change', (e) => {
    if (e.target.id !== inputId) return;
    const type = inputId.includes('gcash') ? 'gcash' : 'maya';
    const previewDiv = document.getElementById(`${type}-preview`);
    const previewImg = document.getElementById(`${type}-preview-img`);
    const file = e.target.files[0];
    if (file && previewDiv && previewImg) {
      const reader = new FileReader();
      reader.onload = (ev) => { previewImg.src = ev.target.result; previewDiv.style.display = ''; };
      reader.readAsDataURL(file);
    }
  });
});

function openQrZoom(src, title) {
  document.getElementById('qr-zoom-img').src = src;
  document.getElementById('qr-zoom-title').textContent = title;
  openModal('qr-zoom-modal');
}

async function submitPayment() {
  if (IS_OFFLINE) { toast("You're offline. Connect to the internet to submit a payment.", 'warning'); return; }
  const dueId = parseInt(document.getElementById('pay-due-id')?.value || 0);
  if (!dueId) { toast('Please select a bill first.', 'error'); return; }

  const tab = currentPayTab;
  const refEl = document.getElementById(`${tab}-ref`);
  const proofEl = document.getElementById(`${tab}-proof`);
  const errEl = document.getElementById(`${tab}-error`);
  const ref = refEl?.value.trim() || '';
  const proof = proofEl?.files[0];

  errEl.classList.remove('show');
  if (!ref) { errEl.textContent = 'Reference number is required.'; errEl.classList.add('show'); return; }
  if (!proof) { errEl.textContent = 'Please upload a proof of transaction image.'; errEl.classList.add('show'); return; }

  const method = tab === 'gcash' ? 'GCash' : 'Maya';
  const formData = new FormData();
  formData.append('due_id', dueId);
  formData.append('payment_method', method);
  formData.append('reference_number', ref);
  formData.append('proof_image', proof);

  const btn = document.getElementById('pay-submit-btn');
  btn.textContent = 'Submitting…'; btn.disabled = true;
  try {
    const resp = await fetch(API + '/dues/submit-proof', { method: 'POST', body: formData, credentials: 'include' });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.error || 'Submission failed.');
    closeModal('pay-modal');
    STATE.payments = await api('/dues');
    renderDues(); renderDashboard();
    toast(`📤 Payment submitted via ${method}! Waiting for admin review.`, 'success');
  } catch (e) {
    errEl.textContent = e.message === 'NETWORK_OFFLINE' ? "You're offline." : e.message;
    errEl.classList.add('show');
  }
  btn.textContent = '📤 Submit Payment'; btn.disabled = false;
}

// ══════════════════════════════════════════════════════════════════════════
// VISITORS
// ══════════════════════════════════════════════════════════════════════════
function renderVisitors() {
  const vis = myVisitors();
  const insideCount = vis.filter((v) => v.status === 'Inside').length;
  document.getElementById('visitors-count-label').textContent = insideCount > 0
    ? `${insideCount} currently inside` : `${vis.length} total record${vis.length === 1 ? '' : 's'}`;

  const list = document.getElementById('visitors-list');
  list.innerHTML = vis.length
    ? vis.map((v) => visitorRowHtml(v)).join('')
    : '<div class="empty-state">No visitors recorded for your property.</div>';
}

// ══════════════════════════════════════════════════════════════════════════
// INCIDENTS
// ══════════════════════════════════════════════════════════════════════════
function renderIncidents() {
  const list = document.getElementById('incidents-list');
  const sorted = [...STATE.incidents].sort((a, b) => new Date(b.reported_at || b.created_at || 0) - new Date(a.reported_at || a.created_at || 0));
  list.innerHTML = sorted.length
    ? sorted.map((i) => `
      <div class="alert ${INC_ALERT[i.status] || 'alert-blue'}">
        <span class="alert-icon">${INC_ICON[i.status] || '🚨'}</span>
        <div style="flex:1;">
          <div class="flex-between"><strong>INC-${i.id} — ${(i.priority || '').toUpperCase()}</strong>${badge(i.status)}</div>
          <div style="font-size:12px;margin-top:2px;">${i.incident_type}${i.description ? ' — ' + i.description : ''}</div>
          <div style="font-size:10.5px;color:var(--text3);margin-top:4px;">${i.block || ''}${i.lot_number ? ' Lot ' + i.lot_number : ''} · ${relDate(i.reported_at || i.created_at)}</div>
        </div>
      </div>`).join('')
    : '<div class="empty-state">No incidents reported yet.</div>';
}

function openIncidentModal() {
  if (IS_OFFLINE) { toast("You're offline. Connect to the internet to report an incident.", 'warning'); return; }
  openModal('incident-modal');
  setTimeout(initIncidentMap, 250);
}

function initIncidentMap() {
  const container = document.getElementById('inc-map');
  if (!container) return;
  if (incMap) { incMap.remove(); incMap = null; }
  incPin = null; incPinCoords = null;

  document.getElementById('inc-pin-status').style.color = 'var(--yellow)';
  document.getElementById('inc-pin-status').textContent = '⚠️ No pin set yet — tap the map';
  document.getElementById('inc-coords-display').textContent = 'No pin set — tap the map above';

  // Default block to the homeowner's own property (most incidents are reported near home);
  // auto-detect-from-pin only overrides this if the field is still empty.
  const blockEl = document.getElementById('inc-block');
  if (blockEl && !blockEl.value && STATE.myResident) blockEl.value = STATE.myResident.block;
  if (blockEl && !blockEl.dataset.selectOnFocusBound) {
    blockEl.dataset.selectOnFocusBound = '1';
    blockEl.addEventListener('focus', () => blockEl.select());
  }

  incMap = L.map('inc-map', { zoomControl: true, attributionControl: false }).setView(CENTER, 17);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20 }).addTo(incMap);
  addSubdivisionLabel(incMap);

  const alertIcon = L.divIcon({
    html: '<div style="font-size:24px;line-height:1;filter:drop-shadow(0 2px 5px rgba(0,0,0,.5));">🚨</div>',
    className: '', iconAnchor: [12, 24],
  });

  incMap.on('click', (e) => {
    const { lat, lng } = e.latlng;
    if (incPin) incMap.removeLayer(incPin);
    incPin = L.marker([lat, lng], { icon: alertIcon }).addTo(incMap);
    incPin.bindPopup('📍 Incident Location').openPopup();
    incPinCoords = { lat, lng };
    document.getElementById('inc-pin-status').style.color = 'var(--green)';
    document.getElementById('inc-pin-status').textContent = '✅ Location pinned';
    document.getElementById('inc-coords-display').textContent = '📍 Pinned: ' + lat.toFixed(6) + ', ' + lng.toFixed(6);
    autoDetectBlock(lat, lng);
  });

  setTimeout(() => incMap.invalidateSize(), 150);
}

function autoDetectBlock(lat, lng) {
  const blockEl = document.getElementById('inc-block');
  if (!blockEl || blockEl.value) return;
  let closest = null, minDist = Infinity;
  Object.entries(BLOCK_OFFSETS).forEach(([block, [dlat, dlng]]) => {
    const dist = Math.hypot(lat - (CENTER[0] + dlat), lng - (CENTER[1] + dlng));
    if (dist < minDist) { minDist = dist; closest = block; }
  });
  if (closest) blockEl.value = closest;
}

async function saveIncident() {
  if (IS_OFFLINE) { toast("You're offline. Connect to the internet to report an incident.", 'warning'); return; }
  const type = document.getElementById('inc-type')?.value;
  const priority = document.getElementById('inc-priority')?.value;
  const block = document.getElementById('inc-block')?.value || (STATE.myResident ? STATE.myResident.block : '');
  const lot = document.getElementById('inc-lot')?.value.trim();
  const desc = document.getElementById('inc-desc')?.value.trim();
  const errEl = document.getElementById('inc-error');
  errEl.classList.remove('show');

  if (!incPinCoords) {
    errEl.textContent = '📍 Please pin the exact incident location on the map before submitting.';
    errEl.classList.add('show');
    return;
  }
  if (!desc) { errEl.textContent = 'Please describe the incident.'; errEl.classList.add('show'); return; }
  if (!block) { errEl.textContent = 'Please specify the block.'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('inc-submit-btn');
  btn.textContent = 'Sending…'; btn.disabled = true;
  try {
    await api('/incidents', 'POST', {
      incident_type: type, description: desc, priority, block,
      lot_number: lot || null, latitude: incPinCoords.lat, longitude: incPinCoords.lng,
    });
    closeModal('incident-modal');
    document.getElementById('inc-desc').value = '';
    document.getElementById('inc-lot').value = '';
    document.getElementById('inc-block').value = '';
    incPinCoords = null;
    STATE.incidents = await api('/incidents');
    renderIncidents(); updateBadges();
    toast(`🚨 Incident reported: ${type} at ${block}${lot ? ' Lot ' + lot : ''}. Guards notified!`, 'error');
  } catch (e) {
    errEl.textContent = e.message === 'NETWORK_OFFLINE' ? "You're offline." : e.message;
    errEl.classList.add('show');
  }
  btn.textContent = '🚨 Send Alert'; btn.disabled = false;
}

// ══════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ══════════════════════════════════════════════════════════════════════════
function renderAnnouncements() {
  const list = document.getElementById('ann-list');
  list.innerHTML = STATE.announcements.length
    ? STATE.announcements.map((a) => `
      <div style="border:1px solid var(--border);border-radius:12px;padding:13px;margin-bottom:10px;">
        <div class="flex-between" style="margin-bottom:6px;"><strong style="font-size:13px;">${a.title}</strong>${badge(a.category || 'General')}</div>
        <div style="font-size:12.5px;color:var(--text2);margin-bottom:8px;line-height:1.5;">${a.content || ''}</div>
        <div style="font-size:10.5px;color:var(--text3);">Posted ${relDate(a.created_at || a.post_date)}</div>
      </div>`).join('')
    : '<div class="empty-state">No announcements yet.</div>';
}

// ══════════════════════════════════════════════════════════════════════════
// NAV BADGES
// ══════════════════════════════════════════════════════════════════════════
function updateBadges() {
  const openInc = STATE.incidents.filter((i) => i.status === 'Open').length;
  const pendingBills = myBills().filter((p) => p.status !== 'Paid').length;

  const incBadge = document.getElementById('nb-incidents');
  incBadge.style.display = openInc > 0 ? 'flex' : 'none';
  incBadge.textContent = openInc;

  const duesBadge = document.getElementById('nb-dues');
  duesBadge.style.display = pendingBills > 0 ? 'flex' : 'none';
  duesBadge.textContent = pendingBills;

  document.getElementById('notif-dot').classList.toggle('show', openInc > 0);
}

// ══════════════════════════════════════════════════════════════════════════
// PROFILE / ACCOUNT SETTINGS
// ══════════════════════════════════════════════════════════════════════════
function openProfileModal() {
  document.getElementById('prof-fullname').textContent = SESSION.name || '—';
  document.getElementById('prof-username').textContent = SESSION.username || '—';
  document.getElementById('prof-role').textContent = SESSION.role || '—';
  document.getElementById('prof-status').textContent = SESSION.status || 'Active';
  document.getElementById('prof-email').value = SESSION.email || '';
  const r = STATE.myResident;
  document.getElementById('prof-property').textContent = r
    ? `${r.block.replace('Block ', 'B-')} / L-${String(r.lot_number).padStart(2, '0')}` : 'N/A';
  document.getElementById('prof-error').classList.remove('show');
  document.getElementById('prof-pass').value = '';
  document.getElementById('prof-pass2').value = '';
  openModal('profile-modal');
}

async function saveProfile() {
  if (IS_OFFLINE) { toast("You're offline. Connect to the internet to update your profile.", 'warning'); return; }
  const email = document.getElementById('prof-email')?.value.trim();
  const pass = document.getElementById('prof-pass')?.value;
  const pass2 = document.getElementById('prof-pass2')?.value;
  const errEl = document.getElementById('prof-error');
  errEl.classList.remove('show');
  if (pass && pass !== pass2) { errEl.textContent = 'Passwords do not match.'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('prof-save-btn');
  btn.textContent = 'Saving…'; btn.disabled = true;
  try {
    await api('/users/account', 'POST', { email: email || null, password: pass || null });
    SESSION.email = email || '';
    closeModal('profile-modal');
    toast('✅ Profile updated.');
  } catch (e) {
    errEl.textContent = e.message === 'NETWORK_OFFLINE' ? "You're offline." : e.message;
    errEl.classList.add('show');
  }
  btn.textContent = 'Save Changes'; btn.disabled = false;
}

// ══════════════════════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ══════════════════════════════════════════════════════════════════════════
async function doForgotPassword() {
  const email = document.getElementById('forgot-email')?.value.trim();
  const errEl = document.getElementById('forgot-error');
  errEl.classList.remove('show');
  if (!email) { errEl.textContent = 'Please enter your email address.'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('forgot-submit-btn');
  btn.textContent = 'Sending…'; btn.disabled = true;
  try {
    await api('/auth/forgot-password', 'POST', { email });
    document.getElementById('forgot-form').style.display = 'none';
    document.getElementById('forgot-success').style.display = '';
    document.getElementById('forgot-footer').innerHTML =
      `<button class="btn btn-primary btn-block" onclick="closeModal('forgot-modal');resetForgotForm()">Done</button>`;
  } catch (e) {
    errEl.textContent = e.message === 'NETWORK_OFFLINE' ? "You're offline." : e.message;
    errEl.classList.add('show');
    btn.textContent = '📧 Send New Password'; btn.disabled = false;
  }
}

function resetForgotForm() {
  document.getElementById('forgot-form').style.display = '';
  document.getElementById('forgot-success').style.display = 'none';
  document.getElementById('forgot-email').value = '';
  document.getElementById('forgot-error').classList.remove('show');
  document.getElementById('forgot-footer').innerHTML =
    `<button class="btn btn-ghost" onclick="closeModal('forgot-modal');resetForgotForm()">Cancel</button>
     <button class="btn btn-primary" id="forgot-submit-btn" onclick="doForgotPassword()">📧 Send New Password</button>`;
}

// ══════════════════════════════════════════════════════════════════════════
// MAPS
// ══════════════════════════════════════════════════════════════════════════
function tiles() {
  return L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20 });
}

function addSubdivisionLabel(map) {
  L.circleMarker(VILLA_PURITA_COORDS, { radius: 9, color: '#fff', fillColor: '#fff', fillOpacity: 0.95, weight: 2, interactive: false }).addTo(map);
  L.circleMarker(VILLA_PURITA_COORDS, { radius: 4, color: '#0284c7', fillColor: '#0284c7', fillOpacity: 1, weight: 0, interactive: false }).addTo(map);
  L.marker(VILLA_PURITA_COORDS, {
    icon: L.divIcon({
      className: '', iconSize: [120, 30], iconAnchor: [60, 40],
      html: '<div style="background:rgba(2,132,199,.92);color:#fff;font-size:10.5px;font-weight:700;padding:5px 10px;border-radius:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3);">🏘️ Villa Purita</div>',
    }),
  }).addTo(map);
}

function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      <div style="font-size:20px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4));">🏠</div>
      <div style="width:8px;height:8px;background:${color};border:2px solid #fff;border-radius:50%;margin-top:-3px;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>
    </div>`,
    iconSize: [24, 32], iconAnchor: [12, 32],
  });
}

function resColor(r) {
  if (r.status === 'Inactive') return '#94a3b8';
  if (r.status === 'Pending') return '#d97706';
  const dues = r.dues_status || 'Unpaid';
  if (dues === 'Overdue') return '#dc2626';
  if (dues === 'Partial') return '#d97706';
  if (dues === 'Paid') return '#059669';
  return '#d97706';
}

function resCoords(r) {
  if (r.latitude && r.longitude) return [parseFloat(r.latitude), parseFloat(r.longitude)];
  const key = `${r.block}|${String(r.lot_number).trim()}`;
  const custom = RESIDENT_COORD_ADJUSTMENTS[key];
  if (custom) return [CENTER[0] + custom[0], CENTER[1] + custom[1]];
  const [dlat, dlng] = BLOCK_OFFSETS[r.block] || [0, 0];
  return [CENTER[0] + dlat, CENTER[1] + dlng];
}

function buildHomeownerMapLayers(map) {
  const r = STATE.myResident;
  if (r) {
    const coords = resCoords(r);
    L.marker(coords, { icon: makeIcon(resColor(r)) }).addTo(map).bindPopup(
      `<div style="min-width:160px;"><strong>${r.last_name}, ${r.first_name}</strong><br>
       <span style="font-size:11px;color:#64748b;">${r.block} · Lot ${r.lot_number}</span></div>`
    );
    map.setView(coords, 19);
  }
  // Active incidents
  STATE.incidents.filter((i) => i.status !== 'Resolved').forEach((inc) => {
    let ilat, ilng;
    if (inc.latitude && inc.longitude) { ilat = parseFloat(inc.latitude); ilng = parseFloat(inc.longitude); }
    else { const [dlat, dlng] = BLOCK_OFFSETS[inc.block] || [0, 0]; ilat = CENTER[0] + dlat; ilng = CENTER[1] + dlng; }
    const color = inc.status === 'In Progress' ? '#f97316' : '#ef4444';
    L.marker([ilat, ilng], {
      icon: L.divIcon({ className: '', html: `<div style="width:14px;height:14px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px ${color};"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }),
    }).addTo(map).bindPopup(`<b>🚨 INC-${inc.id}</b><br>${inc.incident_type}<br>${inc.block}${inc.lot_number ? ' Lot ' + inc.lot_number : ''}`);
  });
  // My visitors currently inside
  if (r) {
    STATE.visitors.filter((v) => v.visiting_block === r.block && String(v.visiting_lot) === String(r.lot_number) && v.status === 'Inside').forEach((v) => {
      const coords = resCoords(r);
      L.marker(coords, {
        icon: L.divIcon({ className: '', html: `<div style="font-size:16px;transform:translate(14px,-14px);">${PUR_ICON[v.purpose] || '🚗'}</div>`, iconSize: [0, 0] }),
      }).addTo(map).bindPopup(`<b>${v.visitor_name}</b><br>${v.purpose} — Inside`);
    });
  }
}

function initDashMap() {
  const container = document.getElementById('dash-map');
  if (!container || container._leaflet_id) return;
  dashMap = L.map('dash-map', { zoomControl: false, attributionControl: false }).setView(CENTER, 17);
  tiles().addTo(dashMap);
  addSubdivisionLabel(dashMap);
  buildHomeownerMapLayers(dashMap);
  setTimeout(() => dashMap.invalidateSize(), 150);
}

function initFullMap() {
  const container = document.getElementById('full-map');
  if (!container) return;
  if (fullMap) { fullMap.invalidateSize(); return; }
  fullMap = L.map('full-map', { zoomControl: true, attributionControl: false }).setView(CENTER, 17);
  tiles().addTo(fullMap);
  addSubdivisionLabel(fullMap);
  buildHomeownerMapLayers(fullMap);
  setTimeout(() => fullMap.invalidateSize(), 150);
}

// ══════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-pass')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-user')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

  setOfflineUI(!navigator.onLine);

  // Try resuming an existing session
  api('/auth/me').then(async (user) => {
    if (user?.role === 'Homeowner') {
      SESSION = { role: user.role, username: user.username, name: user.first_name + ' ' + user.last_name, userId: user.id, loggedIn: true };
      completeLogin();
    } else if (user?.role) {
      // SECURITY: a non-Homeowner session is active in this browser (most likely because
      // someone typed admin/guard credentials into this app before this safeguard existed,
      // or logged into the main system in the same browser). Destroy it immediately rather
      // than just hiding the dashboard — an undestroyed session cookie is a standing risk.
      try { await api('/auth/logout', 'POST'); } catch (e) {}
      document.getElementById('login-error').textContent = `That account was registered as ${user.role}. This app is for Homeowner accounts only — please use the main system instead.`;
      document.getElementById('login-error').classList.add('show');
    }
  }).catch(() => {}); // Not logged in (or offline) — show login screen normally

  // Register service worker for offline support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  }
});
