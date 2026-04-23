<?php
/**
 * Villa Purita Subdivision — API Entry Point
 * All requests route through this file.
 *
 * Apache .htaccess (place in project root):
 *   RewriteEngine On
 *   RewriteCond %{REQUEST_FILENAME} !-f
 *   RewriteRule ^(.*)$ api/index.php [QSA,L]
 *
 * Nginx location block:
 *   location / { try_files $uri $uri/ /api/index.php?$query_string; }
 */

// ── Autoload ─────────────────────────────
$root = dirname(__DIR__);
require_once "$root/config/database.php";
require_once "$root/config/session.php";
require_once "$root/Mailer.php";
require_once "$root/middleware/auth.php";
require_once "$root/helpers/Response.php";
require_once "$root/models/User.php";
require_once "$root/models/Resident.php";
require_once "$root/models/Visitor.php";
require_once "$root/models/Dues.php";
require_once "$root/models/Incident.php";
require_once "$root/models/Announcement.php";
require_once "$root/models/Shift.php";
require_once "$root/controllers/Controllers.php";

// ── CORS headers ─────────────────────────
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ── Routing ──────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

/* remove everything before /api */
$uri = preg_replace('#^.*?/api#', '', $uri);

$uri = '/' . trim($uri, '/');

Session::start();

try {
    match (true) {

        // ── Auth ──────────────────────────────────────────────
        $method === 'POST' && $uri === '/auth/login'
            => (new AuthController())->login(),
        $method === 'POST' && $uri === '/auth/logout'
            => (new AuthController())->logout(),
        $method === 'GET'  && $uri === '/auth/me'
            => (new AuthController())->me(),
        $method === 'POST' && $uri === '/auth/forgot-password'
            => (new AuthController())->forgotPassword(),

        // ── Users ─────────────────────────────────────────────
        $method === 'GET'  && $uri === '/users'
            => (new UserController())->index(),
        $method === 'POST' && $uri === '/users'
            => (new UserController())->store(),
        $method === 'POST' && $uri === '/users/status'
            => (new UserController())->updateStatus(),
        $method === 'POST' && $uri === '/users/account'
            => (new UserController())->updateAccount(),
        $method === 'DELETE' && $uri === '/users'
            => (new UserController())->destroy(),

        // ── Residents ─────────────────────────────────────────
        $method === 'GET'  && $uri === '/residents'
            => (new ResidentController())->index(),
        $method === 'GET'  && $uri === '/residents/show'
            => (new ResidentController())->show(),
        $method === 'GET'  && $uri === '/residents/stats'
            => (new ResidentController())->stats(),
        $method === 'POST' && $uri === '/residents'
            => (new ResidentController())->store(),
        $method === 'DELETE' && $uri === '/residents'
            => (new ResidentController())->destroy(),
        $method === 'POST' && $uri === '/residents/location'
            => (new ResidentController())->updateLocation(),

        // ── Visitors ──────────────────────────────────────────
        $method === 'GET'  && $uri === '/visitors'
            => (new VisitorController())->index(),
        $method === 'GET'  && $uri === '/visitors/inside'
            => (new VisitorController())->inside(),
        $method === 'GET'  && $uri === '/visitors/summary'
            => (new VisitorController())->summary(),
        $method === 'POST' && $uri === '/visitors/entry'
            => (new VisitorController())->logEntry(),
        $method === 'POST' && $uri === '/visitors/exit'
            => (new VisitorController())->logExit(),

        // ── Dues ──────────────────────────────────────────────
        $method === 'GET'  && $uri === '/dues'
            => (new DuesController())->index(),
        $method === 'GET'  && $uri === '/dues/summary'
            => (new DuesController())->summary(),
        $method === 'POST' && $uri === '/dues/payment'
            => (new DuesController())->recordPayment(),
        $method === 'POST' && $uri === '/dues/issue'
            => (new DuesController())->issueBill(),
        $method === 'POST' && $uri === '/dues/submit-proof'
            => (new DuesController())->submitProof(),
        $method === 'POST' && $uri === '/dues/accept'
            => (new DuesController())->acceptPayment(),
        $method === 'POST' && $uri === '/dues/reject'
            => (new DuesController())->rejectPayment(),
        $method === 'DELETE' && $uri === '/dues'
            => (new DuesController())->deleteBill(),

        // ── QR Tokens ─────────────────────────────────────────
        $method === 'POST' && $uri === '/qr/generate'
            => (new QrController())->generate(),
        $method === 'GET'  && $uri === '/qr/validate'
            => (new QrController())->validate(),
        $method === 'POST' && $uri === '/qr/checkin'
            => (new QrController())->checkin(),

        // ── Incidents ─────────────────────────────────────────
        $method === 'GET'  && $uri === '/incidents'
            => (new IncidentController())->index(),
        $method === 'POST' && $uri === '/incidents'
            => (new IncidentController())->store(),
        $method === 'POST' && $uri === '/incidents/status'
            => (new IncidentController())->updateStatus(),

        // ── Announcements ─────────────────────────────────────
        $method === 'GET'  && $uri === '/announcements'
            => (new AnnouncementController())->index(),
        $method === 'POST' && $uri === '/announcements'
            => (new AnnouncementController())->store(),
        $method === 'POST' && $uri === '/announcements/archive'
            => (new AnnouncementController())->archive(),

        // ── Shifts ────────────────────────────────────────────
        $method === 'GET'  && $uri === '/shifts'
            => (new ShiftController())->index(),
        $method === 'POST' && $uri === '/shifts/start'
            => (new ShiftController())->start(),
        $method === 'POST' && $uri === '/shifts/end'
            => (new ShiftController())->end(),
        $method === 'GET'  && $uri === '/shifts/status'
            => (new ShiftController())->status(),

        // ── 404 fallback ──────────────────────────────────────
        default => Response::error("Endpoint not found: $method $uri", 404),
    };
} catch (PDOException $e) {
    error_log('[Villa Purita DB Error] ' . $e->getMessage());
    $msg = 'Database error. Please try again.';
    if (strpos($e->getMessage(), 'Duplicate entry') !== false) {
        $msg = 'Duplicate entry detected. Please use a different username or email.';
    } elseif (strpos($e->getMessage(), 'Unknown column') !== false) {
        $msg = 'Database schema mismatch: missing required column. Please restart the app or update the database schema.';
    } elseif (strpos($e->getMessage(), 'cannot be null') !== false) {
        $msg = 'Missing required data. Please ensure all required fields are filled.';
    }
    Response::error($msg, 500);
} catch (Throwable $e) {
    error_log('[Villa Purita Error] ' . $e->getMessage());
    Response::error('Server error: ' . $e->getMessage(), 500);
}
