import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createApiClient } from '../src/lib/api-client.js';
import { ApiError } from '../src/lib/errors.js';

function makeScheduler() {
  const kinds = [];
  return {
    kinds,
    scheduler: {
      acquire: async (kind) => {
        kinds.push(kind);
      },
    },
  };
}

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function textResponse(
  body,
  {
    status = 200,
    redirected = false,
    url = 'https://api.cardtrader.com/',
    contentType = 'text/html; charset=windows-1252',
  } = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected,
    url,
    headers: new Headers({ 'Content-Type': contentType }),
    text: async () => body,
  };
}

const billingAddress = {
  name: 'Mario Rossi',
  street: 'Via Roma 1',
  zip: '00100',
  city: 'Roma',
  state_or_province: 'RM',
  country_code: 'IT',
};

test('GET /info usa solo Authorization e non espone shared_secret', async () => {
  const { scheduler } = makeScheduler();
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url: url.toString(), init };
    return jsonResponse({ id: 3, name: 'Test App', shared_secret: 'super-segreto' });
  };

  const api = createApiClient({ token: 'tok-123', fetchImpl, scheduler });
  const info = await api.getInfo();

  assert.deepEqual(info, { id: 3, name: 'Test App' });
  assert.equal(captured.init.headers.Authorization, 'Bearer tok-123');
  assert.equal(captured.url.includes('tok-123'), false);
  assert.equal(captured.url, 'https://api.cardtrader.com/api/v2/info');
  assert.equal(JSON.stringify(info).includes('super-segreto'), false);
});

test('marketplace/products passa la lingua, non invia foil=false e usa la coda marketplace', async () => {
  const { scheduler, kinds } = makeScheduler();
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url: url.toString(), init };
    return jsonResponse({ 123: [] });
  };

  const api = createApiClient({ token: 'tok', fetchImpl, scheduler });
  const result = await api.getMarketplaceProducts(123, { language: 'it' });

  assert.deepEqual(result, { 123: [] });
  const parsed = new URL(captured.url);
  assert.equal(parsed.pathname, '/api/v2/marketplace/products');
  assert.equal(parsed.searchParams.get('blueprint_id'), '123');
  assert.equal(parsed.searchParams.get('language'), 'it');
  // foil=false faceva restituire 0 offerte all'API reale.
  assert.equal(parsed.searchParams.has('foil'), false);
  assert.deepEqual(kinds, ['marketplace']);
});

test('searchBlueprintsByName usa /blueprints con nome e gioco', async () => {
  const { scheduler } = makeScheduler();
  let captured;
  const api = createApiClient({
    token: 'tok',
    scheduler,
    fetchImpl: async (url, init) => {
      captured = { url: url.toString(), init };
      return jsonResponse([
        { id: 409562, name: 'Basic Psychic Energy', version: 'Holo | MEE 013' },
      ]);
    },
  });

  const result = await api.searchBlueprintsByName('Basic Psychic Energy', {
    gameId: 5,
  });

  assert.deepEqual(result, [
    { id: 409562, name: 'Basic Psychic Energy', version: 'Holo | MEE 013' },
  ]);
  const parsed = new URL(captured.url);
  assert.equal(parsed.pathname, '/api/v2/blueprints');
  assert.equal(parsed.searchParams.get('name'), 'Basic Psychic Energy');
  assert.equal(parsed.searchParams.get('game_id'), '5');
  assert.equal(parsed.searchParams.get('limit'), '100');
  assert.equal(parsed.searchParams.get('page'), '1');
});

test('cart/add invia via_cardtrader_zero=true e gli indirizzi API', async () => {
  const { scheduler } = makeScheduler();
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url: url.toString(), init };
    return jsonResponse({ id: 99, subcarts: [] });
  };

  const api = createApiClient({ token: 'tok', fetchImpl, scheduler });
  await api.addToCart({
    productId: 555,
    quantity: 2,
    billingAddress,
    shippingAddress: billingAddress,
  });

  assert.equal(captured.init.method, 'POST');
  const body = JSON.parse(captured.init.body);
  assert.deepEqual(body, {
    product_id: 555,
    quantity: 2,
    via_cardtrader_zero: true,
    billing_address: billingAddress,
    shipping_address: billingAddress,
  });
  assert.match(captured.url, /\/cart\/add$/);
});

test('un 429 viene ritentato una sola volta', async () => {
  const { scheduler, kinds } = makeScheduler();
  let calls = 0;
  const sleeps = [];
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse({ error: 'Too many requests' }, 429, { 'Retry-After': '0' });
    }
    return jsonResponse({ id: 3, name: 'Test App' });
  };

  const api = createApiClient({
    token: 'tok',
    fetchImpl,
    scheduler,
    sleep: async (ms) => sleeps.push(ms),
  });
  const info = await api.getInfo();

  assert.equal(calls, 2);
  assert.equal(info.name, 'Test App');
  assert.deepEqual(kinds, ['general', 'general']);
  assert.equal(sleeps.length, 1);
});

test('due 429 consecutivi producono un errore 429', async () => {
  const { scheduler } = makeScheduler();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({ error: 'Too many requests' }, 429, { 'Retry-After': '0' });
  };

  const api = createApiClient({
    token: 'tok',
    fetchImpl,
    scheduler,
    sleep: async () => {},
  });

  await assert.rejects(
    () => api.getInfo(),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 429);
      assert.match(error.message, /429/);
      return true;
    }
  );
  assert.equal(calls, 2);
});

test('401 e 422 riportano il messaggio del server senza il token', async () => {
  const { scheduler } = makeScheduler();

  const api401 = createApiClient({
    token: 'tok-segreto',
    scheduler,
    fetchImpl: async () =>
      jsonResponse(
        { error_code: 'unauthorized', extra: { message: 'Invalid token' } },
        401
      ),
  });
  await assert.rejects(
    () => api401.getGames(),
    (error) => {
      assert.equal(error.status, 401);
      assert.match(error.message, /Invalid token/);
      assert.equal(error.message.includes('tok-segreto'), false);
      return true;
    }
  );

  const api422 = createApiClient({
    token: 'tok-segreto',
    scheduler,
    fetchImpl: async () =>
      jsonResponse(
        {
          error_code: 'validation_error',
          errors: { quantity: ['must be greater than 0'] },
          extra: { message: 'Quantity non valida' },
        },
        422
      ),
  });
  await assert.rejects(
    () =>
      api422.addToCart({
        productId: 1,
        quantity: 1,
        billingAddress,
        shippingAddress: billingAddress,
      }),
    (error) => {
      assert.equal(error.status, 422);
      assert.match(error.message, /Quantity non valida/);
      return true;
    }
  );
});

test('la pagina HTML di manutenzione produce un errore chiaro invece di "Risposta inattesa"', async () => {
  const { scheduler } = makeScheduler();
  const api = createApiClient({
    token: 'tok-segreto-123',
    scheduler,
    fetchImpl: async () =>
      textResponse(
        '<!DOCTYPE html><html><head><title>CardTrader is under maintenance</title></head><body>Manutenzione</body></html>',
        { redirected: true }
      ),
  });

  await assert.rejects(
    () => api.getGames(),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'API_NON_DISPONIBILE');
      assert.equal(error.status, 200);
      assert.match(error.message, /manutenzione/i);
      assert.equal(error.message.includes('Risposta inattesa'), false);
      assert.equal(error.message.includes('tok-segreto-123'), false);
      return true;
    }
  );
});

test('getInfo non dichiara valido il token quando arriva la pagina di manutenzione', async () => {
  const { scheduler } = makeScheduler();
  const api = createApiClient({
    token: 'tok',
    scheduler,
    fetchImpl: async () =>
      textResponse('<html><head><title>CardTrader is under maintenance</title></head></html>'),
  });

  await assert.rejects(
    () => api.getInfo(),
    (error) => {
      assert.equal(error.code, 'API_NON_DISPONIBILE');
      assert.match(error.message, /manutenzione/i);
      return true;
    }
  );
});

test('una pagina HTML con status 403 viene riportata come API non disponibile', async () => {
  const { scheduler } = makeScheduler();
  const api = createApiClient({
    token: 'tok',
    scheduler,
    fetchImpl: async () =>
      textResponse('<html><head><title>CardTrader is under maintenance</title></head></html>', {
        status: 403,
        redirected: true,
      }),
  });

  await assert.rejects(
    () => api.getGames(),
    (error) => {
      assert.equal(error.code, 'API_NON_DISPONIBILE');
      assert.equal(error.status, 403);
      assert.match(error.message, /manutenzione/i);
      return true;
    }
  );
});

test('l’HTML viene riconosciuto anche con un content-type errato', async () => {
  const { scheduler } = makeScheduler();
  const api = createApiClient({
    token: 'tok',
    scheduler,
    fetchImpl: async () =>
      textResponse('<!DOCTYPE html><html><body>Manutenzione</body></html>', {
        contentType: 'application/json',
      }),
  });

  await assert.rejects(
    () => api.getGames(),
    (error) => {
      assert.equal(error.code, 'API_NON_DISPONIBILE');
      return true;
    }
  );
});

test('/games con JSON non-array riporta un errore di formato esplicito', async () => {
  const { scheduler } = makeScheduler();
  const api = createApiClient({
    token: 'tok',
    scheduler,
    fetchImpl: async () => jsonResponse({ unexpected: true, request_id: 'abc' }),
  });

  await assert.rejects(
    () => api.getGames(),
    (error) => {
      assert.equal(error.code, 'RISPOSTA_NON_VALIDA');
      assert.match(error.message, /Risposta inattesa da \/games/);
      assert.match(error.message, /elenco JSON/);
      assert.match(error.message, /chiavi ricevute: \["unexpected","request_id"\]/);
      assert.match(error.message, /primi 200 caratteri: \{"unexpected":true/);
      assert.equal(error.message.includes('manutenzione'), false);
      return true;
    }
  );
});

test('un elenco racchiuso in { array: [...] } viene accettato', async () => {
  const { scheduler } = makeScheduler();
  const api = createApiClient({
    token: 'tok',
    scheduler,
    fetchImpl: async () => jsonResponse({ array: [{ id: 3, name: 'Pokemon' }] }),
  });

  const games = await api.getGames();
  assert.deepEqual(games, [{ id: 3, name: 'Pokemon' }]);
});

test('anche /expansions e /blueprints/export accettano elenchi racchiusi', async () => {
  const { scheduler } = makeScheduler();
  const api = createApiClient({
    token: 'tok',
    scheduler,
    fetchImpl: async (url) => {
      if (String(url).includes('/expansions')) {
        return jsonResponse({ array: [{ id: 1, game_id: 3, code: 'MEG' }] });
      }
      return jsonResponse({ array: [{ id: 10, name: 'Pikachu' }] });
    },
  });

  const expansions = await api.getExpansions();
  assert.deepEqual(expansions, [{ id: 1, game_id: 3, code: 'MEG' }]);
  const blueprints = await api.getBlueprints(1);
  assert.deepEqual(blueprints, [{ id: 10, name: 'Pikachu' }]);
});

test('un BOM UTF-8 non impedisce il parsing JSON', async () => {
  const { scheduler } = makeScheduler();
  const api = createApiClient({
    token: 'tok',
    scheduler,
    fetchImpl: async () =>
      textResponse(`\uFEFF${JSON.stringify([{ id: 3, name: 'Pokemon' }])}`),
  });

  const games = await api.getGames();
  assert.deepEqual(games, [{ id: 3, name: 'Pokemon' }]);
});

test('un elenco JSON valido non viene scartato per un content-type non standard', async () => {
  const { scheduler } = makeScheduler();
  const api = createApiClient({
    token: 'tok',
    scheduler,
    fetchImpl: async () =>
      textResponse(JSON.stringify([{ id: 3, name: 'Pokemon' }]), {
        contentType: 'text/plain',
      }),
  });

  const games = await api.getGames();
  assert.deepEqual(games, [{ id: 3, name: 'Pokemon' }]);
});

test('senza token non viene fatta alcuna chiamata', async () => {
  const { scheduler } = makeScheduler();
  let calls = 0;
  const api = createApiClient({
    token: '',
    scheduler,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({});
    },
  });

  await assert.rejects(() => api.getInfo(), /Token API mancante/);
  assert.equal(calls, 0);
});

test('il client non contiene mai /cart/purchase', () => {
  const source = readFileSync(new URL('../src/lib/api-client.js', import.meta.url), 'utf8');
  assert.equal(source.includes('/cart/purchase'), false);
  assert.equal(source.includes('cart/purchase'), false);
});
