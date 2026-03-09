<?php
class User {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    public function findByUsername(string $username): ?array {
        $stmt = $this->db->prepare("SELECT * FROM users WHERE username = ? AND deleted_at IS NULL");
        $stmt->execute([$username]);
        return $stmt->fetch() ?: null;
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare(
            "SELECT id, username, first_name, last_name, role, status, last_login, created_at
             FROM users WHERE id = ? AND deleted_at IS NULL"
        );
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function getAll(): array {
        $stmt = $this->db->query(
            "SELECT id, username, first_name, last_name, role, status,
                    DATE_FORMAT(last_login,'%b %d %Y %H:%i') AS last_login
             FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC"
        );
        return $stmt->fetchAll();
    }

    public function create(array $data): int {
        $stmt = $this->db->prepare(
            "INSERT INTO users (username, password_hash, first_name, last_name, role, status, created_at)
             VALUES (:username, :password_hash, :first_name, :last_name, :role, :status, NOW())"
        );
        $stmt->execute([
            ':username'      => $data['username'],
            ':password_hash' => password_hash($data['password'], PASSWORD_BCRYPT),
            ':first_name'    => $data['first_name'],
            ':last_name'     => $data['last_name'],
            ':role'          => $data['role'],
            ':status'        => $data['status'] ?? 'Active',
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function updateStatus(int $id, string $status): bool {
        return $this->db->prepare("UPDATE users SET status = ? WHERE id = ?")
                        ->execute([$status, $id]);
    }

    public function delete(int $id): bool {
        return $this->db->prepare("UPDATE users SET deleted_at = NOW() WHERE id = ?")
                        ->execute([$id]);
    }

    public function verifyPassword(string $password, string $hash): bool {
        return password_verify($password, $hash);
    }

    public function updateLastLogin(int $id): void {
        $this->db->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")
                 ->execute([$id]);
    }

    public function usernameExists(string $username, int $excludeId = 0): bool {
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) FROM users WHERE username = ? AND id != ? AND deleted_at IS NULL"
        );
        $stmt->execute([$username, $excludeId]);
        return (bool)$stmt->fetchColumn();
    }
}
