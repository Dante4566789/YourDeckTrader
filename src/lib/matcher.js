import {
  expansionCodeKey,
  nameKey,
  normalizePrintNumber,
  printNumberKey,
} from './normalize.js';

const PRINT_FIELD_PATTERN = /collector|card.?number|print|number|num|card.?no|no\.?$/i;
const LANG_FIELD_PATTERN = /lang/i;
const CONDITION_FIELD_PATTERN = /condition/i;
const FOIL_FIELD_PATTERN = /foil|holo|reverse/i;

const IGNORED_TOP_LEVEL_FIELDS = new Set([
  'id',
  'game_id',
  'category_id',
  'expansion_id',
  'blueprint_id',
  'image',
  'image_url',
  'back_image',
]);

const PRINT_FIELD_PRIORITY = [
  'fixed_properties.collector_number',
  'fixed_properties.card_number',
  'fixed_properties.number',
  'fixed_properties.print_number',
  'fixed_properties.card_no',
  'collector_number',
  'card_number',
  'number',
  'print_number',
  'collectorNumber',
  'cardNumber',
  'printNumber',
];

function isScalar(value) {
  return typeof value === 'string' || typeof value === 'number';
}

export function isPlausiblePrintNumber(value) {
  if (!isScalar(value)) return false;
  const raw = String(value).trim();
  if (!raw) return false;
  const normalized = normalizePrintNumber(raw);
  if (!normalized || normalized === '0' || !/\d/.test(normalized)) return false;
  return /^[A-Za-z]{0,6}\d{1,5}[A-Za-z]?(?:\/\d{1,4})?$/.test(normalized);
}

/**
 * Raccoglie i possibili numeri di stampa da un blueprint senza assumere
 * un unico nome di campo. Riporta anche il campo usato, così la UI può
 * mostrare cosa è stato realmente letto.
 */
export function extractPrintNumberCandidates(blueprint) {
  const candidates = [];
  const seen = new Set();

  function add(field, value) {
    if (!isPlausiblePrintNumber(value)) return;
    const key = `${field}=${String(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      field,
      value: String(value).trim(),
      normalized: normalizePrintNumber(value),
    });
  }

  const fixed = blueprint?.fixed_properties;
  if (fixed && typeof fixed === 'object') {
    for (const [key, value] of Object.entries(fixed)) {
      if (PRINT_FIELD_PATTERN.test(key)) add(`fixed_properties.${key}`, value);
    }
  }

  for (const [key, value] of Object.entries(blueprint || {})) {
    if (IGNORED_TOP_LEVEL_FIELDS.has(key)) continue;
    if (!PRINT_FIELD_PATTERN.test(key)) continue;
    if (value && typeof value === 'object') continue;
    add(key, value);
  }

  const properties = blueprint?.properties;
  if (properties && typeof properties === 'object') {
    for (const [key, value] of Object.entries(properties)) {
      if (PRINT_FIELD_PATTERN.test(key)) add(`properties.${key}`, value);
    }
  }

  if (blueprint?.version && isScalar(blueprint.version)) {
    add('version', blueprint.version);
  }

  candidates.sort((a, b) => {
    const indexA = PRINT_FIELD_PRIORITY.indexOf(a.field);
    const indexB = PRINT_FIELD_PRIORITY.indexOf(b.field);
    const priorityA = indexA === -1 ? 100 : indexA;
    const priorityB = indexB === -1 ? 100 : indexB;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.field.localeCompare(b.field);
  });

  return candidates;
}

function nameAliases(blueprint) {
  const aliases = new Set();
  if (blueprint?.name) aliases.add(nameKey(blueprint.name));
  if (blueprint?.name && blueprint?.version) {
    aliases.add(nameKey(`${blueprint.name} ${blueprint.version}`));
  }
  aliases.delete('');
  return [...aliases];
}

export function findPokemonGame(games) {
  if (!Array.isArray(games)) return null;
  const candidates = games.filter(
    (game) =>
      nameKey(game?.name).includes('pokemon') ||
      nameKey(game?.display_name).includes('pokemon')
  );
  if (!candidates.length) return null;
  return (
    candidates.find((game) => nameKey(game?.name) === 'pokemon') || candidates[0]
  );
}

export function resolveExpansion(expansions, gameId, deckCode, mappings = []) {
  const codeKey = expansionCodeKey(deckCode);
  const gameExpansions = (Array.isArray(expansions) ? expansions : []).filter(
    (expansion) => Number(expansion.game_id) === Number(gameId)
  );

  if (!codeKey) {
    return {
      expansion: null,
      error: {
        code: 'ESPANSIONE_NON_TROVATA',
        message: 'Codice espansione vuoto.',
      },
    };
  }

  const exact = gameExpansions.find(
    (expansion) => expansionCodeKey(expansion.code) === codeKey
  );
  if (exact) {
    return { expansion: exact, matchedBy: 'code' };
  }

  const mapping = (Array.isArray(mappings) ? mappings : []).find(
    (item) => expansionCodeKey(item?.deckCode) === codeKey
  );

  if (mapping) {
    const target = String(mapping.target || '').trim();
    if (/^\d+$/.test(target)) {
      const byId = gameExpansions.find(
        (expansion) => Number(expansion.id) === Number(target)
      );
      if (byId) return { expansion: byId, matchedBy: 'mapping-id' };
    }

    const targetNameKey = nameKey(target);
    const targetCodeKey = expansionCodeKey(target);
    const targetLooksLikeName = /\s/.test(target) || target.length > 8;

    const byName = () =>
      gameExpansions.find((expansion) => nameKey(expansion.name) === targetNameKey);
    const byCode = () =>
      gameExpansions.find(
        (expansion) => expansionCodeKey(expansion.code) === targetCodeKey
      );

    const orderedChecks = targetLooksLikeName
      ? [
          ['mapping-name', byName],
          ['mapping-code', byCode],
        ]
      : [
          ['mapping-code', byCode],
          ['mapping-name', byName],
        ];

    for (const [matchedBy, finder] of orderedChecks) {
      const found = finder();
      if (found) return { expansion: found, matchedBy };
    }

    if (targetNameKey.length >= 3) {
      const partial = gameExpansions.filter((expansion) =>
        nameKey(expansion.name).includes(targetNameKey)
      );
      if (partial.length === 1) {
        return { expansion: partial[0], matchedBy: 'mapping-name-partial' };
      }
    }
  }

  return {
    expansion: null,
    error: {
      code: 'ESPANSIONE_NON_TROVATA',
      message: `Espansione "${deckCode}" non trovata per il gioco Pokémon. Aggiungi un mapping nelle opzioni.`,
      deckCode,
      gameId,
    },
  };
}

export function resolveEntriesExpansions(entries, expansions, gameId, mappings) {
  const cache = new Map();
  const results = new Map();
  for (const entry of entries) {
    const key = entry.setKey || expansionCodeKey(entry.setCode);
    if (!cache.has(key)) {
      cache.set(key, resolveExpansion(expansions, gameId, entry.setCode, mappings));
    }
    results.set(key, cache.get(key));
  }
  return results;
}

function countFields(blueprints, pattern) {
  const counts = {};
  for (const blueprint of blueprints) {
    const props = Array.isArray(blueprint?.editable_properties)
      ? blueprint.editable_properties
      : [];
    for (const property of props) {
      if (property?.name && pattern.test(property.name)) {
        counts[property.name] = (counts[property.name] || 0) + 1;
      }
    }
  }
  return counts;
}

export function createBlueprintIndex(blueprints) {
  const list = Array.isArray(blueprints) ? blueprints : [];
  const byName = new Map();
  const printFieldCounts = {};
  let withNumber = 0;
  let withoutNumber = 0;

  for (const blueprint of list) {
    const candidates = extractPrintNumberCandidates(blueprint);
    if (candidates.length) withNumber += 1;
    else withoutNumber += 1;
    for (const candidate of candidates) {
      printFieldCounts[candidate.field] =
        (printFieldCounts[candidate.field] || 0) + 1;
    }

    const item = { blueprint, candidates };
    for (const alias of nameAliases(blueprint)) {
      if (!byName.has(alias)) byName.set(alias, []);
      byName.get(alias).push(item);
    }
  }

  const printFields = Object.entries(printFieldCounts).sort((a, b) => b[1] - a[1]);

  return {
    byName,
    diagnostics: {
      total: list.length,
      withNumber,
      withoutNumber,
      printFieldCounts,
      printFields,
      languageFields: countFields(list, LANG_FIELD_PATTERN),
      conditionFields: countFields(list, CONDITION_FIELD_PATTERN),
      foilFields: countFields(list, FOIL_FIELD_PATTERN),
    },
  };
}

export function findBlueprint(index, entry) {
  const candidatesForName = index?.byName?.get(entry.nameKey) || [];
  if (!candidatesForName.length) {
    return {
      status: 'not_found',
      reason: 'name',
      message: `Nessun blueprint chiamato "${entry.name}" nel set ${entry.setCode}.`,
    };
  }

  const seenIds = new Set();
  const matches = [];
  for (const item of candidatesForName) {
    const dedupeKey = item.blueprint?.id;
    if (seenIds.has(dedupeKey)) continue;
    seenIds.add(dedupeKey);
    for (const candidate of item.candidates) {
      if (printNumberKey(candidate.value) === entry.printKey) {
        matches.push({ ...item, matchedCandidate: candidate });
        break;
      }
    }
  }

  if (matches.length) {
    matches.sort((a, b) => Number(a.blueprint.id) - Number(b.blueprint.id));
    const chosen = matches[0];
    return {
      status: 'ok',
      blueprint: chosen.blueprint,
      printField: chosen.matchedCandidate.field,
      printValue: chosen.matchedCandidate.value,
      candidates: chosen.candidates,
      ambiguous: matches.length > 1,
      alternatives: matches.slice(1).map((match) => match.blueprint),
    };
  }

  const withCandidates = candidatesForName.filter(
    (item) => item.candidates.length > 0
  );
  const available = [
    ...new Set(
      withCandidates.flatMap((item) =>
        item.candidates.map((candidate) => candidate.value)
      )
    ),
  ];

  if (!withCandidates.length) {
    return {
      status: 'not_found',
      reason: 'missing_print_number',
      message: `Blueprint trovato per nome, ma nessun campo numero di stampa è disponibile per "${entry.name}".`,
      candidates: [],
    };
  }

  return {
    status: 'not_found',
    reason: 'number',
    message: `Numero ${entry.printNumber} non trovato per "${entry.name}" (numeri disponibili: ${available.join(', ') || '—'}).`,
    available,
  };
}

/** Riduce i blueprint ai soli campi utili, per una cache più leggera. */
export function trimBlueprints(blueprints) {
  if (!Array.isArray(blueprints)) return [];
  return blueprints.map((blueprint) => ({
    id: blueprint.id,
    name: blueprint.name,
    version: blueprint.version ?? null,
    game_id: blueprint.game_id,
    category_id: blueprint.category_id,
    expansion_id: blueprint.expansion_id,
    fixed_properties: blueprint.fixed_properties || {},
    editable_properties: Array.isArray(blueprint.editable_properties)
      ? blueprint.editable_properties.map((property) => ({
          name: property.name,
          type: property.type,
          default_value: property.default_value,
          possible_values: property.possible_values,
        }))
      : [],
    properties: blueprint.properties || {},
  }));
}
