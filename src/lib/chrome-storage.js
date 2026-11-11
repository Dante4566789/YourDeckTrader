import {
  CACHE_PREFIX,
  CACHE_TTL_MS,
  STORAGE_KEYS,
} from '../constants.js';
import { createKeyValueCache } from './cache.js';
import { normalizeSettings } from './settings.js';

export const chromeLocalStore = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (value) => chrome.storage.local.set(value),
  remove: (keys) => chrome.storage.local.remove(keys),
};

export async function loadSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(result?.[STORAGE_KEYS.settings]);
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: normalized });
  return normalized;
}

export async function loadDraft() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.draft);
  const value = result?.[STORAGE_KEYS.draft];
  return typeof value === 'string' ? value : '';
}

export async function saveDraft(text) {
  await chrome.storage.local.set({ [STORAGE_KEYS.draft]: String(text ?? '') });
}

export function createReferenceCache() {
  return createKeyValueCache({
    store: chromeLocalStore,
    prefix: CACHE_PREFIX,
    ttlMs: CACHE_TTL_MS,
    maxEntries: 12,
  });
}

export async function clearExtensionCache() {
  const cache = createReferenceCache();
  await cache.clear();
}
