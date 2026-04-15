<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap-plugin.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wp_safe_redirect(home_url('/'));
    exit;
}

tcr_submit_reservation();
