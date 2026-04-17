-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 09, 2026 at 06:51 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `villa_purita_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `activity_log`
--

CREATE TABLE `activity_log` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `table_name` varchar(60) DEFAULT NULL,
  `record_id` int(10) UNSIGNED DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `announcements`
--

CREATE TABLE `announcements` (
  `id` int(10) UNSIGNED NOT NULL,
  `title` varchar(200) NOT NULL,
  `content` text NOT NULL,
  `category` enum('General','Urgent','Event','Maintenance','Payment Reminder') DEFAULT 'General',
  `target_audience` varchar(60) DEFAULT 'All Homeowners',
  `post_date` date NOT NULL,
  `expiry_date` date DEFAULT NULL,
  `posted_by` int(10) UNSIGNED DEFAULT NULL,
  `archived` tinyint(1) DEFAULT 0,
  `created_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `announcements`
--

INSERT INTO `announcements` (`id`, `title`, `content`, `category`, `target_audience`, `post_date`, `expiry_date`, `posted_by`, `archived`, `created_at`) VALUES
(1, 'HELLO GUYS', 'WASSUP', 'General', 'All Homeowners', '2026-03-11', NULL, 1, 0, '2026-03-11 21:43:51'),
(2, 'WASSUP', 'HEYYY', 'General', 'All Homeowners', '2026-03-11', NULL, 1, 0, '2026-03-11 22:14:08');

-- --------------------------------------------------------

--
-- Table structure for table `dues`
--

CREATE TABLE `dues` (
  `id` int(10) UNSIGNED NOT NULL,
  `resident_id` int(10) UNSIGNED NOT NULL,
  `billing_month` varchar(7) NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT 500.00,
  `status` enum('Paid','Unpaid','Overdue','Partial') DEFAULT 'Unpaid',
  `date_paid` datetime DEFAULT NULL,
  `payment_method` enum('Cash','GCash','Bank Transfer','Check','Other') DEFAULT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `confirmed_by` int(10) UNSIGNED DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `issued_by` int(10) UNSIGNED DEFAULT NULL,
  `issued_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `incidents`
--

CREATE TABLE `incidents` (
  `id` int(10) UNSIGNED NOT NULL,
  `incident_type` varchar(80) NOT NULL,
  `description` text NOT NULL,
  `priority` enum('High','Medium','Low') DEFAULT 'Medium',
  `block` varchar(20) DEFAULT NULL,
  `lot_number` varchar(10) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `reported_by` int(10) UNSIGNED DEFAULT NULL,
  `status` enum('Open','In Progress','Resolved','Closed') DEFAULT 'Open',
  `resolution_notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `incidents`
--

INSERT INTO `incidents` (`id`, `incident_type`, `description`, `priority`, `block`, `lot_number`, `latitude`, `longitude`, `reported_by`, `status`, `resolution_notes`, `created_at`, `updated_at`) VALUES
(1, 'Fire', 'SUNOG!!!!!', 'Medium', 'Block A', '12', NULL, NULL, 1, 'Resolved', '', '2026-03-09 23:34:52', '2026-03-09 23:36:27'),
(2, 'Theft/Robbery', 'kawatan yawa', 'High', 'Block A', '13', NULL, NULL, 4, 'Resolved', '', '2026-03-09 23:36:49', '2026-03-12 23:20:30'),
(3, 'Vandalism', 'animal ka', 'Medium', 'Block A', NULL, NULL, NULL, 1, 'Resolved', '', '2026-03-12 23:20:40', '2026-03-12 23:29:32');

-- --------------------------------------------------------

--
-- Table structure for table `lots`
--

CREATE TABLE `lots` (
  `id` int(10) UNSIGNED NOT NULL,
  `block` varchar(20) NOT NULL,
  `lot_number` varchar(10) NOT NULL,
  `area_sqm` decimal(8,2) DEFAULT NULL,
  `status` enum('Vacant','Occupied','Reserved','For Sale') DEFAULT 'Vacant',
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `lots`
--

INSERT INTO `lots` (`id`, `block`, `lot_number`, `area_sqm`, `status`, `latitude`, `longitude`, `created_at`) VALUES
(1, 'Block A', 'Lot 01', 120.00, 'Occupied', 10.31600000, 123.88540000, '2026-03-09 22:30:07'),
(2, 'Block A', 'Lot 02', 100.00, 'Vacant', 10.31610000, 123.88550000, '2026-03-09 22:30:07'),
(3, 'Block A', 'Lot 03', 120.00, 'Occupied', 10.31620000, 123.88560000, '2026-03-09 22:30:07'),
(4, 'Block B', 'Lot 07', 130.00, 'Occupied', 10.31550000, 123.88520000, '2026-03-09 22:30:07'),
(5, 'Block C', 'Lot 12', 110.00, 'Occupied', 10.31500000, 123.88580000, '2026-03-09 22:30:07'),
(6, 'Block D', 'Lot 01', 150.00, 'Occupied', 10.31450000, 123.88500000, '2026-03-09 22:30:07');

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `type` varchar(40) NOT NULL,
  `title` varchar(200) NOT NULL,
  `message` text DEFAULT NULL,
  `reference_id` int(10) UNSIGNED DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`id`, `user_id`, `type`, `title`, `message`, `reference_id`, `is_read`, `created_at`) VALUES
(1, 2, 'incident', '🚨 Medium — Fire', 'Location: Block A Lot 12', 1, 0, '2026-03-09 23:34:52'),
(2, 3, 'incident', '🚨 Medium — Fire', 'Location: Block A Lot 12', 1, 0, '2026-03-09 23:34:52'),
(3, 5, 'incident', '🚨 Medium — Fire', 'Location: Block A Lot 12', 1, 0, '2026-03-09 23:34:52'),
(4, 2, 'incident', '🚨 High — Theft/Robbery', 'Location: Block A Lot 13', 2, 0, '2026-03-09 23:36:49'),
(5, 3, 'incident', '🚨 High — Theft/Robbery', 'Location: Block A Lot 13', 2, 0, '2026-03-09 23:36:49'),
(6, 5, 'incident', '🚨 High — Theft/Robbery', 'Location: Block A Lot 13', 2, 0, '2026-03-09 23:36:49'),
(7, 2, 'incident', '🚨 Medium — Vandalism', 'Location: Block A', 3, 0, '2026-03-12 23:20:40'),
(8, 3, 'incident', '🚨 Medium — Vandalism', 'Location: Block A', 3, 0, '2026-03-12 23:20:40'),
(9, 5, 'incident', '🚨 Medium — Vandalism', 'Location: Block A', 3, 0, '2026-03-12 23:20:40');

-- --------------------------------------------------------

--
-- Table structure for table `residents`
--

CREATE TABLE `residents` (
  `id` int(10) UNSIGNED NOT NULL,
  `lot_id` int(10) UNSIGNED DEFAULT NULL,
  `first_name` varchar(80) NOT NULL,
  `last_name` varchar(80) NOT NULL,
  `block` varchar(20) NOT NULL,
  `lot_number` varchar(10) NOT NULL,
  `year_of_residency` year(4) NOT NULL,
  `occupancy_status` enum('Owner','Tenant','Co-owner') DEFAULT 'Owner',
  `contact_number` varchar(20) DEFAULT NULL,
  `contact_visibility` enum('admin_only','guard_access','public') DEFAULT 'admin_only',
  `status` enum('Active','Pending','Inactive') DEFAULT 'Active',
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `residents`
--

INSERT INTO `residents` (`id`, `lot_id`, `first_name`, `last_name`, `block`, `lot_number`, `year_of_residency`, `occupancy_status`, `contact_number`, `contact_visibility`, `status`, `user_id`, `created_at`, `deleted_at`) VALUES
(1, NULL, 'Jodee Dwayne', 'Somera', 'Block A', '25', '2025', 'Owner', '09123456789', 'admin_only', 'Active', NULL, '2026-03-09 23:33:25', '2026-04-05 22:17:20'),
(2, NULL, 'Nash', 'Nogger', 'Block A', '67', '2024', 'Owner', '123123123', 'admin_only', 'Active', NULL, '2026-03-12 23:22:57', '2026-04-05 22:17:22'),
(3, NULL, 'Nashu', 'Sanchez', 'Block A', '1', '2026', 'Owner', '09123123', 'admin_only', 'Active', 4, '2026-04-05 22:32:51', NULL),
(4, NULL, 'Navigail', 'Ruiz', 'Block B', '01', '2025', 'Owner', '09123123123', 'admin_only', 'Active', NULL, '2026-04-05 23:00:09', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `shifts`
--

CREATE TABLE `shifts` (
  `id` int(11) NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime DEFAULT NULL,
  `status` enum('Active','Ended') DEFAULT 'Active',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `shifts`
--

INSERT INTO `shifts` (`id`, `user_id`, `start_time`, `end_time`, `status`, `created_at`, `updated_at`) VALUES
(1, 5, '2026-04-10 00:37:00', '2026-04-10 00:37:04', 'Ended', '2026-04-10 00:37:00', '2026-04-10 00:37:04'),
(2, 5, '2026-04-10 00:37:07', '2026-04-10 00:37:09', 'Ended', '2026-04-10 00:37:07', '2026-04-10 00:37:09'),
(3, 5, '2026-04-10 00:37:10', '2026-04-10 00:37:10', 'Ended', '2026-04-10 00:37:10', '2026-04-10 00:37:10'),
(4, 5, '2026-04-10 00:37:11', '2026-04-10 00:37:13', 'Ended', '2026-04-10 00:37:11', '2026-04-10 00:37:13'),
(5, 5, '2026-04-10 00:37:13', '2026-04-10 00:37:14', 'Ended', '2026-04-10 00:37:13', '2026-04-10 00:37:14'),
(6, 5, '2026-04-10 00:37:16', '2026-04-10 00:37:17', 'Ended', '2026-04-10 00:37:16', '2026-04-10 00:37:17'),
(7, 5, '2026-04-10 00:37:18', '2026-04-10 00:37:22', 'Ended', '2026-04-10 00:37:18', '2026-04-10 00:37:22'),
(8, 5, '2026-04-10 00:37:23', '2026-04-10 00:37:31', 'Ended', '2026-04-10 00:37:23', '2026-04-10 00:37:31'),
(9, 5, '2026-04-10 00:37:31', '2026-04-10 00:37:32', 'Ended', '2026-04-10 00:37:31', '2026-04-10 00:37:32'),
(10, 5, '2026-04-10 00:38:15', '2026-04-10 00:38:22', 'Ended', '2026-04-10 00:38:15', '2026-04-10 00:38:22'),
(11, 5, '2026-04-10 00:38:49', '2026-04-10 00:38:49', 'Ended', '2026-04-10 00:38:49', '2026-04-10 00:38:49'),
(12, 5, '2026-04-10 00:38:52', '2026-04-10 00:38:52', 'Ended', '2026-04-10 00:38:52', '2026-04-10 00:38:52'),
(13, 5, '2026-04-10 00:38:53', '2026-04-10 00:38:54', 'Ended', '2026-04-10 00:38:53', '2026-04-10 00:38:54'),
(14, 5, '2026-04-10 00:38:54', '2026-04-10 00:38:55', 'Ended', '2026-04-10 00:38:54', '2026-04-10 00:38:55'),
(15, 5, '2026-04-10 00:39:01', '2026-04-10 00:39:01', 'Ended', '2026-04-10 00:39:01', '2026-04-10 00:39:01'),
(16, 5, '2026-04-10 00:42:09', NULL, 'Active', '2026-04-10 00:42:09', '2026-04-10 00:42:09');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `password_reset_token` varchar(64) DEFAULT NULL,
  `password_reset_expires` datetime DEFAULT NULL,
  `first_name` varchar(80) NOT NULL,
  `last_name` varchar(80) NOT NULL,
  `role` enum('Administrator','Guard','Homeowner') NOT NULL,
  `status` enum('Active','Inactive') DEFAULT 'Active',
  `last_login` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `password_reset_token`, `password_reset_expires`, `first_name`, `last_name`, `role`, `status`, `last_login`, `created_at`, `deleted_at`) VALUES
(1, 'admin', NULL, '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, NULL, 'HOA', 'Administrator', 'Administrator', 'Active', '2026-04-10 00:49:12', '2026-03-09 22:30:07', NULL),
(2, 'guard_cruz', NULL, '$argon2id$...', NULL, NULL, 'Pedro', 'Cruz', 'Guard', 'Active', NULL, '2026-03-09 22:30:07', '2026-03-09 23:30:54'),
(3, 'guard_delacruz', NULL, '$argon2id$...', NULL, NULL, 'Ramon', 'Dela Cruz', 'Guard', 'Active', NULL, '2026-03-09 22:30:07', '2026-03-09 23:30:56'),
(4, 'nashu', NULL, '$2y$10$e7Fl9sQ1rsDGQDdbsiPgA.fOtLR4DQfsOv8k1oaK1MSxl0ZzN3zCO', NULL, NULL, 'Nashu', 'Sanchez', 'Homeowner', 'Active', '2026-04-10 00:48:41', '2026-03-09 23:29:08', NULL),
(5, 'ekosh', NULL, '$2y$10$a2.JHoAReAE584qeSG9isu0bhuByBpBEF0K1PN9GSO9E.u92vi8xm', NULL, NULL, 'Jericho', 'Alcala', 'Guard', 'Active', '2026-04-10 00:48:17', '2026-03-09 23:30:48', NULL),
(6, 'zeyuru', 'requirosoaaronr@gmail.com', '$2y$10$bY0TfcKXDnS1/XtdkKVa9.Ir3HNStXB5PBeUyiEWW3gCxcdYugx4C', NULL, NULL, 'Aaron', 'Ruiz', 'Homeowner', 'Active', '2026-04-05 22:39:42', '2026-04-05 22:33:17', '2026-04-05 22:44:49'),
(26, 'violeta', 'rnavigail@gmail.com', '$2y$10$sCTpFSl0qTiva61EWeubU.TksZbULRa76GrvbWHZHQ2Kbmi76hvhG', NULL, NULL, 'Violeta', 'Ruiz', 'Homeowner', 'Active', '2026-04-10 00:14:41', '2026-04-09 14:29:09', NULL),
(27, 'kc', 'aronzkiaron@gmail.com', '$2y$10$BtKB8Pl9ryPonmTJ9DgvreaNFWiXTSQPQJf5nuYFKyH3a1fML7EeG', NULL, NULL, 'Keycee', 'Bolambot', 'Homeowner', 'Active', '2026-04-09 14:53:31', '2026-04-09 14:38:11', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `visitors`
--

CREATE TABLE `visitors` (
  `id` int(10) UNSIGNED NOT NULL,
  `visitor_name` varchar(150) NOT NULL,
  `purpose` enum('Guest Visit','Delivery','Utility/Repair','Business','Family','Other') DEFAULT 'Guest Visit',
  `visiting_resident_id` int(10) UNSIGNED DEFAULT NULL,
  `visiting_block` varchar(20) NOT NULL,
  `visiting_lot` varchar(10) NOT NULL,
  `visiting_homeowner_id` int(10) UNSIGNED DEFAULT NULL,
  `id_type` varchar(60) DEFAULT NULL,
  `id_number` varchar(80) DEFAULT NULL,
  `vehicle_plate` varchar(20) DEFAULT NULL,
  `time_in` datetime NOT NULL,
  `time_out` datetime DEFAULT NULL,
  `status` enum('Inside','Left') DEFAULT 'Inside',
  `guard_id` int(10) UNSIGNED DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `visitors`
--

INSERT INTO `visitors` (`id`, `visitor_name`, `purpose`, `visiting_resident_id`, `visiting_block`, `visiting_lot`, `visiting_homeowner_id`, `id_type`, `id_number`, `vehicle_plate`, `time_in`, `time_out`, `status`, `guard_id`, `notes`, `created_at`) VALUES
(1, 'Aaron Ruiz', 'Delivery', NULL, 'Block A', '26', NULL, '321', '123', '321', '2026-03-12 23:22:02', '2026-03-12 23:29:38', 'Left', 5, NULL, '2026-03-12 23:22:02'),
(2, 'KC', 'Delivery', NULL, 'Block A', '25', NULL, 'Student ID', NULL, '123123', '2026-03-13 14:01:58', '2026-03-13 14:08:55', 'Left', 5, NULL, '2026-03-13 14:01:58');

-- --------------------------------------------------------

--
-- Stand-in structure for view `v_daily_visitor_summary`
-- (See below for the actual view)
--
CREATE TABLE `v_daily_visitor_summary` (
`visit_date` date
,`total_visitors` bigint(21)
,`still_inside` decimal(23,0)
,`exited` decimal(23,0)
,`deliveries` decimal(23,0)
,`guests` decimal(23,0)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `v_resident_dues_summary`
-- (See below for the actual view)
--
CREATE TABLE `v_resident_dues_summary` (
`id` int(10) unsigned
,`full_name` varchar(162)
,`block` varchar(20)
,`lot_number` varchar(10)
,`resident_status` enum('Active','Pending','Inactive')
,`total_bills` bigint(21)
,`total_paid` decimal(32,2)
,`total_outstanding` decimal(32,2)
,`has_overdue` bigint(1)
);

-- --------------------------------------------------------

--
-- Structure for view `v_daily_visitor_summary`
--
DROP TABLE IF EXISTS `v_daily_visitor_summary`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_daily_visitor_summary`  AS SELECT cast(`visitors`.`time_in` as date) AS `visit_date`, count(0) AS `total_visitors`, sum(`visitors`.`status` = 'Inside') AS `still_inside`, sum(`visitors`.`status` = 'Left') AS `exited`, sum(`visitors`.`purpose` = 'Delivery') AS `deliveries`, sum(`visitors`.`purpose` = 'Guest Visit') AS `guests` FROM `visitors` GROUP BY cast(`visitors`.`time_in` as date) ;

-- --------------------------------------------------------

--
-- Structure for view `v_resident_dues_summary`
--
DROP TABLE IF EXISTS `v_resident_dues_summary`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_resident_dues_summary`  AS SELECT `r`.`id` AS `id`, concat(`r`.`last_name`,', ',`r`.`first_name`) AS `full_name`, `r`.`block` AS `block`, `r`.`lot_number` AS `lot_number`, `r`.`status` AS `resident_status`, count(`d`.`id`) AS `total_bills`, sum(case when `d`.`status` = 'Paid' then `d`.`amount` else 0 end) AS `total_paid`, sum(case when `d`.`status` in ('Unpaid','Overdue') then `d`.`amount` else 0 end) AS `total_outstanding`, max(case when `d`.`status` = 'Overdue' then 1 else 0 end) AS `has_overdue` FROM (`residents` `r` left join `dues` `d` on(`d`.`resident_id` = `r`.`id`)) WHERE `r`.`deleted_at` is null GROUP BY `r`.`id` ;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `activity_log`
--
ALTER TABLE `activity_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_created` (`created_at`);

--
-- Indexes for table `announcements`
--
ALTER TABLE `announcements`
  ADD PRIMARY KEY (`id`),
  ADD KEY `posted_by` (`posted_by`),
  ADD KEY `idx_post_date` (`post_date`);

--
-- Indexes for table `dues`
--
ALTER TABLE `dues`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_resident_month` (`resident_id`,`billing_month`),
  ADD KEY `confirmed_by` (`confirmed_by`),
  ADD KEY `idx_billing_month` (`billing_month`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `dues_issued_by_fk` (`issued_by`);

--
-- Indexes for table `incidents`
--
ALTER TABLE `incidents`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reported_by` (`reported_by`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_priority` (`priority`),
  ADD KEY `idx_created` (`created_at`);

--
-- Indexes for table `lots`
--
ALTER TABLE `lots`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_block_lot` (`block`,`lot_number`),
  ADD KEY `idx_block` (`block`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user_read` (`user_id`,`is_read`),
  ADD KEY `idx_created` (`created_at`);

--
-- Indexes for table `residents`
--
ALTER TABLE `residents`
  ADD PRIMARY KEY (`id`),
  ADD KEY `lot_id` (`lot_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_block_lot` (`block`,`lot_number`),
  ADD KEY `idx_status` (`status`);

--
-- Indexes for table `shifts`
--
ALTER TABLE `shifts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_shifts_user_id` (`user_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `uq_users_email` (`email`),
  ADD KEY `idx_role` (`role`),
  ADD KEY `idx_status` (`status`);

--
-- Indexes for table `visitors`
--
ALTER TABLE `visitors`
  ADD PRIMARY KEY (`id`),
  ADD KEY `visiting_resident_id` (`visiting_resident_id`),
  ADD KEY `guard_id` (`guard_id`),
  ADD KEY `idx_time_in` (`time_in`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `visitors_homeowner_fk` (`visiting_homeowner_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `activity_log`
--
ALTER TABLE `activity_log`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `announcements`
--
ALTER TABLE `announcements`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `dues`
--
ALTER TABLE `dues`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `incidents`
--
ALTER TABLE `incidents`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `lots`
--
ALTER TABLE `lots`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `residents`
--
ALTER TABLE `residents`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `shifts`
--
ALTER TABLE `shifts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=28;

--
-- AUTO_INCREMENT for table `visitors`
--
ALTER TABLE `visitors`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `activity_log`
--
ALTER TABLE `activity_log`
  ADD CONSTRAINT `activity_log_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `announcements`
--
ALTER TABLE `announcements`
  ADD CONSTRAINT `announcements_ibfk_1` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `dues`
--
ALTER TABLE `dues`
  ADD CONSTRAINT `dues_ibfk_1` FOREIGN KEY (`resident_id`) REFERENCES `residents` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `dues_ibfk_2` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `dues_issued_by_fk` FOREIGN KEY (`issued_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `incidents`
--
ALTER TABLE `incidents`
  ADD CONSTRAINT `incidents_ibfk_1` FOREIGN KEY (`reported_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `residents`
--
ALTER TABLE `residents`
  ADD CONSTRAINT `residents_ibfk_1` FOREIGN KEY (`lot_id`) REFERENCES `lots` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `residents_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `shifts`
--
ALTER TABLE `shifts`
  ADD CONSTRAINT `fk_shifts_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `visitors`
--
ALTER TABLE `visitors`
  ADD CONSTRAINT `visitors_homeowner_fk` FOREIGN KEY (`visiting_homeowner_id`) REFERENCES `residents` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `visitors_ibfk_1` FOREIGN KEY (`visiting_resident_id`) REFERENCES `residents` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `visitors_ibfk_2` FOREIGN KEY (`guard_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
