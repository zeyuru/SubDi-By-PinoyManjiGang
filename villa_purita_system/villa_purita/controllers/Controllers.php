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
        foreach (['first_name','last_name','username','role','password'] as $f) {
            if (empty($d[$f])) Response::error("Field '$f' is required.");
        }
        if (strlen($d['password']) < 6) Response::error('Password must be at least 6 characters.');
        if ($this->model->usernameExists($d['username'])) Response::error('Username already taken.');
        $id = $this->model->create($d);
        Response::json(['id' => $id, 'message' => 'User created successfully'], 201);
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
