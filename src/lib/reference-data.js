import { BLUEPRINT_CACHE_TTL_MS, CACHE_TTL_MS } from '../constants.js';
import { AppError } from './errors.js';
import { findPokemonGame, trimBlueprints } from './matcher.js';

export const GAMES_CACHE_KEY = 'reference.games';
export const EXPANSIONS_CACHE_KEY = 'reference.expansions';

export function blueprintsCacheKey(expansionId) {
  return `reference.blueprints.${Number(expansionId)}`;
}

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

/**
 * Dati di riferimento CardTrader (giochi, espansioni, blueprint) con cache
 * iniettabile. Il modulo non usa chrome.*: in popup si passa la cache basata
 * su chrome.storage.local, nei test una cache in memoria.
 */
export function createReferenceData(options = {}) {
  const {
    api,
    cache,
    referenceTtlMs = CACHE_TTL_MS,
    blueprintTtlMs = BLUEPRINT_CACHE_TTL_MS,
  } = options;

  if (!api) throw new TypeError('createReferenceData richiede un client API.');
  if (!cache) throw new TypeError('createReferenceData richiede una cache.');

  async function cachedArray(key, ttlMs, loader) {
    const cached = await cache.get(key);
    if (Array.isArray(cached)) {
      return { value: cached, fromCache: true };
    }
    if (cached !== null) {
      // Voce corrotta o di formato vecchio: la si sostituisce.
      await cache.remove(key);
    }
    const value = await loader();
    if (!Array.isArray(value)) {
      throw new AppError(
        'RISPOSTA_NON_VALIDA',
        `Risposta inattesa per i dati di riferimento (${key}).`
      );
    }
    await cache.set(key, value, ttlMs);
    return { value, fromCache: false };
  }

  async function loadGames() {
    return cachedArray(GAMES_CACHE_KEY, referenceTtlMs, () => api.getGames());
  }

  async function loadPokemonGame() {
    const { value: games, fromCache } = await loadGames();
    const game = findPokemonGame(games);
    if (!game) {
      throw new AppError(
        'GIOCO_NON_TROVATO',
        'Il gioco Pokémon non è presente tra i giochi CardTrader.'
      );
    }
    return {
      game,
      gameId: Number(game.id),
      fromCache,
    };
  }

  async function loadPokemonExpansions(gameId) {
    if (!isPositiveInteger(gameId)) {
      throw new AppError('PARAMETRO_NON_VALIDO', 'ID gioco non valido.');
    }
    const { value: expansions, fromCache } = await cachedArray(
      EXPANSIONS_CACHE_KEY,
      referenceTtlMs,
      () => api.getExpansions()
    );
    const filtered = expansions.filter(
      (expansion) => Number(expansion?.game_id) === Number(gameId)
    );
    return { expansions: filtered, fromCache };
  }

  async function loadBlueprints(expansionId) {
    if (!isPositiveInteger(expansionId)) {
      throw new AppError('PARAMETRO_NON_VALIDO', 'ID espansione non valido.');
    }
    const numericId = Number(expansionId);
    const key = blueprintsCacheKey(numericId);
    const cached = await cache.get(key);
    if (Array.isArray(cached)) {
      return { blueprints: cached, fromCache: true };
    }
    if (cached !== null) {
      await cache.remove(key);
    }
    const raw = await api.getBlueprints(numericId);
    if (!Array.isArray(raw)) {
      throw new AppError(
        'RISPOSTA_NON_VALIDA',
        'Risposta inattesa dai blueprint CardTrader.'
      );
    }
    const blueprints = trimBlueprints(raw);
    await cache.set(key, blueprints, blueprintTtlMs);
    return { blueprints, fromCache: false };
  }

  return {
    loadGames,
    loadPokemonGame,
    loadPokemonExpansions,
    loadBlueprints,
  };
}
