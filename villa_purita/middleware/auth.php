<?php
class AuthMiddleware {
    public static function handle(): void {
        Session::start();
        if (!Session::isLoggedIn()) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Unauthorized. Please log in.']);
            exit;
        }
    }

    public static function adminOnly(): void {
        self::handle();
        Session::requireRole(['Administrator']);
    }

    public static function guardOrAdmin(): void {
        self::handle();
        Session::requireRole(['Administrator', 'Guard']);
    }
}
