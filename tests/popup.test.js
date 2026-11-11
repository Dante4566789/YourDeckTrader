import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const popupHtml = readFileSync(new URL('popup.html', root), 'utf8');
const popupJs = readFileSync(new URL('popup.js', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));

test('il popup usa solo script esterni e i moduli previsti', () => {
  assert.match(popupHtml, /<script type="module" src="popup\.js"><\/script>/);
  assert.equal(/on(?:click|change|submit|input)\s*=/i.test(popupHtml), false);
  assert.match(popupJs, /createDeckPlanner/);
  assert.match(popupJs, /addPlanToCart/);
  assert.match(popupJs, /buildReport/);
});

test('il popup espone input, anteprima, problemi, carrello e report', () => {
  for (const id of [
    'deck-input',
    'analyze-btn',
    'summary-section',
    'problems-section',
    'preview-section',
    'add-cart-btn',
    'copy-report',
    'cart-status',
  ]) {
    assert.match(popupHtml, new RegExp(`id="${id}"`), `manca #${id}`);
  }
});

test('tutte le pagine e le icone del manifest esistono', () => {
  const files = [
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...Object.values(manifest.action.default_icon),
    ...Object.values(manifest.icons),
  ];
  for (const file of new Set(files)) {
    assert.equal(existsSync(new URL(file, root)), true, `file mancante: ${file}`);
  }
});

test('nessun file sorgente contiene un endpoint di acquisto', () => {
  const files = [
    new URL('popup.js', root),
    new URL('options.js', root),
    ...readdirSync(new URL('src/lib/', root))
      .filter((file) => file.endsWith('.js'))
      .map((file) => new URL(`src/lib/${file}`, root)),
  ];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.equal(/\/purchase\b|cart\/purchase/.test(source), false, file.pathname);
  }
});

test('il popup non scrive token o log in console', () => {
  assert.equal(/console\./.test(popupJs), false);
  assert.equal(/localStorage|sessionStorage/.test(popupJs), false);
});
