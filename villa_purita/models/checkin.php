<?php
// Visitor QR Check-in Page — no login required
// Served at: /villa_purita/checkin.php?token=xxx
$token = htmlspecialchars(trim($_GET['token'] ?? ''));
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>Villa Purita — Visitor Check-in</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px 48px;
  }
  .logo {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 28px; margin-top: 8px;
  }
  .logo-icon {
    width: 40px; height: 40px; background: #3b82f6;
    border-radius: 10px; display: flex; align-items: center;
    justify-content: center; font-size: 20px;
  }
  .logo-text { font-size: 15px; font-weight: 700; color: #f1f5f9; }
  .logo-sub  { font-size: 11px; color: #64748b; }
  .card {
    background: #1e293b; border: 1px solid #334155;
    border-radius: 16px; padding: 24px; width: 100%;
    max-width: 420px; margin-bottom: 16px;
  }
  .resident-badge {
    background: #0f172a; border: 1px solid #334155;
    border-radius: 12px; padding: 16px; margin-bottom: 20px;
    display: flex; align-items: center; gap: 14px;
  }
  .resident-icon { font-size: 32px; flex-shrink: 0; }
  .resident-name { font-size: 16px; font-weight: 700; color: #f1f5f9; }
  .resident-addr { font-size: 12px; color: #64748b; margin-top: 2px; }
  label { display: block; font-size: 11px; font-weight: 600;
          color: #94a3b8; text-transform: uppercase;
          letter-spacing: .05em; margin-bottom: 6px; margin-top: 16px; }
  input, select {
    width: 100%; padding: 11px 14px; font-size: 14px;
    background: #0f172a; border: 1px solid #334155;
    border-radius: 10px; color: #e2e8f0; outline: none;
    font-family: inherit;
  }
  input:focus, select:focus { border-color: #3b82f6; }
  select option { background: #1e293b; }
  .btn {
    width: 100%; padding: 14px; font-size: 15px; font-weight: 700;
    border: none; border-radius: 12px; cursor: pointer;
    font-family: inherit; margin-top: 20px; transition: opacity .15s;
  }
  .btn:active { opacity: .8; }
  .btn-primary { background: #3b82f6; color: #fff; }
  .btn-maps    { background: #10b981; color: #fff; }
  .btn-disabled{ background: #334155; color: #64748b; cursor: not-allowed; }
  .timer {
    text-align: center; font-size: 12px; color: #f59e0b;
    margin-top: 10px; font-weight: 600;
  }
  .msg {
    border-radius: 10px; padding: 14px 16px;
    font-size: 13px; margin-bottom: 16px; line-height: 1.5;
  }
  .msg-error   { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3); color: #f87171; }
  .msg-success { background: rgba(16,185,129,.1); border: 1px solid rgba(16,185,129,.3); color: #34d399; }
  .msg-warn    { background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.3); color: #fbbf24; }
  .section-title {
    font-size: 17px; font-weight: 700; color: #f1f5f9; margin-bottom: 4px;
  }
  .section-sub { font-size: 12px; color: #64748b; margin-bottom: 16px; }
  #step-loading, #step-form, #step-success, #step-expired { display: none; }
  .spinner {
    width: 36px; height: 36px; border: 3px solid #334155;
    border-top-color: #3b82f6; border-radius: 50%;
    animation: spin .7s linear infinite; margin: 24px auto;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .success-icon { font-size: 56px; text-align: center; margin-bottom: 12px; }
</style>
</head>
<body>

<div class="logo">
  <div class="logo-icon">🏘️</div>
  <div>
    <div class="logo-text">Villa Purita</div>
    <div class="logo-sub">Subdivision Management</div>
  </div>
</div>

<?php if (!$token): ?>
  <div class="card">
    <div class="msg msg-error">⚠️ No QR token provided. Please scan a valid Villa Purita visitor QR code.</div>
  </div>
<?php else: ?>

<!-- Loading -->
<div class="card" id="step-loading" style="display:block;">
  <div class="spinner"></div>
  <div style="text-align:center;font-size:13px;color:#64748b;">Verifying QR code…</div>
</div>

<!-- Expired / Invalid -->
<div class="card" id="step-expired">
  <div style="text-align:center;padding:8px 0;">
    <div style="font-size:48px;margin-bottom:12px;">⏰</div>
    <div class="section-title">QR Code Expired</div>
    <div class="section-sub" style="margin-top:6px;" id="expired-msg">This QR code has expired or is no longer valid.</div>
    <div style="font-size:12px;color:#475569;margin-top:16px;">Please ask the homeowner or guard to generate a new QR code.</div>
  </div>
</div>

<!-- Check-in Form -->
<div class="card" id="step-form">
  <div class="section-title">🚪 Visitor Check-in</div>
  <div class="section-sub">You're visiting:</div>
  <div class="resident-badge">
    <div class="resident-icon">🏠</div>
    <div>
      <div class="resident-name" id="res-name">—</div>
      <div class="resident-addr" id="res-addr">—</div>
    </div>
  </div>
  <div id="form-error" class="msg msg-error" style="display:none;"></div>
  <div class="timer" id="timer-display"></div>

  <label>Your Full Name *</label>
  <input type="text" id="v-name" placeholder="e.g. Juan Dela Cruz" autocomplete="name">

  <label>Purpose of Visit *</label>
  <select id="v-purpose">
    <option value="Guest Visit">Guest Visit</option>
    <option value="Delivery">Delivery</option>
    <option value="Family">Family</option>
    <option value="Utility/Repair">Utility / Repair</option>
    <option value="Business">Business</option>
    <option value="Other">Other</option>
  </select>

  <label>ID Type (optional)</label>
  <input type="text" id="v-id" placeholder="e.g. Driver's License, Student ID">

  <button class="btn btn-primary" id="submit-btn" onclick="submitCheckin()">✅ Check In</button>
</div>

<!-- Success -->
<div class="card" id="step-success">
  <div class="success-icon">🎉</div>
  <div style="text-align:center;">
    <div class="section-title">Check-in Successful!</div>
    <div class="section-sub" style="margin-top:6px;">You've been logged into the visitor record.</div>
  </div>
  <div style="background:#0f172a;border:1px solid #334155;border-radius:10px;padding:14px;margin:16px 0;font-size:13px;">
    <div style="color:#64748b;font-size:11px;margin-bottom:4px;">VISITING</div>
    <div id="success-addr" style="font-weight:700;color:#f1f5f9;"></div>
  </div>
  <button class="btn btn-maps" id="maps-btn" onclick="openMaps()">🗺️ Open House Location in Maps</button>
  <div style="font-size:11px;color:#475569;text-align:center;margin-top:12px;">Please proceed to the guard on duty to deposit your ID.</div>
</div>

<script>
const TOKEN = <?= json_encode($token) ?>;
let residentLat = null, residentLng = null;
let expiryTimer = null;
let secondsLeft = 300;

// ── Validate token on page load ─────────────────────────────────────────────
async function validateToken() {
  show('step-loading');
  try {
    const res = await fetch(`api/index.php?uri=/qr/validate&token=${encodeURIComponent(TOKEN)}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      showExpired(data.error || 'Invalid or expired QR code.');
      return;
    }
    document.getElementById('res-name').textContent = data.resident_name;
    document.getElementById('res-addr').textContent = data.block + ' · Lot ' + data.lot_number;
    document.getElementById('success-addr').textContent = data.block + ' · Lot ' + data.lot_number + ' — ' + data.resident_name;
    residentLat = data.latitude;
    residentLng = data.longitude;
    show('step-form');
    startTimer();
  } catch(e) {
    showExpired('Could not connect to server. Please check your connection.');
  }
}

// ── Countdown timer ──────────────────────────────────────────────────────────
function startTimer() {
  updateTimerDisplay();
  expiryTimer = setInterval(() => {
    secondsLeft--;
    updateTimerDisplay();
    if (secondsLeft <= 0) {
      clearInterval(expiryTimer);
      showExpired('Time is up! This QR code has expired.');
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const el = document.getElementById('timer-display');
  if (el) el.textContent = `⏱ QR expires in ${m}:${s.toString().padStart(2,'0')}`;
}

// ── Submit check-in ──────────────────────────────────────────────────────────
async function submitCheckin() {
  const name    = document.getElementById('v-name').value.trim();
  const purpose = document.getElementById('v-purpose').value;
  const idType  = document.getElementById('v-id').value.trim();
  const errEl   = document.getElementById('form-error');
  const btn     = document.getElementById('submit-btn');

  if (!name) {
    errEl.textContent = 'Please enter your full name.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  btn.textContent = 'Checking in…';
  btn.className = 'btn btn-disabled';
  btn.onclick = null;

  try {
    const res = await fetch('api/index.php?uri=/qr/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, visitor_name: name, purpose, id_type: idType })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      errEl.textContent = data.error || 'Check-in failed. Please try again.';
      errEl.style.display = 'block';
      btn.textContent = '✅ Check In';
      btn.className = 'btn btn-primary';
      btn.onclick = submitCheckin;
      return;
    }
    clearInterval(expiryTimer);
    show('step-success');
  } catch(e) {
    errEl.textContent = 'Connection error. Please try again.';
    errEl.style.display = 'block';
    btn.textContent = '✅ Check In';
    btn.className = 'btn btn-primary';
    btn.onclick = submitCheckin;
  }
}

// ── Open Maps ────────────────────────────────────────────────────────────────
function openMaps() {
  if (residentLat && residentLng) {
    window.open(`https://maps.google.com/?q=${residentLat},${residentLng}`, '_blank');
  } else {
    alert('No GPS location saved for this address yet.');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function show(id) {
  ['step-loading','step-form','step-success','step-expired'].forEach(s => {
    document.getElementById(s).style.display = s === id ? 'block' : 'none';
  });
}

function showExpired(msg) {
  document.getElementById('expired-msg').textContent = msg;
  show('step-expired');
}

validateToken();
</script>
<?php endif; ?>

</body>
</html>
