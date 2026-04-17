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

    // Basic validation for required fields from the reservation form.
    const email = (params.get('email') || '').trim();
    const car = (params.get('car') || '').trim();
    const pickupDate = (params.get('pickup_date') || '').trim();
    const dropoffDate = (params.get('dropoff_date') || '').trim();

    if (!email || !car || !pickupDate || !dropoffDate) {
      res.statusCode = 302;
      res.setHeader(
        'Location',
        isEnglish ? '/en/reservacion-prueba/?error=missing-data' : '/reservacion-prueba/?error=missing-data'
      );
      res.end();
      return;
    }

    // For static Vercel deployment, acknowledge reservation flow and continue UX.
    // Replace with provider integration (Resend/SMTP/DB) when credentials are available.
    res.statusCode = 302;
    res.setHeader('Location', isEnglish ? '/en/gracias-reservacion/' : '/gracias-reservacion/');
    res.end();
  } catch (_err) {
    res.statusCode = 302;
    res.setHeader(
      'Location',
      isEnglish ? '/en/reservacion-prueba/?error=submit-failed' : '/reservacion-prueba/?error=submit-failed'
    );
    res.end();
  }
};

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
