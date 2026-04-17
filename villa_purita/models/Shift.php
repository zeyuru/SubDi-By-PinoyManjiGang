<?php
class Shift {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    public function startShift(int $userId): int {
        // End any active shift first
        $this->endActiveShift($userId);
        // Start new shift
        $stmt = $this->db->prepare("INSERT INTO shifts (user_id, start_time, status) VALUES (?, NOW(), 'Active')");
        $stmt->execute([$userId]);
        return (int)$this->db->lastInsertId();
    }

    public function endActiveShift(int $userId): bool {
        $stmt = $this->db->prepare("UPDATE shifts SET end_time = NOW(), status = 'Ended' WHERE user_id = ? AND status = 'Active'");
        return $stmt->execute([$userId]);
    }

    public function getActiveShift(int $userId): ?array {
        $stmt = $this->db->prepare("SELECT * FROM shifts WHERE user_id = ? AND status = 'Active' ORDER BY start_time DESC LIMIT 1");
        $stmt->execute([$userId]);
        return $stmt->fetch() ?: null;
    }

    public function getAllShifts(): array {
        $stmt = $this->db->query("SELECT s.*, u.first_name, u.last_name, u.username FROM shifts s JOIN users u ON s.user_id = u.id ORDER BY s.start_time DESC");
        return $stmt->fetchAll();
    }
}