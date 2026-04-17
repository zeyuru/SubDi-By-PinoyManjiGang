<?php
// ── Email Configuration ──────────────
putenv('MAIL_HOST=smtp.gmail.com');
putenv('MAIL_PORT=587');
putenv('MAIL_USERNAME=rnavigail@gmail.com');
putenv('MAIL_PASSWORD=rtnd axkm xgfg mini');
putenv('MAIL_ENCRYPTION=tls');
putenv('MAIL_FROM_EMAIL=rnavigail@gmail.com');
putenv('MAIL_FROM_NAME=Villa Purita HOA');
putenv('APP_URL=http://localhost/SubDi');

// ── DB Connection ──────────────────────
class Database {
    private static ?self $instance = null;
    private PDO $pdo;

    private function __construct() {
        $host   = getenv('DB_HOST') ?: 'localhost';
        $dbname = getenv('DB_NAME') ?: 'villa_purita_db';
        $user   = getenv('DB_USER') ?: 'root';
        $pass   = getenv('DB_PASS') ?: '';
        $port   = getenv('DB_PORT') ?: '3306';

        $this->pdo = new PDO(
            "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4",
            $user, $pass,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
        $this->ensureEmailColumn();
    }

    private function ensureEmailColumn(): void {
        try {
            $stmt = $this->pdo->query("SHOW COLUMNS FROM users LIKE 'email'");
            if ($stmt && $stmt->rowCount() === 0) {
                $this->pdo->exec("ALTER TABLE users ADD COLUMN email varchar(150) DEFAULT NULL AFTER username");
            }
        } catch (PDOException $e) {
            error_log('[Villa Purita Schema] Unable to ensure users.email column: ' . $e->getMessage());
        }
    }

    public static function getInstance(): self {
        if (!self::$instance) self::$instance = new self();
        return self::$instance;
    }

    public function getConnection(): PDO { return $this->pdo; }
}
