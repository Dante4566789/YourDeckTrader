#!/usr/bin/env node
/**
 * Verifica in sola lettura dei campi reali CardTrader.
 *
 * Uso (PowerShell):
 *   $env:CARDTRADER_TOKEN="..."
 *   npm run inspect:api
 *
 * Non stampa mai il token né shared_secret. Non effettua POST.
 */
import { createApiClient } from '../src/lib/api-client.js';
import { createRequestScheduler } from '../src/lib/rate-scheduler.js';
import { nameKey } from '../src/lib/normalize.js';

const token = process.env.CARDTRADER_TOKEN?.trim() || '';

if (!token) {
  console.log('SALTATO: CARDTRADER_TOKEN non impostata.');
  console.log('PowerShell: $env:CARDTRADER_TOKEN="il_tuo_token"; npm run inspect:api');
  process.exit(0);
}

const api = createApiClient({
  token,
  scheduler: createRequestScheduler({ marketplaceIntervalMs: 1100 }),
});

function line(label = '') {
  console.log(label ? `\n=== ${label} ===` : '');
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null))];
}

function collectKeys(objects, pick) {
  const keys = new Set();
  for (const object of objects) {
    const target = pick(object);
    if (target && typeof target === 'object') {
      Object.keys(target).forEach((key) => keys.add(key));
    }
  }
  return [...keys].sort();
}

function printNumberCandidates(blueprint) {
  const candidates = [];
  const sources = [
    ['blueprint', blueprint],
    ['fixed_properties', blueprint?.fixed_properties],
    ['properties', blueprint?.properties],
  ];
  for (const [sourceName, source] of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const [key, value] of Object.entries(source)) {
      if (sourceName === 'blueprint' && !/collector|card_?number|print|number|num/i.test(key)) {
        continue;
      }
      if (sourceName === 'blueprint' && key === 'version') continue;
      if (/collector|card_?number|print|number|num/i.test(key)) {
        candidates.push({ field: `${sourceName}.${key}`, value });
      }
    }
  }
  if (blueprint?.version && /^\d[\w/-]*$/.test(String(blueprint.version))) {
    candidates.push({ field: 'version', value: blueprint.version });
  }
  return candidates;
}

function printPropertySummary(label, offers) {
  const properties = offers.map((offer) => offer?.properties_hash || {});
  const keys = unique(properties.flatMap((hash) => Object.keys(hash || {})));
  line(label);
  console.log(`Offerte restituite: ${offers.length}`);
  console.log(`Chiavi properties_hash: ${keys.join(', ') || '(nessuna)'}`);
  console.log(
    `can_sell_via_hub=true: ${offers.filter((offer) => offer?.user?.can_sell_via_hub === true).length}`
  );
  for (const key of keys) {
    const values = unique(properties.map((hash) => hash[key])).slice(0, 12);
    console.log(`  ${key}: ${JSON.stringify(values)}`);
  }
}

try {
  line('GET /info');
  const info = await api.getInfo();
  console.log(`Token valido. App: ${info.name ?? '(senza nome)'} (id ${info.id ?? '?'})`);
  console.log('shared_secret non richiesto/stampato.');

  line('GET /games');
  const games = await api.getGames();
  const pokemonGames = games.filter(
    (game) =>
      nameKey(game?.name).includes('pokemon') ||
      nameKey(game?.display_name).includes('pokemon')
  );
  console.log(JSON.stringify(pokemonGames, null, 2));

  if (!pokemonGames.length) {
    console.log('\nNESSUNA corrispondenza Pokémon in /games.');
    process.exit(1);
  }

  const gameId = Number(pokemonGames[0].id);
  line('GET /expansions');
  const expansions = await api.getExpansions();
  const pokemonExpansions = expansions.filter(
    (expansion) => Number(expansion.game_id) === gameId
  );
  console.log(`Espansioni Pokémon: ${pokemonExpansions.length}`);
  const megaCandidates = pokemonExpansions.filter(
    (expansion) =>
      nameKey(expansion.code) === nameKey('MEG') ||
      nameKey(expansion.name).includes('megaevolution')
  );
  console.log(`Candidate MEG / Mega Evolution: ${JSON.stringify(megaCandidates, null, 2)}`);
  console.log(
    `Ultime 8 espansioni: ${JSON.stringify(pokemonExpansions.slice(-8), null, 2)}`
  );

  if (!megaCandidates.length) {
    console.log('\nNessuna espansione MEG/Mega Evolution trovata: mapping manuale necessario.');
    process.exit(0);
  }

  const expansion = megaCandidates[0];
  line(`GET /blueprints/export?expansion_id=${expansion.id}`);
  const blueprints = await api.getBlueprints(expansion.id);
  console.log(`Blueprint: ${blueprints.length}`);
  console.log(`Chiavi blueprint: ${collectKeys(blueprints, (item) => item).join(', ')}`);
  console.log(
    `Chiavi fixed_properties: ${collectKeys(blueprints, (item) => item.fixed_properties).join(', ')}`
  );
  const editableNames = unique(
    blueprints.flatMap((blueprint) =>
      Array.isArray(blueprint.editable_properties)
        ? blueprint.editable_properties.map((property) => property.name)
        : []
    )
  );
  console.log(`editable_properties: ${editableNames.join(', ')}`);

  const withCandidates = blueprints
    .map((blueprint) => ({ blueprint, candidates: printNumberCandidates(blueprint) }))
    .filter((item) => item.candidates.length);
  const fieldCounts = {};
  for (const item of withCandidates) {
    for (const candidate of item.candidates) {
      fieldCounts[candidate.field] = (fieldCounts[candidate.field] || 0) + 1;
    }
  }
  console.log(`Campi numero di stampa rilevati: ${JSON.stringify(fieldCounts, null, 2)}`);
  console.log(
    `Esempi: ${JSON.stringify(
      withCandidates.slice(0, 5).map((item) => ({
        id: item.blueprint.id,
        name: item.blueprint.name,
        version: item.blueprint.version,
        candidates: item.candidates,
      })),
      null,
      2
    )}`
  );

  line('GET /marketplace/products (fino a 3 blueprint con offerte)');
  let inspected = 0;
  for (const blueprint of blueprints) {
    if (inspected >= 3) break;
    const market = await api.getMarketplaceProducts(blueprint.id, { language: 'it' });
    const offers = market[String(blueprint.id)] || [];
    if (!offers.length) continue;
    inspected += 1;
    console.log(
      `\nBlueprint ${blueprint.id} "${blueprint.name}" — numero candidato: ${JSON.stringify(
        printNumberCandidates(blueprint)
      )}`
    );
    printPropertySummary('Offerte', offers);
  }

  if (!inspected) {
    console.log('Nessuna offerta restituita per i blueprint campione.');
  }

  line('CONCLUSIONE');
  console.log('Verifica completata. Controlla sopra i campi reali di numero, lingua e foil.');
} catch (error) {
  console.error(`\nERRORE: ${error?.message || error}`);
  if (error?.status) console.error(`Status HTTP: ${error.status}`);
  if (error?.code === 'API_NON_DISPONIBILE') {
    console.error(
      'CardTrader è in manutenzione: riprova quando api.cardtrader.com torna disponibile.'
    );
  } else if (error?.status === 403) {
    console.error(
      'CardTrader sta rispondendo 403 (manutenzione/accesso negato). Riprova quando api.cardtrader.com torna disponibile.'
    );
  }
  process.exitCode = 1;
}
