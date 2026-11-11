import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDeckList } from '../src/lib/deck-parser.js';

const sample = `Pokémon: 4

4 Lillie's Determination MEG 119
2 Charizard ex OBF 125
1 Iron Leaves ex TEF 025/162

Trainer: 1
3 Arven SVI 166

Energy: 2
4 Basic Fire Energy

Total Cards: 10
`;

test('analizza il formato quantità nome set numero', () => {
  const result = parseDeckList('4 Lillie\'s Determination MEG 119');
  assert.equal(result.problems.length, 0);
  assert.deepEqual(result.entries[0], {
    lineNumber: 1,
    raw: "4 Lillie's Determination MEG 119",
    quantity: 4,
    name: "Lillie's Determination",
    nameKey: 'lilliesdetermination',
    setCode: 'MEG',
    setKey: 'MEG',
    printNumber: '119',
    printNumberRaw: '119',
    printKey: '119',
  });
});

test('ignora intestazioni, Total Cards e righe vuote', () => {
  const result = parseDeckList(sample);
  assert.equal(result.entries.length, 4);
  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0].raw, '4 Basic Fire Energy');
  assert.equal(result.ignored.length, 4);
});

test('normalizza zeri iniziali e suffisso /162', () => {
  const result = parseDeckList('1 Iron Leaves ex TEF 025/162');
  assert.equal(result.entries[0].printNumber, '25');
  assert.equal(result.entries[0].setCode, 'TEF');
});

test('gestisce apostrofi tipografici, accenti e nomi lunghi', () => {
  const result = parseDeckList(
    '2 N’s Zoroark ex SVP 185\n1 Pokémon Catcher SVI 187\n1 Professor’s Research SVI 189'
  );
  assert.equal(result.entries.length, 3);
  assert.equal(result.entries[0].name, 'N’s Zoroark ex');
  assert.equal(result.entries[1].name, 'Pokémon Catcher');
  assert.equal(result.entries[0].nameKey, 'nszoroarkex');
});

test('accetta il formato PTCGO con asterisco', () => {
  const result = parseDeckList('* 4 Charizard ex OBF 125');
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].quantity, 4);
  assert.equal(result.entries[0].name, 'Charizard ex');
});

test('riconosce intestazioni PTCGO e decorazioni', () => {
  const result = parseDeckList(`****** Pokémon Trading Card Game Deck List ******

##Pokémon - 2
* 2 Pidgeot ex OBF 164
Total Cards - 2`);
  assert.equal(result.entries.length, 1);
  assert.equal(result.problems.length, 0);
});

test('una energia base senza set finisce nei problemi', () => {
  const result = parseDeckList('4 Basic Fire Energy');
  assert.equal(result.entries.length, 0);
  assert.equal(result.problems[0].code, 'RIGA_NON_RICONOSCIUTA');
  assert.match(result.problems[0].message, /Codice espansione/);
});

test('righe non riconosciute finiscono nei problemi con numero di riga', () => {
  const result = parseDeckList('intestazione strana\n4 Lillie\'s Determination MEG\nSole MEG 119');
  assert.equal(result.entries.length, 0);
  assert.equal(result.problems.length, 3);
  assert.deepEqual(
    result.problems.map((item) => item.lineNumber),
    [1, 2, 3]
  );
});

test('rifiuta quantità non valide e nomi mancanti', () => {
  const result = parseDeckList('0 Sole MEG 119\nx Sole MEG 119\n4 MEG 119\n4 Sole MEG 0');
  assert.equal(result.entries.length, 0);
  assert.equal(result.problems.length, 4);
});

test('supporta BOM, CRLF e tab', () => {
  const result = parseDeckList('\uFEFF4\tLillie\'s Determination\tMEG\t119\r\n');
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].name, "Lillie's Determination");
  assert.equal(result.entries[0].quantity, 4);
});

test('non scambia il numero di stampa per un id blueprint', () => {
  const result = parseDeckList('1 Charizard ex OBF 125');
  assert.equal(result.entries[0].printNumber, '125');
  assert.equal(result.entries[0].printNumberRaw, '125');
});

test('accetta numeri promo con lettere', () => {
  const result = parseDeckList('1 Pikachu SWSH 039\n1 Radiant Greninja SWSH 161');
  assert.equal(result.entries[0].printNumber, '39');
  assert.equal(result.entries[1].printNumber, '161');
});
