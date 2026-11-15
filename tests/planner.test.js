import test from 'node:test';
import assert from 'node:assert/strict';

import { createDeckPlanner } from '../src/lib/planner.js';

const blueprints = [
  {
    id: 100,
    name: "Lillie's Determination",
    game_id: 2,
    expansion_id: 10,
    fixed_properties: { collector_number: '119' },
    editable_properties: [],
  },
  {
    id: 101,
    name: 'Iron Leaves ex',
    game_id: 2,
    expansion_id: 10,
    fixed_properties: { collector_number: '25' },
    editable_properties: [],
  },
];

function offer(id, overrides = {}) {
  const {
    cents = 100,
    quantity = 4,
    condition = 'Near Mint',
    language = 'it',
    foil = false,
    reverse = false,
    hub = true,
  } = overrides;
  return {
    id,
    blueprint_id: 100,
    quantity,
    price: { cents, currency: 'EUR' },
    properties_hash: {
      condition,
      pokemon_language: language,
      pokemon_foil: foil,
      pokemon_reverse: reverse,
    },
    user: {
      id: 1,
      username: 'seller',
      country_code: 'IT',
      can_sell_via_hub: hub,
    },
  };
}

function makeReference(overrides = {}) {
  const calls = { game: 0, expansions: 0, blueprints: [], market: 0 };
  const reference = {
    async loadPokemonGame() {
      calls.game += 1;
      return { gameId: 2, game: { id: 2, name: 'Pokémon' } };
    },
    async loadPokemonExpansions() {
      calls.expansions += 1;
      return {
        expansions: [
          { id: 10, game_id: 2, code: 'MEG', name: 'Mega Evolution' },
        ],
      };
    },
    async loadBlueprints(expansionId) {
      calls.blueprints.push(expansionId);
      return { blueprints };
    },
    ...overrides,
  };
  return { reference, calls };
}

function makeApi(overrides = {}) {
  const calls = { market: [], cart: [] };
  const api = {
    async getMarketplaceProducts(blueprintId, options) {
      calls.market.push({ blueprintId, language: options?.language });
      return {
        [blueprintId]: [offer(1), offer(2, { cents: 120, quantity: 1 })],
      };
    },
    async addToCart(payload) {
      calls.cart.push(payload);
      return { id: 1 };
    },
    ...overrides,
  };
  return { api, calls };
}

test('pianifica una carta e produce anteprima e totale senza toccare il carrello', async () => {
  const { reference, calls } = makeReference();
  const { api, calls: apiCalls } = makeApi();
  const progress = [];
  const planner = createDeckPlanner({
    api,
    reference,
    onProgress: (event) => progress.push(event),
  });

  const plan = await planner.plan({
    text: "4 Lillie's Determination MEG 119",
    settings: {
      language: 'it',
      minCondition: 'Near Mint',
      expansionMappings: [],
    },
  });

  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].status, 'ok');
  assert.equal(plan.entries[0].blueprint.id, 100);
  assert.equal(plan.entries[0].selection.strategy, 'single');
  assert.equal(plan.summary.readyEntries, 1);
  assert.equal(plan.summary.readyCards, 4);
  assert.equal(plan.summary.totalCents, 400);
  assert.equal(plan.summary.currency, 'EUR');
  assert.equal(plan.problems.length, 0);
  assert.equal(calls.blueprints.length, 1);
  assert.deepEqual(apiCalls.market, [{ blueprintId: 100, language: 'it' }]);
  assert.equal(apiCalls.cart.length, 0);
  assert.ok(progress.some((event) => event.phase === 'done'));
});

test('un nome approssimativo viene pianificato con un avviso', async () => {
  const { reference } = makeReference({
    async loadBlueprints() {
      return {
        blueprints: [
          {
            id: 100,
            name: "Boss's Orders - Ghetsis",
            game_id: 2,
            expansion_id: 10,
            fixed_properties: { collector_number: '114' },
            editable_properties: [],
          },
        ],
      };
    },
  });
  const { api } = makeApi();
  const planner = createDeckPlanner({ api, reference });

  const plan = await planner.plan({
    text: "3 Boss's Orders MEG 114",
    settings: { language: 'it', minCondition: 'Near Mint' },
  });

  assert.equal(plan.entries[0].status, 'ok');
  assert.equal(plan.entries[0].blueprint.name, "Boss's Orders - Ghetsis");
  assert.equal(plan.entries[0].blueprint.matchedBy, 'prefix');
  assert.equal(plan.entries[0].warnings[0].code, 'NOME_APPROSSIMATIVO');
  assert.match(plan.entries[0].warnings[0].message, /Boss's Orders - Ghetsis/);
});

test('cerca il blueprint MEE 013 in un\'altra espansione tramite la versione', async () => {
  const { reference } = makeReference({
    async loadPokemonExpansions() {
      return {
        expansions: [
          {
            id: 4336,
            game_id: 2,
            code: 'MEE',
            name: 'Mega Evolution Energies',
          },
          {
            id: 4679,
            game_id: 2,
            code: '30c',
            name: '30th Celebration',
          },
        ],
      };
    },
    async loadBlueprints() {
      return {
        blueprints: [
          {
            id: 352946,
            name: 'Basic Psychic Energy',
            version: 'MEE 005',
            game_id: 2,
            expansion_id: 4336,
            fixed_properties: { collector_number: '005' },
            editable_properties: [],
          },
        ],
      };
    },
  });
  const { api } = makeApi({
    async searchBlueprintsByName() {
      return [
        {
          id: 352946,
          name: 'Basic Psychic Energy',
          version: 'MEE 005',
          game_id: 2,
          expansion_id: 4336,
        },
        {
          id: 409562,
          name: 'Basic Psychic Energy',
          version: 'Holo | MEE 013',
          game_id: 2,
          expansion_id: 4679,
        },
      ];
    },
    async getMarketplaceProducts(blueprintId) {
      return {
        [blueprintId]: [
          offer(1, { cents: 11, quantity: 2, reverse: false }),
          offer(2, { cents: 13, quantity: 2, reverse: true }),
        ],
      };
    },
  });
  const planner = createDeckPlanner({ api, reference });

  const plan = await planner.plan({
    text: '1 Basic Psychic Energy - Holo MEE 13',
    settings: { language: 'it', minCondition: 'Near Mint' },
  });

  const planned = plan.entries[0];
  assert.equal(planned.status, 'ok');
  assert.equal(planned.blueprint.id, 409562);
  assert.equal(planned.blueprint.expansionId, 4679);
  assert.equal(planned.blueprint.finish, 'holo');
  assert.ok(
    planned.warnings.some(
      (warning) => warning.code === 'BLUEPRINT_IN_ALTRA_ESPANSIONE'
    )
  );
  // Il blueprint 409562 dichiara già "Holo" nella versione: tutte le sue
  // offerte sono Holo e non vanno filtrate per pokemon_reverse.
  assert.equal(planned.blueprint.finish, 'holo');
  assert.equal(planned.selection.items[0].unitPriceCents, 11);
});

test('le energie Holo usano il fallback numero e scelgono la variante reverse', async () => {
  const { reference } = makeReference({
    async loadPokemonExpansions() {
      return {
        expansions: [
          {
            id: 4336,
            game_id: 2,
            code: 'MEE',
            name: 'Mega Evolution Energies',
          },
        ],
      };
    },
    async loadBlueprints() {
      return {
        blueprints: [
          {
            id: 352946,
            name: 'Basic Psychic Energy',
            version: 'MEE 005',
            game_id: 2,
            expansion_id: 4336,
            fixed_properties: { collector_number: '005' },
            editable_properties: [],
          },
        ],
      };
    },
  });
  const { api } = makeApi({
    async getMarketplaceProducts(blueprintId) {
      return {
        [blueprintId]: [
          offer(1, { cents: 11, quantity: 2, reverse: false }),
          offer(2, { cents: 13, quantity: 2, reverse: true }),
        ],
      };
    },
  });
  const planner = createDeckPlanner({ api, reference });

  const plan = await planner.plan({
    text: '1 Psychic Energy MEE 13',
    settings: { language: 'it', minCondition: 'Near Mint' },
  });

  const planned = plan.entries[0];
  assert.equal(planned.status, 'ok');
  assert.equal(planned.blueprint.finish, 'holo');
  assert.ok(
    planned.warnings.some(
      (warning) => warning.code === 'NUMERO_STAMPA_APPROSSIMATIVO'
    )
  );
  assert.equal(
    planned.warnings.some((warning) => warning.code === 'NOME_APPROSSIMATIVO'),
    false
  );
  assert.equal(planned.selection.items[0].unitPriceCents, 13);
  assert.equal(planned.selection.items[0].foil, true);
});

test('una riga malformata finisce nei problemi senza chiamare le API', async () => {
  const { reference } = makeReference();
  const { api, calls } = makeApi();
  const planner = createDeckPlanner({ api, reference });

  const plan = await planner.plan({
    text: '4 Basic Fire Energy',
    settings: { language: 'it', minCondition: 'Near Mint' },
  });

  assert.equal(plan.entries.length, 0);
  assert.equal(plan.problems[0].code, 'RIGA_NON_RICONOSCIUTA');
  assert.equal(calls.market.length, 0);
});

test('segnala espansione non trovata e blueprint non corrispondente', async () => {
  const { reference } = makeReference();
  const { api, calls } = makeApi();
  const planner = createDeckPlanner({ api, reference });

  const missingExpansion = await planner.plan({
    text: '1 Pikachu ZZZ 1',
    settings: { language: 'it', minCondition: 'Near Mint' },
  });
  assert.equal(missingExpansion.entries[0].status, 'problem');
  assert.equal(missingExpansion.entries[0].problems[0].code, 'ESPANSIONE_NON_TROVATA');

  const missingNumber = await planner.plan({
    text: '1 Iron Leaves ex MEG 999',
    settings: { language: 'it', minCondition: 'Near Mint' },
  });
  assert.equal(missingNumber.entries[0].problems[0].code, 'BLUEPRINT_NON_TROVATO');
  assert.match(missingNumber.entries[0].problems[0].message, /999/);
  assert.equal(calls.market.length, 0);
});

test('quantità insufficiente non rende la riga pronta', async () => {
  const { reference } = makeReference();
  const { api } = makeApi({
    async getMarketplaceProducts(blueprintId) {
      return { [blueprintId]: [offer(1, { quantity: 1 })] };
    },
  });
  const planner = createDeckPlanner({ api, reference });

  const plan = await planner.plan({
    text: "2 Lillie's Determination MEG 119",
    settings: { language: 'it', minCondition: 'Near Mint' },
  });

  assert.equal(plan.entries[0].status, 'problem');
  assert.equal(plan.entries[0].selection.status, 'insufficient');
  assert.equal(plan.summary.readyEntries, 0);
  assert.equal(plan.summary.readyCards, 0);
  assert.equal(plan.summary.totalCents, 0);
});

test('due righe uguali caricano blueprint e marketplace una sola volta', async () => {
  const { reference, calls } = makeReference();
  const { api, calls: apiCalls } = makeApi();
  const planner = createDeckPlanner({ api, reference });

  const plan = await planner.plan({
    text: "2 Lillie's Determination MEG 119\n2 Lillie's Determination MEG 119",
    settings: { language: 'it', minCondition: 'Near Mint' },
  });

  assert.equal(plan.entries.length, 2);
  assert.equal(plan.entries.every((item) => item.status === 'ok'), true);
  assert.equal(calls.blueprints.length, 1);
  assert.equal(apiCalls.market.length, 1);
  assert.equal(plan.summary.readyCards, 4);
});

test('un errore API non 401 viene isolato sulla riga', async () => {
  const { reference } = makeReference();
  const { api } = makeApi({
    async getMarketplaceProducts() {
      const error = new Error('Errore temporaneo');
      error.status = 500;
      throw error;
    },
  });
  const planner = createDeckPlanner({ api, reference });

  const plan = await planner.plan({
    text: "1 Lillie's Determination MEG 119",
    settings: { language: 'it', minCondition: 'Near Mint' },
  });

  assert.equal(plan.entries[0].status, 'problem');
  assert.equal(plan.entries[0].problems[0].code, 'ERRORE_API');
  assert.equal(plan.entries[0].problems[0].status, 500);
});

test('un 401 interrompe la pianificazione', async () => {
  const { reference } = makeReference();
  const { api } = makeApi({
    async getMarketplaceProducts() {
      const error = new Error('Token non valido');
      error.status = 401;
      throw error;
    },
  });
  const planner = createDeckPlanner({ api, reference });

  await assert.rejects(
    () =>
      planner.plan({
        text: "1 Lillie's Determination MEG 119",
        settings: { language: 'it', minCondition: 'Near Mint' },
      }),
    /Token non valido/
  );
});
