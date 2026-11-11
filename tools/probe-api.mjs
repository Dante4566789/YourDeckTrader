#!/usr/bin/env node
/**
 * Sonda in sola lettura della forma delle risposte CardTrader.
 *
 * Uso (PowerShell):
 *   $env:CARDTRADER_TOKEN="..."
 *   npm run probe:api
 *
 * Non stampa il token né shared_secret. Non effettua POST.
 * Serve a diagnosticare errori "Risposta inattesa" mostrando status HTTP,
 * content-type e struttura JSON senza dumpare dati personali.
 */
import { API_BASE } from '../src/constants.js';

const token = process.env.CARDTRADER_TOKEN?.trim() || '';

if (!token) {
  console.log('SALTATO: CARDTRADER_TOKEN non impostata.');
  console.log('PowerShell: $env:CARDTRADER_TOKEN="il_tuo_token"; npm run probe:api');
  process.exit(0);
}

function shapeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array (${value.length} elementi)`;
  if (typeof value === 'object') {
    return `object (chiavi: ${Object.keys(value).slice(0, 12).join(', ') || '(nessuna)'})`;
  }
  if (typeof value === 'string') {
    return `string (${value.length} caratteri)`;
  }
  return typeof value;
}

function errorSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message =
    value.extra?.message ?? value.error ?? value.message ?? value.error_code;
  return typeof message === 'string' ? message.slice(0, 200) : null;
}

async function probe(path) {
  const url = `${API_BASE}${path}`;
  console.log(`\n=== GET ${path} ===`);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '(assente)';
    let parsed = null;
    let json = false;
    try {
      parsed = text ? JSON.parse(text) : null;
      json = true;
    } catch {
      parsed = null;
    }

    console.log(`HTTP: ${response.status}${response.redirected ? ` (redirect a ${response.url})` : ''}`);
    console.log(`Content-Type: ${contentType}`);
    console.log(`JSON valido: ${json ? 'sì' : 'no'}`);
    console.log(`Forma: ${json ? shapeOf(parsed) : `testo (${text.length} caratteri)`}`);
    const summary = json ? errorSummary(parsed) : null;
    if (summary) console.log(`Messaggio del server: ${summary}`);

    return { status: response.status, json, parsed };
  } catch (error) {
    console.log(`ERRORE di rete: ${error?.message || error}`);
    return { status: 0, json: false, parsed: null };
  }
}

const info = await probe('/info');
const games = await probe('/games');
const expansions = await probe('/expansions');

const gamesArray = Array.isArray(games.parsed)
  ? games.parsed
  : Array.isArray(games.parsed?.array)
    ? games.parsed.array
    : null;

console.log('\n=== ESITO ===');
if (info.status === 401) {
  console.log('Token rifiutato (401): rigenera il token dalle opzioni.');
  process.exitCode = 1;
} else if (gamesArray) {
  console.log(`/games contiene ${gamesArray.length} giochi (forma accettata dal client).`);
} else {
  console.log('/games non restituisce un elenco: la forma ricevuta è quella stampata sopra.');
  process.exitCode = 1;
}

const expansionsArray = Array.isArray(expansions.parsed)
  ? expansions.parsed
  : Array.isArray(expansions.parsed?.array)
    ? expansions.parsed.array
    : null;
if (expansionsArray) {
  console.log(`/expansions contiene ${expansionsArray.length} espansioni.`);
} else {
  console.log('/expansions non restituisce un elenco.');
  process.exitCode = 1;
}
