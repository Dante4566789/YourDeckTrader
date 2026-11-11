import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')
);

test('Manifest V3 con soli permessi storage e host CardTrader', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, ['https://api.cardtrader.com/*']);
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.options_ui.page, 'options.html');
});

test('nessun content script o permesso scripting/tabs', () => {
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.permissions.includes('scripting'), false);
  assert.equal(manifest.permissions.includes('tabs'), false);
  assert.equal(manifest.permissions.includes('activeTab'), false);
});
