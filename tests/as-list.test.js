import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { asList } from '../src/lib/as-list.js';
import { createApiClient } from '../src/lib/api-client.js';
import { ApiError } from '../src/lib/errors.js';

const gamesFixture = JSON.parse(
  readFileSync(new URL('./fixtures/games.json', import.meta.url), 'utf8')
);
const expansionsFixture = JSON.parse(
  readFileSync(new URL('./fixtures/expansions.json', import.meta.url), 'utf8')
);

function makeScheduler() {
  return {
    acquire: async () => {},
  };
}

test('asList legge il campione reale di /games con chiave array', () => {
  const games = asList(gamesFixture, { label: 'Risposta inattesa da /games' });
  assert.equal(Array.isArray(games), true);
  assert.equal(games.length, 16);
  const pokemon = games.find((game) => game.id === 5);
  assert.deepEqual(pokemon, {
    id: 5,
    display_name: 'Pokémon',
    name: 'Pokémon',
  });
});

test('asList legge il campione reale di /expansions come array', () => {
  const expansions = asList(expansionsFixture);
  assert.equal(Array.isArray(expansions), true);
  assert.ok(expansions.length >= 3000);
  const mega = expansions.find(
    (expansion) => expansion.game_id === 5 && expansion.code.toLowerCase() === 'meg'
  );
  assert.deepEqual(mega, {
    id: 4256,
    game_id: 5,
    code: 'meg',
    name: 'Mega Evolution',
  });
});

test('asList accetta un array e un oggetto { array: [...] }', () => {
  const list = [{ id: 1 }];
  assert.equal(asList(list), list);
  assert.deepEqual(asList({ array: list }), list);
});

test('asList rifiuta le altre forme mostrando chiavi e primi 200 caratteri', () => {
  const payload = { error: 'boom', message: 'x'.repeat(300) };

  assert.throws(
    () => asList(payload, { label: 'Risposta inattesa da /games' }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'RISPOSTA_NON_VALIDA');
      assert.match(error.message, /Risposta inattesa da \/games/);
      assert.match(error.message, /chiavi ricevute: \["error","message"\]/);
      assert.match(error.message, /primi 200 caratteri: \{"error":"boom"/);
      assert.deepEqual(error.details.keys, ['error', 'message']);
      assert.equal(error.details.preview.length, 200);
      assert.equal(error.message.includes('x'.repeat(201)), false);
      return true;
    }
  );
});

test('asList tronca a 200 caratteri anche i payload testuali', () => {
  assert.throws(
    () => asList('y'.repeat(500)),
    (error) => {
      assert.deepEqual(error.details.keys, []);
      assert.equal(error.details.preview.length, 200);
      return true;
    }
  );
});

test('il client usa asList sul campione reale di /games', async () => {
  const api = createApiClient({
    token: 'tok',
    scheduler: makeScheduler(),
    fetchImpl: async () =>
      new Response(JSON.stringify(gamesFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });

  const games = await api.getGames();
  assert.equal(games.length, 16);
  assert.equal(games.some((game) => game.display_name === 'Pokémon'), true);
});
