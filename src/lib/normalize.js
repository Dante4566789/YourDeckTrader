export function stripDiacritics(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeName(value) {
  return normalizeWhitespace(
    stripDiacritics(value)
      .replace(/[\u2018\u2019\u201a\u201b\u0060\u00b4]/g, "'")
      .replace(/[\u2013\u2014]/g, '-')
      .toLowerCase()
  );
}

/** Chiave di confronto tollerante a apostrofi, accenti e punteggiatura. */
export function nameKey(value) {
  return normalizeName(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizePrintNumber(value) {
  const raw = normalizeWhitespace(value).toUpperCase();
  if (!raw) return '';
  const beforeSlash = raw.split('/')[0].trim();
  return beforeSlash.replace(/(^|[^0-9])0+(?=\d)/g, '$1');
}

export function printNumberKey(value) {
  return normalizePrintNumber(value).replace(/[^A-Z0-9]/g, '');
}

export function normalizeExpansionCode(value) {
  return normalizeWhitespace(value).toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

export function expansionCodeKey(value) {
  return normalizeExpansionCode(value).replace(/[^A-Z0-9]/g, '');
}

const LANGUAGE_CODES_CANONICAL = new Map([
  ['it', 'it'],
  ['en', 'en'],
  ['fr', 'fr'],
  ['de', 'de'],
  ['es', 'es'],
  ['pt', 'pt'],
  ['jp', 'jp'],
  ['kr', 'kr'],
  ['zh-cn', 'zh-CN'],
  ['zh-tw', 'zh-TW'],
  ['ru', 'ru'],
  ['nl', 'nl'],
  ['cz', 'cz'],
  ['hu', 'hu'],
  ['pl', 'pl'],
]);

const LANGUAGE_ALIASES = new Map([
  ['italian', 'it'],
  ['italiano', 'it'],
  ['english', 'en'],
  ['inglese', 'en'],
  ['french', 'fr'],
  ['francese', 'fr'],
  ['german', 'de'],
  ['tedesco', 'de'],
  ['spanish', 'es'],
  ['spagnolo', 'es'],
  ['portuguese', 'pt'],
  ['portoghese', 'pt'],
  ['japanese', 'jp'],
  ['giapponese', 'jp'],
  ['ja', 'jp'],
  ['korean', 'kr'],
  ['coreano', 'kr'],
  ['chinese', 'zh-cn'],
  ['russo', 'ru'],
  ['russian', 'ru'],
  ['dutch', 'nl'],
  ['czech', 'cz'],
  ['cs', 'cz'],
  ['hungarian', 'hu'],
  ['polish', 'pl'],
]);

export function normalizeLanguageCode(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) return '';
  if (LANGUAGE_CODES_CANONICAL.has(normalized)) {
    return LANGUAGE_CODES_CANONICAL.get(normalized);
  }
  if (LANGUAGE_ALIASES.has(normalized)) return LANGUAGE_ALIASES.get(normalized);
  const short = normalized.split(/[-_]/)[0];
  return LANGUAGE_CODES_CANONICAL.get(short) || short;
}

export function normalizeToken(value) {
  return normalizeWhitespace(value).replace(/^bearer\s+/i, '').trim();
}

export function formatPrice(cents, currency = 'EUR', locale = 'it-IT') {
  const amount = Number(cents);
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency || 'EUR'}`;
  }
}
