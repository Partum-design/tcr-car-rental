const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const SMTP_ACCOUNTS = [
  {
    host: process.env.TCR_SMTP_INFO_HOST || 'mail.tcrcarrental.com',
    port: Number(process.env.TCR_SMTP_INFO_PORT || 465),
    secure: true,
    user: process.env.TCR_SMTP_INFO_USER || 'info@tcrcarrental.com',
    pass: process.env.TCR_SMTP_INFO_PASS || 'Kt{9Nxb2dp~rEA;W'
  },
  {
    host: process.env.TCR_SMTP_VENTAS_HOST || 'mail.tcrcarrental.com',
    port: Number(process.env.TCR_SMTP_VENTAS_PORT || 465),
    secure: true,
    user: process.env.TCR_SMTP_VENTAS_USER || 'ventas@tcrcarrental.com',
    pass: process.env.TCR_SMTP_VENTAS_PASS || '-!ghHW?S.Ua@q%oa'
  }
];

const RESERVATION_RECIPIENTS = [
  'bryan.lopez@partumdesign.com.mx',
  'info@tcrcarrental.com',
  'ventas@tcrcarrental.com'
];

const SITE_URL = (process.env.TCR_SITE_URL || 'https://tcrcarrental.com').replace(/\/$/, '');
const EMAIL_LOGO_URL = process.env.TCR_EMAIL_LOGO_URL || `${SITE_URL}/wp-content/uploads/2025/11/imgi_16_logo.png`;
const WHATSAPP_URL = 'https://wa.me/529987773600';
const CAR_CATALOG = loadCarCatalog();

module.exports = async (req, res) => {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const isEnglish = requestUrl.searchParams.get('lang') === 'en';

  if (req.method !== 'POST') {
    res.statusCode = 302;
    res.setHeader('Location', isEnglish ? '/en/' : '/');
    res.end();
    return;
  }

  try {
    const bodyText = await readBody(req);
    const params = new URLSearchParams(bodyText);

    const email = readParam(params, 'email');
    const car = readParam(params, 'car');
    const pickupDate = readParam(params, 'pickup_date');
    const dropoffDate = readParam(params, 'dropoff_date');

    if (!email || !car || !pickupDate || !dropoffDate) {
      redirect(res, isEnglish, 'missing-data');
      return;
    }

    const reservation = buildReservationData(params, isEnglish);
    await sendReservationEmails(reservation);

    res.statusCode = 302;
    res.setHeader('Location', isEnglish ? '/en/gracias-reservacion/' : '/gracias-reservacion/');
    res.end();
  } catch (err) {
    console.error('[TCR] Reservation submit error:', err && err.message ? err.message : err);
    redirect(res, isEnglish, 'submit-failed');
  }
};

function redirect(res, isEnglish, errorCode) {
  res.statusCode = 302;
  const basePath = isEnglish ? '/en/reservacion-prueba/' : '/reservacion-prueba/';
  res.setHeader('Location', `${basePath}?error=${errorCode}`);
  res.end();
}

function readParam(params, key) {
  return (params.get(key) || '').trim();
}

function buildReservationData(params, isEnglish) {
  const extras = params.getAll('extras[]').map((v) => v.trim()).filter(Boolean);
  const carName = readParam(params, 'car');
  const carMeta = getCarMeta(carName);

  return {
    reservationId: buildReservationId(),
    siteLanguage: isEnglish ? 'English' : 'Español',
    formLanguage: readParam(params, 'language') || (isEnglish ? 'English' : 'Español'),
    firstName: readParam(params, 'first_name'),
    lastName: readParam(params, 'last_name'),
    email: readParam(params, 'email'),
    phone: readParam(params, 'phone'),
    car: carName,
    carImage: carMeta.image,
    carPassengers: carMeta.passengers,
    dailyLow: carMeta.dailyLow,
    dailyHigh: carMeta.dailyHigh,
    pickupLocation: readParam(params, 'pickup_location'),
    dropoffLocation: readParam(params, 'dropoff_location'),
    pickupDate: readParam(params, 'pickup_date'),
    pickupTime: readParam(params, 'pickup_time'),
    dropoffDate: readParam(params, 'dropoff_date'),
    dropoffTime: readParam(params, 'dropoff_time'),
    passengers: readParam(params, 'passengers'),
    hotel: readParam(params, 'hotel'),
    originCity: readParam(params, 'origin_city'),
    airline: readParam(params, 'airline'),
    flightNumber: readParam(params, 'flight_number'),
    connection: params.get('connection') === '1' ? 'Sí' : 'No',
    extras,
    comments: readParam(params, 'comments'),
    submittedAt: formatDateTime(new Date())
  };
}

async function sendReservationEmails(reservation) {
  const { transporter, senderUser } = await createWorkingTransporter();
  const fullName = `${reservation.firstName} ${reservation.lastName}`.trim() || 'Cliente sin nombre';

  const adminSubject = `Nueva reservación TCR #${reservation.reservationId} - ${fullName}`;
  const adminHtml = buildAdminHtmlEmail(reservation);
  const adminText = buildAdminTextEmail(reservation);

  await transporter.sendMail({
    from: `"TCR Car Rental" <${senderUser}>`,
    to: RESERVATION_RECIPIENTS.join(', '),
    replyTo: reservation.email || undefined,
    subject: adminSubject,
    text: adminText,
    html: adminHtml
  });

  const clientSubject = `Confirmación de solicitud de reservación #${reservation.reservationId} - TCR Car Rental`;
  const clientHtml = buildClientHtmlEmail(reservation);
  const clientText = buildClientTextEmail(reservation);

  await transporter.sendMail({
    from: `"TCR Car Rental" <${senderUser}>`,
    to: reservation.email,
    subject: clientSubject,
    text: clientText,
    html: clientHtml
  });
}

async function createWorkingTransporter() {
  let lastError = null;

  for (const account of SMTP_ACCOUNTS) {
    try {
      const transporter = nodemailer.createTransport({
        host: account.host,
        port: account.port,
        secure: account.secure,
        auth: {
          user: account.user,
          pass: account.pass
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        tls: { rejectUnauthorized: true }
      });

      await transporter.verify();
      return { transporter, senderUser: account.user };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('No SMTP account succeeded');
}

function buildAdminTextEmail(r) {
  const lines = [
    `Nueva reservación recibida - #${r.reservationId}`,
    `Fecha: ${r.submittedAt}`,
    '',
    'DATOS DEL CLIENTE',
    `Nombre: ${`${r.firstName} ${r.lastName}`.trim() || 'No especificado'}`,
    `Correo: ${r.email || 'No especificado'}`,
    `Teléfono: ${r.phone || 'No especificado'}`,
    '',
    'DETALLES DE VEHÍCULO',
    `Auto: ${r.car || 'No especificado'}`,
    `Pasajeros: ${r.passengers || r.carPassengers || 'No especificado'}`,
    `Tarifa baja por día: ${r.dailyLow || 'No disponible'}`,
    `Tarifa alta por día: ${r.dailyHigh || 'No disponible'}`,
    '',
    'ITINERARIO',
    `Entrega: ${r.pickupLocation || 'No especificado'} - ${r.pickupDate || '-'} ${r.pickupTime || ''}`.trim(),
    `Devolución: ${r.dropoffLocation || 'No especificado'} - ${r.dropoffDate || '-'} ${r.dropoffTime || ''}`.trim(),
    '',
    'DATOS ADICIONALES',
    `Hotel: ${r.hotel || 'No especificado'}`,
    `Ciudad origen: ${r.originCity || 'No especificado'}`,
    `Aerolínea: ${r.airline || 'No especificado'}`,
    `No. vuelo: ${r.flightNumber || 'No especificado'}`,
    `Conexión: ${r.connection}`,
    `Extras: ${r.extras.length ? r.extras.join(', ') : 'Ninguno'}`,
    `Comentarios: ${r.comments || 'Sin comentarios'}`
  ];

  return lines.join('\n');
}

function buildClientTextEmail(r) {
  return [
    `Hola ${`${r.firstName} ${r.lastName}`.trim() || 'Cliente'},`,
    '',
    'Recibimos tu solicitud de reservación en TCR Car Rental.',
    `Folio: #${r.reservationId}`,
    `Vehículo: ${r.car || 'No especificado'}`,
    `Entrega: ${r.pickupLocation || '-'} - ${r.pickupDate || '-'} ${r.pickupTime || ''}`.trim(),
    `Devolución: ${r.dropoffLocation || '-'} - ${r.dropoffDate || '-'} ${r.dropoffTime || ''}`.trim(),
    '',
    'En un máximo de 24 horas te contactaremos para confirmación y link de pago.',
    `WhatsApp directo: ${WHATSAPP_URL}`,
    '',
    'Gracias por confiar en TCR Car Rental.'
  ].join('\n');
}

function buildAdminHtmlEmail(r) {
  const fullName = `${r.firstName} ${r.lastName}`.trim() || 'No especificado';
  const carImage = r.carImage ? `<img src="${escapeHtml(r.carImage)}" alt="${escapeHtml(r.car)}" style="display:block;width:100%;max-width:360px;border-radius:12px;border:1px solid #333;">` : '';

  return `
  <div style="margin:0;padding:0;background:#0d0f14;font-family:Arial,Helvetica,sans-serif;color:#fff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0d0f14;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:680px;max-width:680px;background:#12151d;border:1px solid #2a2f3a;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(90deg,#ffcd00,#f5b900);padding:20px 24px;text-align:center;">
                <img src="${escapeHtml(EMAIL_LOGO_URL)}" alt="TCR Car Rental" style="height:54px;max-width:260px;object-fit:contain;">
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 8px;font-size:26px;line-height:1.2;color:#ffffff;">Nueva reservación recibida</h1>
                <p style="margin:0;color:#c3cad8;font-size:14px;">Folio <strong>#${escapeHtml(r.reservationId)}</strong> · ${escapeHtml(r.submittedAt)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#0f1218;border:1px solid #2a2f3a;border-radius:12px;overflow:hidden;">
                  <tr><td colspan="4" style="padding:10px 12px;background:#0a0c11;color:#ffcd00;font-weight:700;font-size:13px;letter-spacing:.4px;">DATOS GENERALES</td></tr>
                  ${kvRow('Cliente', fullName, 'Idioma', r.formLanguage || 'No especificado')}
                  ${kvRow('Correo', r.email || 'No especificado', 'Teléfono', r.phone || 'No especificado')}
                  ${kvRow('Aerolínea', r.airline || 'No especificado', 'No. vuelo', r.flightNumber || 'No especificado')}
                  ${kvRow('Ciudad origen', r.originCity || 'No especificado', 'Conexión', r.connection)}
                  ${kvRow('Hotel', r.hotel || 'No especificado', 'Extras', r.extras.length ? r.extras.join(', ') : 'Ninguno')}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#0f1218;border:1px solid #2a2f3a;border-radius:12px;overflow:hidden;">
                  <tr><td colspan="4" style="padding:10px 12px;background:#0a0c11;color:#ffcd00;font-weight:700;font-size:13px;letter-spacing:.4px;">VEHÍCULO Y FECHAS</td></tr>
                  ${kvRow('Auto', r.car || 'No especificado', 'Pasajeros', r.passengers || r.carPassengers || 'No especificado')}
                  ${kvRow('Entrega', `${r.pickupLocation || 'No especificado'} - ${r.pickupDate || '-'} ${r.pickupTime || ''}`.trim(), 'Devolución', `${r.dropoffLocation || 'No especificado'} - ${r.dropoffDate || '-'} ${r.dropoffTime || ''}`.trim())}
                  ${kvRow('Tarifa baja / día', r.dailyLow || 'No disponible', 'Tarifa alta / día', r.dailyHigh || 'No disponible')}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 16px;">
                ${carImage}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#0f1218;border:1px solid #2a2f3a;border-radius:12px;overflow:hidden;">
                  <tr><td style="padding:10px 12px;background:#0a0c11;color:#ffcd00;font-weight:700;font-size:13px;letter-spacing:.4px;">COMENTARIOS</td></tr>
                  <tr><td style="padding:12px;color:#d5dbea;font-size:14px;line-height:1.55;">${escapeHtml(r.comments || 'Sin comentarios')}</td></tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
}

function buildClientHtmlEmail(r) {
  const fullName = `${r.firstName} ${r.lastName}`.trim() || 'Cliente';

  return `
  <div style="margin:0;padding:0;background:#0d0f14;font-family:Arial,Helvetica,sans-serif;color:#fff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0d0f14;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:680px;max-width:680px;background:#12151d;border:1px solid #2a2f3a;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(90deg,#ffcd00,#f5b900);padding:20px 24px;text-align:center;">
                <img src="${escapeHtml(EMAIL_LOGO_URL)}" alt="TCR Car Rental" style="height:54px;max-width:260px;object-fit:contain;">
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 10px;font-size:26px;line-height:1.2;color:#ffffff;">Confirmación de solicitud</h1>
                <p style="margin:0 0 14px;color:#c3cad8;font-size:15px;line-height:1.6;">Hola <strong>${escapeHtml(fullName)}</strong>, recibimos tu solicitud de reservación con folio <strong>#${escapeHtml(r.reservationId)}</strong>. Nuestro equipo te confirmará en máximo 24 horas con el enlace de pago.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#0f1218;border:1px solid #2a2f3a;border-radius:12px;overflow:hidden;">
                  <tr><td colspan="2" style="padding:10px 12px;background:#0a0c11;color:#ffcd00;font-weight:700;font-size:13px;letter-spacing:.4px;">RESUMEN DE TU RESERVACIÓN</td></tr>
                  ${summaryRow('Vehículo', r.car || 'No especificado')}
                  ${summaryRow('Entrega', `${r.pickupLocation || 'No especificado'} - ${r.pickupDate || '-'} ${r.pickupTime || ''}`.trim())}
                  ${summaryRow('Devolución', `${r.dropoffLocation || 'No especificado'} - ${r.dropoffDate || '-'} ${r.dropoffTime || ''}`.trim())}
                  ${summaryRow('Pasajeros', r.passengers || r.carPassengers || 'No especificado')}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;">
                <a href="${WHATSAPP_URL}" style="display:inline-block;padding:12px 20px;background:#25D366;color:#0b2714;text-decoration:none;font-weight:700;border-radius:999px;font-size:14px;">WhatsApp 998 777 3600</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;color:#9ea7ba;font-size:12px;line-height:1.6;">Si no reconoces esta solicitud, responde este correo para reportarlo.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
}

function kvRow(k1, v1, k2, v2) {
  return `<tr>
    <td style="padding:10px 12px;border-top:1px solid #22293a;color:#9aa6bf;font-size:12px;width:18%;">${escapeHtml(k1)}</td>
    <td style="padding:10px 12px;border-top:1px solid #22293a;color:#ffffff;font-size:14px;width:32%;font-weight:600;">${escapeHtml(v1)}</td>
    <td style="padding:10px 12px;border-top:1px solid #22293a;color:#9aa6bf;font-size:12px;width:18%;">${escapeHtml(k2)}</td>
    <td style="padding:10px 12px;border-top:1px solid #22293a;color:#ffffff;font-size:14px;width:32%;font-weight:600;">${escapeHtml(v2)}</td>
  </tr>`;
}

function summaryRow(key, value) {
  return `<tr>
    <td style="padding:10px 12px;border-top:1px solid #22293a;color:#9aa6bf;font-size:12px;width:34%;">${escapeHtml(key)}</td>
    <td style="padding:10px 12px;border-top:1px solid #22293a;color:#ffffff;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
  </tr>`;
}

function loadCarCatalog() {
  const filePath = path.join(process.cwd(), 'reservacion-prueba', 'index.html');
  const map = new Map();

  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const optionRegex = /<option\s+([^>]*?data-image="[^"]+"[^>]*)>([\s\S]*?)<\/option>/gi;
    let match;

    while ((match = optionRegex.exec(html)) !== null) {
      const attrs = match[1] || '';
      const label = (match[2] || '').replace(/\s+/g, ' ').trim();
      const value = readAttr(attrs, 'value');
      const image = readAttr(attrs, 'data-image');
      const passengers = readAttr(attrs, 'data-pax');
      const low = readAttr(attrs, 'data-low');
      const high = readAttr(attrs, 'data-high');

      const key = normalizeCarKey(value || label.split('—')[0] || '');
      if (!key || !image) continue;

      map.set(key, {
        image: absoluteImageUrl(image),
        passengers: passengers || '',
        dailyLow: low ? `$${Number(low).toLocaleString('en-US')}` : '',
        dailyHigh: high ? `$${Number(high).toLocaleString('en-US')}` : ''
      });
    }
  } catch (err) {
    console.warn('[TCR] No se pudo cargar catálogo de autos para email:', err && err.message ? err.message : err);
  }

  return map;
}

function getCarMeta(carName) {
  const key = normalizeCarKey(carName);
  if (!key || !CAR_CATALOG.size) {
    return { image: '', passengers: '', dailyLow: '', dailyHigh: '' };
  }

  const direct = CAR_CATALOG.get(key);
  if (direct) return direct;

  for (const [catalogKey, meta] of CAR_CATALOG.entries()) {
    if (key.includes(catalogKey) || catalogKey.includes(key)) {
      return meta;
    }
  }

  return { image: '', passengers: '', dailyLow: '', dailyHigh: '' };
}

function readAttr(attrText, attrName) {
  const escaped = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}="([^"]*)"`, 'i');
  const match = attrText.match(regex);
  return match ? match[1].trim() : '';
}

function normalizeCarKey(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function absoluteImageUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${SITE_URL}${url}`;
  return `${SITE_URL}/${url}`;
}

function buildReservationId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `${y}${m}${d}-${rand}`;
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City'
  }).format(date);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readBody(req) {
  if (typeof req.body === 'string') {
    return req.body;
  }

  if (req.body && typeof req.body === 'object') {
    return new URLSearchParams(req.body).toString();
  }

  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
