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

  const adminSubject = `[TCR Rental] CONFIRMACION TCR #${reservation.reservationId} - ${fullName}`;
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

  const clientSubject = `[TCR Rental] CONFIRMACION TCR #${reservation.reservationId}`;
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
  const pricing = buildPricingSummary(r);
  const lines = [
    `CONFIRMACION TCR - #${r.reservationId}`,
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
    '',
    'SU RENTA INCLUYE',
    '- Seguro de colisión y robo con deducible del 10%',
    '- Kilometraje libre',
    '- Seguro de responsabilidad civil',
    '- Impuestos federales',
    '- Impuestos aeroportuarios',
    '- Seguro de gastos médicos',
    '- Asistencia legal',
    '- Transporte gratuito Aeropuerto <-> Oficina',
    '',
    `Comentarios: ${r.comments || 'Sin comentarios'}`,
    '',
    'CONCEPTO / IMPORTE',
    pricing.rows.map((row) => `- ${row.label}: ${row.amount}`).join('\n'),
    `Total estimado: ${pricing.total}`
  ];

  return lines.join('\n');
}

function buildClientTextEmail(r) {
  const pricing = buildPricingSummary(r);
  return [
    `Hola ${`${r.firstName} ${r.lastName}`.trim() || 'Cliente'},`,
    '',
    'CONFIRMACION TCR',
    `Folio de reservación: #${r.reservationId}`,
    '',
    'Recibimos tu solicitud de reservación en TCR Car Rental. En un máximo de 24 horas te enviaremos confirmación final y link de pago.',
    '',
    `Vehículo: ${r.car || 'No especificado'}`,
    `Entrega: ${r.pickupLocation || '-'} - ${r.pickupDate || '-'} ${r.pickupTime || ''}`.trim(),
    `Devolución: ${r.dropoffLocation || '-'} - ${r.dropoffDate || '-'} ${r.dropoffTime || ''}`.trim(),
    `Pasajeros: ${r.passengers || r.carPassengers || 'No especificado'}`,
    `Hotel: ${r.hotel || 'No especificado'}`,
    `Extras: ${r.extras.length ? r.extras.join(', ') : 'Ninguno'}`,
    `Comentarios: ${r.comments || 'Sin comentarios'}`,
    '',
    'Total estimado:',
    pricing.total,
    '',
    `WhatsApp directo: ${WHATSAPP_URL}`,
    '',
    'Gracias por confiar en TCR Car Rental.'
  ].join('\n');
}

function buildAdminHtmlEmail(r) {
  return buildConfirmationHtml(r, false);
}

function buildClientHtmlEmail(r) {
  return buildConfirmationHtml(r, true);
}

function buildConfirmationHtml(r, forClient) {
  const fullName = `${r.firstName} ${r.lastName}`.trim() || 'No especificado';
  const carImageHtml = r.carImage
    ? `<img src="${escapeHtml(r.carImage)}" alt="${escapeHtml(r.car || 'Vehículo')}" style="display:block;width:100%;max-width:420px;margin:0 auto;border:1px solid #d8e6ff;border-radius:10px;">`
    : `<div style="padding:22px;text-align:center;color:#6a7690;font-size:13px;">Imagen del vehículo no disponible</div>`;
  const pricing = buildPricingSummary(r);
  const introText = forClient
    ? `Estimado(a) ${escapeHtml(fullName)}, recibimos su solicitud de reservación. En un periodo máximo de 24 horas nos pondremos en contacto para confirmación y envío de link de pago PayPal.`
    : `Se recibió una nueva solicitud de reservación desde el formulario web de TCR Car Rental.`;

  const conceptsHtml = pricing.rows.map((row) => conceptRow(row.label, row.amount)).join('');
  const extrasText = r.extras.length ? r.extras.join(', ') : 'Ninguno';

  return `
  <div style="margin:0;padding:0;background:#edf3ff;font-family:Arial,Helvetica,sans-serif;color:#0f1c33;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf3ff;padding:20px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="780" cellspacing="0" cellpadding="0" style="width:780px;max-width:780px;background:#ffffff;border:1px solid #c7d9ff;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px 10px;">
                <h1 style="margin:0;color:#0a4abf;font-size:34px;line-height:1.1;font-weight:800;">CONFIRMACION TCR</h1>
                <p style="margin:10px 0 4px;color:#2d3f66;font-size:14px;line-height:1.55;">${introText}</p>
                <p style="margin:0;color:#445679;font-size:13px;line-height:1.55;"><strong>Origen:</strong> TCR Car Rental<br><strong>WhatsApp:</strong> 9987773600<br><strong>Temporada aplicada:</strong> Temporada baja</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 4px;">
                ${sectionTitle('Datos Generales')}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  ${kvRow('Reservación', `#${r.reservationId}`, 'Idioma', r.formLanguage || 'Español')}
                  ${kvRow('Cliente', fullName, 'Fecha', r.submittedAt)}
                  ${kvRow('Teléfono', r.phone || 'No especificado', 'Email', r.email || 'No especificado')}
                  ${kvRow('Aerolínea', r.airline || 'No especificado', 'No. vuelo', r.flightNumber || 'No especificado')}
                  ${kvRow('Ciudad origen', r.originCity || 'No especificado', 'Conexión', r.connection)}
                  ${kvRow('Hotel', r.hotel || 'No especificado', 'Extras', extrasText)}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 4px;">
                ${sectionTitle('Vehículo')}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  ${kvRow('Auto', r.car || 'No especificado', 'No. pasajeros', r.passengers || r.carPassengers || 'No especificado')}
                  ${kvRow('Entrega', r.pickupLocation || 'No especificado', 'Fecha / hora', `${r.pickupDate || '-'} ${r.pickupTime || ''}`.trim())}
                  ${kvRow('Devolución', r.dropoffLocation || 'No especificado', 'Fecha / hora', `${r.dropoffDate || '-'} ${r.dropoffTime || ''}`.trim())}
                  ${kvRow('Tarifa baja / día', r.dailyLow || 'Por confirmar', 'Tarifa alta / día', r.dailyHigh || 'Por confirmar')}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 24px 4px;">${carImageHtml}</td>
            </tr>
            <tr>
              <td style="padding:12px 24px 4px;">
                ${sectionTitle('Su Renta Incluye')}
                <div style="border:1px solid #d8e6ff;border-top:none;padding:12px 14px;color:#1f2d4b;font-size:14px;line-height:1.7;">
                  • Seguro de colisión y robo con deducible del 10%<br>
                  • Kilometraje libre<br>
                  • Seguro de responsabilidad civil<br>
                  • Impuestos federales<br>
                  • Impuestos aeroportuarios<br>
                  • Seguro de gastos médicos<br>
                  • Asistencia legal<br>
                  • Transporte gratuito de Aeropuerto a oficina y de oficina a Aeropuerto
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 4px;">
                ${sectionTitle('Comentarios')}
                <div style="border:1px solid #d8e6ff;border-top:none;padding:12px 14px;color:#1f2d4b;font-size:14px;line-height:1.6;">${escapeHtml(r.comments || 'Sin comentarios')}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 20px;">
                ${sectionTitle('Concepto')}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d8e6ff;border-top:none;">
                  <tr>
                    <td style="padding:10px 12px;background:#e9f1ff;color:#0a4abf;font-size:12px;font-weight:700;border-bottom:1px solid #d8e6ff;">Concepto</td>
                    <td style="padding:10px 12px;background:#e9f1ff;color:#0a4abf;font-size:12px;font-weight:700;border-bottom:1px solid #d8e6ff;text-align:right;">Importe</td>
                  </tr>
                  ${conceptsHtml}
                  <tr>
                    <td style="padding:12px;border-top:2px solid #b9cff8;font-weight:700;color:#0d2450;">Total estimado</td>
                    <td style="padding:12px;border-top:2px solid #b9cff8;font-weight:800;color:#0a4abf;text-align:right;">${escapeHtml(pricing.total)}</td>
                  </tr>
                </table>
                <p style="margin:10px 0 0;color:#5a6884;font-size:11px;line-height:1.5;">Nota: El total es estimado y puede ajustarse según temporada, horarios especiales o servicios extra confirmados.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
}

function sectionTitle(label) {
  return `<div style="background:#0a4abf;color:#ffffff;padding:9px 12px;font-size:14px;font-weight:700;letter-spacing:.3px;border:1px solid #0a4abf;">${escapeHtml(label)}</div>`;
}

function kvRow(k1, v1, k2, v2) {
  return `<tr>
    <td style="padding:9px 10px;border:1px solid #d8e6ff;background:#f2f7ff;color:#0a4abf;font-size:12px;width:20%;font-weight:700;">${escapeHtml(k1)}</td>
    <td style="padding:9px 10px;border:1px solid #d8e6ff;color:#14284d;font-size:13px;width:30%;font-weight:600;">${escapeHtml(v1)}</td>
    <td style="padding:9px 10px;border:1px solid #d8e6ff;background:#f2f7ff;color:#0a4abf;font-size:12px;width:20%;font-weight:700;">${escapeHtml(k2)}</td>
    <td style="padding:9px 10px;border:1px solid #d8e6ff;color:#14284d;font-size:13px;width:30%;font-weight:600;">${escapeHtml(v2)}</td>
  </tr>`;
}

function conceptRow(label, amount) {
  return `<tr>
    <td style="padding:10px 12px;border-top:1px solid #d8e6ff;color:#1c2f56;font-size:13px;">${escapeHtml(label)}</td>
    <td style="padding:10px 12px;border-top:1px solid #d8e6ff;color:#1c2f56;font-size:13px;text-align:right;font-weight:700;">${escapeHtml(amount)}</td>
  </tr>`;
}

function buildPricingSummary(r) {
  const rows = [];
  const days = calculateDays(r.pickupDate, r.dropoffDate);
  const lowRate = parseCurrency(r.dailyLow);

  if (days > 0 && lowRate > 0) {
    rows.push({
      label: `Auto (${days} día${days > 1 ? 's' : ''} x ${formatCurrency(lowRate)})`,
      amount: formatCurrency(days * lowRate)
    });
  } else {
    rows.push({ label: `Auto (${r.car || 'No especificado'})`, amount: 'Por confirmar' });
  }

  rows.push({ label: `Entrega (${r.pickupLocation || 'No especificado'})`, amount: 'Por confirmar' });
  rows.push({ label: `Devolución (${r.dropoffLocation || 'No especificado'})`, amount: 'Por confirmar' });

  if (r.extras && r.extras.length) {
    r.extras.forEach((extra) => rows.push({ label: `Extra: ${extra}`, amount: 'Por confirmar' }));
  }

  const knownTotal = rows
    .map((row) => (row.amount.startsWith('$') ? parseCurrency(row.amount) : 0))
    .reduce((sum, value) => sum + value, 0);

  return {
    rows,
    total: knownTotal > 0 ? `${formatCurrency(knownTotal)} MXN` : 'Por confirmar'
  };
}

function calculateDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const s = new Date(`${startDate}T12:00:00`);
  const e = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function parseCurrency(value) {
  if (!value) return 0;
  const normalized = String(value).replace(/[^0-9.-]/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2
  }).format(value);
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
