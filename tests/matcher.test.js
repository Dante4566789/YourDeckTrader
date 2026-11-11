import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBlueprintIndex,
  extractPrintNumberCandidates,
  findBlueprint,
  findPokemonGame,
  resolveExpansion,
  resolveEntriesExpansions,
  trimBlueprints,
} from '../src/lib/matcher.js';

const games = [
  { id: 1, name: 'Magic: The Gathering' },
  { id: 2, name: 'Pokémon' },
  { id: 3, name: 'One Piece' },
];

const expansions = [
  { id: 10, game_id: 2, code: 'OBF', name: 'Obsidian Flames' },
  { id: 11, game_id: 2, code: 'TEF', name: 'Temporal Forces' },
  { id: 12, game_id: 2, code: 'MEG', name: 'Mega Evolution' },
  { id: 90, game_id: 1, code: 'MEG', name: 'Magic Expansion' },
];

function entry(overrides = {}) {
  return {
    name: "Lillie's Determination",
    nameKey: 'lilliesdetermination',
    setCode: 'MEG',
    setKey: 'MEG',
    printNumber: '119',
    printKey: '119',
    ...overrides,
  };
}

test('findPokemonGame riconosce il gioco Pokémon e ignora gli altri', () => {
  assert.equal(findPokemonGame(games).id, 2);
  assert.equal(findPokemonGame([{ id: 7, display_name: 'Pokemon TCG' }]).id, 7);
  assert.equal(findPokemonGame([{ id: 1, name: 'Magic' }]), null);
  assert.equal(findPokemonGame(null), null);
});

test('resolveExpansion preferisce il codice esatto e filtra per gioco', () => {
  const result = resolveExpansion(expansions, 2, 'MEG', [
    { deckCode: 'MEG', target: 'Obsidian Flames' },
  ]);
  assert.equal(result.expansion.id, 12);
  assert.equal(result.matchedBy, 'code');
});

test('resolveExpansion usa il mapping per codice, nome o id', () => {
  const byCode = resolveExpansion(expansions, 2, 'MEGX', [
    { deckCode: 'MEGX', target: 'obf' },
  ]);
  assert.equal(byCode.expansion.id, 10);
  assert.equal(byCode.matchedBy, 'mapping-code');

  const byName = resolveExpansion(expansions, 2, 'MEW', [
    { deckCode: 'MEW', target: 'Temporal Forces' },
  ]);
  assert.equal(byName.expansion.id, 11);
  assert.equal(byName.matchedBy, 'mapping-name');

  const byId = resolveExpansion(expansions, 2, 'XYZ', [
    { deckCode: 'XYZ', target: '10' },
  ]);
  assert.equal(byId.expansion.id, 10);
  assert.equal(byId.matchedBy, 'mapping-id');
});

test('resolveExpansion segnala codice mancante o espansione assente', () => {
  const empty = resolveExpansion(expansions, 2, '   ');
  assert.equal(empty.error.code, 'ESPANSIONE_NON_TROVATA');

  const missing = resolveExpansion(expansions, 2, 'ZZZ');
  assert.equal(missing.expansion, null);
  assert.equal(missing.error.code, 'ESPANSIONE_NON_TROVATA');
  assert.match(missing.error.message, /ZZZ/);
});

test('resolveEntriesExpansions calcola una volta per codice di set', () => {
  const entries = [
    entry({ name: 'A', nameKey: 'a', setCode: 'MEG', setKey: 'MEG' }),
    entry({ name: 'B', nameKey: 'b', setCode: 'MEG', setKey: 'MEG' }),
    entry({ name: 'C', nameKey: 'c', setCode: 'ZZZ', setKey: 'ZZZ' }),
  ];
  const results = resolveEntriesExpansions(entries, expansions, 2, []);
  assert.equal(results.size, 2);
  assert.equal(results.get('MEG').expansion.id, 12);
  assert.equal(results.get('ZZZ').expansion, null);
});

test('extractPrintNumberCandidates dà priorità a fixed_properties.collector_number', () => {
  const candidates = extractPrintNumberCandidates({
    id: 900,
    name: 'Pikachu',
    number: '999',
    version: '025',
    fixed_properties: {
      collector_number: '025/165',
      card_number: '25',
      rarity: 'Common',
    },
    properties: { print_number: '26' },
  });

  assert.equal(candidates[0].field, 'fixed_properties.collector_number');
  assert.equal(candidates[0].normalized, '25');
  assert.ok(candidates.some((item) => item.field === 'version' && item.normalized === '25'));
  assert.ok(candidates.every((item) => item.field !== 'fixed_properties.rarity'));
});

test('extractPrintNumberCandidates ignora valori non plausibili', () => {
  const candidates = extractPrintNumberCandidates({
    id: 1,
    name: 'Solo',
    fixed_properties: { collector_number: '0', card_number: '---', print_number: 'TG05' },
  });
  assert.deepEqual(
    candidates.map((item) => item.normalized),
    ['TG5']
  );
});

test('createBlueprintIndex indicizza nome, nome+versione e diagnostica i campi', () => {
  const index = createBlueprintIndex([
    {
      id: 1,
      name: 'Charizard',
      version: 'ex',
      fixed_properties: { collector_number: '125' },
      editable_properties: [{ name: 'Language' }, { name: 'Condition' }],
    },
    {
      id: 2,
      name: 'Charizard ex',
      fixed_properties: {},
      editable_properties: [],
    },
  ]);

  assert.equal(index.byName.get('charizardex').length, 2);
  assert.equal(index.diagnostics.total, 2);
  assert.equal(index.diagnostics.withNumber, 1);
  assert.equal(index.diagnostics.withoutNumber, 1);
  assert.equal(index.diagnostics.printFieldCounts['fixed_properties.collector_number'], 1);
  assert.equal(index.diagnostics.languageFields.Language, 1);
  assert.equal(index.diagnostics.conditionFields.Condition, 1);
});

test('findBlueprint trova il numero anche con zeri iniziali o /162', () => {
  const index = createBlueprintIndex([
    {
      id: 1,
      name: 'Iron Leaves ex',
      fixed_properties: { collector_number: '025/162' },
    },
  ]);
  const result = findBlueprint(
    index,
    entry({
      name: 'Iron Leaves ex',
      nameKey: 'ironleavesex',
      setCode: 'TEF',
      printNumber: '25',
      printKey: '25',
    })
  );
  assert.equal(result.status, 'ok');
  assert.equal(result.blueprint.id, 1);
  assert.equal(result.printField, 'fixed_properties.collector_number');
});

test('findBlueprint distingue nome assente, numero assente e numero sbagliato', () => {
  const index = createBlueprintIndex([
    {
      id: 1,
      name: 'Lillie\'s Determination',
      fixed_properties: { collector_number: '119' },
    },
    {
      id: 2,
      name: 'Senza Numero',
      fixed_properties: {},
    },
  ]);

  const missingName = findBlueprint(index, entry({ name: 'Assente', nameKey: 'assente' }));
  assert.equal(missingName.reason, 'name');

  const missingNumber = findBlueprint(
    index,
    entry({ name: 'Senza Numero', nameKey: 'senzanumero', printKey: '1', printNumber: '1' })
  );
  assert.equal(missingNumber.reason, 'missing_print_number');

  const wrongNumber = findBlueprint(
    index,
    entry({ printKey: '120', printNumber: '120' })
  );
  assert.equal(wrongNumber.reason, 'number');
  assert.ok(wrongNumber.available.includes('119'));
});

test('findBlueprint segnala ambiguità senza bloccare la scelta', () => {
  const index = createBlueprintIndex([
    { id: 5, name: 'Pikachu', fixed_properties: { collector_number: '58' } },
    { id: 6, name: 'Pikachu', fixed_properties: { collector_number: '58' } },
  ]);
  const result = findBlueprint(
    index,
    entry({ name: 'Pikachu', nameKey: 'pikachu', printKey: '58', printNumber: '58' })
  );
  assert.equal(result.status, 'ok');
  assert.equal(result.blueprint.id, 5);
  assert.equal(result.ambiguous, true);
  assert.equal(result.alternatives.length, 1);
});

test('trimBlueprints conserva solo i campi utili', () => {
  const [trimmed] = trimBlueprints([
    {
      id: 1,
      name: 'Pikachu',
      version: 'ex',
      game_id: 2,
      category_id: 1,
      expansion_id: 10,
      image_url: 'https://example.test/card.png',
      fixed_properties: { collector_number: '58' },
      editable_properties: [
        { name: 'Language', type: 'single_select', default_value: 'it', possible_values: ['it'] },
      ],
      properties: { foo: 'bar' },
      extra: 'scartato',
    },
  ]);
  assert.deepEqual(Object.keys(trimmed).sort(), [
    'category_id',
    'editable_properties',
    'expansion_id',
    'fixed_properties',
    'game_id',
    'id',
    'name',
    'properties',
    'version',
  ]);
  assert.equal(trimmed.image_url, undefined);
  assert.equal(trimmed.extra, undefined);
});
