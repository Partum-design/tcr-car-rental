const assert = require('node:assert/strict');
const test = require('node:test');

const { _test } = require('../api/submit-reservation');

function futureDate(daysFromToday) {
  const today = new Date(`${_test.getMexicoDateValue(new Date())}T12:00:00Z`);
  today.setUTCDate(today.getUTCDate() + daysFromToday);
  return today.toISOString().slice(0, 10);
}

function validParams(overrides = {}) {
  const pickup = futureDate(7);
  const dropoff = futureDate(10);
  return new URLSearchParams({
    language: 'Español',
    car: 'Mirage G4 or Similar',
    pickup_location: 'Cancún',
    dropoff_location: 'Cancún',
    pickup_date: pickup,
    pickup_time: '12:00',
    dropoff_date: dropoff,
    dropoff_time: '12:00',
    first_name: 'Ana',
    last_name: 'Cliente',
    email: 'ana@example.com',
    hotel: 'Hotel TCR',
    origin_city: 'Monterrey',
    passengers: '2',
    tcr_form_started_at: String(Date.now() - 5000),
    ...overrides
  });
}

test('accepts a valid future three-day reservation', () => {
  assert.doesNotThrow(() => _test.validateSubmission(validParams()));
});

test('rejects dates from the past instead of generating a quote', () => {
  assert.throws(
    () => _test.validateSubmission(validParams({ pickup_date: '1986-05-01', dropoff_date: '1986-05-04' })),
    (error) => error.code === 'invalid-date'
  );
});

test('rejects reservations longer than the configured maximum', () => {
  assert.throws(
    () => _test.validateSubmission(validParams({ pickup_date: futureDate(7), dropoff_date: futureDate(7 + _test.MAX_RENTAL_DAYS + 1) })),
    (error) => error.code === 'invalid-date'
  );
});

test('rejects a honeypot submission', () => {
  assert.throws(
    () => _test.validateSubmission(validParams({ website: 'https://spam.example' })),
    (error) => error.code === 'spam-detected'
  );
});

test('rejects submissions made too quickly', () => {
  assert.throws(
    () => _test.validateSubmission(validParams({ tcr_form_started_at: String(Date.now()) })),
    (error) => error.code === 'spam-detected'
  );
});
