import {
  expansionCodeKey,
  nameKey,
  normalizeName,
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

function nameTokens(value) {
  return normalizeName(value)
    .replace(/'s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function compactDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Confronta il nome della lista con quello del blueprint.
 *
 * Le liste dei giocatori spesso usano il nome base, mentre CardTrader
 * aggiunge il suffisso del personaggio: "Boss's Orders" deve trovare
 * "Boss's Orders - Ghetsis". Il numero di stampa resta obbligatorio, quindi
 * la similarità non può cambiare la carta scelta.
 */
export function nameSimilarity(queryName, candidateName) {
  const queryKey = nameKey(queryName);
  const candidateKey = nameKey(candidateName);
  if (!queryKey || !candidateKey) return null;
  if (queryKey === candidateKey) {
    return { kind: 'exact', score: 100 };
  }

  const queryTokens = nameTokens(queryName);
  const candidateTokens = nameTokens(candidateName);
  const candidateSet = new Set(candidateTokens);

  if (
    queryTokens.length &&
    queryTokens.every((token) => candidateSet.has(token))
  ) {
    const extra = Math.max(0, candidateTokens.length - queryTokens.length);
    return { kind: 'prefix', score: 80 - Math.min(extra, 10) };
  }

  if (queryKey.length >= 5 && candidateKey.startsWith(queryKey)) {
    return { kind: 'prefix', score: 70 };
  }

  if (queryKey.length >= 6 && candidateKey.includes(queryKey)) {
    return { kind: 'partial', score: 60 };
  }

  const querySet = new Set(queryTokens);
  if (
    candidateTokens.length &&
    candidateTokens.every((token) => querySet.has(token))
  ) {
    return { kind: 'tokens', score: 55 };
  }

  const intersection = queryTokens.filter((token) => candidateSet.has(token))
    .length;
  const union = new Set([...queryTokens, ...candidateTokens]).size;
  const jaccard = union ? intersection / union : 0;
  const distance = compactDistance(queryKey, candidateKey);
  const ratio = 1 - distance / Math.max(queryKey.length, candidateKey.length);

  if (jaccard >= 0.6 || ratio >= 0.82) {
    return {
      kind: 'similar',
      score: Math.max(30, Math.round(Math.max(jaccard, ratio) * 50)),
    };
  }

  return null;
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
  const items = [];
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
    items.push(item);
    for (const alias of nameAliases(blueprint)) {
      if (!byName.has(alias)) byName.set(alias, []);
      byName.get(alias).push(item);
    }
  }

  const printFields = Object.entries(printFieldCounts).sort((a, b) => b[1] - a[1]);

  return {
    byName,
    items,
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

function matchNumber(item, entry) {
  for (const candidate of item.candidates) {
    if (printNumberKey(candidate.value) === entry.printKey) return candidate;
  }
  return null;
}

function collectNumberMatches(items, entry) {
  const seenIds = new Set();
  const matches = [];
  for (const item of items) {
    const id = item.blueprint?.id;
    if (seenIds.has(id)) continue;
    const matchedCandidate = matchNumber(item, entry);
    if (!matchedCandidate) continue;
    seenIds.add(id);
    matches.push({ ...item, matchedCandidate });
  }
  return matches;
}

function availableNumbers(items) {
  return [
    ...new Set(
      items.flatMap((item) =>
        item.candidates.map((candidate) => candidate.value)
      )
    ),
  ];
}

function describeNames(items, limit = 5) {
  return items.slice(0, limit).map((item) => {
    const blueprint = item.blueprint || {};
    return blueprint.version
      ? `${blueprint.name} (${blueprint.version})`
      : `${blueprint.name}`;
  });
}

function okResult(chosen, extra = {}) {
  return {
    status: 'ok',
    blueprint: chosen.blueprint,
    printField: chosen.matchedCandidate.field,
    printValue: chosen.matchedCandidate.value,
    candidates: chosen.candidates,
    ambiguous: extra.ambiguous || false,
    alternatives: extra.alternatives || [],
    ...extra,
  };
}

export function findBlueprint(index, entry) {
  const candidatesForName = index?.byName?.get(entry.nameKey) || [];

  // 1. Nome esatto (comportamento storico).
  const exactMatches = collectNumberMatches(candidatesForName, entry);
  if (exactMatches.length) {
    exactMatches.sort((a, b) => Number(a.blueprint.id) - Number(b.blueprint.id));
    return okResult(exactMatches[0], {
      matchedBy: 'exact',
      nameScore: 100,
      ambiguous: exactMatches.length > 1,
      alternatives: exactMatches.slice(1).map((match) => match.blueprint),
    });
  }

  // 2. Fallback per nome simile: la lista del giocatore può usare il nome
  // base ("Boss's Orders") mentre CardTrader aggiunge un suffisso
  // ("Boss's Orders - Ghetsis"). Il numero di stampa resta obbligatorio.
  const exactIds = new Set(candidatesForName.map((item) => item.blueprint?.id));
  const scored = [];
  for (const item of index?.items || []) {
    if (exactIds.has(item.blueprint?.id)) continue;
    const similarity = nameSimilarity(entry.name, item.blueprint?.name);
    if (!similarity) continue;
    scored.push({ item, similarity });
  }
  scored.sort(
    (a, b) =>
      b.similarity.score - a.similarity.score ||
      Number(a.item.blueprint?.id) - Number(b.item.blueprint?.id)
  );

  const similarMatches = [];
  for (const { item, similarity } of scored) {
    const matchedCandidate = matchNumber(item, entry);
    if (!matchedCandidate) continue;
    similarMatches.push({ ...item, matchedCandidate, similarity });
  }

  if (similarMatches.length) {
    similarMatches.sort(
      (a, b) =>
        b.similarity.score - a.similarity.score ||
        Number(a.blueprint?.id) - Number(b.blueprint?.id)
    );
    const chosen = similarMatches[0];
    return okResult(chosen, {
      matchedBy: chosen.similarity.kind,
      nameScore: chosen.similarity.score,
      requestedName: entry.name,
      ambiguous: similarMatches.length > 1,
      alternatives: similarMatches.slice(1).map((match) => match.blueprint),
    });
  }

  // 3. Errori diagnostici.
  if (!candidatesForName.length) {
    if (scored.length) {
      const similarItems = scored.map(({ item }) => item);
      const available = availableNumbers(similarItems);
      const names = describeNames(similarItems);
      return {
        status: 'not_found',
        reason: 'number',
        message: `Numero ${entry.printNumber} non trovato per "${entry.name}". Nomi simili nel set: ${names.join(', ') || '—'}${available.length ? ` (numeri disponibili: ${available.join(', ')})` : ''}.`,
        available,
        similarNames: names,
      };
    }

    return {
      status: 'not_found',
      reason: 'name',
      message: `Nessun blueprint chiamato "${entry.name}" nel set ${entry.setCode}.`,
    };
  }

  const withCandidates = candidatesForName.filter(
    (item) => item.candidates.length > 0
  );
  const available = availableNumbers(withCandidates);

  if (!withCandidates.length) {
    return {
      status: 'not_found',
      reason: 'missing_print_number',
      message: `Blueprint trovato per nome, ma nessun campo numero di stampa è disponibile per "${entry.name}".`,
      candidates: [],
    };
  }

  const similarNames = describeNames(scored.map(({ item }) => item));
  return {
    status: 'not_found',
    reason: 'number',
    message: `Numero ${entry.printNumber} non trovato per "${entry.name}" (numeri disponibili: ${available.join(', ') || '—'})${similarNames.length ? `. Nomi simili nel set: ${similarNames.join(', ')}` : ''}.`,
    available,
    similarNames,
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
