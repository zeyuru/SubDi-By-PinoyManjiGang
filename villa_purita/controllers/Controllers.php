<?php
// ══════════════════════════════════════════
// AuthController
// ══════════════════════════════════════════
class AuthController {
    private User $users;

    public function __construct() {
        $this->users = new User();
        Session::start();
    }

    public function login(): void {
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($d['username']) || empty($d['password'])) {
            Response::error('Username and password are required.');
        }
        $user = $this->users->findByUsername(trim($d['username']));
        if (!$user)                              Response::error('Invalid credentials.', 401);
        if ($user['status'] !== 'Active')        Response::error('Account is inactive. Contact administrator.', 403);
        if (!$this->users->verifyPassword($d['password'], $user['password_hash']))
                                                 Response::error('Invalid credentials.', 401);

        Session::set('user_id',   $user['id']);
        Session::set('username',  $user['username']);
        Session::set('role',      $user['role']);
        Session::set('full_name', $user['first_name'] . ' ' . $user['last_name']);
        $this->users->updateLastLogin($user['id']);

        Response::json([
            'user_id'    => $user['id'],
            'username'   => $user['username'],
            'role'       => $user['role'],
            'first_name' => $user['first_name'],
            'last_name'  => $user['last_name'],
            'full_name'  => $user['first_name'] . ' ' . $user['last_name'],
        ]);
    }

    public function logout(): void {
        Session::destroy();
        Response::json(['message' => 'Logged out successfully']);
    }

    public function me(): void {
        AuthMiddleware::handle();
        Response::json($this->users->findById(Session::getUserId()));
    }

    /**
     * POST /auth/forgot-password
     * Body: { email }
     * Generates a new random password, emails it, stores the hashed version.
     * Always returns success (don't reveal whether email exists).
     */
    public function forgotPassword(): void {
        $d     = json_decode(file_get_contents('php://input'), true) ?? [];
        $email = trim($d['email'] ?? '');
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid email address is required.', 400);
        }

        $user = $this->users->findByEmail($email);

        // Always respond with success regardless of whether email exists (security best practice)
        if (!$user) {
            Response::json(['message' => 'If that email is registered, a new password has been sent.']);
            return;
        }

        if ($user['status'] !== 'Active') {
            Response::json(['message' => 'If that email is registered, a new password has been sent.']);
            return;
        }

        // Generate a new temporary password and update it immediately
        $newPassword = self::generateTempPassword();
        $this->users->updatePassword((int)$user['id'], $newPassword);

        try {
            Mailer::sendPasswordReset(
                $user['email'],
                $user['first_name'] . ' ' . $user['last_name'],
                $user['username'],
                $newPassword
            );
        } catch (\Throwable $e) {
            error_log('[Villa Purita Mailer] Forgot password email failed: ' . $e->getMessage());
            // Still return success for security — admin can check server logs
        }

        Response::json(['message' => 'If that email is registered, a new password has been sent.']);
    }

    private static function generateTempPassword(): string {
        $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$';
        $pass  = strtoupper(substr(str_shuffle('abcdefghjkmnpqrstuvwxyz'),0,2))
               . substr(str_shuffle('23456789'),0,2)
               . substr(str_shuffle('!@#$'),0,1)
               . substr(str_shuffle($chars),0,7);
        return str_shuffle($pass);
    }
}

// ══════════════════════════════════════════
// UserController
// ══════════════════════════════════════════
class UserController {
    private User $model;

    public function __construct() { $this->model = new User(); }

    public function index(): void {
        AuthMiddleware::adminOnly();
        Response::json($this->model->getAll());
    }

    public function store(): void {
        AuthMiddleware::adminOnly();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        foreach (['first_name','last_name','username','role'] as $f) {
            if (empty($d[$f])) Response::error("Field '$f' is required.");
        }
        // Email required so we can send credentials
        if (empty($d['email'])) Response::error('Email is required to send login credentials to the user.');
        if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) Response::error('Invalid email address.');
        if ($this->model->usernameExists($d['username'])) Response::error('Username already taken.');
        if ($this->model->emailExists($d['email'])) Response::error('Email already registered.');

        // Generate a secure random password
        $randomPassword = self::generatePassword();
        $d['password'] = $randomPassword;

        $id = $this->model->create($d);

        // Send welcome email with credentials
        try {
            Mailer::sendWelcome(
                $d['email'],
                $d['first_name'] . ' ' . $d['last_name'],
                $d['username'],
                $randomPassword,
                $d['role']
            );
            $emailNote = 'Credentials emailed to ' . $d['email'];
        } catch (\Throwable $e) {
            error_log('[Villa Purita Mailer] ' . $e->getMessage());
            // Don't fail the account creation if email fails — log and continue
            $emailNote = 'Account created but email could not be sent: ' . $e->getMessage();
        }

        Response::json([
            'id'      => $id,
            'message' => 'User created successfully. ' . $emailNote,
            'email_sent' => str_starts_with($emailNote, 'Credentials'),
        ], 201);
    }

    /** Generates a strong 12-char random password */
    private static function generatePassword(): string {
        $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$';
        $pass  = '';
        // Guarantee at least 1 uppercase, 1 digit, 1 symbol
        $pass .= strtoupper(substr(str_shuffle('abcdefghjkmnpqrstuvwxyz'), 0, 2));
        $pass .= substr(str_shuffle('23456789'), 0, 2);
        $pass .= substr(str_shuffle('!@#$'), 0, 1);
        $pass .= substr(str_shuffle($chars), 0, 7);
        return str_shuffle($pass);
    }

    public function updateAccount(): void {
        AuthMiddleware::handle();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        $userId = Session::getUserId();
        if (!$userId) Response::error('Authentication required.', 401);
        if (!empty($d['email']) && $this->model->emailExists($d['email'], $userId)) Response::error('Email already taken.');
        if (!empty($d['password']) && strlen($d['password']) < 6) Response::error('Password must be at least 6 characters.');
        $this->model->updateAccount($userId, $d);
        Response::json(['updated' => true]);
    }

    public function updateStatus(): void {
        AuthMiddleware::adminOnly();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($d['id']) || empty($d['status'])) Response::error('id and status required.');
        if ((int)$d['id'] === Session::getUserId()) Response::error('Cannot deactivate your own account.');
        $this->model->updateStatus((int)$d['id'], $d['status']);
        Response::json(['updated' => true]);
    }

    public function destroy(): void {
        AuthMiddleware::adminOnly();
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) Response::error('id required.');
        if ($id === Session::getUserId()) Response::error('Cannot delete your own account.');
        $this->model->delete($id);
        Response::json(['deleted' => true]);
    }
}

// ══════════════════════════════════════════
// ShiftController
// ══════════════════════════════════════════
class ShiftController {
    private Shift $model;

    public function __construct() {
        $this->model = new Shift();
    }

    public function start(): void {
        AuthMiddleware::handle();
        if (Session::getRole() !== 'Guard') Response::error('Only guards can start shifts.', 403);
        $userId = Session::getUserId();
        $active = $this->model->getActiveShift($userId);
        if ($active) Response::error('You already have an active shift.');
        $id = $this->model->startShift($userId);
        Response::json(['id' => $id, 'message' => 'Shift started successfully']);
    }

    public function end(): void {
        AuthMiddleware::handle();
        if (Session::getRole() !== 'Guard') Response::error('Only guards can end shifts.', 403);
        $userId = Session::getUserId();
        $ended = $this->model->endActiveShift($userId);
        if (!$ended) Response::error('No active shift to end.');
        Response::json(['message' => 'Shift ended successfully']);
    }

    public function status(): void {
        AuthMiddleware::handle();
        if (Session::getRole() !== 'Guard') Response::error('Only guards can check shift status.', 403);
        $userId = Session::getUserId();
        $active = $this->model->getActiveShift($userId);
        if ($active) {
            Response::json($active);
        } else {
            Response::json(null);
        }
    }

    public function index(): void {
        AuthMiddleware::adminOnly();
        Response::json($this->model->getAllShifts());
    }
}

// ══════════════════════════════════════════
// ResidentController
// ══════════════════════════════════════════
class ResidentController {
    private Resident $model;

    public function __construct() { $this->model = new Resident(); }

    public function index(): void {
        AuthMiddleware::handle();
        $filters = array_filter([
            'block'  => $_GET['block']  ?? '',
            'status' => $_GET['status'] ?? '',
            'search' => $_GET['search'] ?? '',
        ]);
        $list = $this->model->getAll($filters);
        // Strip contact for non-admins
        if (Session::getRole() !== 'Administrator') {
            $list = array_map(function($r) {
                unset($r['contact_number'], $r['contact_visibility']);
                return $r;
            }, $list);
        }
        Response::json($list);
    }

    public function show(): void {
        AuthMiddleware::handle();
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) Response::error('id required.');
        $r = $this->model->findById($id);
        if (!$r) Response::error('Resident not found.', 404);
        if (Session::getRole() !== 'Administrator') {
            unset($r['contact_number'], $r['contact_visibility']);
        }
        $r['payment_history'] = $this->model->getPaymentHistory($id);
        Response::json($r);
    }

    public function store(): void {
        AuthMiddleware::adminOnly();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        foreach (['first_name','last_name','block','lot_number','year_of_residency'] as $f) {
            if (empty($d[$f])) Response::error("Field '$f' is required.");
        }
        if ($this->model->blockLotExists($d['block'], $d['lot_number'])) {
            Response::error("{$d['block']} Lot {$d['lot_number']} already has a registered resident.");
        }
        if (!empty($d['user_id']) && $this->model->userIdExists((int)$d['user_id'])) {
            Response::error('That homeowner account is already linked to another resident.');
        }
        $id = $this->model->create($d);
        Response::json(['id' => $id, 'message' => 'Resident added successfully'], 201);
    }

    public function destroy(): void {
        AuthMiddleware::adminOnly();
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) Response::error('id required.');
        $this->model->delete($id);
        Response::json(['deleted' => true]);
    }

    public function updateLocation(): void {
        AuthMiddleware::adminOnly();
        $d   = json_decode(file_get_contents('php://input'), true) ?? [];
        $id  = (int)($d['id'] ?? 0);
        $lat = isset($d['latitude'])  ? (float)$d['latitude']  : null;
        $lng = isset($d['longitude']) ? (float)$d['longitude'] : null;
        if (!$id) Response::error('id required.');
        if ($lat === null || $lng === null) Response::error('latitude and longitude required.');
        // Validate reasonable coordinates for Cebu area
        if ($lat < 9.0 || $lat > 12.0 || $lng < 122.0 || $lng > 125.0) {
            Response::error('Coordinates appear to be outside the Philippines. Please click within the subdivision area.');
        }
        $db = Database::getInstance()->getConnection();
        $db->prepare("UPDATE residents SET latitude = ?, longitude = ? WHERE id = ?")
           ->execute([$lat, $lng, $id]);
        Response::json(['updated' => true, 'latitude' => $lat, 'longitude' => $lng]);
    }

    public function stats(): void {
        AuthMiddleware::handle();
        Response::json($this->model->getStats());
    }
}

// ══════════════════════════════════════════
// VisitorController
// ══════════════════════════════════════════
class VisitorController {
    private Visitor $model;

    public function __construct() { $this->model = new Visitor(); }

    public function index(): void {
        AuthMiddleware::handle();
        Response::json($this->model->getAll());
    }

    public function inside(): void {
        AuthMiddleware::handle();
        Response::json($this->model->getInsideNow());
    }

    public function summary(): void {
        AuthMiddleware::handle();
        Response::json($this->model->getDailySummary());
    }

    public function logEntry(): void {
        AuthMiddleware::guardOrAdmin();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($d['visitor_name'])) Response::error('Visitor name is required.');
        if (empty($d['block']))        Response::error('Block is required.');
        if (empty($d['lot']))          Response::error('Lot is required.');
        if (empty($d['id_type']))      Response::error('ID type is required.');
        $id = $this->model->logEntry($d);
        Response::json(['id' => $id, 'message' => 'Visitor logged in'], 201);
    }

    public function logExit(): void {
        AuthMiddleware::guardOrAdmin();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        $id = (int)($d['id'] ?? 0);
        if (!$id) Response::error('Visitor id required.');
        $this->model->logExit($id);
        Response::json(['message' => 'Exit logged']);
    }
}

// ══════════════════════════════════════════
// DuesController
// ══════════════════════════════════════════
class DuesController {
    private Dues $model;

    public function __construct() { $this->model = new Dues(); }

    public function index(): void {
        AuthMiddleware::handle();
        $status = $_GET['status'] ?? '';
        Response::json($this->model->getAll($status));
    }

    public function summary(): void {
        AuthMiddleware::handle();
        Response::json($this->model->getSummary());
    }

    public function recordPayment(): void {
        AuthMiddleware::adminOnly();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($d['resident_id']))   Response::error('resident_id is required.');
        if (empty($d['billing_month'])) Response::error('billing_month is required.');
        if (empty($d['amount']))        Response::error('amount is required.');
        $this->model->recordPayment($d);
        Response::json(['message' => 'Payment recorded successfully']);
    }

    public function issueBill(): void {
        AuthMiddleware::adminOnly();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($d['billing_month'])) Response::error('billing_month is required.');
        if (empty($d['amount']))        Response::error('amount is required.');

        // Issue to everyone
        if (!empty($d['issue_to_all'])) {
            $count = $this->model->createBillForAll($d);
            Response::json(['count' => $count, 'message' => "Bills issued to $count resident(s). Duplicates were skipped."], 201);
            return;
        }

        // Issue to one resident
        if (empty($d['resident_id'])) Response::error('resident_id is required when not issuing to all.');
        $id = $this->model->createBill($d);
        Response::json(['id' => $id, 'message' => 'Bill issued successfully'], 201);
    }

    /**
     * Homeowner submits online payment proof (GCash / Maya).
     * Handles multipart/form-data (file upload).
     */
    public function submitProof(): void {
        AuthMiddleware::handle();

        $dueId      = (int)($_POST['due_id'] ?? 0);
        $method     = $_POST['payment_method'] ?? '';
        $ref        = trim($_POST['reference_number'] ?? '');
        $notes      = trim($_POST['notes'] ?? '');

        if (!$dueId)   Response::error('due_id is required.');
        if (!$method)  Response::error('payment_method is required.');

        // Resolve resident_id from the logged-in user
        $db = Database::getInstance()->getConnection();
        $userId = Session::getUserId();
        $resStmt = $db->prepare("SELECT id FROM residents WHERE user_id = ? AND deleted_at IS NULL LIMIT 1");
        $resStmt->execute([$userId]);
        $resident = $resStmt->fetch();
        if (!$resident) Response::error('No resident record linked to your account.');
        $residentId = (int)$resident['id'];

        // Handle image upload
        $proofPath = null;
        if (!empty($_FILES['proof_image']['tmp_name'])) {
            $file    = $_FILES['proof_image'];
            $allowed = ['image/jpeg', 'image/jpg', 'image/png'];
            $finfo   = finfo_open(FILEINFO_MIME_TYPE);
            $mime    = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);
            if (!in_array($mime, $allowed)) Response::error('Only JPG and PNG images are allowed.');
            if ($file['size'] > 5 * 1024 * 1024) Response::error('Image must be under 5MB.');

            $uploadDir = dirname(__DIR__) . '/uploads/payment_proofs/';
            if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

            $ext      = $mime === 'image/png' ? 'png' : 'jpg';
            $filename = 'proof_' . $dueId . '_' . $residentId . '_' . time() . '.' . $ext;
            $dest     = $uploadDir . $filename;
            if (!move_uploaded_file($file['tmp_name'], $dest)) {
                Response::error('Failed to save uploaded image.');
            }
            $proofPath = 'uploads/payment_proofs/' . $filename;
        } else {
            Response::error('Proof of transaction image is required.');
        }

        $this->model->submitPaymentProof($dueId, $residentId, [
            'payment_method'   => $method,
            'reference_number' => $ref ?: null,
            'proof_image'      => $proofPath,
            'notes'            => $notes ?: null,
        ]);
        Response::json(['message' => 'Payment submitted! Waiting for admin review.']);
    }

    /**
     * Admin accepts a pending payment.
     */
    public function acceptPayment(): void {
        AuthMiddleware::adminOnly();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($d['id'])) Response::error('id is required.');
        $this->model->acceptPayment((int)$d['id']);
        Response::json(['message' => 'Payment accepted and marked as Paid.']);
    }

    /**
     * Admin rejects a pending payment.
     */
    public function rejectPayment(): void {
        AuthMiddleware::adminOnly();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($d['id']))     Response::error('id is required.');
        $reason = trim($d['reason'] ?? '');
        if (!$reason) Response::error('A rejection reason is required.');
        $this->model->rejectPayment((int)$d['id'], $reason);
        Response::json(['message' => 'Payment rejected.']);
    }

    public function deleteBill(): void {
        AuthMiddleware::adminOnly();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($d['id'])) Response::error('id is required.');
        $this->model->deleteBill((int)$d['id']);
        Response::json(['message' => 'Bill deleted']);
    }
}

// ══════════════════════════════════════════
// IncidentController
// ══════════════════════════════════════════
class IncidentController {
    private Incident $model;

    public function __construct() { $this->model = new Incident(); }

    public function index(): void {
        AuthMiddleware::handle();
        Response::json($this->model->getAll());
    }

    public function store(): void {
        AuthMiddleware::handle();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($d['incident_type'])) Response::error('incident_type is required.');
        if (empty($d['description']))   Response::error('description is required.');
        if (empty($d['block']))         Response::error('block is required.');
        $id = $this->model->create($d);
        Response::json(['id' => $id, 'message' => 'Incident reported'], 201);
    }

    public function updateStatus(): void {
        AuthMiddleware::guardOrAdmin();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($d['id']))     Response::error('id required.');
        if (empty($d['status'])) Response::error('status required.');
        $this->model->updateStatus((int)$d['id'], $d['status'], $d['notes'] ?? '');
        Response::json(['updated' => true]);
    }
}

// ══════════════════════════════════════════
// AnnouncementController
// ══════════════════════════════════════════
class AnnouncementController {
    private Announcement $model;

    public function __construct() { $this->model = new Announcement(); }

    public function index(): void {
        AuthMiddleware::handle();
        Response::json($this->model->getAll());
    }

    public function store(): void {
        AuthMiddleware::adminOnly();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($d['title']))   Response::error('title is required.');
        if (empty($d['content'])) Response::error('content is required.');
        $id = $this->model->create($d);
        Response::json(['id' => $id, 'message' => 'Announcement posted'], 201);
    }

    public function archive(): void {
        AuthMiddleware::adminOnly();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        $id = (int)($d['id'] ?? 0);
        if (!$id) Response::error('id required.');
        $this->model->archive($id);
        Response::json(['archived' => true]);
    }
}

// ══════════════════════════════════════════
// QrController
// ══════════════════════════════════════════
class QrController {

    public function generate(): void {
        AuthMiddleware::guardOrAdmin();
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        $residentId = (int)($d['resident_id'] ?? 0);
        if (!$residentId) Response::error('resident_id required.');

        $db = Database::getInstance()->getConnection();

        // Invalidate any existing unexpired tokens for this resident
        $db->prepare("UPDATE qr_tokens SET used = 1 WHERE resident_id = ? AND used = 0")
           ->execute([$residentId]);

        // Create new token — expires 5 min after first scan (stored as NULL until scanned)
        $token = bin2hex(random_bytes(24));
        $db->prepare(
            "INSERT INTO qr_tokens (token, resident_id, created_by, created_at)
             VALUES (?, ?, ?, NOW())"
        )->execute([$token, $residentId, Session::getUserId()]);

        Response::json(['token' => $token]);
    }

    public function validate(): void {
        // Public — no auth needed (visitor scanning)
        $token = $_GET['token'] ?? '';
        if (!$token) Response::error('token required.');

        $db = Database::getInstance()->getConnection();
        $stmt = $db->prepare(
            "SELECT t.*, r.first_name, r.last_name, r.block, r.lot_number,
                    r.latitude, r.longitude
             FROM qr_tokens t
             JOIN residents r ON r.id = t.resident_id
             WHERE t.token = ? AND t.used = 0"
        );
        $stmt->execute([$token]);
        $row = $stmt->fetch();

        if (!$row) {
            Response::error('This QR code is invalid or has already been used.', 410);
        }

        // Mark first_scanned_at if not set yet — this starts the 5-min clock
        if (!$row['first_scanned_at']) {
            $db->prepare("UPDATE qr_tokens SET first_scanned_at = NOW() WHERE token = ?")
               ->execute([$token]);
        } else {
            // Check if 5 minutes have elapsed since first scan
            $scanned = strtotime($row['first_scanned_at']);
            if (time() - $scanned > 300) {
                $db->prepare("UPDATE qr_tokens SET used = 1 WHERE token = ?")
                   ->execute([$token]);
                Response::error('This QR code has expired (5-minute limit reached).', 410);
            }
        }

        Response::json([
            'resident_name' => $row['first_name'] . ' ' . $row['last_name'],
            'block'         => $row['block'],
            'lot_number'    => $row['lot_number'],
            'latitude'      => $row['latitude'],
            'longitude'     => $row['longitude'],
            'token'         => $token,
        ]);
    }

    public function checkin(): void {
        // Public — no auth needed (visitor submitting form)
        $d = json_decode(file_get_contents('php://input'), true) ?? [];
        $token        = $d['token'] ?? '';
        $visitorName  = trim($d['visitor_name'] ?? '');
        $purpose      = trim($d['purpose'] ?? 'Guest Visit');
        $idType       = trim($d['id_type'] ?? '');

        if (!$token)       Response::error('token required.');
        if (!$visitorName) Response::error('visitor_name required.');

        $db = Database::getInstance()->getConnection();
        $stmt = $db->prepare(
            "SELECT t.*, r.block, r.lot_number
             FROM qr_tokens t
             JOIN residents r ON r.id = t.resident_id
             WHERE t.token = ? AND t.used = 0"
        );
        $stmt->execute([$token]);
        $row = $stmt->fetch();

        if (!$row) {
            Response::error('This QR code is invalid or has already been used.', 410);
        }

        // Check expiry
        if ($row['first_scanned_at']) {
            $scanned = strtotime($row['first_scanned_at']);
            if (time() - $scanned > 300) {
                $db->prepare("UPDATE qr_tokens SET used = 1 WHERE token = ?")
                   ->execute([$token]);
                Response::error('This QR code has expired.', 410);
            }
        }

        // Log visitor — guard_id is NULL for QR self-checkins
        $db->prepare(
            "INSERT INTO visitors
             (visitor_name, purpose, visiting_block, visiting_lot,
              id_type, time_in, status, notes, created_at)
             VALUES (?, ?, ?, ?, ?, NOW(), 'Inside', 'QR self check-in', NOW())"
        )->execute([$visitorName, $purpose, $row['block'], $row['lot_number'], $idType ?: null]);

        // Mark token as used
        $db->prepare("UPDATE qr_tokens SET used = 1 WHERE token = ?")
           ->execute([$token]);

        Response::json(['message' => 'Check-in successful! Welcome to Villa Purita.']);
    }
}
