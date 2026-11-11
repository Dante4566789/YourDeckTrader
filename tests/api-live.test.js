import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiClient } from '../src/lib/api-client.js';
import { createRequestScheduler } from '../src/lib/rate-scheduler.js';
import { nameKey } from '../src/lib/normalize.js';

const token = process.env.CARDTRADER_TOKEN?.trim() || '';
const skip = token ? false : 'CARDTRADER_TOKEN non impostato: test live saltati.';

function liveApi() {
  return createApiClient({
    token,
    scheduler: createRequestScheduler({ marketplaceIntervalMs: 0 }),
  });
}

/**
 * Se l'API è in manutenzione il test viene saltato con un motivo esplicito,
 * invece di fallire come se il codice o il token fossero errati.
 */
async function runLive(t, fn) {
  try {
    return await fn(liveApi());
  } catch (error) {
    if (error?.code === 'API_NON_DISPONIBILE') {
      t.skip('API CardTrader in manutenzione: test live saltato.');
      return undefined;
    }
    throw error;
  }
}

// Questi test sono volutamente di sola lettura: nessun POST.
test('LIVE /info autentica il token senza esporre shared_secret', { skip }, async (t) => {
  const info = await runLive(t, (api) => api.getInfo());
  if (!info) return;
  assert.equal(typeof info.id, 'number');
  assert.equal(typeof info.name, 'string');
  assert.equal(Object.hasOwn(info, 'shared_secret'), false);
  t.diagnostic(`App CardTrader: ${info.name} (id ${info.id})`);
});

test('LIVE /games contiene Pokémon', { skip }, async (t) => {
  const games = await runLive(t, (api) => api.getGames());
  if (!games) return;
  const pokemon = games.find((game) => nameKey(game?.name).includes('pokemon'));
  assert.ok(pokemon, 'Gioco Pokémon non presente nella risposta /games');
  t.diagnostic(`Pokémon game_id=${pokemon.id}, name=${pokemon.name}`);
});

test('LIVE /expansions contiene espansioni Pokémon', { skip }, async (t) => {
  const result = await runLive(t, async (api) => {
    const games = await api.getGames();
    const pokemon = games.find((game) => nameKey(game?.name).includes('pokemon'));
    assert.ok(pokemon);
    const expansions = await api.getExpansions();
    const pokemonExpansions = expansions.filter(
      (expansion) => Number(expansion.game_id) === Number(pokemon.id)
    );
    return { pokemon, pokemonExpansions };
  });
  if (!result) return;

  assert.ok(result.pokemonExpansions.length > 0);
  const mega = result.pokemonExpansions.filter(
    (expansion) =>
      nameKey(expansion.code) === nameKey('MEG') ||
      nameKey(expansion.name).includes('megaevolution')
  );
  t.diagnostic(
    `Espansioni Pokémon: ${result.pokemonExpansions.length}; corrispondenze MEG: ${JSON.stringify(mega)}`
  );
});
