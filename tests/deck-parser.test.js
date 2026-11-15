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

test('ignora le intestazioni di sezione nelle varianti Limitless/PTCGL', () => {
  const text = [
    'Pokémon: 25',
    '4 Poltchageist PBL 5',
    '',
    'Trainers: 28',
    "3 Boss's Orders MEG 114",
    '',
    '• Energia: 7',
    '2 Psychic Energy MEE 13',
    '',
    'Totale Carte (60)',
  ].join('\n');

  const result = parseDeckList(text);
  assert.equal(result.entries.length, 3);
  assert.equal(result.problems.length, 0);
  assert.deepEqual(
    result.ignored.map((item) => item.raw),
    ['Pokémon: 25', 'Trainers: 28', '• Energia: 7', 'Totale Carte (60)']
  );
});

test('riconosce Pokémon con accento decomposto (NFD)', () => {
  const text = 'Poke\u0301mon: 1\n4 Poltchageist PBL 5';
  const result = parseDeckList(text);
  assert.equal(result.entries.length, 1);
  assert.equal(result.problems.length, 0);
  assert.equal(result.ignored[0].raw.normalize('NFC'), 'Pokémon: 1');
});

test('una lista Limitless completa non produce problemi per le intestazioni', () => {
  const text = `Pokémon: 25
4 Poltchageist PBL 5
2 Sinistcha PBL 6
4 Dhelmise PBL 39
3 Dunsparce JTG 120
2 Dudunsparce TEF 129
2 Shuppet PBL 33
4 Banette PBL 34
2 Lillie's Clefairy ex JTG 56
1 Bloodmoon Ursaluna ex TWM 141
1 Latias ex SSP 76

Trainer: 28
4 Lillie's Determination MEG 119
4 Gwynn PBL 78
3 Boss's Orders MEG 114
2 Explorer's Guidance TEF 147
1 Black Belt's Training JTG 143
4 Ultra Ball MEG 131
4 Poké Pad POR 81
3 Night Stretcher ASC 196
3 Prism Tower CRI 80

Energy: 7
4 Telepathic Psychic Energy POR 88
2 Psychic Energy MEE 13
1 Legacy Energy TWM 167
`;

  const result = parseDeckList(text);
  assert.equal(result.entries.length, 22);
  assert.equal(result.problems.length, 0);
  assert.equal(
    result.entries.reduce((sum, entry) => sum + entry.quantity, 0),
    60
  );
  assert.deepEqual(
    result.ignored.map((item) => item.raw),
    ['Pokémon: 25', 'Trainer: 28', 'Energy: 7']
  );
});

test('una carta che inizia con Pokémon non viene scambiata per intestazione', () => {
  const result = parseDeckList('4 Pokémon Catcher SVI 187');
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].name, 'Pokémon Catcher');
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
