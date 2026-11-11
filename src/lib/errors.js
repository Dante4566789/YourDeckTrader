export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export class ApiError extends AppError {
  constructor({ status = 0, code = 'ERRORE_API', message, details = {} }) {
    super(code, message, details);
    this.name = 'ApiError';
    this.status = status;
  }
}

function flattenErrors(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === 'string' ? [item] : flattenErrors(item)
    );
  }
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => {
      const messages = flattenErrors(item);
      return messages.map((message) => `${key}: ${message}`);
    });
  }
  return [String(value)];
}

/**
 * Estrae un messaggio leggibile dal payload di errore CardTrader.
 * Non include mai header, token o body della richiesta.
 */
export function extractServerMessage(payload, status = 0) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }
  if (payload && typeof payload === 'object') {
    if (typeof payload.extra?.message === 'string' && payload.extra.message.trim()) {
      return payload.extra.message.trim();
    }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
    if (payload.errors) {
      const messages = flattenErrors(payload.errors);
      if (messages.length) return messages.join('; ');
    }
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }
    if (typeof payload.error_code === 'string' && payload.error_code.trim()) {
      return payload.error_code.trim();
    }
  }

  if (status === 401) return 'Token non valido o scaduto.';
  if (status === 403) return 'Accesso negato dal server.';
  if (status === 404) return 'Risorsa non trovata.';
  if (status === 422) return 'Dati non validi.';
  if (status === 429) return 'Troppe richieste. Riprova tra poco.';
  if (status >= 500) return 'Errore temporaneo del server CardTrader.';
  return 'Errore di comunicazione con CardTrader.';
}

export function apiErrorFromResponse(status, payload, fallback) {
  const serverMessage = extractServerMessage(payload, status);
  const message =
    status === 401
      ? `Token non valido o scaduto (401). ${serverMessage}`
      : status === 422
        ? `Richiesta non valida (422). ${serverMessage}`
        : status === 429
          ? `Troppe richieste (429). ${serverMessage}`
          : `${fallback || 'Errore API'} (${status}). ${serverMessage}`;

  return new ApiError({
    status,
    code:
      status === 401
        ? 'TOKEN_NON_VALIDO'
        : status === 422
          ? 'VALIDAZIONE'
          : status === 429
            ? 'RATE_LIMITED'
            : 'ERRORE_API',
    message,
    details: { status, serverMessage },
  });
}
