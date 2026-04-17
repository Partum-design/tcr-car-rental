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

  return {
    siteLanguage: isEnglish ? 'English' : 'Español',
    formLanguage: readParam(params, 'language'),
    firstName: readParam(params, 'first_name'),
    lastName: readParam(params, 'last_name'),
    email: readParam(params, 'email'),
    phone: readParam(params, 'phone'),
    car: readParam(params, 'car'),
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
    submittedAt: new Date().toISOString()
  };
}

async function sendReservationEmails(reservation) {
  const fullName = `${reservation.firstName} ${reservation.lastName}`.trim() || 'Sin nombre';
  const subject = `Nueva reservación TCR - ${fullName} - ${reservation.car || 'Auto no especificado'}`;
  const to = RESERVATION_RECIPIENTS.join(', ');

  const text = buildTextEmail(reservation);
  const html = buildHtmlEmail(reservation);

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
        socketTimeout: 20000
      });

      await transporter.sendMail({
        from: `"TCR Car Rental" <${account.user}>`,
        to,
        replyTo: reservation.email || undefined,
        subject,
        text,
        html
      });

      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('No SMTP account succeeded');
}

function buildTextEmail(r) {
  const lines = [
    'Nueva reservación recibida en TCR Car Rental',
    '',
    `Fecha de envío: ${r.submittedAt}`,
    `Idioma del sitio: ${r.siteLanguage}`,
    `Idioma del formulario: ${r.formLanguage || 'No especificado'}`,
    '',
    'Datos del cliente',
    `Nombre: ${`${r.firstName} ${r.lastName}`.trim() || 'No especificado'}`,
    `Correo: ${r.email || 'No especificado'}`,
    `Teléfono: ${r.phone || 'No especificado'}`,
    '',
    'Detalles de renta',
    `Auto: ${r.car || 'No especificado'}`,
    `Recoger: ${r.pickupLocation || 'No especificado'} - ${r.pickupDate || '-'} ${r.pickupTime || ''}`.trim(),
    `Devolver: ${r.dropoffLocation || 'No especificado'} - ${r.dropoffDate || '-'} ${r.dropoffTime || ''}`.trim(),
    `Pasajeros: ${r.passengers || 'No especificado'}`,
    '',
    'Información adicional',
    `Hotel: ${r.hotel || 'No especificado'}`,
    `Ciudad de origen: ${r.originCity || 'No especificado'}`,
    `Aerolínea: ${r.airline || 'No especificado'}`,
    `Número de vuelo: ${r.flightNumber || 'No especificado'}`,
    `Vuelo con conexión: ${r.connection}`,
    `Extras: ${r.extras.length ? r.extras.join(', ') : 'Ninguno'}`,
    '',
    'Comentarios',
    r.comments || 'Sin comentarios'
  ];

  return lines.join('\n');
}

function buildHtmlEmail(r) {
  const fullName = escapeHtml(`${r.firstName} ${r.lastName}`.trim() || 'No especificado');
  const rows = [
    ['Fecha de envío', r.submittedAt],
    ['Idioma del sitio', r.siteLanguage],
    ['Idioma del formulario', r.formLanguage || 'No especificado'],
    ['Nombre', fullName],
    ['Correo', r.email || 'No especificado'],
    ['Teléfono', r.phone || 'No especificado'],
    ['Auto', r.car || 'No especificado'],
    ['Recoger', `${r.pickupLocation || 'No especificado'} - ${r.pickupDate || '-'} ${r.pickupTime || ''}`.trim()],
    ['Devolver', `${r.dropoffLocation || 'No especificado'} - ${r.dropoffDate || '-'} ${r.dropoffTime || ''}`.trim()],
    ['Pasajeros', r.passengers || 'No especificado'],
    ['Hotel', r.hotel || 'No especificado'],
    ['Ciudad de origen', r.originCity || 'No especificado'],
    ['Aerolínea', r.airline || 'No especificado'],
    ['Número de vuelo', r.flightNumber || 'No especificado'],
    ['Vuelo con conexión', r.connection],
    ['Extras', r.extras.length ? r.extras.join(', ') : 'Ninguno'],
    ['Comentarios', r.comments || 'Sin comentarios']
  ];

  const tableRows = rows
    .map(([k, v]) => `<tr><td style="padding:8px;border:1px solid #e3e3e3;background:#f7f7f7;font-weight:600;">${escapeHtml(k)}</td><td style="padding:8px;border:1px solid #e3e3e3;">${escapeHtml(v)}</td></tr>`)
    .join('');

  return `
  <div style="font-family:Arial,sans-serif;color:#222;">
    <h2 style="margin:0 0 12px;">Nueva reservación recibida en TCR Car Rental</h2>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:680px;max-width:100%;">
      ${tableRows}
    </table>
  </div>
  `;
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
