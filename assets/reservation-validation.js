(function () {
  const scope = document.getElementById('tcr-reserva');
  if (!scope) return;

  const form = scope.querySelector('form');
  const pickup = scope.querySelector('#tcr_pickup_date');
  const dropoff = scope.querySelector('#tcr_dropoff_date');
  const submitButton = scope.querySelector('button[type="submit"]');
  if (!form || !pickup || !dropoff) return;

  const MIN_DAYS = 3;
  const MAX_DAYS = 90;
  const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en');
  const messages = {
    invalidDate: isEnglish
      ? 'Please choose a valid future rental period of 3 to 90 days.'
      : 'Selecciona un periodo válido en el futuro de 3 a 90 días.',
    invalidPickup: isEnglish
      ? 'The pickup date cannot be in the past.'
      : 'La fecha de entrega no puede estar en el pasado.',
    tooShort: isEnglish
      ? 'The minimum rental is 3 full days.'
      : 'La renta mínima es de 3 días completos.',
    tooLong: isEnglish
      ? 'The maximum rental period per request is 90 days.'
      : 'El periodo máximo por solicitud es de 90 días.',
    sending: isEnglish ? 'Sending…' : 'Enviando…',
    spam: isEnglish
      ? 'We could not validate this request. Please complete the form manually and try again.'
      : 'No pudimos validar esta solicitud. Completa el formulario manualmente e inténtalo de nuevo.',
    tooMany: isEnglish
      ? 'Too many requests were received. Please try again later or contact us on WhatsApp.'
      : 'Recibimos demasiadas solicitudes. Inténtalo más tarde o contáctanos por WhatsApp.',
    invalidData: isEnglish
      ? 'Please check the required information and dates.'
      : 'Revisa la información obligatoria y las fechas.'
  };

  const startedAt = form.querySelector('[name="tcr_form_started_at"]');
  if (startedAt) startedAt.value = String(Date.now());

  const alert = document.createElement('div');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  alert.style.cssText = 'margin:0 0 18px;padding:12px 14px;border:1px solid #f2b8b5;border-radius:12px;background:#fff5f4;color:#9b2c24;font-size:14px;line-height:1.45;font-weight:700;';
  const header = scope.querySelector('.tcr-header');
  (header || form).prepend(alert);

  function dateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function todayValue() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).reduce((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value;
      return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function addDays(value, days) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    return dateValue(date);
  }

  function rentalDays() {
    if (!pickup.value || !dropoff.value) return null;
    const start = new Date(`${pickup.value}T12:00:00`);
    const end = new Date(`${dropoff.value}T12:00:00`);
    const days = Math.ceil((end - start) / 86400000);
    return Number.isFinite(days) ? days : null;
  }

  function showError(message) {
    alert.textContent = message;
    alert.hidden = !message;
  }

  function syncDateConstraints() {
    const today = todayValue();
    pickup.min = today;
    dropoff.min = pickup.value ? addDays(pickup.value, MIN_DAYS) : addDays(today, MIN_DAYS);
  }

  function validateDates(showMessage) {
    syncDateConstraints();
    pickup.setCustomValidity('');
    dropoff.setCustomValidity('');

    if (!pickup.value || !dropoff.value) {
      if (showMessage) showError(messages.invalidDate);
      return false;
    }

    const days = rentalDays();
    if (pickup.value < todayValue()) {
      pickup.setCustomValidity(messages.invalidPickup);
      if (showMessage) showError(messages.invalidPickup);
      return false;
    }
    if (!days || days < MIN_DAYS) {
      dropoff.setCustomValidity(messages.tooShort);
      if (showMessage) showError(messages.tooShort);
      return false;
    }
    if (days > MAX_DAYS) {
      dropoff.setCustomValidity(messages.tooLong);
      if (showMessage) showError(messages.tooLong);
      return false;
    }

    if (showMessage) showError('');
    return true;
  }

  function showRedirectMessage() {
    const code = new URLSearchParams(window.location.search).get('error');
    const message = code === 'spam-detected' ? messages.spam
      : code === 'too-many-requests' ? messages.tooMany
      : code ? messages.invalidData
      : '';
    if (message) showError(message);
  }

  pickup.addEventListener('change', function () {
    syncDateConstraints();
    validateDates(false);
  });
  dropoff.addEventListener('change', function () { validateDates(false); });
  form.addEventListener('submit', function (event) {
    if (!validateDates(true)) {
      event.preventDefault();
      (dropoff.value ? dropoff : pickup).reportValidity();
      return;
    }
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = messages.sending;
    }
  });

  syncDateConstraints();
  showRedirectMessage();
})();
