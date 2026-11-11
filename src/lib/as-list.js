import { ApiError } from './errors.js';

function previewOf(data) {
  if (typeof data === 'string') return data.slice(0, 200);
  try {
    const serialized = JSON.stringify(data);
    if (typeof serialized === 'string') return serialized.slice(0, 200);
  } catch {
    // Fallback per valori non serializzabili (es. cicli).
  }
  return String(data ?? '').slice(0, 200);
}

/**
 * Normalizza le risposte che dovrebbero essere elenchi.
 *
 * L'API CardTrader documenta un array, ma `/games` restituisce realmente
 * `{ "array": [...] }`. Accettiamo entrambe le forme; per tutto il resto
 * produciamo un errore che mostra chiavi e primi 200 caratteri, senza
 * includere mai il token.
 */
export function asList(data, { label = 'Risposta API' } = {}) {
  if (Array.isArray(data)) return data;
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray(data.array)
  ) {
    return data.array;
  }

  const keys = data && typeof data === 'object' ? Object.keys(data) : [];
  const preview = previewOf(data);

  throw new ApiError({
    status: 0,
    code: 'RISPOSTA_NON_VALIDA',
    message: `${label}: atteso un elenco JSON (array oppure { "array": [...] }); chiavi ricevute: ${JSON.stringify(keys)}; primi 200 caratteri: ${preview}`,
    details: { keys, preview },
  });
}
