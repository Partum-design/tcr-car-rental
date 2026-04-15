# TCR Car Rental (Vercel Static)

Sitio migrado a formato compatible con Vercel:

- Páginas estáticas HTML (`index.html` por ruta).
- Assets en `wp-content/uploads`.
- Endpoint serverless en `api/submit-reservation.js` para procesar el formulario y redirigir a `/gracias-reservacion/`.

## Estructura

- `index.html`
- `servicios/index.html`
- `contacto/index.html`
- `reservacion-prueba/index.html`
- `gracias-reservacion/index.html`
- `api/submit-reservation.js`
- `vercel.json`

## Deploy

Este proyecto está listo para deploy directo en Vercel desde GitHub.

## Nota formulario

El flujo del formulario funciona en frontend y el submit redirige correctamente a la página de gracias.
Si deseas envío real por correo/CRM, se integra en `api/submit-reservation.js` con credenciales del proveedor.