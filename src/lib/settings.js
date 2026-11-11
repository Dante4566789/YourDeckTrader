import {
  DEFAULT_EXPANSION_MAPPINGS,
  LANGUAGE_CODES,
  MIN_CONDITIONS,
} from '../constants.js';
import { canonicalCondition } from './conditions.js';
import {
  normalizeExpansionCode,
  normalizeLanguageCode,
  normalizeToken,
  normalizeWhitespace,
} from './normalize.js';

export const EMPTY_ADDRESS = Object.freeze({
  name: '',
  street: '',
  zip: '',
  city: '',
  stateOrProvince: '',
  countryCode: '',
});

export const DEFAULT_SETTINGS = Object.freeze({
  token: '',
  language: 'it',
  minCondition: 'Near Mint',
  billingAddress: EMPTY_ADDRESS,
  shippingAddress: EMPTY_ADDRESS,
  sameAddress: true,
  expansionMappings: DEFAULT_EXPANSION_MAPPINGS,
});

function normalizeAddress(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    name: normalizeWhitespace(source.name),
    street: normalizeWhitespace(source.street),
    zip: normalizeWhitespace(source.zip),
    city: normalizeWhitespace(source.city),
    stateOrProvince: normalizeWhitespace(source.stateOrProvince ?? source.state_or_province),
    countryCode: normalizeWhitespace(source.countryCode ?? source.country_code).toUpperCase(),
  };
}

export function normalizeMappings(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const rows = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const deckCode = normalizeExpansionCode(item.deckCode ?? item.deck_code);
    const target = normalizeWhitespace(item.target ?? item.expansion ?? item.name);
    if (!deckCode || !target) continue;
    const key = deckCode.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ deckCode, target });
  }
  return rows;
}

export function normalizeSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const language = normalizeLanguageCode(source.language);
  const minCondition =
    MIN_CONDITIONS.find(
      (condition) => canonicalCondition(condition) === canonicalCondition(source.minCondition)
    ) || DEFAULT_SETTINGS.minCondition;

  return {
    token: normalizeToken(source.token),
    language: LANGUAGE_CODES.includes(language) ? language : DEFAULT_SETTINGS.language,
    minCondition,
    billingAddress: normalizeAddress(source.billingAddress),
    shippingAddress: normalizeAddress(source.shippingAddress),
    sameAddress: source.sameAddress !== false,
    expansionMappings: Array.isArray(source.expansionMappings)
      ? normalizeMappings(source.expansionMappings)
      : normalizeMappings(DEFAULT_EXPANSION_MAPPINGS),
  };
}

export function validateToken(value) {
  const token = normalizeToken(value);
  if (!token) return 'Inserisci il token API CardTrader.';
  if (/\s/.test(token)) return 'Il token non può contenere spazi.';
  return '';
}

export function validateAddress(address) {
  const normalized = normalizeAddress(address);
  const errors = {};
  if (!normalized.name) errors.name = 'Inserisci nome e cognome.';
  if (!normalized.street) errors.street = 'Inserisci via e numero civico.';
  if (!normalized.zip) errors.zip = 'Inserisci il CAP.';
  if (!normalized.city) errors.city = 'Inserisci la città.';
  if (!/^[A-Z]{2}$/.test(normalized.countryCode)) {
    errors.countryCode = 'Usa un codice paese di 2 lettere (es. IT).';
  }
  return errors;
}

export function validateSettingsForRun(value) {
  const settings = normalizeSettings(value);
  const errors = [];
  const tokenError = validateToken(settings.token);
  if (tokenError) errors.push({ field: 'token', message: tokenError });

  const billingErrors = validateAddress(settings.billingAddress);
  if (Object.keys(billingErrors).length) {
    errors.push({
      field: 'billingAddress',
      message: 'Indirizzo di fatturazione incompleto.',
      fields: billingErrors,
    });
  }

  if (!settings.sameAddress) {
    const shippingErrors = validateAddress(settings.shippingAddress);
    if (Object.keys(shippingErrors).length) {
      errors.push({
        field: 'shippingAddress',
        message: 'Indirizzo di spedizione incompleto.',
        fields: shippingErrors,
      });
    }
  }

  return errors;
}

export function toApiAddress(address) {
  const normalized = normalizeAddress(address);
  return {
    name: normalized.name,
    street: normalized.street,
    zip: normalized.zip,
    city: normalized.city,
    state_or_province: normalized.stateOrProvince,
    country_code: normalized.countryCode,
  };
}

export function effectiveShippingAddress(settings) {
  const normalized = normalizeSettings(settings);
  return normalized.sameAddress
    ? normalized.billingAddress
    : normalized.shippingAddress;
}

export function hasToken(settings) {
  return Boolean(normalizeToken(settings?.token));
}

export function maskToken(token) {
  return normalizeToken(token) ? 'Configurato' : 'Non configurato';
}
