-- ============================================================
-- Villa Purita — Resident Coordinates Migration
-- Run once on villa_purita_db
-- ============================================================

ALTER TABLE `residents`
  ADD COLUMN `latitude`  DECIMAL(10, 7) DEFAULT NULL AFTER `status`,
  ADD COLUMN `longitude` DECIMAL(10, 7) DEFAULT NULL AFTER `latitude`;

-- Done ✓
-- After running this, admins can click each house on the map
-- inside the Resident Details modal to save coordinates.
