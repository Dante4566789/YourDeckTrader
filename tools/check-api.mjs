#!/usr/bin/env node
/**
 * Diagnostica rapida e in sola lettura dell'API CardTrader.
 *
 * Non richiede token, non stampa credenziali e non modifica nulla.
 * Serve a distinguere un problema di token da un'API in manutenzione:
 *
 *   npm run check:api
 *
 * Exit code 0: API raggiungibile (anche se risponde 401 senza token).
 * Exit code 1: API non disponibile o risposta inattesa.
 */
import { API_BASE } from '../src/constants.js';

const url = `${API_BASE}/info`;

try {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'follow',
    credentials: 'omit',
    cache: 'no-store',
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const looksHtml =
    contentType.toLowerCase().includes('text/html') || /^\s*</.test(text);

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  console.log(`URL: ${url}`);
  console.log(
    `HTTP: ${response.status}${
      response.redirected ? ` (reindirizzato a ${response.url})` : ''
    }`
  );
  console.log(`Content-Type: ${contentType || '(assente)'}`);

  if (looksHtml) {
    console.log(
      'RISULTATO: API non disponibile — il server restituisce una pagina HTML (manutenzione).'
    );
    process.exitCode = 1;
  } else if (response.status === 401) {
    console.log(
      'RISULTATO: API raggiungibile; /info richiede un token valido (401 JSON).'
    );
  } else if (response.ok && json) {
    console.log('RISULTATO: API raggiungibile e risposta JSON valida.');
  } else {
    console.log(
      'RISULTATO: risposta inattesa; controlla lo stato del servizio CardTrader.'
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`ERRORE di rete: ${error?.message || error}`);
  process.exitCode = 1;
}
