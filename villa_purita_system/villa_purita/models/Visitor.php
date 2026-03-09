<?php
class Visitor {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    public function logEntry(array $data): int {
        $stmt = $this->db->prepare(
            "INSERT INTO visitors
             (visitor_name, purpose, visiting_block, visiting_lot,
              id_type, id_number, vehicle_plate, time_in, status, guard_id, created_at)
             VALUES
             (:name, :purpose, :block, :lot, :id_type, :id_num, :plate, NOW(), 'Inside', :guard_id, NOW())"
        );
        $stmt->execute([
            ':name'     => $data['visitor_name'],
            ':purpose'  => $data['purpose'],
            ':block'    => $data['block'],
            ':lot'      => $data['lot'],
            ':id_type'  => $data['id_type'],
            ':id_num'   => $data['id_number'] ?? null,
            ':plate'    => $data['vehicle_plate'] ?? null,
            ':guard_id' => Session::getUserId(),
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function logExit(int $id): bool {
        return $this->db->prepare(
            "UPDATE visitors SET time_out = NOW(), status = 'Left' WHERE id = ?"
        )->execute([$id]);
    }

    public function getAll(): array {
        $stmt = $this->db->query(
            "SELECT v.*,
                    TIME_FORMAT(v.time_in,'%h:%i %p')  AS time_in_fmt,
                    TIME_FORMAT(v.time_out,'%h:%i %p') AS time_out_fmt,
                    CONCAT(u.first_name,' ',u.last_name) AS guard_name
             FROM visitors v
             LEFT JOIN users u ON u.id = v.guard_id
             ORDER BY v.time_in DESC
             LIMIT 200"
        );
        return $stmt->fetchAll();
    }

    public function getInsideNow(): array {
        $stmt = $this->db->query(
            "SELECT v.*,
                    TIME_FORMAT(v.time_in,'%h:%i %p') AS time_in_fmt,
                    CONCAT(u.first_name,' ',u.last_name) AS guard_name
             FROM visitors v
             LEFT JOIN users u ON u.id = v.guard_id
             WHERE v.status = 'Inside'
             ORDER BY v.time_in DESC"
        );
        return $stmt->fetchAll();
    }

    public function getDailySummary(): array {
        return $this->db->query(
            "SELECT COUNT(*) AS total,
                    SUM(status = 'Inside')         AS inside,
                    SUM(status = 'Left')           AS exited,
                    SUM(purpose = 'Delivery')      AS deliveries,
                    SUM(purpose = 'Guest Visit')   AS guests
             FROM visitors WHERE DATE(time_in) = CURDATE()"
        )->fetch();
    }
}
