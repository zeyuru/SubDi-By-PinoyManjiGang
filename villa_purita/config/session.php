<?php
class Session {
    public static function start(): void {
        if (session_status() === PHP_SESSION_NONE) {
            session_set_cookie_params([
                'lifetime' => 0,
                'path'     => '/',
                'secure'   => isset($_SERVER['HTTPS']),
                'httponly' => true,
                'samesite' => 'Strict',
            ]);
            session_start();
        }
    }

    public static function set(string $key, mixed $value): void { $_SESSION[$key] = $value; }
    public static function get(string $key): mixed              { return $_SESSION[$key] ?? null; }
    public static function destroy(): void                      { session_unset(); session_destroy(); }
    public static function isLoggedIn(): bool                   { return !empty($_SESSION['user_id']); }
    public static function getRole(): string                    { return $_SESSION['role'] ?? ''; }
    public static function getUserId(): int                     { return (int)($_SESSION['user_id'] ?? 0); }

    public static function requireRole(array $roles): void {
        if (!self::isLoggedIn() || !in_array(self::getRole(), $roles)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Access denied']);
            exit;
        }
    }
}
