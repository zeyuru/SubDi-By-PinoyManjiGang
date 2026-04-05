<?php
class User {
    private PDO $db;
    private ?bool $emailExists = null;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    private function hasEmailColumn(): bool {
        if ($this->emailExists !== null) return $this->emailExists;
        try {
            $stmt = $this->db->query("SHOW COLUMNS FROM users LIKE 'email'");
            $this->emailExists = $stmt && $stmt->rowCount() > 0;
        } catch (PDOException $e) {
            $this->emailExists = false;
        }
        return $this->emailExists;
    }

    public function findByUsername(string $username): ?array {
        $stmt = $this->db->prepare("SELECT * FROM users WHERE username = ? AND deleted_at IS NULL");
        $stmt->execute([$username]);
        return $stmt->fetch() ?: null;
    }

    public function findById(int $id): ?array {
        $emailField = $this->hasEmailColumn() ? ', email' : '';
        $stmt = $this->db->prepare(
            "SELECT id, username{$emailField}, first_name, last_name, role, status, last_login, created_at
             FROM users WHERE id = ? AND deleted_at IS NULL"
        );
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function getAll(): array {
        $emailField = $this->hasEmailColumn() ? ', email' : '';
        $stmt = $this->db->query(
            "SELECT id, username{$emailField}, first_name, last_name, role, status,
                    DATE_FORMAT(last_login,'%b %d %Y %H:%i') AS last_login
             FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC"
        );
        return $stmt->fetchAll();
    }

    public function create(array $data): int {
        if ($this->hasEmailColumn()) {
            $stmt = $this->db->prepare(
                "INSERT INTO users (username, email, password_hash, first_name, last_name, role, status, created_at)
                 VALUES (:username, :email, :password_hash, :first_name, :last_name, :role, :status, NOW())"
            );
            $stmt->execute([
                ':username'      => $data['username'],
                ':email'         => $data['email'] ?? null,
                ':password_hash' => password_hash($data['password'], PASSWORD_BCRYPT),
                ':first_name'    => $data['first_name'],
                ':last_name'     => $data['last_name'],
                ':role'          => $data['role'],
                ':status'        => $data['status'] ?? 'Active',
            ]);
        } else {
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
        }
        return (int)$this->db->lastInsertId();
    }

    public function updateStatus(int $id, string $status): bool {
        return $this->db->prepare("UPDATE users SET status = ? WHERE id = ?")
                        ->execute([$status, $id]);
    }

    public function delete(int $id): bool {
        $deletedUsername = "deleted_user_" . $id . "_" . time();
        if ($this->hasEmailColumn()) {
            $stmt = $this->db->prepare(
                "UPDATE users SET deleted_at = NOW(), username = ?, email = NULL, status = 'Inactive' WHERE id = ?"
            );
            return $stmt->execute([$deletedUsername, $id]);
        }
        $stmt = $this->db->prepare(
            "UPDATE users SET deleted_at = NOW(), username = ?, status = 'Inactive' WHERE id = ?"
        );
        return $stmt->execute([$deletedUsername, $id]);
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

    public function emailExists(string $email, int $excludeId = 0): bool {
        if (!$this->hasEmailColumn()) {
            return false;
        }
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) FROM users WHERE email = ? AND id != ? AND deleted_at IS NULL"
        );
        $stmt->execute([$email, $excludeId]);
        return (bool)$stmt->fetchColumn();
    }

    public function updateAccount(int $id, array $data): bool {
        $fields = [];
        $params = [];
        if (array_key_exists('email', $data) && $this->hasEmailColumn()) {
            $fields[] = 'email = :email';
            $params[':email'] = $data['email'] ?: null;
        }
        if (!empty($data['password'])) {
            $fields[] = 'password_hash = :password_hash';
            $params[':password_hash'] = password_hash($data['password'], PASSWORD_BCRYPT);
        }
        if (empty($fields)) {
            return false;
        }
        $params[':id'] = $id;
        $stmt = $this->db->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id');
        return $stmt->execute($params);
    }
}
