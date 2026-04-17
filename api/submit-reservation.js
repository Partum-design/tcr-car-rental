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
const MIN_RENTAL_DAYS = 3;
const AFTER_HOURS_FEE = 300;
const LOCATION_FEES = {
  'Cancún': 0,
  'Cancún zona hotelera': 400,
  'Puerto Morelos': 500,
  'Playa del Carmen': 900,
  Tulum: 1500,
  Chetumal: 3800,
  Mérida: 3400,
  'Los Cabos San Lucas': 0,
  'México DF': 0
};
const EXTRA_FEES = {
  baby_seat: { label: 'Silla de bebé', amount: 100 },
  extra_driver: { label: 'Conductor adicional', amount: 95 }
};
const RENTA_INCLUYE = [
  'Seguro de colisión y robo con deducible del 10%',
  'Kilometraje libre',
  'Seguro de responsabilidad civil',
  'Impuestos federales',
  'Impuestos aeroportuarios',
  'Seguro de gastos médicos',
  'Asistencia legal',
  'Transporte gratuito de Aeropuerto a oficina y de oficina a Aeropuerto'
];
const HIGH_SEASON_RANGES = [
  { name: 'Semana Santa', start: '04-01', end: '04-15' },
  { name: 'Verano', start: '07-15', end: '08-10' },
  { name: 'Diciembre', start: '12-12', end: '01-10' }
];
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

  const adminSubject = `[TCR Rental] Detalle TCR #${reservation.reservationId} - ${fullName}`;
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

  const clientSubject = `[TCR Rental] Detalle TCR #${reservation.reservationId}`;
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
  const fullName = `${r.firstName} ${r.lastName}`.trim() || 'No especificado';
  const lines = [
    `DETALLE TCR - #${r.reservationId}`,
    `Fecha: ${r.submittedAt}`,
    '',
    'DATOS GENERALES',
    `Reservación: #${r.reservationId}`,
    `Cliente: ${fullName}`,
    `Idioma: ${r.formLanguage || 'No especificado'}`,
    `Teléfono: ${r.phone || 'No especificado'}`,
    `Correo: ${r.email || 'No especificado'}`,
    `Aerolínea: ${r.airline || 'No especificado'}`,
    `No. vuelo: ${r.flightNumber || 'No especificado'}`,
    `Ciudad origen: ${r.originCity || 'No especificado'}`,
    `Conexión: ${r.connection}`,
    `Hotel: ${r.hotel || 'No especificado'}`,
    '',
    'VEHÍCULO',
    `Auto: ${r.car || 'No especificado'}`,
    `No. pasajeros: ${r.passengers || r.carPassengers || 'No especificado'}`,
    `Entrega: ${r.pickupLocation || 'No especificado'} - ${r.pickupDate || '-'} ${r.pickupTime || ''}`.trim(),
    `Devolución: ${r.dropoffLocation || 'No especificado'} - ${r.dropoffDate || '-'} ${r.dropoffTime || ''}`.trim(),
    `Tarifa diaria (${pricing.seasonLabel}): ${formatCurrency(pricing.dailyRate)}`,
    `Pasajeros: ${r.passengers || r.carPassengers || 'No especificado'}`,
    '',
    'SU RENTA INCLUYE',
    ...RENTA_INCLUYE.map((item) => `- ${item}`),
    '',
    `Comentarios: ${r.comments || 'Sin comentarios'}`,
    '',
    'CONCEPTO / IMPORTE',
    ...pricing.rows.map((row) => `- ${row.label}: ${row.amount}`),
    `Total estimado: ${pricing.total}`
  ];

  return lines.join('\n');
}

function buildClientTextEmail(r) {
  const pricing = buildPricingSummary(r);
  const fullName = `${r.firstName} ${r.lastName}`.trim() || 'Cliente';
  return [
    `Hola ${fullName},`,
    '',
    'DETALLE TCR',
    `Folio de reservación: #${r.reservationId}`,
    '',
    'Recibimos tu solicitud y este es el detalle registrado. En un máximo de 24 horas te contactaremos con el enlace de pago.',
    '',
    `Idioma: ${r.formLanguage || 'No especificado'}`,
    `Teléfono: ${r.phone || 'No especificado'}`,
    `Vehículo: ${r.car || 'No especificado'}`,
    `Tarifa diaria (${pricing.seasonLabel}): ${formatCurrency(pricing.dailyRate)}`,
    `Entrega: ${r.pickupLocation || '-'} - ${r.pickupDate || '-'} ${r.pickupTime || ''}`.trim(),
    `Devolución: ${r.dropoffLocation || '-'} - ${r.dropoffDate || '-'} ${r.dropoffTime || ''}`.trim(),
    `Pasajeros: ${r.passengers || r.carPassengers || 'No especificado'}`,
    `Hotel: ${r.hotel || 'No especificado'}`,
    `Extras: ${r.extras.length ? r.extras.join(', ') : 'Ninguno'}`,
    `Comentarios: ${r.comments || 'Sin comentarios'}`,
    '',
    ...pricing.rows.map((row) => `${row.label}: ${row.amount}`),
    `Total estimado: ${pricing.total}`,
    '',
    `WhatsApp directo: ${WHATSAPP_URL}`,
    '',
    'Gracias por confiar en TCR Car Rental.'
  ].join('\n');
}

function buildAdminHtmlEmail(r) {
  return buildReservationHtml(r, false);
}

function buildClientHtmlEmail(r) {
  return buildReservationHtml(r, true);
}

function buildReservationHtml(r, forClient) {
  const pricing = buildPricingSummary(r);
  const fullName = `${r.firstName} ${r.lastName}`.trim() || 'No especificado';
  const carImageHtml = r.carImage
    ? `<img src="${escapeHtml(r.carImage)}" alt="${escapeHtml(r.car || 'Vehículo')}" style="display:block;width:100%;max-width:360px;height:220px;object-fit:contain;margin:0 auto;border:1px solid #d8e6ff;border-radius:8px;background:#f7fbff;">`
    : `<div style="padding:22px;text-align:center;color:#6a7690;font-size:13px;">Imagen del vehículo no disponible</div>`;
  const introText = forClient
    ? `Estimado(a) ${escapeHtml(fullName)}, este correo contiene el detalle completo de su solicitud enviada en TCR Car Rental.`
    : `Se recibió una nueva solicitud desde el formulario web de TCR Car Rental con el detalle completo.`;

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
                <h1 style="margin:0;color:#0a4abf;font-size:34px;line-height:1.1;font-weight:800;">DETALLE TCR</h1>
                <p style="margin:10px 0 4px;color:#2d3f66;font-size:14px;line-height:1.55;">${introText}</p>
                <p style="margin:0;color:#445679;font-size:13px;line-height:1.55;"><strong>Origen:</strong> TCR Car Rental<br><strong>WhatsApp:</strong> 9987773600<br><strong>Temporada aplicada:</strong> ${escapeHtml(pricing.seasonLabel)}</p>
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
                  ${kvRow('Tarifa diaria', formatCurrency(pricing.dailyRate), 'Días cobrados', String(pricing.days))}
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
                  ${RENTA_INCLUYE.map((item) => `• ${escapeHtml(item)}`).join('<br>')}
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
  const seasonInfo = detectSeason(r.pickupDate, r.dropoffDate);
  const lowRate = Number(r.dailyLow || 0);
  const highRate = Number(r.dailyHigh || 0);
  const dailyRate = seasonInfo.season === 'high' ? (highRate > 0 ? highRate : lowRate) : lowRate;
  const rawDays = calculateDays(r.pickupDate, r.dropoffDate);
  const days = Math.max(MIN_RENTAL_DAYS, rawDays || 1);
  const carAmount = dailyRate * days;

  rows.push({
    label: `Auto (${days} día${days > 1 ? 's' : ''} x ${formatCurrency(dailyRate)})`,
    amount: formatCurrency(carAmount)
  });

  const pickupFee = LOCATION_FEES[r.pickupLocation] ?? 0;
  if (pickupFee > 0) {
    rows.push({
      label: `Cargo por ciudad (Entrega: ${r.pickupLocation})`,
      amount: formatCurrency(pickupFee)
    });
  }

  const dropoffFee = LOCATION_FEES[r.dropoffLocation] ?? 0;
  if (dropoffFee > 0) {
    rows.push({
      label: `Cargo por ciudad (Devolución: ${r.dropoffLocation})`,
      amount: formatCurrency(dropoffFee)
    });
  }

  const afterHoursApplied = isAfterHours(r.pickupTime) || isAfterHours(r.dropoffTime);
  if (afterHoursApplied) {
    rows.push({
      label: 'Cargo fuera de horario (10:00 pm a 5:00 am)',
      amount: formatCurrency(AFTER_HOURS_FEE)
    });
  }

  if (r.extras && r.extras.length) {
    r.extras.forEach((extraKey) => {
      const extra = EXTRA_FEES[extraKey];
      if (extra) {
        rows.push({
          label: extra.label,
          amount: formatCurrency(extra.amount)
        });
      }
    });
  }

  const total = rows.reduce((sum, row) => sum + parseCurrency(row.amount), 0);

  return {
    rows,
    total: formatCurrency(total),
    totalRaw: total,
    season: seasonInfo.season,
    seasonLabel: seasonInfo.label,
    dailyRate,
    days
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

function detectSeason(startDate, endDate) {
  if (!startDate) return { season: 'low', label: 'Temporada baja' };

  const start = new Date(`${startDate}T00:00:00`);
  const end = endDate ? new Date(`${endDate}T00:00:00`) : new Date(start.getTime() + 86400000);
  const finalEnd = end > start ? end : new Date(start.getTime() + 86400000);

  const cursor = new Date(start);
  let guard = 0;
  while (cursor < finalEnd && guard < 370) {
    const md = `${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    for (const range of HIGH_SEASON_RANGES) {
      if (isMonthDayInRange(md, range.start, range.end)) {
        return { season: 'high', label: `Temporada alta — ${range.name}` };
      }
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }

  return { season: 'low', label: 'Temporada baja' };
}

function isMonthDayInRange(md, start, end) {
  if (start <= end) {
    return md >= start && md <= end;
  }
  return md >= start || md <= end;
}

function isAfterHours(timeValue) {
  if (!timeValue || !/^\d{2}:\d{2}$/.test(timeValue)) return false;
  const [h, m] = timeValue.split(':').map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  const mins = h * 60 + m;
  return mins >= 22 * 60 || mins <= 5 * 60;
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
  const map = new Map();
  loadCatalogFromPlugin(map);
  loadCatalogFromReservationHtml(map);
  return map;
}

function loadCatalogFromPlugin(map) {
  const pluginPath = path.join(process.cwd(), '..', 'bakcup-tcr', 'wp-content', 'plugins', 'tcr-reservas', 'tcr-reservas.php');
  if (!fs.existsSync(pluginPath)) return;

  try {
    const php = fs.readFileSync(pluginPath, 'utf8');
    const carRegex = /'([^']+)'\s*=>\s*\[\s*'low'\s*=>\s*([0-9.]+)\s*,\s*'high'\s*=>\s*([0-9.]+)\s*,\s*'image'\s*=>\s*'([^']+)'\s*,\s*'pax'\s*=>\s*([0-9.]+)/g;
    let match;
    while ((match = carRegex.exec(php)) !== null) {
      const name = match[1];
      const low = Number(match[2] || 0);
      const high = Number(match[3] || 0);
      const image = match[4];
      const pax = match[5];
      const key = normalizeCarKey(name);
      if (!key) continue;
      map.set(key, {
        image: absoluteImageUrl(image),
        passengers: pax || '',
        dailyLow: Number.isFinite(low) ? low : 0,
        dailyHigh: Number.isFinite(high) ? high : 0
      });
    }
  } catch (err) {
    console.warn('[TCR] No se pudo cargar catálogo de autos desde plugin:', err && err.message ? err.message : err);
  }
}

function loadCatalogFromReservationHtml(map) {
  const filePath = path.join(process.cwd(), 'reservacion-prueba', 'index.html');

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
        dailyLow: Number(low || 0),
        dailyHigh: Number(high || 0)
      });
    }
  } catch (err) {
    console.warn('[TCR] No se pudo cargar catálogo de autos para email:', err && err.message ? err.message : err);
  }
}

function getCarMeta(carName) {
  const key = normalizeCarKey(carName);
  if (!key || !CAR_CATALOG.size) {
    return { image: '', passengers: '', dailyLow: 0, dailyHigh: 0 };
  }

  const direct = CAR_CATALOG.get(key);
  if (direct) return direct;

  for (const [catalogKey, meta] of CAR_CATALOG.entries()) {
    if (key.includes(catalogKey) || catalogKey.includes(key)) {
      return meta;
    }
  }

  return { image: '', passengers: '', dailyLow: 0, dailyHigh: 0 };
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
