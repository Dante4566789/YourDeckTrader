import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blueprintsCacheKey,
  createReferenceData,
  EXPANSIONS_CACHE_KEY,
  GAMES_CACHE_KEY,
} from '../src/lib/reference-data.js';
import { AppError } from '../src/lib/errors.js';

function memoryCache(initial = {}) {
  const data = new Map(Object.entries(initial));
  const writes = [];
  return {
    data,
    writes,
    async get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async set(key, value, ttlMs) {
      writes.push({ key, value, ttlMs });
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
  };
}

function stubApi(overrides = {}) {
  const calls = { games: 0, expansions: 0, blueprints: 0 };
  const api = {
    async getGames() {
      calls.games += 1;
      return [
        { id: 1, name: 'Magic: The Gathering' },
        { id: 2, name: 'Pokémon' },
      ];
    },
    async getExpansions() {
      calls.expansions += 1;
      return [
        { id: 10, game_id: 2, code: 'OBF', name: 'Obsidian Flames' },
        { id: 11, game_id: 1, code: 'MAG', name: 'Magic Set' },
        { id: 12, game_id: 2, code: 'TEF', name: 'Temporal Forces' },
      ];
    },
    async getBlueprints(expansionId) {
      calls.blueprints += 1;
      return [
        {
          id: 100,
          name: 'Charizard ex',
          game_id: 2,
          expansion_id: expansionId,
          image_url: 'https://example.test/charizard.png',
          fixed_properties: { collector_number: '125' },
          editable_properties: [
            { name: 'Language', type: 'single_select', possible_values: ['it', 'en'] },
          ],
          properties: { frame: 'silver' },
        },
      ];
    },
    ...overrides,
  };
  return { api, calls };
}

test('loadPokemonGame mette in cache i giochi e li riusa', async () => {
  const cache = memoryCache();
  const { api, calls } = stubApi();
  const reference = createReferenceData({ api, cache });

  const first = await reference.loadPokemonGame();
  const second = await reference.loadPokemonGame();

  assert.equal(first.gameId, 2);
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(calls.games, 1);
  assert.ok(cache.data.has(GAMES_CACHE_KEY));
});

test('loadPokemonGame segnala l’assenza del gioco Pokémon', async () => {
  const cache = memoryCache();
  const { api } = stubApi({
    async getGames() {
      return [{ id: 1, name: 'Magic: The Gathering' }];
    },
  });
  const reference = createReferenceData({ api, cache });

  await assert.rejects(
    () => reference.loadPokemonGame(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'GIOCO_NON_TROVATO');
      return true;
    }
  );
});

test('loadPokemonExpansions filtra per gioco e mette in cache tutte le espansioni', async () => {
  const cache = memoryCache();
  const { api, calls } = stubApi();
  const reference = createReferenceData({ api, cache });

  const first = await reference.loadPokemonExpansions(2);
  const second = await reference.loadPokemonExpansions(2);

  assert.deepEqual(
    first.expansions.map((item) => item.code),
    ['OBF', 'TEF']
  );
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(calls.expansions, 1);
  assert.equal(cache.data.get(EXPANSIONS_CACHE_KEY).length, 3);
});

test('loadBlueprints riduce i campi e applica il TTL dedicato', async () => {
  const cache = memoryCache();
  const { api, calls } = stubApi();
  const reference = createReferenceData({ api, cache });
  const key = blueprintsCacheKey(10);

  const first = await reference.loadBlueprints(10);
  const second = await reference.loadBlueprints(10);

  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(calls.blueprints, 1);
  assert.equal(first.blueprints[0].image_url, undefined);
  assert.equal(first.blueprints[0].fixed_properties.collector_number, '125');

  const write = cache.writes.find((item) => item.key === key);
  assert.equal(write.key, key);
  assert.equal(write.ttlMs, 12 * 60 * 60 * 1000);
});

test('una voce di cache non valida viene sostituita', async () => {
  const cache = memoryCache({ [blueprintsCacheKey(10)]: 'formato vecchio' });
  const { api, calls } = stubApi();
  const reference = createReferenceData({ api, cache });

  const result = await reference.loadBlueprints(10);

  assert.equal(result.fromCache, false);
  assert.equal(calls.blueprints, 1);
  assert.ok(Array.isArray(cache.data.get(blueprintsCacheKey(10))));
});

test('gli ID non validi non producono chiamate API', async () => {
  const cache = memoryCache();
  const { api, calls } = stubApi();
  const reference = createReferenceData({ api, cache });

  await assert.rejects(() => reference.loadPokemonExpansions(0), /ID gioco non valido/);
  await assert.rejects(() => reference.loadBlueprints('x'), /ID espansione non valido/);
  assert.equal(calls.expansions, 0);
  assert.equal(calls.blueprints, 0);
});

test('createReferenceData richiede api e cache', () => {
  assert.throws(() => createReferenceData({ cache: memoryCache() }), /client API/);
  assert.throws(() => createReferenceData({ api: {} }), /cache/);
});
