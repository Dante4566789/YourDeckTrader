import {
  expansionCodeKey,
  nameKey,
  normalizeExpansionCode,
  normalizePrintNumber,
  normalizeWhitespace,
  printNumberKey,
} from './normalize.js';

const HEADER_PATTERN =
  /^(?:[*#\s-]*)(?:pok[eé]mon|trainer(?: cards)?|energy|total cards|deck(?: list)?|pok[eé]mon trading card game deck list)\b/i;

const DECORATION_PATTERN = /^[*#=\-\s]+$/;

const PRINT_NUMBER_PATTERN = /^[A-Za-z0-9]{1,12}(?:\/\d{1,4})?$/;
const SET_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{1,7}$/;

// Parole che possono comparire al posto del codice espansione in una riga
// incompleta (tipicamente energie base senza set).
const NON_SET_WORDS = new Set([
  'ENERGY',
  'ENERGIA',
  'TRAINER',
  'ALLENATORE',
  'POKEMON',
  'BASIC',
  'BASE',
  'FIRE',
  'FUOCO',
  'WATER',
  'ACQUA',
  'GRASS',
  'ERBA',
  'LIGHTNING',
  'FULMINE',
  'PSYCHIC',
  'PSICO',
  'FIGHTING',
  'LOTTA',
  'DARKNESS',
  'OSCURITA',
  'METAL',
  'METALLO',
  'DRAGON',
  'DRAGO',
  'FAIRY',
  'FATA',
  'COLORLESS',
  'INCOLORE',
  'CARD',
  'CARDS',
  'CARTA',
]);

function stripLeadingBullet(value) {
  return value.replace(/^[*•]\s+/, '');
}

function isIgnoredLine(line) {
  if (!line) return true;
  if (DECORATION_PATTERN.test(line)) return true;
  if (HEADER_PATTERN.test(line)) return true;
  if (/^\/\//.test(line)) return true;

  // Intestazioni generiche tipo "Pokémon: 12" o "Trainer - 20".
  if (/^[A-Za-zÀ-ÿ ]+\s*[:=-]\s*\d+\s*$/.test(line)) return true;
  return false;
}

function problem(lineNumber, raw, message) {
  return {
    lineNumber,
    raw,
    code: 'RIGA_NON_RICONOSCIUTA',
    message,
  };
}

function looksLikePrintNumber(value) {
  return PRINT_NUMBER_PATTERN.test(value) && /\d/.test(value);
}

function looksLikeSetCode(value) {
  return SET_CODE_PATTERN.test(value) && /[A-Za-z]/.test(value);
}

/**
 * Analizza una lista mazzo Pokémon TCG Live.
 *
 * Formato atteso per riga:
 *   <quantità> <nome carta> <codice espansione> <numero di stampa>
 *
 * Restituisce le righe valide e i problemi, senza chiamare chrome.* o API.
 */
export function parseDeckList(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  const lines = source.split(/\r?\n/);
  const entries = [];
  const problems = [];
  const ignored = [];

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const raw = rawLine.trim();
    if (!raw) return;

    if (isIgnoredLine(raw)) {
      ignored.push({ lineNumber, raw });
      return;
    }

    const line = stripLeadingBullet(raw);
    const tokens = line.split(/\s+/).filter(Boolean);

    if (tokens.length < 4) {
      problems.push(
        problem(
          lineNumber,
          raw,
          'Formato non riconosciuto: servono quantità, nome, codice espansione e numero di stampa.'
        )
      );
      return;
    }

    const quantityToken = tokens[0];
    const printToken = tokens[tokens.length - 1];
    const setToken = tokens[tokens.length - 2];
    const name = tokens.slice(1, -2).join(' ');

    if (!/^\d+$/.test(quantityToken)) {
      problems.push(problem(lineNumber, raw, 'La quantità deve essere un numero intero.'));
      return;
    }

    const quantity = Number(quantityToken);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      problems.push(problem(lineNumber, raw, 'Quantità non valida.'));
      return;
    }

    if (!name) {
      problems.push(problem(lineNumber, raw, 'Nome carta mancante.'));
      return;
    }

    if (!looksLikeSetCode(setToken) || NON_SET_WORDS.has(setToken.toUpperCase())) {
      problems.push(
        problem(
          lineNumber,
          raw,
          'Codice espansione mancante o non valido: le energie base senza set vanno corrette a mano.'
        )
      );
      return;
    }

    const normalizedPrintNumber = normalizePrintNumber(printToken);
    if (
      !looksLikePrintNumber(printToken) ||
      !normalizedPrintNumber ||
      normalizedPrintNumber === '0'
    ) {
      problems.push(
        problem(
          lineNumber,
          raw,
          'Numero di stampa mancante o non riconosciuto (es. 119, 025/162, TG05).'
        )
      );
      return;
    }

    entries.push({
      lineNumber,
      raw,
      quantity,
      name: normalizeWhitespace(name),
      nameKey: nameKey(name),
      setCode: normalizeExpansionCode(setToken),
      setKey: expansionCodeKey(setToken),
      printNumber: normalizePrintNumber(printToken),
      printNumberRaw: printToken,
      printKey: printNumberKey(printToken),
    });
  });

  return { entries, problems, ignored };
}
