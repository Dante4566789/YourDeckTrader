#!/usr/bin/env node
/**
 * Ispeziona la forma reale delle risposte CardTrader e salva i campioni.
 *
 * Uso (PowerShell):
 *   $env:CARDTRADER_TOKEN="..."
 *   node scripts/inspect-api.mjs
 *
 * Non stampa mai il token. Effettua solo GET.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { API_BASE } from '../src/constants.js';

const token = process.env.CARDTRADER_TOKEN?.trim() || '';

if (!token) {
  console.error('ERRORE: CARDTRADER_TOKEN non impostata.');
  console.error('PowerShell: $env:CARDTRADER_TOKEN="il_tuo_token"; node scripts/inspect-api.mjs');
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(scriptDir, '..', 'tests', 'fixtures');

function previewKeys(data, limit = 12) {
  if (!data || typeof data !== 'object') return [];
  const keys = Object.keys(data);
  return {
    shown: keys.slice(0, limit),
    total: keys.length,
  };
}

function firstEntries(data, count = 3) {
  if (Array.isArray(data)) return data.slice(0, count);
  if (data && typeof data === 'object' && Array.isArray(data.array)) {
    return data.array.slice(0, count);
  }
  return null;
}

async function inspect(endpoint, fixtureName) {
  const url = `${API_BASE}${endpoint}`;
  console.log(`\n=== GET ${endpoint} ===`);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
    });
  } catch (error) {
    console.error(`ERRORE di rete: ${error?.message || error}`);
    return null;
  }

  const contentType = response.headers.get('content-type') || '(assente)';
  const text = await response.text();

  let data = null;
  let parsed = false;
  try {
    data = text ? JSON.parse(text) : null;
    parsed = true;
  } catch {
    data = null;
  }

  const keys = previewKeys(data);
  const entries = firstEntries(data);

  console.log(`status: ${response.status}${response.redirected ? ` (redirect a ${response.url})` : ''}`);
  console.log(`content-type: ${contentType}`);
  console.log(`JSON valido: ${parsed ? 'sì' : 'no'}`);
  console.log(`Array.isArray: ${Array.isArray(data)}`);
  console.log(
    `Object.keys (primi ${keys.shown?.length ?? 0} di ${keys.total ?? 0}): ${JSON.stringify(keys.shown ?? [])}`
  );
  if (entries) {
    console.log(`prime ${entries.length} voci: ${JSON.stringify(entries, null, 2)}`);
  } else if (parsed && data && typeof data === 'object') {
    console.log(`prime 3 voci: (nessun array in data.array; chiavi: ${JSON.stringify(Object.keys(data))})`);
  } else if (!parsed) {
    console.log(`prime 200 caratteri: ${text.slice(0, 200)}`);
  }

  await mkdir(fixturesDir, { recursive: true });
  const fixturePath = path.join(fixturesDir, fixtureName);
  if (parsed) {
    await writeFile(fixturePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    console.log(`salvato: ${fixturePath}`);
  } else {
    const textPath = fixturePath.replace(/\.json$/, '.txt');
    await writeFile(textPath, text, 'utf8');
    console.log(`salvato (testo non JSON): ${textPath}`);
  }

  return { status: response.status, parsed, data };
}

const games = await inspect('/games', 'games.json');
const expansions = await inspect('/expansions', 'expansions.json');

console.log('\n=== ESITO ===');
if (!games?.parsed) {
  console.log('/games: risposta non JSON.');
  process.exitCode = 1;
} else if (Array.isArray(games.data)) {
  console.log(`/games: array di ${games.data.length} elementi.`);
} else if (Array.isArray(games.data?.array)) {
  console.log(`/games: oggetto con chiave "array" di ${games.data.array.length} elementi.`);
} else {
  console.log(`/games: forma non riconosciuta (chiavi: ${JSON.stringify(Object.keys(games.data ?? {}))}).`);
  process.exitCode = 1;
}

if (!expansions?.parsed) {
  console.log('/expansions: risposta non JSON.');
  process.exitCode = 1;
} else if (Array.isArray(expansions.data)) {
  console.log(`/expansions: array di ${expansions.data.length} elementi.`);
} else if (Array.isArray(expansions.data?.array)) {
  console.log(`/expansions: oggetto con chiave "array" di ${expansions.data.array.length} elementi.`);
} else {
  console.log(
    `/expansions: forma non riconosciuta (chiavi: ${JSON.stringify(Object.keys(expansions.data ?? {}))}).`
  );
  process.exitCode = 1;
}
