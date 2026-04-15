# TCR Standalone (HTML/CSS/JS/PHP)

Migración del backup WordPress a una versión standalone usando:

- `HTML/CSS/JS` para frontend.
- `PHP` para el flujo de reservación/cotización.
- El plugin original `tcr-reservas` reutilizado desde `includes/tcr-reservas.php` con un shim de funciones WordPress.

## Estructura

- `index.php` -> Inicio
- `servicios/index.php`
- `contacto/index.php`
- `reservacion-prueba/index.php`
- `gracias-reservacion/index.php`
- `submit-reservation.php` -> handler POST del formulario
- `includes/wp-shim.php` -> compatibilidad WP mínima
- `includes/bootstrap-plugin.php` -> carga del plugin
- `includes/site.php` -> render de páginas/fragments
- `includes/fragments/*.html` -> contenido reconstruido desde Elementor
- `wp-content/uploads` -> junction al backup original

## Ejecutar local

1. Instala PHP 8.x con `mail()` habilitado.
2. Desde esta carpeta:

```bash
php -S localhost:8080
```

3. Abre:

- `http://localhost:8080/`

## Ajustes recomendados

- Datos de marca, WhatsApp y correos internos están en:
  - `includes/tcr-reservas.php` (funciones `tcr_whatsapp_number()`, `tcr_mail_from_email()`, `tcr_internal_emails()`).
- Si cambias dominio/rutas de uploads, actualiza:
  - `includes/wp-shim.php` (`tcr_localize_url`).
