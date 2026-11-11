import { CONDITIONS } from '../constants.js';
import { normalizeName } from './normalize.js';

const RANK = new Map(CONDITIONS.map((condition, index) => [normalizeName(condition), index]));

const ALIASES = new Map([
  ['mint', 'Mint'],
  ['m', 'Mint'],
  ['near mint', 'Near Mint'],
  ['near-mint', 'Near Mint'],
  ['nearmint', 'Near Mint'],
  ['nm', 'Near Mint'],
  ['slightly played', 'Slightly Played'],
  ['slightly-played', 'Slightly Played'],
  ['sp', 'Slightly Played'],
  ['moderately played', 'Moderately Played'],
  ['moderately-played', 'Moderately Played'],
  ['mp', 'Moderately Played'],
  ['played', 'Played'],
  ['pl', 'Played'],
  ['heavily played', 'Heavily Played'],
  ['heavily-played', 'Heavily Played'],
  ['hp', 'Heavily Played'],
  ['poor', 'Poor'],
  ['po', 'Poor'],
]);

export function canonicalCondition(value) {
  const key = normalizeName(value);
  if (RANK.has(key)) return CONDITIONS[RANK.get(key)];
  if (ALIASES.has(key)) return ALIASES.get(key);
  return null;
}

export function conditionRank(value) {
  const canonical = canonicalCondition(value);
  return canonical ? RANK.get(normalizeName(canonical)) : null;
}

export function meetsMinimumCondition(value, minimum) {
  const offerRank = conditionRank(value);
  const minimumRank = conditionRank(minimum);
  if (offerRank === null || minimumRank === null) return false;
  return offerRank <= minimumRank;
}

export function conditionLabel(value) {
  return canonicalCondition(value) || String(value ?? '');
}
