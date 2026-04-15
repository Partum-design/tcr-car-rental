<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}

require_once __DIR__ . '/wp-shim.php';
require_once __DIR__ . '/tcr-reservas.php';

function tcr_render_reservation_form(): string
{
    $callback = $GLOBALS['tcr_shortcodes']['tcr_reservation_form'] ?? null;
    if (!is_callable($callback)) {
        return '<p>No fue posible cargar el formulario de reservacion.</p>';
    }

    return (string) call_user_func($callback);
}