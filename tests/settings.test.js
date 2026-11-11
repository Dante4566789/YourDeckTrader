import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  effectiveShippingAddress,
  normalizeMappings,
  normalizeSettings,
  toApiAddress,
  validateAddress,
  validateSettingsForRun,
  validateToken,
} from '../src/lib/settings.js';

const validAddress = {
  name: 'Mario Rossi',
  street: 'Via Roma 1',
  zip: '00100',
  city: 'Roma',
  stateOrProvince: 'RM',
  countryCode: 'IT',
};

test('normalizeSettings applica i valori predefiniti', () => {
  const settings = normalizeSettings({});
  assert.equal(settings.language, 'it');
  assert.equal(settings.minCondition, 'Near Mint');
  assert.equal(settings.sameAddress, true);
  assert.deepEqual(settings.expansionMappings, [{ deckCode: 'MEG', target: 'Mega Evolution' }]);
});

test('normalizeSettings conserva le lingue con trattino', () => {
  assert.equal(normalizeSettings({ language: 'zh-CN' }).language, 'zh-CN');
  assert.equal(normalizeSettings({ language: 'zh-tw' }).language, 'zh-TW');
  assert.equal(normalizeSettings({ language: 'ja' }).language, 'jp');
});

test('normalizeSettings canonicalizza la condizione minima', () => {
  assert.equal(normalizeSettings({ minCondition: 'SP' }).minCondition, 'Slightly Played');
  assert.equal(normalizeSettings({ minCondition: 'sconosciuta' }).minCondition, 'Near Mint');
});

test('validateToken rimuove il prefisso Bearer e rifiuta spazi', () => {
  assert.equal(validateToken('Bearer abc123'), '');
  assert.match(validateToken('  '), /Inserisci/);
  assert.match(validateToken('abc 123'), /spazi/);
});

test('validateAddress richiede i campi CardTrader', () => {
  assert.deepEqual(validateAddress(validAddress), {});
  const errors = validateAddress({ ...validAddress, name: '', countryCode: 'ITA' });
  assert.ok(errors.name);
  assert.ok(errors.countryCode);
});

test('toApiAddress produce le chiavi accettate da /cart/add', () => {
  assert.deepEqual(toApiAddress(validAddress), {
    name: 'Mario Rossi',
    street: 'Via Roma 1',
    zip: '00100',
    city: 'Roma',
    state_or_province: 'RM',
    country_code: 'IT',
  });
});

test('sameAddress usa la fatturazione anche per la spedizione', () => {
  const settings = normalizeSettings({
    billingAddress: validAddress,
    shippingAddress: { ...validAddress, city: 'Milano' },
    sameAddress: true,
  });
  assert.equal(effectiveShippingAddress(settings).city, 'Roma');
});

test('normalizeMappings elimina righe vuote e duplicati', () => {
  const mappings = normalizeMappings([
    { deckCode: 'meg', target: 'Mega Evolution' },
    { deckCode: 'MEG', target: 'Duplicato' },
    { deckCode: '', target: 'Vuoto' },
    { deckCode: 'SVI', target: '' },
  ]);
  assert.deepEqual(mappings, [{ deckCode: 'MEG', target: 'Mega Evolution' }]);
});

test('validateSettingsForRun segnala token e indirizzi mancanti', () => {
  const errors = validateSettingsForRun(DEFAULT_SETTINGS);
  assert.ok(errors.some((error) => error.field === 'token'));
  assert.ok(errors.some((error) => error.field === 'billingAddress'));

  const valid = validateSettingsForRun({
    token: 'token',
    billingAddress: validAddress,
    sameAddress: true,
  });
  assert.deepEqual(valid, []);
});
