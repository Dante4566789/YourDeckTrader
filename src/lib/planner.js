import { parseDeckList } from './deck-parser.js';
import {
  createBlueprintIndex,
  findBlueprint,
  resolveEntriesExpansions,
} from './matcher.js';
import {
  extractMarketplaceOffers,
  selectOffersForEntry,
} from './offers.js';

function safeProgress(onProgress, event) {
  if (typeof onProgress !== 'function') return;
  try {
    onProgress(event);
  } catch {
    // La UI non deve interrompere la pianificazione.
  }
}

function entryProblem(code, message, extra = {}) {
  return { code, message, ...extra };
}

/**
 * Pianifica l'intero mazzo fino all'anteprima. Non modifica mai il carrello:
 * le uniche chiamate di scrittura sono escluse da questo modulo.
 */
export function createDeckPlanner(options = {}) {
  const { api, reference, onProgress } = options;
  if (!api) throw new TypeError('createDeckPlanner richiede un client API.');
  if (!reference) throw new TypeError('createDeckPlanner richiede i dati di riferimento.');

  async function plan({ text, settings }) {
    const parsed = parseDeckList(text);
    const language = settings?.language || 'it';
    const minCondition = settings?.minCondition || 'Near Mint';

    const result = {
      config: { language, minCondition },
      parsed,
      entries: [],
      problems: parsed.problems.map((problem) => ({ ...problem })),
      warnings: [],
      summary: {
        parsedEntries: parsed.entries.length,
        requestedCards: parsed.entries.reduce((sum, entry) => sum + entry.quantity, 0),
        readyEntries: 0,
        problemEntries: 0,
        readyCards: 0,
        splitEntries: 0,
        totalCents: 0,
        currency: '',
        mixedCurrencies: false,
      },
    };

    if (!parsed.entries.length) {
      result.entries = [];
      return result;
    }

    safeProgress(onProgress, {
      phase: 'reference',
      message: 'Carico giochi ed espansioni CardTrader…',
    });

    const { gameId } = await reference.loadPokemonGame();
    const { expansions } = await reference.loadPokemonExpansions(gameId);
    const expansionBySet = resolveEntriesExpansions(
      parsed.entries,
      expansions,
      gameId,
      settings?.expansionMappings || []
    );

    const blueprintIndexes = new Map();
    const marketplaceCache = new Map();
    const plannedEntries = [];

    let index = 0;
    for (const entry of parsed.entries) {
      index += 1;
      const planned = {
        entry,
        expansion: null,
        blueprint: null,
        printField: null,
        selection: null,
        status: 'problem',
        problems: [],
        warnings: [],
      };

      safeProgress(onProgress, {
        phase: 'market',
        message: `Cerco "${entry.name}" (${index}/${parsed.entries.length})…`,
        current: index,
        total: parsed.entries.length,
      });

      const expansionResult = expansionBySet.get(entry.setKey);
      if (!expansionResult?.expansion) {
        planned.problems.push(
          entryProblem(
            'ESPANSIONE_NON_TROVATA',
            expansionResult?.error?.message ||
              `Espansione "${entry.setCode}" non trovata per il gioco Pokémon.`
          )
        );
        plannedEntries.push(planned);
        continue;
      }

      const expansion = expansionResult.expansion;
      planned.expansion = {
        id: Number(expansion.id),
        code: expansion.code,
        name: expansion.name,
        matchedBy: expansionResult.matchedBy,
      };

      try {
        if (!blueprintIndexes.has(expansion.id)) {
          safeProgress(onProgress, {
            phase: 'blueprints',
            message: `Carico i blueprint di ${expansion.name}…`,
          });
          const { blueprints } = await reference.loadBlueprints(expansion.id);
          blueprintIndexes.set(expansion.id, createBlueprintIndex(blueprints));
        }

        const found = findBlueprint(blueprintIndexes.get(expansion.id), entry);
        if (found.status !== 'ok') {
          planned.problems.push(
            entryProblem(
              found.reason === 'missing_print_number'
                ? 'NUMERO_STAMPA_NON_DISPONIBILE'
                : 'BLUEPRINT_NON_TROVATO',
              found.message
            )
          );
          plannedEntries.push(planned);
          continue;
        }

        planned.blueprint = {
          id: Number(found.blueprint.id),
          name: found.blueprint.name,
          version: found.blueprint.version,
          expansionId: found.blueprint.expansion_id,
          matchedBy: found.matchedBy,
        };
        planned.printField = found.printField;

        if (found.matchedBy && found.matchedBy !== 'exact') {
          planned.warnings.push({
            code: 'NOME_APPROSSIMATIVO',
            message: `Nome "${entry.name}" abbinato a "${found.blueprint.name}" (${found.matchedBy}). Verifica che sia la carta giusta.`,
          });
        }

        if (!marketplaceCache.has(found.blueprint.id)) {
          const payload = await api.getMarketplaceProducts(found.blueprint.id, {
            language,
          });
          marketplaceCache.set(found.blueprint.id, payload);
        }

        const offers = extractMarketplaceOffers(
          marketplaceCache.get(found.blueprint.id),
          found.blueprint.id
        );
        const selection = selectOffersForEntry({
          offers,
          quantity: entry.quantity,
          language,
          minCondition,
        });

        planned.selection = selection;
        planned.warnings.push(...(selection.warnings || []));
        if (selection.status === 'ok') {
          planned.status = 'ok';
        } else {
          planned.problems.push(...(selection.problems || []));
        }
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) throw error;
        planned.problems.push(
          entryProblem(
            'ERRORE_API',
            error?.message || 'Errore durante la ricerca delle offerte.'
          )
        );
        if (error?.status) planned.problems[planned.problems.length - 1].status = error.status;
      }

      plannedEntries.push(planned);
    }

    result.entries = plannedEntries;

    for (const planned of plannedEntries) {
      for (const problem of planned.problems) {
        result.problems.push({
          ...problem,
          lineNumber: planned.entry.lineNumber,
          card: planned.entry.name,
        });
      }
      for (const warning of planned.warnings) {
        result.warnings.push({
          ...warning,
          lineNumber: planned.entry.lineNumber,
          card: planned.entry.name,
        });
      }
    }

    const ready = plannedEntries.filter((item) => item.status === 'ok');
    const items = ready.flatMap((item) => item.selection.items);
    const currencies = [...new Set(items.map((item) => item.currency).filter(Boolean))];

    result.summary = {
      parsedEntries: parsed.entries.length,
      requestedCards: parsed.entries.reduce((sum, entry) => sum + entry.quantity, 0),
      readyEntries: ready.length,
      problemEntries: plannedEntries.length - ready.length,
      readyCards: ready.reduce((sum, item) => sum + item.entry.quantity, 0),
      splitEntries: ready.filter((item) => item.selection.strategy === 'split').length,
      totalCents: items.reduce((sum, item) => sum + item.totalCents, 0),
      currency: currencies[0] || '',
      mixedCurrencies: currencies.length > 1,
    };

    if (result.summary.mixedCurrencies) {
      result.problems.push({
        code: 'VALUTE_MISTE',
        message:
          'Le offerte pronte usano valute diverse: il totale complessivo non è affidabile.',
      });
    }

    safeProgress(onProgress, {
      phase: 'done',
      message: 'Anteprima pronta.',
      current: parsed.entries.length,
      total: parsed.entries.length,
    });

    return result;
  }

  return { plan };
}
