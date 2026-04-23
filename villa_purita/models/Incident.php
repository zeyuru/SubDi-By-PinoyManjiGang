<?php
class Incident {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    public function getAll(): array {
        $stmt = $this->db->query(
            "SELECT i.*,
                    CONCAT(u.first_name,' ',u.last_name) AS reporter_name,
                    DATE_FORMAT(i.created_at,'%Y-%m-%d %H:%i') AS created_fmt
             FROM incidents i
             LEFT JOIN users u ON u.id = i.reported_by
             ORDER BY FIELD(i.priority,'High','Medium','Low'), i.created_at DESC
             LIMIT 100"
        );
        return $stmt->fetchAll();
    }

    public function create(array $data): int {
        $stmt = $this->db->prepare(
            "INSERT INTO incidents
             (incident_type, description, priority, block, lot_number,
              latitude, longitude, reported_by, status, created_at, updated_at)
             VALUES
             (:type, :desc, :priority, :block, :lot, :lat, :lng, :reporter, 'Open', NOW(), NOW())"
        );
        $stmt->execute([
            ':type'     => $data['incident_type'],
            ':desc'     => $data['description'],
            ':priority' => $data['priority'],
            ':block'    => $data['block'],
            ':lot'      => $data['lot_number'] ?? null,
            ':lat'      => $data['latitude'] ?? null,
            ':lng'      => $data['longitude'] ?? null,
            ':reporter' => Session::getUserId(),
        ]);
        $id = (int)$this->db->lastInsertId();
        $this->notifyGuards($id, $data);
        return $id;
    }

    public function updateStatus(int $id, string $status, string $notes = ''): bool {
        return $this->db->prepare(
            "UPDATE incidents SET status = ?, resolution_notes = ?, updated_at = NOW() WHERE id = ?"
        )->execute([$status, $notes, $id]);
    }

    public function getOpenCount(): int {
        return (int)$this->db->query(
            "SELECT COUNT(*) FROM incidents WHERE status IN ('Open','In Progress')"
        )->fetchColumn();
    }

    private function notifyGuards(int $incidentId, array $data): void {
        $guards = $this->db->query(
            "SELECT id FROM users WHERE role='Guard' AND status='Active'"
        )->fetchAll();
        $stmt = $this->db->prepare(
            "INSERT INTO notifications (user_id, type, title, message, reference_id, created_at)
             VALUES (?, 'incident', ?, ?, ?, NOW())"
        );
        $title = '🚨 ' . $data['priority'] . ' — ' . $data['incident_type'];
        $msg   = 'Location: ' . $data['block'] . ($data['lot_number'] ? ' Lot ' . $data['lot_number'] : '');
        foreach ($guards as $g) {
            $stmt->execute([$g['id'], $title, $msg, $incidentId]);
        }
    }
}
