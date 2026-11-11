export const API_BASE = 'https://api.cardtrader.com/api/v2';

export const STORAGE_KEYS = Object.freeze({
  settings: 'ctdc.settings',
  draft: 'ctdc.draft',
});

export const CACHE_PREFIX = 'ctdc.cache.';

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const BLUEPRINT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export const MARKETPLACE_INTERVAL_MS = 1100;
export const GLOBAL_WINDOW_MS = 10_000;
export const GLOBAL_MAX_REQUESTS = 200;

export const MIN_CONDITIONS = Object.freeze([
  'Near Mint',
  'Slightly Played',
  'Moderately Played',
  'Played',
  'Heavily Played',
  'Poor',
]);

export const CONDITIONS = Object.freeze([
  'Mint',
  'Near Mint',
  'Slightly Played',
  'Moderately Played',
  'Played',
  'Heavily Played',
  'Poor',
]);

export const LANGUAGES = Object.freeze([
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'Inglese' },
  { code: 'fr', label: 'Francese' },
  { code: 'de', label: 'Tedesco' },
  { code: 'es', label: 'Spagnolo' },
  { code: 'pt', label: 'Portoghese' },
  { code: 'jp', label: 'Giapponese' },
  { code: 'kr', label: 'Coreano' },
  { code: 'zh-CN', label: 'Cinese semplificato' },
  { code: 'zh-TW', label: 'Cinese tradizionale' },
  { code: 'ru', label: 'Russo' },
  { code: 'nl', label: 'Olandese' },
  { code: 'cz', label: 'Ceco' },
  { code: 'hu', label: 'Ungherese' },
  { code: 'pl', label: 'Polacco' },
]);

export const LANGUAGE_CODES = Object.freeze(LANGUAGES.map((item) => item.code));

// Fallback dichiarato, non verificato contro l'API: viene usato solo se il
// codice "MEG" non corrisponde a nessun code di espansione CardTrader.
export const DEFAULT_EXPANSION_MAPPINGS = Object.freeze([
  Object.freeze({ deckCode: 'MEG', target: 'Mega Evolution' }),
]);

export const PROBLEM_CODES = Object.freeze({
  RIGA_NON_RICONOSCIUTA: 'Riga non riconosciuta',
  TOKEN_MANCANTE: 'Token API mancante',
  TOKEN_NON_VALIDO: 'Token API non valido',
  INDIRIZZI_MANCANTI: 'Indirizzi mancanti',
  GIOCO_NON_TROVATO: 'Gioco Pokémon non trovato',
  ESPANSIONE_NON_TROVATA: 'Espansione non trovata',
  BLUEPRINT_NON_TROVATO: 'Carta non trovata',
  NUMERO_STAMPA_NON_DISPONIBILE: 'Numero di stampa non disponibile',
  NESSUNA_OFFERTA_ZERO: 'Nessuna offerta CardTrader Zero',
  NESSUNA_OFFERTA_VALIDA: 'Nessuna offerta valida',
  QUANTITA_INSUFFICIENTE: 'Quantità insufficiente',
  QUANTITA_DIVISA: 'Quantità divisa su più venditori',
  OFFERTA_SCARTATA: 'Offerta scartata',
  ERRORE_API: 'Errore API',
  ERRORE_CARRELLO: 'Errore aggiunta al carrello',
  VALUTE_MISTE: 'Valute non omogenee',
  DATI_NON_DISPONIBILI: 'Dati non disponibili',
});
