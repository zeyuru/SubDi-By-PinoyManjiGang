<?php
class Dues {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    public function getAll(string $statusFilter = '', ?int $residentId = null): array {
        $where  = [];
        $params = [];
        if ($statusFilter) {
            $where[]           = 'd.status = :status';
            $params[':status'] = $statusFilter;
        }
        if ($residentId) {
            $where[]                = 'd.resident_id = :resident_id';
            $params[':resident_id'] = $residentId;
        }
        $whereSQL = $where ? 'AND ' . implode(' AND ', $where) : '';
        $stmt = $this->db->prepare(
            "SELECT d.id, d.resident_id, d.billing_month, d.amount, d.status,
                    DATE_FORMAT(d.date_paid,'%b %d, %Y') AS date_paid_fmt,
                    d.payment_method, d.reference_number, d.proof_image, d.notes,
                    d.description, d.rejection_reason,
                    DATE_FORMAT(d.reviewed_at,'%b %d, %Y %H:%i') AS reviewed_at_fmt,
                    r.first_name, r.last_name, r.block, r.lot_number, r.user_id,
                    CONCAT(u.first_name,' ',u.last_name) AS issued_by_name
             FROM dues d
             JOIN residents r ON r.id = d.resident_id AND r.deleted_at IS NULL
             LEFT JOIN users u ON u.id = d.issued_by
             WHERE 1=1 $whereSQL
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
               amount = :amount2, status = 'Paid', date_paid = NOW(),
               payment_method = :method2, reference_number = :ref2,
               confirmed_by = :admin_id2, notes = :notes2,
               proof_image = NULL, rejection_reason = NULL"
        );
        $adminId = Session::getUserId();
        $stmt->execute([
            ':resident_id'   => $data['resident_id'],
            ':billing_month' => $data['billing_month'],
            ':amount'        => $data['amount'],
            ':method'        => $data['payment_method'] ?? 'Cash',
            ':ref'           => $data['reference_number'] ?? null,
            ':admin_id'      => $adminId,
            ':notes'         => $data['notes'] ?? null,
            ':amount2'       => $data['amount'],
            ':method2'       => $data['payment_method'] ?? 'Cash',
            ':ref2'          => $data['reference_number'] ?? null,
            ':admin_id2'     => $adminId,
            ':notes2'        => $data['notes'] ?? null,
        ]);
    }

    public function createBill(array $data): int {
        $stmt = $this->db->prepare(
            "INSERT INTO dues
             (resident_id, billing_month, amount, status, description, notes, issued_by, issued_at, created_at)
             VALUES (:resident_id, :billing_month, :amount, 'Unpaid', :description, :notes, :issued_by, NOW(), NOW())"
        );
        $stmt->execute([
            ':resident_id'   => $data['resident_id'],
            ':billing_month' => $data['billing_month'],
            ':amount'        => $data['amount'],
            ':description'   => $data['description'] ?? 'Monthly association dues',
            ':notes'         => $data['notes'] ?? null,
            ':issued_by'     => Session::getUserId(),
        ]);
        return (int)$this->db->lastInsertId();
    }

    /**
     * Issue bills to ALL active residents for a billing month,
     * skipping those who already have a bill for that month.
     */
    public function createBillForAll(array $data): int {
        $billing_month = $data['billing_month'];
        $amount        = $data['amount'];
        $description   = $data['description'] ?? 'Monthly association dues';
        $notes         = $data['notes'] ?? null;
        $issued_by     = Session::getUserId();

        // Get all active residents who do NOT yet have a bill for this month
        $stmt = $this->db->prepare(
            "SELECT r.id FROM residents r
             WHERE r.deleted_at IS NULL
               AND r.status = 'Active'
               AND r.id NOT IN (
                   SELECT resident_id FROM dues
                   WHERE billing_month = :billing_month
               )"
        );
        $stmt->execute([':billing_month' => $billing_month]);
        $residents = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($residents)) return 0;

        $insert = $this->db->prepare(
            "INSERT INTO dues
             (resident_id, billing_month, amount, status, description, notes, issued_by, issued_at, created_at)
             VALUES (:resident_id, :billing_month, :amount, 'Unpaid', :description, :notes, :issued_by, NOW(), NOW())"
        );

        $count = 0;
        foreach ($residents as $resId) {
            $insert->execute([
                ':resident_id'   => $resId,
                ':billing_month' => $billing_month,
                ':amount'        => $amount,
                ':description'   => $description,
                ':notes'         => $notes,
                ':issued_by'     => $issued_by,
            ]);
            $count++;
        }
        return $count;
    }

    /**
     * Homeowner submits payment proof - sets status to Pending.
     */
    public function submitPaymentProof(int $dueId, int $residentId, array $data): void {
        $check = $this->db->prepare(
            "SELECT id FROM dues WHERE id = ? AND resident_id = ? AND status IN ('Unpaid','Overdue','Partial')"
        );
        $check->execute([$dueId, $residentId]);
        if (!$check->fetch()) {
            throw new \Exception('Bill not found or already paid/pending.');
        }
        $stmt = $this->db->prepare(
            "UPDATE dues SET
               status = 'Pending',
               payment_method   = :method,
               reference_number = :ref,
               proof_image      = :proof,
               notes            = :notes,
               rejection_reason = NULL,
               reviewed_by      = NULL,
               reviewed_at      = NULL
             WHERE id = :due_id AND resident_id = :resident_id"
        );
        $stmt->execute([
            ':method'      => $data['payment_method'],
            ':ref'         => $data['reference_number'] ?? null,
            ':proof'       => $data['proof_image'] ?? null,
            ':notes'       => $data['notes'] ?? null,
            ':due_id'      => $dueId,
            ':resident_id' => $residentId,
        ]);
    }

    /**
     * Admin accepts a Pending payment.
     */
    public function acceptPayment(int $dueId): void {
        $stmt = $this->db->prepare(
            "UPDATE dues SET
               status       = 'Paid',
               date_paid    = NOW(),
               confirmed_by = :confirmed_by,
               reviewed_by  = :reviewed_by,
               reviewed_at  = NOW(),
               rejection_reason = NULL
             WHERE id = :due_id AND status = 'Pending'"
        );
        $adminId = Session::getUserId();
        $stmt->execute([':confirmed_by' => $adminId, ':reviewed_by' => $adminId, ':due_id' => $dueId]);
    }

    /**
     * Admin rejects a Pending payment (reverts to Unpaid).
     */
    public function rejectPayment(int $dueId, string $reason): void {
        $stmt = $this->db->prepare(
            "UPDATE dues SET
               status           = 'Unpaid',
               payment_method   = NULL,
               reference_number = NULL,
               proof_image      = NULL,
               reviewed_by      = :admin_id,
               reviewed_at      = NOW(),
               rejection_reason = :reason
             WHERE id = :due_id AND status = 'Pending'"
        );
        $stmt->execute([':admin_id' => Session::getUserId(), ':reason' => $reason, ':due_id' => $dueId]);
    }

    public function deleteBill(int $id): void {
        $this->db->prepare("DELETE FROM dues WHERE id = ?")->execute([$id]);
    }

    public function getSummary(): array {
        $month = date('Y-m');
        $row = $this->db->prepare(
            "SELECT
               SUM(CASE WHEN status='Paid'    THEN 1 ELSE 0 END)   AS paid_count,
               SUM(CASE WHEN status='Overdue' THEN 1 ELSE 0 END)   AS overdue_count,
               SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END)   AS pending_count,
               SUM(CASE WHEN status IN ('Unpaid','Partial') THEN 1 ELSE 0 END) AS unpaid_count,
               COALESCE(SUM(CASE WHEN status='Paid' THEN amount END), 0) AS total_collected,
               COALESCE(SUM(CASE WHEN status='Overdue' THEN amount END), 0) AS total_overdue
             FROM dues WHERE billing_month = ?"
        );
        $row->execute([$month]);
        return $row->fetch();
    }
}
