import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectOfferSchema,
  extractMarketplaceOffers,
  normalizeOffer,
  readOfferPrice,
  selectOffersForEntry,
} from '../src/lib/offers.js';

let nextProductId = 1000;

function offer(overrides = {}) {
  const id = overrides.id ?? nextProductId++;
  const {
    cents = 100,
    quantity = 1,
    condition = 'Near Mint',
    language = 'it',
    foil = false,
    reverse,
    hub = true,
    country = 'IT',
    currency = 'EUR',
    includeLanguage = true,
    includeCondition = true,
    includeFoil = true,
    ...rest
  } = overrides;

  const properties = {};
  if (includeCondition) properties.condition = condition;
  if (includeLanguage) properties.pokemon_language = language;
  if (includeFoil) properties.pokemon_foil = foil;
  if (reverse !== undefined) properties.pokemon_reverse_holo = reverse;

  return {
    id,
    blueprint_id: 500,
    quantity,
    price: { cents, currency },
    properties_hash: properties,
    user: {
      id: 7,
      username: `seller-${id}`,
      country_code: country,
      can_sell_via_hub: hub,
    },
    ...rest,
  };
}

function select(offers, overrides = {}) {
  return selectOffersForEntry({
    offers,
    quantity: 2,
    language: 'it',
    minCondition: 'Near Mint',
    ...overrides,
  });
}

test('extractMarketplaceOffers legge la chiave del blueprint', () => {
  assert.deepEqual(extractMarketplaceOffers({ 500: [1, 2] }, 500), [1, 2]);
  assert.deepEqual(extractMarketplaceOffers([1], 500), [1]);
  assert.deepEqual(extractMarketplaceOffers({ 500: [] }, 999), []);
  assert.deepEqual(extractMarketplaceOffers(null, 500), []);
});

test('extractMarketplaceOffers usa tutti gli array se la chiave manca', () => {
  const payload = { 111: [{ id: 1 }], 222: [{ id: 2 }] };
  assert.deepEqual(extractMarketplaceOffers(payload, 999), [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(extractMarketplaceOffers({}, 999), []);
});

test('detectOfferSchema riconosce i campi reali Pokémon in properties_hash', () => {
  const schema = detectOfferSchema([
    offer({ reverse: false }),
    offer({ language: 'en' }),
  ]);

  assert.equal(schema.conditionField, 'properties_hash.condition');
  assert.equal(schema.languageField, 'properties_hash.pokemon_language');
  assert.deepEqual(schema.foilFields.sort(), [
    'properties_hash.pokemon_foil',
    'properties_hash.pokemon_reverse_holo',
  ]);
  assert.equal(schema.priceFormat, 'price');
  assert.equal(schema.hubField, 'user.can_sell_via_hub');
});

test('detectOfferSchema supporta anche campi di primo livello', () => {
  const schema = detectOfferSchema([
    {
      id: 1,
      quantity: 1,
      price_cents: 50,
      price_currency: 'eur',
      condition: 'Near Mint',
      language: 'it',
      foil: false,
    },
  ]);
  assert.equal(schema.conditionField, 'condition');
  assert.equal(schema.languageField, 'language');
  assert.deepEqual(schema.foilFields, ['foil']);
  assert.equal(schema.priceFormat, 'price_cents');
});

test('readOfferPrice legge price.cents e price_cents', () => {
  assert.deepEqual(readOfferPrice(offer({ cents: 123 })), {
    cents: 123,
    currency: 'EUR',
  });
  assert.deepEqual(
    readOfferPrice({ price_cents: 80, price_currency: 'usd' }),
    { cents: 80, currency: 'USD' }
  );
  assert.equal(readOfferPrice({}), null);
});

test('normalizeOffer riconosce lingua, condizione e foil', () => {
  const normalized = normalizeOffer(
    offer({ condition: 'Slightly Played', language: 'it', foil: false, reverse: false })
  );
  assert.equal(normalized.productId > 0, true);
  assert.equal(normalized.condition, 'Slightly Played');
  assert.equal(normalized.language, 'it');
  assert.equal(normalized.foil, false);
  assert.equal(normalized.canSellViaHub, true);
});

test('selectOffersForEntry scarta non-Zero, altra lingua, condizioni basse e foil/reverse', () => {
  const result = select([
    offer({ cents: 10, hub: false }),
    offer({ cents: 20, language: 'en' }),
    offer({ cents: 30, condition: 'Played' }),
    offer({ cents: 40, foil: true }),
    offer({ cents: 50, reverse: true }),
    offer({ cents: 60, includeCondition: false }),
    offer({ cents: 70, quantity: 2 }),
  ]);

  assert.equal(result.status, 'ok');
  assert.equal(result.strategy, 'single');
  assert.equal(result.diagnostics.totalOffers, 7);
  assert.equal(result.diagnostics.eligibleOffers, 1);
  assert.equal(result.diagnostics.excluded.notZero, 1);
  assert.equal(result.diagnostics.excluded.language, 1);
  assert.equal(result.diagnostics.excluded.foil, 2);
  assert.equal(result.diagnostics.excluded.condition, 1);
  assert.equal(result.diagnostics.excluded.conditionUnknown, 1);
});

test('scarta venditori in ferie, carte gradate e bundle non singoli', () => {
  const result = select([
    offer({ cents: 10, on_vacation: true }),
    offer({ cents: 20, graded: true }),
    offer({ cents: 30, bundle_size: 4 }),
    offer({ cents: 40, quantity: 2 }),
  ]);

  assert.equal(result.status, 'ok');
  assert.equal(result.strategy, 'single');
  assert.equal(result.diagnostics.excluded.vacation, 1);
  assert.equal(result.diagnostics.excluded.graded, 1);
  assert.equal(result.diagnostics.excluded.bundle, 1);
  assert.equal(result.items[0].quantity, 2);
});

test('sceglie una sola offerta se copre la quantità, anche se lo split costa meno', () => {
  const result = select([
    offer({ id: 1, cents: 100, quantity: 1 }),
    offer({ id: 2, cents: 120, quantity: 1 }),
    offer({ id: 3, cents: 150, quantity: 2 }),
  ]);

  assert.equal(result.strategy, 'single');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].productId, 3);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.totalCents, 300);
});

test('a parità di prezzo sceglie la condizione migliore', () => {
  const result = select([
    offer({ id: 1, cents: 100, quantity: 2, condition: 'Slightly Played' }),
    offer({ id: 2, cents: 100, quantity: 2, condition: 'Near Mint' }),
  ]);

  assert.equal(result.items[0].productId, 2);
  assert.equal(result.items[0].condition, 'Near Mint');
});

test('combina le offerte più economiche e segnala la quantità divisa', () => {
  const result = select([
    offer({ id: 1, cents: 100, quantity: 1 }),
    offer({ id: 2, cents: 120, quantity: 1 }),
    offer({ id: 3, cents: 200, quantity: 1 }),
  ]);

  assert.equal(result.status, 'ok');
  assert.equal(result.strategy, 'split');
  assert.equal(result.items.length, 2);
  assert.deepEqual(
    result.items.map((item) => [item.productId, item.quantity]),
    [
      [1, 1],
      [2, 1],
    ]
  );
  assert.equal(result.totalCents, 220);
  assert.equal(result.coveredQuantity, 2);
});

test('una singola offerta con quantità sufficiente non viene spezzata', () => {
  const result = select([
    offer({ id: 1, cents: 100, quantity: 1 }),
    offer({ id: 2, cents: 120, quantity: 3 }),
  ]);
  assert.equal(result.strategy, 'single');
  assert.deepEqual(
    result.items.map((item) => [item.productId, item.quantity]),
    [[2, 2]]
  );
});

test('quantità insufficiente restituisce un problema e nessun item da aggiungere', () => {
  const result = select([offer({ cents: 100, quantity: 1 })]);
  assert.equal(result.status, 'insufficient');
  assert.equal(result.items.length, 0);
  assert.equal(result.partialItems.length, 1);
  assert.equal(result.coveredQuantity, 1);
  assert.equal(result.problems[0].code, 'QUANTITA_INSUFFICIENTE');
});

test('valute miste bloccano il totale', () => {
  const result = select([
    offer({ id: 1, cents: 100, currency: 'EUR' }),
    offer({ id: 2, cents: 100, currency: 'USD' }),
  ]);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.problems[0].code, 'VALUTE_MISTE');
});

test('se la lingua non è nella risposta include le offerte con avviso', () => {
  const result = select([
    offer({ cents: 100, quantity: 2, includeLanguage: false }),
  ]);
  assert.equal(result.status, 'ok');
  assert.equal(result.diagnostics.language.field, null);
  assert.equal(result.diagnostics.language.serverFiltered, true);
  assert.equal(result.warnings[0].code, 'DATI_NON_DISPONIBILI');
});

test('se manca il campo foil include le offerte con avviso', () => {
  const result = select([
    offer({ cents: 100, quantity: 2, includeFoil: false }),
  ]);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.diagnostics.foil.fields, []);
  assert.match(result.warnings[0].message, /foil/);
});

test('se manca il campo condition nessuna offerta è verificabile', () => {
  const result = select([
    offer({ cents: 100, quantity: 2, includeCondition: false }),
  ]);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.problems[0].code, 'NESSUNA_OFFERTA_VALIDA');
  assert.ok(
    result.warnings.some((warning) =>
      /non espone la condizione/.test(warning.message)
    )
  );
});

test('nessuna offerta o nessuna offerta valida produce problemi distinti', () => {
  const empty = select([]);
  assert.equal(empty.status, 'unavailable');
  assert.equal(empty.problems[0].code, 'NESSUNA_OFFERTA_ZERO');

  const noZero = select([offer({ cents: 10, hub: false })]);
  assert.equal(noZero.problems[0].code, 'NESSUNA_OFFERTA_ZERO');
  assert.match(noZero.problems[0].message, /1 offerte, 0 Zero, 0 Zero in Italia/);

  const invalid = select([offer({ cents: 10, language: 'en' })]);
  assert.equal(invalid.problems[0].code, 'NESSUNA_OFFERTA_VALIDA');
  assert.match(invalid.problems[0].message, /1 offerte, 1 Zero, 1 Zero in Italia/);
});

test('accetta Mint come condizione migliore e canonicalizza le abbreviazioni', () => {
  const result = select([
    offer({ id: 1, cents: 100, quantity: 2, condition: 'Mint' }),
  ]);
  assert.equal(result.status, 'ok');
  assert.equal(result.items[0].condition, 'Mint');
});

test('rifiuta parametri non validi', () => {
  assert.throws(() => select([], { quantity: 0 }), /quantità/);
  assert.throws(() => select([], { language: '' }), /lingua/);
  assert.throws(() => select([], { minCondition: 'Pessima' }), /condizione minima/);
});
