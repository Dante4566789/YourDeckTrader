import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReport } from '../src/lib/report.js';

function makePlan() {
  return {
    token: 'tok-segreto-mai-nel-report',
    billingAddress: { name: 'Mario Rossi', street: 'Via Segreta 1' },
    config: { language: 'it', minCondition: 'Near Mint' },
    summary: {
      parsedEntries: 2,
      requestedCards: 5,
      readyEntries: 1,
      problemEntries: 1,
      readyCards: 4,
      splitEntries: 1,
      totalCents: 480,
      currency: 'EUR',
      mixedCurrencies: false,
    },
    entries: [
      {
        status: 'ok',
        entry: {
          name: "Lillie's Determination",
          quantity: 4,
          setCode: 'MEG',
          printNumber: '119',
          lineNumber: 1,
        },
        selection: {
          status: 'ok',
          strategy: 'split',
          items: [
            {
              productId: 1,
              quantity: 2,
              condition: 'Near Mint',
              seller: 'Mario',
              unitPriceCents: 100,
              totalCents: 200,
              currency: 'EUR',
            },
            {
              productId: 2,
              quantity: 2,
              condition: 'Slightly Played',
              seller: 'Luigi',
              unitPriceCents: 140,
              totalCents: 280,
              currency: 'EUR',
            },
          ],
          totalCents: 480,
          currency: 'EUR',
        },
        warnings: [],
      },
      {
        status: 'problem',
        entry: {
          name: 'Pikachu',
          quantity: 1,
          setCode: 'MEG',
          printNumber: '1',
          lineNumber: 2,
        },
        problems: [
          {
            code: 'NESSUNA_OFFERTA_VALIDA',
            message: 'Nessuna offerta CardTrader Zero valida.',
          },
        ],
        warnings: [],
      },
    ],
    problems: [
      {
        code: 'RIGA_NON_RICONOSCIUTA',
        lineNumber: 7,
        raw: '4 Basic Fire Energy',
        message: 'Codice espansione mancante.',
      },
      {
        code: 'VALUTE_MISTE',
        message: 'Le offerte pronte usano valute diverse.',
      },
    ],
    warnings: [
      { card: 'Pikachu', message: 'La risposta non espone foil/reverse.' },
    ],
  };
}

test('il report contiene riepilogo, prezzi, split e problemi', () => {
  const report = buildReport({
    plan: makePlan(),
    generatedAt: new Date('2026-11-11T12:00:00Z'),
  });

  assert.match(report, /Righe valide: 2/);
  assert.match(report, /Totale anteprima: .*4,80/);
  assert.match(report, /\[OK · DIVISA\]/);
  assert.match(report, /Quantità divisa su più venditori/);
  assert.match(report, /\[PROBLEMA\]/);
  assert.match(report, /Nessuna offerta CardTrader Zero valida/);
  assert.match(report, /PROBLEMI DI FORMATO/);
  assert.match(report, /Riga 7/);
  assert.match(report, /ALTRI PROBLEMI/);
  assert.match(report, /valute diverse/);
  assert.match(report, /AVVISI/);
  assert.match(report, /Nessun acquisto è stato effettuato/);
});

test('il report non contiene token o indirizzi', () => {
  const report = buildReport({ plan: makePlan() });
  assert.equal(report.includes('tok-segreto'), false);
  assert.equal(report.includes('Via Segreta'), false);
  assert.equal(report.includes('Mario Rossi'), false);
});

test('il report include l’esito del carrello e gli errori', () => {
  const report = buildReport({
    plan: makePlan(),
    cartResult: {
      added: [{ quantity: 2, currency: 'EUR' }],
      totalAddedQuantity: 2,
      totalAddedCents: 200,
      failed: [
        {
          entryName: 'Pikachu',
          quantity: 1,
          message: 'Offerta non più disponibile',
        },
      ],
      notAttempted: [],
    },
  });

  assert.match(report, /Aggiunte riuscite: 1 righe, 2 copie/);
  assert.match(report, /Totale aggiunto/);
  assert.match(report, /Offerta non più disponibile/);
});

test('senza analisi restituisce un report neutro', () => {
  const report = buildReport({});
  assert.match(report, /Nessuna analisi disponibile/);
});
