/**
 * Coda globale per le chiamate CardTrader.
 * - 1 richiesta ogni 1,1 s per la marketplace
 * - 200 richieste mobili ogni 10 s in totale
 *
 * Orologio e sleep sono iniettabili per i test; il modulo non usa chrome.*.
 */
export function createRequestScheduler(options = {}) {
  const {
    marketplaceIntervalMs = 1100,
    windowMs = 10_000,
    maxRequests = 200,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;

  const timestamps = [];
  let lastMarketplaceAt = Number.NEGATIVE_INFINITY;
  let tail = Promise.resolve();

  async function waitForGlobalSlot() {
    while (true) {
      const current = now();
      while (timestamps.length > 0 && timestamps[0] <= current - windowMs) {
        timestamps.shift();
      }
      if (timestamps.length < maxRequests) return;
      const waitMs = timestamps[0] + windowMs - current;
      await sleep(Math.max(1, waitMs));
    }
  }

  async function waitForMarketplaceSlot() {
    const current = now();
    const waitMs = lastMarketplaceAt + marketplaceIntervalMs - current;
    if (waitMs > 0) await sleep(waitMs);
    lastMarketplaceAt = now();
  }

  function acquire(kind = 'general') {
    const task = tail.then(async () => {
      await waitForGlobalSlot();
      if (kind === 'marketplace') {
        await waitForMarketplaceSlot();
      }
      timestamps.push(now());
    });
    tail = task.catch(() => {});
    return task;
  }

  function snapshot() {
    return {
      requestsInWindow: timestamps.length,
      lastMarketplaceAt,
    };
  }

  return { acquire, snapshot };
}
