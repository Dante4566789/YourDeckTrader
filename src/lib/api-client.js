import { API_BASE } from '../constants.js';
import { asList } from './as-list.js';
import { ApiError, apiErrorFromResponse } from './errors.js';
import { normalizeToken } from './normalize.js';
import { createRequestScheduler } from './rate-scheduler.js';

const DEFAULT_TIMEOUT_MS = 30_000;

const MAINTENANCE_MESSAGE =
  "CardTrader non è disponibile in questo momento: il server ha restituito una pagina HTML invece dei dati dell'API (probabile manutenzione o accesso temporaneamente bloccato). Riprova più tardi.";

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHtmlPayload(payload, contentType = '') {
  if (typeof payload !== 'string') return false;
  if (String(contentType).toLowerCase().includes('text/html')) return true;
  const start = payload.trimStart().slice(0, 64).toLowerCase();
  return start.startsWith('<');
}

function maintenanceError(response) {
  return new ApiError({
    status: response.status,
    code: 'API_NON_DISPONIBILE',
    message: MAINTENANCE_MESSAGE,
    details: {
      status: response.status,
      redirected: Boolean(response.redirected),
    },
  });
}

function parseRetryAfter(value, fallbackMs) {
  if (!value) return fallbackMs;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return fallbackMs;
}

async function readPayload(response) {
  try {
    const text = await response.text();
    if (!text) return null;
    // Alcuni proxy aggiungono un BOM UTF-8: JSON.parse lo rifiuta e il body
    // verrebbe trattato come testo invece che come JSON.
    const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    try {
      return JSON.parse(normalized);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}



/**
 * Client API CardTrader. L'unico host contattato è API_BASE.
 * Il token viaggia solo nell'header Authorization e non viene mai
 * inserito nell'URL, nei messaggi di errore o nei log.
 */
export function createApiClient(options = {}) {
  const {
    token,
    fetchImpl = globalThis.fetch,
    scheduler = createRequestScheduler(),
    baseUrl = API_BASE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelayMs = 2000,
    sleep = defaultSleep,
  } = options;

  const authToken = normalizeToken(token);

  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetch non disponibile in questo contesto.');
  }

  async function execute(url, requestInit, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetchImpl(url, { ...requestInit, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(path, requestOptions = {}) {
    if (!authToken) {
      throw new ApiError({
        status: 401,
        code: 'TOKEN_MANCANTE',
        message: 'Token API mancante. Aprilo dalle opzioni dell\'estensione.',
      });
    }

    const {
      method = 'GET',
      query = {},
      body,
      kind = 'general',
      retryOn429 = true,
      timeout = timeoutMs,
    } = requestOptions;

    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let retried = false;

    while (true) {
      await scheduler.acquire(kind);

      let response;
      try {
        response = await execute(
          url.toString(),
          {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
          },
          timeout
        );
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new ApiError({
            status: 0,
            code: 'TIMEOUT',
            message: 'CardTrader non ha risposto in tempo. Riprova.',
          });
        }
        throw new ApiError({
          status: 0,
          code: 'RETE',
          message: 'Impossibile raggiungere CardTrader. Controlla la connessione.',
        });
      }

      if (response.status === 429 && retryOn429 && !retried) {
        retried = true;
        const retryAfterMs = parseRetryAfter(
          response.headers?.get?.('retry-after'),
          retryDelayMs
        );
        await readPayload(response);
        await sleep(Math.max(retryAfterMs, 0));
        continue;
      }

      const payload = await readPayload(response);
      const contentType = response.headers?.get?.('content-type') || '';

      // Con l'API in manutenzione CardTrader reindirizza alla home page e
      // restituisce HTML (200 o 403): senza questo controllo sembrerebbe una
      // risposta JSON non valida per l'endpoint richiesto.
      if (isHtmlPayload(payload, contentType)) {
        throw maintenanceError(response);
      }

      if (!response.ok) {
        throw apiErrorFromResponse(response.status, payload, 'Errore API');
      }

      return payload;
    }
  }

  async function getInfo() {
    const payload = await request('/info', { kind: 'general' });
    // shared_secret non deve mai uscire dal client.
    return {
      id: Number.isFinite(Number(payload?.id)) ? Number(payload.id) : null,
      name: typeof payload?.name === 'string' ? payload.name : null,
    };
  }

  async function getGames() {
    const payload = await request('/games');
    return asList(payload, { label: 'Risposta inattesa da /games' });
  }

  async function getExpansions() {
    const payload = await request('/expansions');
    return asList(payload, { label: 'Risposta inattesa da /expansions' });
  }

  /**
   * Ricerca globale per nome. L'endpoint /blueprints non è nella reference
   * principale ma è in sola lettura e restituisce i blueprint di tutti i set:
   * serve per le carte spostate in espansioni speciali (es. 30th Celebration)
   * la cui versione contiene ancora il codice originale, come "MEE 013".
   */
  async function searchBlueprintsByName(name, { gameId, limit = 100, page = 1 } = {}) {
    const queryText = String(name ?? '').trim();
    if (!queryText) return [];

    const payload = await request('/blueprints', {
      query: {
        name: queryText,
        game_id: gameId ? Number(gameId) : undefined,
        limit: Math.max(1, Math.min(Number(limit) || 100, 100)),
        page: Math.max(1, Number(page) || 1),
      },
    });
    return asList(payload, { label: 'Risposta inattesa da /blueprints' });
  }

  async function getBlueprints(expansionId) {
    if (!Number.isInteger(Number(expansionId)) || Number(expansionId) <= 0) {
      throw new ApiError({
        status: 0,
        code: 'PARAMETRO_NON_VALIDO',
        message: 'ID espansione non valido.',
      });
    }
    const payload = await request('/blueprints/export', {
      query: { expansion_id: Number(expansionId) },
      timeout: Math.max(timeoutMs, 60_000),
    });
    return asList(payload, {
      label: 'Risposta inattesa da /blueprints/export',
    });
  }

  async function getMarketplaceProducts(blueprintId, { language } = {}) {
    if (!Number.isInteger(Number(blueprintId)) || Number(blueprintId) <= 0) {
      throw new ApiError({
        status: 0,
        code: 'PARAMETRO_NON_VALIDO',
        message: 'ID blueprint non valido.',
      });
    }
    // NON inviare foil=false: l'API risponde 200 con un array vuoto anche
    // quando esistono offerte non foil (verificato sul blueprint 370830:
    // 156 offerte senza parametro, 0 con foil=false). Il filtro foil/reverse
    // viene applicato lato client su properties_hash.
    const payload = await request('/marketplace/products', {
      query: {
        blueprint_id: Number(blueprintId),
        language: language || undefined,
      },
      kind: 'marketplace',
    });
    // La risposta documentata è un oggetto con l'ID blueprint come chiave.
    // Accettiamo anche un array per non bloccare varianti dell'API: la
    // lettura delle offerte avviene comunque in extractMarketplaceOffers.
    if (!payload || typeof payload !== 'object') {
      throw new ApiError({
        status: 0,
        code: 'RISPOSTA_NON_VALIDA',
        message: `Risposta inattesa da /marketplace/products: atteso un oggetto JSON, ricevuto ${Array.isArray(payload) ? 'array' : typeof payload}.`,
      });
    }
    return payload;
  }

  async function addToCart({ productId, quantity, billingAddress, shippingAddress }) {
    const numericProductId = Number(productId);
    const numericQuantity = Number(quantity);
    if (!Number.isInteger(numericProductId) || numericProductId <= 0) {
      throw new ApiError({
        status: 0,
        code: 'PARAMETRO_NON_VALIDO',
        message: 'product_id non valido.',
      });
    }
    if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) {
      throw new ApiError({
        status: 0,
        code: 'PARAMETRO_NON_VALIDO',
        message: 'quantity non valida.',
      });
    }
    if (!billingAddress || !shippingAddress) {
      throw new ApiError({
        status: 0,
        code: 'INDIRIZZI_MANCANTI',
        message: 'Indirizzo di fatturazione o spedizione mancante.',
      });
    }

    return request('/cart/add', {
      method: 'POST',
      body: {
        product_id: numericProductId,
        quantity: numericQuantity,
        via_cardtrader_zero: true,
        billing_address: billingAddress,
        shipping_address: shippingAddress,
      },
    });
  }

  return {
    getInfo,
    getGames,
    getExpansions,
    searchBlueprintsByName,
    getBlueprints,
    getMarketplaceProducts,
    addToCart,
  };
}
