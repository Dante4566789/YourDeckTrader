import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  addPlanToCart,
  collectCartItems,
} from '../src/lib/cart-runner.js';

const addresses = {
  billingAddress: {
    name: 'Mario Rossi',
    street: 'Via Roma 1',
    zip: '00100',
    city: 'Roma',
    state_or_province: 'RM',
    country_code: 'IT',
  },
  shippingAddress: {
    name: 'Mario Rossi',
    street: 'Via Roma 1',
    zip: '00100',
    city: 'Roma',
    state_or_province: 'RM',
    country_code: 'IT',
  },
};

function item(productId, quantity, cents = 100) {
  return {
    productId,
    blueprintId: 500,
    quantity,
    unitPriceCents: cents,
    totalCents: cents * quantity,
    currency: 'EUR',
    condition: 'Near Mint',
    language: 'it',
    seller: 'seller',
  };
}

function makePlan(entries) {
  return {
    entries: entries.map((entry, index) => ({
      status: entry.status || 'ok',
      entry: {
        name: entry.name || `Carta ${index}`,
        lineNumber: index + 1,
        setCode: 'MEG',
        printNumber: '119',
        quantity: entry.quantity || 2,
      },
      selection: entry.selection || {
        items: entry.items || [item(1000 + index, entry.quantity || 2)],
      },
      problems: entry.problems || [],
    })),
  };
}

test('collectCartItems include solo righe pronte', () => {
  const plan = makePlan([
    { items: [item(1, 2), item(2, 1)] },
    { status: 'problem', problems: [{ message: 'no' }] },
  ]);
  const items = collectCartItems(plan);
  assert.equal(items.length, 2);
  assert.equal(items[0].entryName, 'Carta 0');
  assert.equal(items[0].lineNumber, 1);
});

test('aggiunge gli item in ordine passando gli indirizzi API', async () => {
  const plan = makePlan([{ items: [item(1, 2), item(2, 1)] }]);
  const calls = [];
  const progress = [];
  const api = {
    async addToCart(payload) {
      calls.push(payload);
      return { id: calls.length };
    },
  };

  const result = await addPlanToCart({
    plan,
    api,
    ...addresses,
    onProgress: (event) => progress.push(event),
    now: () => 123,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    productId: 1,
    quantity: 2,
    billingAddress: addresses.billingAddress,
    shippingAddress: addresses.shippingAddress,
  });
  assert.equal(result.added.length, 2);
  assert.equal(result.totalAddedQuantity, 3);
  assert.equal(result.totalAddedCents, 300);
  assert.equal(result.lastCart.id, 2);
  assert.equal(progress.length, 2);
});

test('un 401 ferma le aggiunte successive e le marca non tentate', async () => {
  const plan = makePlan([{ items: [item(1, 1), item(2, 1), item(3, 1)] }]);
  const api = {
    async addToCart() {
      const error = new Error('Token scaduto');
      error.status = 401;
      throw error;
    },
  };

  const result = await addPlanToCart({ plan, api, ...addresses });

  assert.equal(result.ok, false);
  assert.equal(result.attempted, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].status, 401);
  assert.equal(result.notAttempted.length, 2);
});

test('un errore 422 su un item non blocca i successivi', async () => {
  const plan = makePlan([{ items: [item(1, 1), item(2, 1)] }]);
  let calls = 0;
  const api = {
    async addToCart() {
      calls += 1;
      if (calls === 1) {
        const error = new Error('Offerta non più disponibile');
        error.status = 422;
        throw error;
      }
      return { id: 2 };
    },
  };

  const result = await addPlanToCart({ plan, api, ...addresses });

  assert.equal(calls, 2);
  assert.equal(result.failed.length, 1);
  assert.equal(result.added.length, 1);
  assert.equal(result.notAttempted.length, 0);
  assert.equal(result.ok, false);
});

test('richiede client e indirizzi', async () => {
  await assert.rejects(
    () => addPlanToCart({ plan: makePlan([]) }),
    /client API/
  );
  await assert.rejects(
    () => addPlanToCart({ plan: makePlan([]), api: {} }),
    /fatturazione/
  );
});

test('il modulo non contiene mai un endpoint di acquisto', () => {
  const source = readFileSync(
    new URL('../src/lib/cart-runner.js', import.meta.url),
    'utf8'
  );
  assert.equal(/purchase/i.test(source), false);
});
