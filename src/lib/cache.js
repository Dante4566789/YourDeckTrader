/**
 * Cache con scadenza sopra un piccolo adapter KeyValue.
 * L'adapter deve esporre get(keys), set(object), remove(keys).
 * Gli errori di storage non devono mai bloccare il flusso principale.
 */
export function createKeyValueCache(options) {
  const {
    store,
    prefix = 'ctdc.cache.',
    ttlMs = 24 * 60 * 60 * 1000,
    maxEntries = 12,
    now = () => Date.now(),
  } = options;

  const indexKey = `${prefix}__index`;

  const fullKey = (key) => `${prefix}${key}`;

  async function readIndex() {
    try {
      const result = await store.get(indexKey);
      const index = result?.[indexKey];
      return index && typeof index === 'object' ? index : {};
    } catch {
      return {};
    }
  }

  async function writeIndex(index) {
    try {
      await store.set({ [indexKey]: index });
    } catch {
      // La cache è un'ottimizzazione: se lo storage è pieno si continua.
    }
  }

  async function prune(index) {
    const current = now();
    const valid = Object.entries(index)
      .filter(([, meta]) => meta && Number(meta.expiresAt) > current)
      .sort((a, b) => Number(a[1].savedAt) - Number(b[1].savedAt));

    const toRemove = [];
    for (const [key, meta] of valid) {
      if (!store.get) break;
      if (valid.length - toRemove.length <= maxEntries) break;
      toRemove.push(key);
      void meta;
    }

    if (toRemove.length) {
      try {
        await store.remove(toRemove.map(fullKey));
      } catch {
        // ignora
      }
    }

    const next = {};
    for (const [key, meta] of valid) {
      if (!toRemove.includes(key)) next[key] = meta;
    }
    await writeIndex(next);
    return next;
  }

  async function get(key) {
    const storageKey = fullKey(key);
    try {
      const result = await store.get(storageKey);
      const envelope = result?.[storageKey];
      if (!envelope || typeof envelope !== 'object') return null;
      if (Number(envelope.expiresAt) <= now()) {
        await store.remove(storageKey);
        return null;
      }
      return envelope.value ?? null;
    } catch {
      return null;
    }
  }

  async function set(key, value, customTtlMs = ttlMs) {
    const storageKey = fullKey(key);
    const savedAt = now();
    const expiresAt = savedAt + customTtlMs;
    try {
      await store.set({
        [storageKey]: { savedAt, expiresAt, value },
      });
      const index = await readIndex();
      index[key] = { savedAt, expiresAt };
      await prune(index);
      return true;
    } catch {
      return false;
    }
  }

  async function getOrLoad(key, loader, customTtlMs = ttlMs) {
    const cached = await get(key);
    if (cached !== null) return { value: cached, fromCache: true };
    const value = await loader();
    await set(key, value, customTtlMs);
    return { value, fromCache: false };
  }

  async function remove(key) {
    try {
      await store.remove(fullKey(key));
      const index = await readIndex();
      delete index[key];
      await writeIndex(index);
    } catch {
      // ignora
    }
  }

  async function clear() {
    try {
      const all = await store.get(null);
      const keys = Object.keys(all || {}).filter((key) => key.startsWith(prefix));
      if (keys.length) await store.remove(keys);
    } catch {
      // ignora
    }
  }

  return { get, set, getOrLoad, remove, clear };
}
