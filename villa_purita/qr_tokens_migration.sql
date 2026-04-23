-- ============================================================
-- Villa Purita — QR Tokens Migration
-- Run once on villa_purita_db
-- ============================================================

CREATE TABLE IF NOT EXISTS `qr_tokens` (
  `id`               int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `token`            varchar(64)      NOT NULL,
  `resident_id`      int(10) UNSIGNED NOT NULL,
  `created_by`       int(10) UNSIGNED DEFAULT NULL,
  `created_at`       datetime         NOT NULL DEFAULT current_timestamp(),
  `first_scanned_at` datetime         DEFAULT NULL,
  `used`             tinyint(1)       NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `resident_id` (`resident_id`),
  CONSTRAINT `qr_tokens_resident_fk`
    FOREIGN KEY (`resident_id`) REFERENCES `residents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Done ✓
-- After running this, guards and admins can generate visitor QR codes
-- that expire 5 minutes after the visitor first scans them.
