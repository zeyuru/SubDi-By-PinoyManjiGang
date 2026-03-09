<?php
class Dues {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    public function getAll(string $statusFilter = ''): array {
        $where  = [];
        $params = [];
        if ($statusFilter) {
            $where[]          = 'd.status = :status';
            $params[':status'] = $statusFilter;
        }
        $whereSQL = $where ? 'AND ' . implode(' AND ', $where) : '';
        $stmt = $this->db->prepare(
            "SELECT d.id, d.resident_id, d.billing_month, d.amount, d.status,
                    DATE_FORMAT(d.date_paid,'%b %d, %Y') AS date_paid_fmt,
                    d.payment_method, d.reference_number, d.notes,
                    r.first_name, r.last_name, r.block, r.lot_number
             FROM dues d
             JOIN residents r ON r.id = d.resident_id AND r.deleted_at IS NULL
             $whereSQL
             ORDER BY d.billing_month DESC, r.block, CAST(r.lot_number AS UNSIGNED)"
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function recordPayment(array $data): void {
        $stmt = $this->db->prepare(
            "INSERT INTO dues
             (resident_id, billing_month, amount, status, date_paid,
              payment_method, reference_number, confirmed_by, notes, created_at)
             VALUES
             (:resident_id, :billing_month, :amount, 'Paid', NOW(),
              :method, :ref, :admin_id, :notes, NOW())
             ON DUPLICATE KEY UPDATE
               amount = :amount, status = 'Paid', date_paid = NOW(),
               payment_method = :method, reference_number = :ref,
               confirmed_by = :admin_id, notes = :notes"
        );
        $stmt->execute([
            ':resident_id'   => $data['resident_id'],
            ':billing_month' => $data['billing_month'],
            ':amount'        => $data['amount'],
            ':method'        => $data['payment_method'] ?? 'Cash',
            ':ref'           => $data['reference_number'] ?? null,
            ':admin_id'      => Session::getUserId(),
            ':notes'         => $data['notes'] ?? null,
        ]);
    }

    public function getSummary(): array {
        $month = date('Y-m');
        $row = $this->db->prepare(
            "SELECT
               SUM(CASE WHEN status='Paid'    THEN 1 ELSE 0 END)   AS paid_count,
               SUM(CASE WHEN status='Overdue' THEN 1 ELSE 0 END)   AS overdue_count,
               SUM(CASE WHEN status IN ('Unpaid','Partial') THEN 1 ELSE 0 END) AS unpaid_count,
               COALESCE(SUM(CASE WHEN status='Paid' THEN amount END), 0) AS total_collected,
               COALESCE(SUM(CASE WHEN status='Overdue' THEN amount END), 0) AS total_overdue
             FROM dues WHERE billing_month = ?"
        );
        $row->execute([$month]);
        return $row->fetch();
    }
}
