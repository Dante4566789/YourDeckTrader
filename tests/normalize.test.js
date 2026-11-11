import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nameKey,
  normalizeExpansionCode,
  normalizeLanguageCode,
  normalizeName,
  normalizePrintNumber,
  normalizeToken,
  printNumberKey,
} from '../src/lib/normalize.js';

test('normalizeName uniforma apostrofi, accenti e maiuscole', () => {
  assert.equal(normalizeName('Lillie’s Détermination'), "lillie's determination");
  assert.equal(normalizeName('  Pokémon   EX  '), 'pokemon ex');
  assert.equal(nameKey("Lillie's Determination"), nameKey('Lillies Determination'));
  assert.equal(nameKey('N’s Zoroark'), nameKey('Ns Zoroark'));
});

test('normalizePrintNumber ignora zeri iniziali e /132', () => {
  assert.equal(normalizePrintNumber('049'), '49');
  assert.equal(normalizePrintNumber('004/102'), '4');
  assert.equal(normalizePrintNumber('TG04/189'), 'TG4');
  assert.equal(normalizePrintNumber('SWSH004'), 'SWSH4');
  assert.equal(printNumberKey(' 004/102 '), '4');
});

test('normalizeExpansionCode e language code', () => {
  assert.equal(normalizeExpansionCode(' meg '), 'MEG');
  assert.equal(normalizeLanguageCode('it'), 'it');
  assert.equal(normalizeLanguageCode('zh-CN'), 'zh-CN');
  assert.equal(normalizeLanguageCode('ja'), 'jp');
  assert.equal(normalizeLanguageCode('Italiano'), 'it');
});

test('normalizeToken toglie un eventuale prefisso Bearer', () => {
  assert.equal(normalizeToken('  Bearer abc.def  '), 'abc.def');
  assert.equal(normalizeToken('abc.def'), 'abc.def');
});
