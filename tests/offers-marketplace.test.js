import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  extractMarketplaceOffers,
  selectOffersForEntry,
} from '../src/lib/offers.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/offers-370830.json', import.meta.url), 'utf8')
);

const BLUEPRINT_ID = 370830;

let nextId = 5000;

function offer({
  cents = 100,
  quantity = 1,
  hub = true,
  country = 'IT',
  condition = 'Near Mint',
  language = 'it',
  foil = false,
  reverse = false,
  seller = null,
} = {}) {
  const id = nextId++;
  return {
    id,
    blueprint_id: BLUEPRINT_ID,
    quantity,
    price: { cents, currency: 'EUR' },
    properties_hash: {
      condition,
      pokemon_language: language,
      pokemon_foil: foil,
      pokemon_reverse: reverse,
    },
    user: {
      id: 7,
      username: seller || `seller-${id}`,
      country_code: country,
      can_sell_via_hub: hub,
    },
  };
}

function select(offers, overrides = {}) {
  return selectOffersForEntry({
    offers,
    quantity: 1,
    language: 'it',
    minCondition: 'Near Mint',
    countryCode: 'IT',
    ...overrides,
  });
}

test('il campione reale 370830 è un oggetto con la chiave del blueprint', () => {
  assert.equal(Array.isArray(fixture), false);
  assert.deepEqual(Object.keys(fixture), [String(BLUEPRINT_ID)]);

  const offers = extractMarketplaceOffers(fixture, BLUEPRINT_ID);
  assert.equal(offers.length, 156);
  assert.equal(offers[0].blueprint_id, BLUEPRINT_ID);
  // I campi usati dal selettore esistono davvero nella risposta.
  assert.equal(typeof offers[0].id, 'number');
  assert.equal(typeof offers[0].price.cents, 'number');
  assert.equal(typeof offers[0].quantity, 'number');
  assert.equal(typeof offers[0].properties_hash.condition, 'string');
  assert.equal(typeof offers[0].user.can_sell_via_hub, 'boolean');
  assert.equal(typeof offers[0].user.country_code, 'string');
});

test('se la chiave manca usa Object.values(data).flat()', () => {
  const other = { 111: [offer()], 222: [offer()] };
  const offers = extractMarketplaceOffers(other, BLUEPRINT_ID);
  assert.equal(offers.length, 2);
});

test('campione reale: quantity 1 sceglie la prima offerta Zero italiana economica', () => {
  const offers = extractMarketplaceOffers(fixture, BLUEPRINT_ID);
  const result = select(offers, { quantity: 1 });

  assert.equal(result.status, 'ok');
  assert.equal(result.strategy, 'single');
  assert.equal(result.items.length, 1);
  assert.deepEqual(
    {
      productId: result.items[0].productId,
      quantity: result.items[0].quantity,
      unitPriceCents: result.items[0].unitPriceCents,
      totalCents: result.totalCents,
      seller: result.items[0].seller,
      sellerCountry: result.items[0].sellerCountry,
    },
    {
      productId: 464526198,
      quantity: 1,
      unitPriceCents: 52,
      totalCents: 52,
      seller: 'Gabry01sa',
      sellerCountry: 'IT',
    }
  );
  assert.equal(result.diagnostics.totalOffers, 156);
  assert.equal(result.diagnostics.zeroOffers, 74);
  assert.equal(result.diagnostics.zeroInCountryOffers, 33);
});

test('campione reale: quantity 4 resta su una sola offerta che ne ha 38', () => {
  const offers = extractMarketplaceOffers(fixture, BLUEPRINT_ID);
  const result = select(offers, { quantity: 4 });

  assert.equal(result.status, 'ok');
  assert.equal(result.strategy, 'single');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].productId, 464526198);
  assert.equal(result.items[0].quantity, 4);
  assert.equal(result.totalCents, 208);
});

test('nessuna offerta Zero: il messaggio dice 0 Zero', () => {
  const result = select([
    offer({ hub: false, cents: 10 }),
    offer({ hub: false, cents: 20 }),
  ]);

  assert.equal(result.status, 'unavailable');
  assert.equal(result.problems[0].code, 'NESSUNA_OFFERTA_ZERO');
  assert.match(result.problems[0].message, /2 offerte, 0 Zero, 0 Zero in Italia/);
  assert.equal(result.diagnostics.zeroOffers, 0);
});

test('Zero ma nessuna italiana: indica i paesi disponibili', () => {
  const result = select([
    offer({ cents: 10, country: 'US' }),
    offer({ cents: 20, country: 'ES' }),
    offer({ cents: 30, country: 'DE' }),
    offer({ cents: 5, hub: false, country: 'IT' }),
  ]);

  assert.equal(result.status, 'unavailable');
  assert.equal(result.problems[0].code, 'NESSUNA_OFFERTA_ZERO_ITALIA');
  assert.match(
    result.problems[0].message,
    /4 offerte, 3 Zero, 0 Zero in Italia/
  );
  assert.match(result.problems[0].message, /paesi con Zero: DE, ES, US/);
  assert.equal(result.diagnostics.excluded.country, 3);
});

test('Zero e Italia con quantity 1 copre una richiesta di 1', () => {
  const result = select([offer({ cents: 42, quantity: 1 })], { quantity: 1 });
  assert.equal(result.status, 'ok');
  assert.equal(result.strategy, 'single');
  assert.equal(result.items[0].quantity, 1);
  assert.equal(result.items[0].totalCents, 42);
});

test('Zero e Italia con quantity 1 non copre una richiesta di 4', () => {
  const result = select([offer({ cents: 42, quantity: 1 })], { quantity: 4 });

  assert.equal(result.status, 'insufficient');
  assert.equal(result.strategy, 'split');
  assert.equal(result.items.length, 0);
  assert.equal(result.partialItems.length, 1);
  assert.equal(result.coveredQuantity, 1);
  assert.equal(result.problems[0].code, 'QUANTITA_INSUFFICIENTE');
  assert.match(result.problems[0].message, /1 copie su 4/);
});

test('ordina per prezzo crescente anche se la risposta non è ordinata', () => {
  const result = select(
    [
      offer({ cents: 300, quantity: 2 }),
      offer({ cents: 100, quantity: 2 }),
      offer({ cents: 200, quantity: 2 }),
    ],
    { quantity: 2 }
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.items[0].unitPriceCents, 100);
});

test('combina più offerte italiane solo quando nessuna copre la quantità', () => {
  const result = select(
    [
      offer({ cents: 100, quantity: 1 }),
      offer({ cents: 150, quantity: 1 }),
      offer({ cents: 400, quantity: 1 }),
    ],
    { quantity: 2 }
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.strategy, 'split');
  assert.equal(result.coveredQuantity, 2);
  assert.deepEqual(
    result.items.map((item) => [item.unitPriceCents, item.quantity]),
    [
      [100, 1],
      [150, 1],
    ]
  );
  assert.equal(result.totalCents, 250);
});

test('finish holo sceglie la variante reverse anche se costa di più', () => {
  const result = select(
    [
      offer({ cents: 10, quantity: 2, reverse: false }),
      offer({ cents: 13, quantity: 2, reverse: true }),
    ],
    { quantity: 1, finish: 'holo' }
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.items[0].unitPriceCents, 13);
  assert.equal(result.items[0].foil, true);
  assert.equal(result.diagnostics.foil.requested, 'holo');
});

test('finish nonfoil scarta la variante holo', () => {
  const result = select(
    [
      offer({ cents: 10, quantity: 2, reverse: true }),
      offer({ cents: 13, quantity: 2, reverse: false }),
    ],
    { quantity: 1, finish: 'nonfoil' }
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.items[0].unitPriceCents, 13);
  assert.equal(result.items[0].foil, false);
});

test('finish holo senza campo foil include le offerte con avviso', () => {
  const result = select(
    [
      {
        id: 1,
        blueprint_id: BLUEPRINT_ID,
        quantity: 2,
        price: { cents: 10, currency: 'EUR' },
        properties_hash: { condition: 'Near Mint', pokemon_language: 'it' },
        user: {
          id: 7,
          username: 'seller',
          country_code: 'IT',
          can_sell_via_hub: true,
        },
      },
    ],
    { quantity: 1, finish: 'holo' }
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.items[0].unitPriceCents, 10);
  assert.ok(result.warnings.some((warning) => /non espone holo/.test(warning.message)));
});

test('il confronto del paese ignora maiuscole e minuscole', () => {
  const result = select([offer({ cents: 42, country: 'it' })], { quantity: 1 });
  assert.equal(result.status, 'ok');
  assert.equal(result.items[0].sellerCountry, 'IT');
});

test('un paese non valido viene rifiutato', () => {
  assert.throws(() => select([], { countryCode: 'Italia' }), /paese/);
});
