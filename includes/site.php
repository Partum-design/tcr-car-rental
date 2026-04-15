<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap-plugin.php';

function tcr_fragment_path(string $name): string
{
    return __DIR__ . '/fragments/' . $name . '.html';
}

function tcr_load_fragment(string $name): string
{
    $path = tcr_fragment_path($name);
    if (!is_file($path)) {
        return '';
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        return '';
    }
    return $raw;
}

function tcr_cleanup_fragment_markup(string $html): string
{
    $html = str_replace(["\r\n", "\r"], "\n", $html);
    $html = preg_replace('#https?://(?:www\.)?tcrcarrental\.com/wp-content/uploads/#i', '/wp-content/uploads/', $html) ?? $html;
    $html = preg_replace('#https?://(?:www\.)?tcrcarrental\.com/#i', '/', $html) ?? $html;

    // Normalizar slugs internos a formato carpeta para evitar 404 en servidores simples.
    $html = str_replace('href="/servicios"', 'href="/servicios/"', $html);
    $html = str_replace('href="/contacto"', 'href="/contacto/"', $html);
    $html = str_replace('href="/reservacion-prueba"', 'href="/reservacion-prueba/"', $html);
    $html = str_replace('href="/gracias-reservacion"', 'href="/gracias-reservacion/"', $html);

    // Some Elementor HTML widgets contain full documents; keep their inner markup only.
    $html = preg_replace('~<!DOCTYPE[^>]*>~i', '', $html) ?? $html;
    $html = preg_replace('~</?html[^>]*>~i', '', $html) ?? $html;
    $html = preg_replace('~</?head[^>]*>~i', '', $html) ?? $html;
    $html = preg_replace('~</?body[^>]*>~i', '', $html) ?? $html;
    $html = preg_replace('~<meta[^>]*>~i', '', $html) ?? $html;
    $html = preg_replace('~<title[^>]*>.*?</title>~is', '', $html) ?? $html;

    return trim($html);
}

function tcr_apply_shortcodes(string $html): string
{
    return preg_replace_callback(
        '/\[tcr_reservation_form\]/',
        static fn(): string => tcr_render_reservation_form(),
        $html
    ) ?? $html;
}

function tcr_render_fragment(string $name): string
{
    $html = tcr_load_fragment($name);
    $html = tcr_apply_shortcodes($html);
    return tcr_cleanup_fragment_markup($html);
}

function tcr_render_page(string $title, string $contentFragment, bool $withHeader = true, bool $withFooter = true): void
{
    $header = $withHeader ? tcr_render_fragment('header') : '';
    $content = tcr_render_fragment($contentFragment);
    $footer = $withFooter ? tcr_render_fragment('footer') : '';

    header('Content-Type: text/html; charset=UTF-8');
    echo '<!DOCTYPE html>';
    echo '<html lang="es">';
    echo '<head>';
    echo '<meta charset="UTF-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
    echo '<title>' . esc_html($title) . '</title>';
    echo '<style>html,body{margin:0;padding:0}body{background:#fff;color:#111}*{box-sizing:border-box}</style>';
    echo '</head>';
    echo '<body>';
    echo $header;
    echo $content;
    echo $footer;
    echo '</body>';
    echo '</html>';
}
