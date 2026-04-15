<?php
declare(strict_types=1);

if (!isset($GLOBALS['tcr_shortcodes'])) {
    $GLOBALS['tcr_shortcodes'] = [];
}

function add_shortcode(string $tag, callable $callback): void
{
    $GLOBALS['tcr_shortcodes'][$tag] = $callback;
}

function add_filter(string $tag, callable $callback): void
{
    // No-op outside WordPress.
}

function add_action(string $tag, callable|string $callback): void
{
    // No-op outside WordPress.
}

function esc_html(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function esc_attr(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function esc_url(string $url): string
{
    return filter_var(trim($url), FILTER_SANITIZE_URL) ?: '';
}

function admin_url(string $path = ''): string
{
    if ($path === 'admin-post.php') {
        return '/submit-reservation.php';
    }
    return '/' . ltrim($path, '/');
}

function wp_nonce_field(string $action, string $name): void
{
    echo '<input type="hidden" name="' . esc_attr($name) . '" value="tcr_static_nonce">';
}

function wp_verify_nonce(string $nonce, string $action): bool
{
    return hash_equals('tcr_static_nonce', $nonce);
}

function sanitize_text_field(string $value): string
{
    $value = strip_tags($value);
    $value = preg_replace('/[\r\n\t]+/', ' ', $value) ?? $value;
    return trim($value);
}

function sanitize_email(string $email): string
{
    $email = filter_var(trim($email), FILTER_SANITIZE_EMAIL);
    return $email ?: '';
}

function sanitize_textarea_field(string $value): string
{
    $value = strip_tags($value);
    $value = str_replace("\r", '', $value);
    return trim($value);
}

function wp_die(string $message): never
{
    http_response_code(400);
    echo '<h1>Error</h1><p>' . esc_html($message) . '</p>';
    exit;
}

function wp_rand(int $min, int $max): int
{
    return random_int($min, $max);
}

function current_time(string $format): string
{
    $tz = new DateTimeZone('America/Mexico_City');
    return (new DateTime('now', $tz))->format($format);
}

function wp_mail(string $to, string $subject, string $message, array $headers = []): bool
{
    $headerString = implode("\r\n", $headers);
    // In local environments without SMTP, suppress transport warnings so
    // reservation flow can still finish and redirect correctly.
    return (bool) @mail($to, $subject, $message, $headerString);
}

function home_url(string $path = ''): string
{
    if ($path === '') {
        return '/';
    }
    if (!str_starts_with($path, '/')) {
        $path = '/' . $path;
    }
    return $path;
}

function wp_safe_redirect(string $url): void
{
    header('Location: ' . $url, true, 302);
}
