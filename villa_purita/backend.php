<?php
/**
 * Villa Purita Subdivision — PHP Backend Framework
 * Minglanilla, Cebu Management System
 *
 * The code has been separated into the following directories:
 *
 * /config/         — Configuration files (database, session)
 * /middleware/     — Authentication middleware
 * /helpers/        — Utility classes (Response)
 * /models/         — Data models (User, Resident, Visitor, etc.)
 * /controllers/    — Business logic controllers
 * /api/            — API routing and entry point
 *
 * Entry point: /api/index.php
 */

// Redirect to the API entry point
require_once __DIR__ . '/api/index.php';
