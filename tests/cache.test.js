import test from 'node:test';
import assert from 'node:assert/strict';

import { createKeyValueCache } from '../src/lib/cache.js';

function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(keys) {
      if (keys === null) return Object.fromEntries(data);
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.filter((key) => data.has(key)).map((key) => [key, data.get(key)]));
      }
      if (typeof keys === 'string') {
        return data.has(keys) ? { [keys]: data.get(keys) } : {};
      }
      return Object.fromEntries(
        Object.keys(keys || {})
          .filter((key) => data.has(key))
          .map((key) => [key, data.get(key)])
      );
    },
    async set(value) {
      for (const [key, item] of Object.entries(value)) data.set(key, item);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => data.delete(key));
    },
  };
}

test('cache salva, rilegge e scade con il tempo simulato', async () => {
  let current = 1000;
  const store = memoryStore();
  const cache = createKeyValueCache({
    store,
    now: () => current,
    ttlMs: 500,
  });

  await cache.set('games', [1, 2]);
  assert.deepEqual(await cache.get('games'), [1, 2]);

  current += 501;
  assert.equal(await cache.get('games'), null);
});

test('getOrLoad chiama il loader solo se la cache è vuota', async () => {
  let calls = 0;
  const cache = createKeyValueCache({
    store: memoryStore(),
    now: () => 0,
    ttlMs: 1000,
  });
  const loader = async () => {
    calls += 1;
    return { value: calls };
  };

  const first = await cache.getOrLoad('key', loader);
  const second = await cache.getOrLoad('key', loader);

  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(calls, 1);
});

test('la cache elimina le voci più vecchie oltre maxEntries', async () => {
  let current = 0;
  const store = memoryStore();
  const cache = createKeyValueCache({
    store,
    now: () => current,
    ttlMs: 10_000,
    maxEntries: 2,
  });

  await cache.set('a', 1);
  current += 10;
  await cache.set('b', 2);
  current += 10;
  await cache.set('c', 3);

  assert.equal(await cache.get('a'), null);
  assert.equal(await cache.get('b'), 2);
  assert.equal(await cache.get('c'), 3);
});

test('clear rimuove solo le chiavi del prefisso', async () => {
  const store = memoryStore({ 'other.key': 'keep' });
  const cache = createKeyValueCache({ store, prefix: 'test.', now: () => 0 });
  await cache.set('a', 1);
  await cache.clear();

  assert.equal(await cache.get('a'), null);
  assert.equal(store.data.get('other.key'), 'keep');
});
