import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalCondition,
  conditionRank,
  meetsMinimumCondition,
} from '../src/lib/conditions.js';

test('canonicalCondition riconosce nomi e abbreviazioni', () => {
  assert.equal(canonicalCondition('NM'), 'Near Mint');
  assert.equal(canonicalCondition('slightly played'), 'Slightly Played');
  assert.equal(canonicalCondition('Mint'), 'Mint');
  assert.equal(canonicalCondition('sconosciuta'), null);
});

test('conditionRank ordina dalla migliore alla peggiore', () => {
  assert.ok(conditionRank('Mint') < conditionRank('Near Mint'));
  assert.ok(conditionRank('Near Mint') < conditionRank('Slightly Played'));
  assert.ok(conditionRank('Slightly Played') < conditionRank('Poor'));
});

test('meetsMinimumCondition rispetta la condizione minima', () => {
  assert.equal(meetsMinimumCondition('Near Mint', 'Near Mint'), true);
  assert.equal(meetsMinimumCondition('Mint', 'Near Mint'), true);
  assert.equal(meetsMinimumCondition('Slightly Played', 'Near Mint'), false);
  assert.equal(meetsMinimumCondition('Moderately Played', 'Slightly Played'), false);
  assert.equal(meetsMinimumCondition('Near Mint', 'Slightly Played'), true);
  assert.equal(meetsMinimumCondition(null, 'Near Mint'), false);
});
