<?php
class Announcement {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    public function getAll(): array {
        $stmt = $this->db->query(
            "SELECT a.*,
                    CONCAT(u.first_name,' ',u.last_name) AS posted_by_name,
                    u.username AS posted_by_username
             FROM announcements a
             LEFT JOIN users u ON u.id = a.posted_by
             WHERE a.archived = 0
             ORDER BY a.post_date DESC, a.created_at DESC
             LIMIT 50"
        );
        return $stmt->fetchAll();
    }

    public function create(array $data): int {
        $stmt = $this->db->prepare(
            "INSERT INTO announcements
             (title, content, category, target_audience, post_date, expiry_date, posted_by, created_at)
             VALUES
             (:title, :content, :category, :target, :post_date, :expiry, :posted_by, NOW())"
        );
        $stmt->execute([
            ':title'     => $data['title'],
            ':content'   => $data['content'],
            ':category'  => $data['category'],
            ':target'    => $data['target_audience'],
            ':post_date' => $data['post_date'] ?? date('Y-m-d'),
            ':expiry'    => $data['expiry_date'] ?: null,
            ':posted_by' => Session::getUserId(),
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function archive(int $id): bool {
        return $this->db->prepare("UPDATE announcements SET archived = 1 WHERE id = ?")
                        ->execute([$id]);
    }
}
