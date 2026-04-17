-- ============================================================
-- Villa Purita — Password Reset Migration
-- Run once on villa_purita_db
-- ============================================================

-- 1. Email column already exists, skipping add

-- 2. Add unique index on email (nullable, so allow multiple NULLs)
-- MySQL 8+ allows functional indexes; use a partial approach for older versions:
ALTER TABLE `users`
  ADD UNIQUE KEY IF NOT EXISTS `uq_users_email` (`email`);

-- 3. Add password reset token columns
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `password_reset_token`   VARCHAR(64)  DEFAULT NULL AFTER `password_hash`,
  ADD COLUMN IF NOT EXISTS `password_reset_expires` DATETIME     DEFAULT NULL AFTER `password_reset_token`;

-- 4. Add shifts table for guard shift logging
CREATE TABLE IF NOT EXISTS `shifts` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`     INT NOT NULL,
  `start_time`  DATETIME NOT NULL,
  `end_time`    DATETIME DEFAULT NULL,
  `status`      ENUM('Active', 'Ended') DEFAULT 'Active',
  `created_at`  DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Done ✓
