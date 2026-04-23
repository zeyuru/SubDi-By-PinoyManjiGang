<?php
class Resident {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    public function getAll(array $filters = []): array {
        $where  = ['r.deleted_at IS NULL'];
        $params = [];

        if (!empty($filters['block'])) {
            $where[]           = 'r.block = :block';
            $params[':block']  = $filters['block'];
        }
        if (!empty($filters['status'])) {
            $where[]            = 'r.status = :status';
            $params[':status']  = $filters['status'];
        }
        if (!empty($filters['search'])) {
            $where[]            = '(r.first_name LIKE :search OR r.last_name LIKE :search
                                    OR CONCAT(r.block," Lot ",r.lot_number) LIKE :search)';
            $params[':search']  = '%' . $filters['search'] . '%';
        }

        $sql = "SELECT r.id, r.first_name, r.last_name, r.block, r.lot_number,
                       r.year_of_residency, r.occupancy_status, r.contact_number,
                       r.contact_visibility, r.status, r.user_id,
                       r.latitude, r.longitude,
                       COALESCE(u.username, '') AS username,
                       COALESCE(d.status, 'Unpaid') AS dues_status
                FROM residents r
                LEFT JOIN users u ON u.id = r.user_id
                LEFT JOIN dues d
                       ON d.resident_id = r.id
                      AND d.billing_month = DATE_FORMAT(NOW(),'%Y-%m')
                WHERE " . implode(' AND ', $where) . "
                ORDER BY r.block, CAST(r.lot_number AS UNSIGNED)";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare(
            "SELECT r.*, COALESCE(u.username, '') AS username, COALESCE(d.status,'Unpaid') AS dues_status
             FROM residents r
             LEFT JOIN users u ON u.id = r.user_id
             LEFT JOIN dues d ON d.resident_id = r.id
               AND d.billing_month = DATE_FORMAT(NOW(),'%Y-%m')
             WHERE r.id = ? AND r.deleted_at IS NULL"
        );
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function getPaymentHistory(int $id): array {
        $stmt = $this->db->prepare(
            "SELECT billing_month, amount, status,
                    DATE_FORMAT(date_paid,'%b %d, %Y') AS date_paid_fmt,
                    payment_method, reference_number, notes
             FROM dues WHERE resident_id = ? ORDER BY billing_month DESC LIMIT 24"
        );
        $stmt->execute([$id]);
        return $stmt->fetchAll();
    }

    public function create(array $data): int {
        $stmt = $this->db->prepare(
            "INSERT INTO residents
             (first_name, last_name, block, lot_number, year_of_residency,
              occupancy_status, contact_number, contact_visibility, status, user_id, created_at)
             VALUES
             (:first_name, :last_name, :block, :lot_number, :year_of_residency,
              :occupancy_status, :contact_number, :contact_visibility, 'Active', :user_id, NOW())"
        );
        $stmt->execute([
            ':first_name'         => $data['first_name'],
            ':last_name'          => $data['last_name'],
            ':block'              => $data['block'],
            ':lot_number'         => $data['lot_number'],
            ':year_of_residency'  => $data['year_of_residency'],
            ':occupancy_status'   => $data['occupancy_status'] ?? 'Owner',
            ':contact_number'     => $data['contact_number'] ?? null,
            ':contact_visibility' => $data['contact_visibility'] ?? 'admin_only',
            ':user_id'            => $data['user_id'] ?? null,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function delete(int $id): bool {
        return $this->db->prepare("UPDATE residents SET deleted_at = NOW() WHERE id = ?")
                        ->execute([$id]);
    }

    public function blockLotExists(string $block, string $lot, int $excludeId = 0): bool {
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) FROM residents
             WHERE block = ? AND lot_number = ? AND id != ? AND deleted_at IS NULL"
        );
        $stmt->execute([$block, $lot, $excludeId]);
        return (bool)$stmt->fetchColumn();
    }

    public function userIdExists(int $userId): bool {
        if (!$userId) return false;
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) FROM residents
             WHERE user_id = ? AND deleted_at IS NULL"
        );
        $stmt->execute([$userId]);
        return (bool)$stmt->fetchColumn();
    }

    public function getStats(): array {
        $row = $this->db->query(
            "SELECT COUNT(*) AS total,
                    SUM(status='Active')  AS active,
                    SUM(status='Pending') AS pending
             FROM residents WHERE deleted_at IS NULL"
        )->fetch();
        $dues = $this->db->query(
            "SELECT SUM(status='Paid') AS paid,
                    SUM(status='Overdue') AS overdue,
                    SUM(status='Partial') AS partial,
                    SUM(amount) AS total_collected
             FROM dues WHERE status = 'Paid'
               AND billing_month = DATE_FORMAT(NOW(),'%Y-%m')"
        )->fetch();
        return array_merge($row, $dues ?? []);
    }
}
