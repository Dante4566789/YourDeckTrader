import { LANGUAGES, MIN_CONDITIONS } from './src/constants.js';
import { createApiClient } from './src/lib/api-client.js';
import { createRequestScheduler } from './src/lib/rate-scheduler.js';
import {
  clearExtensionCache,
  loadSettings,
  saveSettings,
} from './src/lib/chrome-storage.js';
import {
  normalizeSettings,
  normalizeMappings,
  validateAddress,
  validateToken,
} from './src/lib/settings.js';

const form = document.getElementById('settings-form');
const tokenInput = document.getElementById('token');
const tokenBadge = document.getElementById('token-badge');
const tokenStatus = document.getElementById('token-status');
const tokenField = document.getElementById('token-field');
const languageSelect = document.getElementById('language');
const conditionSelect = document.getElementById('min-condition');
const sameAddressInput = document.getElementById('same-address');
const shippingBlock = document.getElementById('shipping-block');
const mappingBody = document.getElementById('mapping-body');
const saveStatus = document.getElementById('save-status');
const cacheStatus = document.getElementById('cache-status');

let currentSettings = null;

function setStatus(element, message, type = 'info', visible = true) {
  element.textContent = message;
  element.className = `status status-${type}`;
  element.hidden = !visible;
}

function clearFieldErrors() {
  document.querySelectorAll('.field.has-error').forEach((field) => {
    field.classList.remove('has-error');
  });
  document.querySelectorAll('[data-error-for]').forEach((element) => {
    element.textContent = '';
  });
}

function setFieldError(name, message) {
  const errorElement = document.querySelector(`[data-error-for="${name}"]`);
  if (errorElement) {
    errorElement.textContent = message;
    const field = errorElement.closest('.field');
    if (field) field.classList.add('has-error');
  }
}

function renderSelects() {
  languageSelect.replaceChildren(
    ...LANGUAGES.map((language) => {
      const option = document.createElement('option');
      option.value = language.code;
      option.textContent = language.label;
      return option;
    })
  );

  conditionSelect.replaceChildren(
    ...MIN_CONDITIONS.map((condition) => {
      const option = document.createElement('option');
      option.value = condition;
      option.textContent = condition;
      return option;
    })
  );
}

function addMappingRow(mapping = { deckCode: '', target: '' }) {
  const row = document.createElement('tr');

  const deckCell = document.createElement('td');
  const deckInput = document.createElement('input');
  deckInput.type = 'text';
  deckInput.placeholder = 'MEG';
  deckInput.value = mapping.deckCode || '';
  deckInput.dataset.role = 'deck-code';
  deckInput.setAttribute('aria-label', 'Codice espansione nel mazzo');
  deckInput.maxLength = 12;
  deckCell.append(deckInput);

  const targetCell = document.createElement('td');
  const targetInput = document.createElement('input');
  targetInput.type = 'text';
  targetInput.placeholder = 'meg oppure Mega Evolution';
  targetInput.value = mapping.target || '';
  targetInput.dataset.role = 'target';
  targetInput.setAttribute('aria-label', 'Codice o nome espansione CardTrader');
  targetCell.append(targetInput);

  const actionCell = document.createElement('td');
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'remove-mapping';
  removeButton.textContent = '×';
  removeButton.title = 'Rimuovi corrispondenza';
  removeButton.setAttribute('aria-label', 'Rimuovi corrispondenza');
  removeButton.addEventListener('click', () => {
    row.remove();
    if (!mappingBody.children.length) addMappingRow();
    markDirty();
  });
  actionCell.append(removeButton);

  deckInput.addEventListener('input', markDirty);
  targetInput.addEventListener('input', markDirty);

  row.append(deckCell, targetCell, actionCell);
  mappingBody.append(row);
}

function renderMappings(mappings) {
  mappingBody.replaceChildren();
  const rows = mappings.length ? mappings : [{ deckCode: '', target: '' }];
  rows.forEach((mapping) => addMappingRow(mapping));
}

function readMappings() {
  const rows = [...mappingBody.querySelectorAll('tr')].map((row) => ({
    deckCode: row.querySelector('[data-role="deck-code"]').value,
    target: row.querySelector('[data-role="target"]').value,
  }));
  return normalizeMappings(rows);
}

function setAddressFields(prefix, address) {
  document.getElementById(`${prefix}-name`).value = address.name || '';
  document.getElementById(`${prefix}-street`).value = address.street || '';
  document.getElementById(`${prefix}-zip`).value = address.zip || '';
  document.getElementById(`${prefix}-city`).value = address.city || '';
  document.getElementById(`${prefix}-state`).value = address.stateOrProvince || '';
  document.getElementById(`${prefix}-country`).value = address.countryCode || '';
}

function readAddress(prefix) {
  return {
    name: document.getElementById(`${prefix}-name`).value,
    street: document.getElementById(`${prefix}-street`).value,
    zip: document.getElementById(`${prefix}-zip`).value,
    city: document.getElementById(`${prefix}-city`).value,
    stateOrProvince: document.getElementById(`${prefix}-state`).value,
    countryCode: document.getElementById(`${prefix}-country`).value,
  };
}

function applySettings(settings) {
  currentSettings = normalizeSettings(settings);
  tokenInput.value = currentSettings.token;
  languageSelect.value = currentSettings.language;
  conditionSelect.value = currentSettings.minCondition;
  setAddressFields('billing', currentSettings.billingAddress);
  setAddressFields('shipping', currentSettings.shippingAddress);
  sameAddressInput.checked = currentSettings.sameAddress;
  renderMappings(currentSettings.expansionMappings);
  updateTokenBadge();
  updateShippingState();
}

function updateTokenBadge() {
  const hasToken = Boolean(tokenInput.value.trim());
  tokenBadge.textContent = hasToken ? 'Configurato' : 'Non configurato';
  tokenBadge.className = `badge ${hasToken ? 'badge-green' : 'badge-red'}`;
}

function updateShippingState() {
  const disabled = sameAddressInput.checked;
  shippingBlock.classList.toggle('is-disabled', disabled);
  shippingBlock.querySelectorAll('input').forEach((input) => {
    input.disabled = disabled;
  });
}

function markDirty() {
  saveStatus.textContent = '';
  saveStatus.classList.remove('is-error');
}

function collectSettings() {
  return normalizeSettings({
    token: tokenInput.value,
    language: languageSelect.value,
    minCondition: conditionSelect.value,
    billingAddress: readAddress('billing'),
    shippingAddress: sameAddressInput.checked
      ? readAddress('billing')
      : readAddress('shipping'),
    sameAddress: sameAddressInput.checked,
    expansionMappings: readMappings(),
  });
}

function showAddressErrors(prefix, errors) {
  const fields = {
    name: `${prefix}Name`,
    street: `${prefix}Street`,
    zip: `${prefix}Zip`,
    city: `${prefix}City`,
    countryCode: `${prefix}Country`,
  };
  for (const [key, message] of Object.entries(errors)) {
    if (fields[key]) setFieldError(fields[key], message);
  }
}

async function onSave(event) {
  event.preventDefault();
  clearFieldErrors();
  saveStatus.textContent = '';
  saveStatus.classList.remove('is-error');

  const settings = collectSettings();
  const tokenError = validateToken(settings.token);
  if (tokenError) setFieldError('token', tokenError);

  const billingErrors = validateAddress(settings.billingAddress);
  showAddressErrors('billing', billingErrors);

  let shippingErrors = {};
  if (!settings.sameAddress) {
    shippingErrors = validateAddress(settings.shippingAddress);
    showAddressErrors('shipping', shippingErrors);
  }

  const hasErrors =
    Boolean(tokenError) ||
    Object.keys(billingErrors).length > 0 ||
    Object.keys(shippingErrors).length > 0;

  if (hasErrors) {
    saveStatus.textContent = 'Controlla i campi evidenziati prima di salvare.';
    saveStatus.classList.add('is-error');
    document.querySelector('.field.has-error input')?.focus();
    return;
  }

  const saveButton = document.getElementById('save-settings');
  saveButton.disabled = true;
  saveButton.textContent = 'Salvataggio…';
  try {
    await saveSettings(settings);
    currentSettings = settings;
    updateTokenBadge();
    saveStatus.textContent = 'Impostazioni salvate.';
    saveStatus.classList.remove('is-error');
  } catch {
    saveStatus.textContent = 'Salvataggio non riuscito. Riprova.';
    saveStatus.classList.add('is-error');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Salva impostazioni';
  }
}

async function onVerifyToken() {
  clearFieldErrors();
  const token = tokenInput.value;
  const tokenError = validateToken(token);
  if (tokenError) {
    setFieldError('token', tokenError);
    tokenField.classList.add('has-error');
    setStatus(tokenStatus, tokenError, 'error');
    return;
  }

  const button = document.getElementById('verify-token');
  button.disabled = true;
  button.textContent = 'Verifica…';
  setStatus(tokenStatus, 'Contatto CardTrader…', 'info');
  try {
    const api = createApiClient({
      token,
      scheduler: createRequestScheduler(),
    });
    const info = await api.getInfo();
    const label = [info.name, info.id ? `ID ${info.id}` : null]
      .filter(Boolean)
      .join(' · ');
    setStatus(
      tokenStatus,
      `Token valido${label ? `: ${label}` : '.'}`,
      'success'
    );
  } catch (error) {
    setStatus(tokenStatus, error?.message || 'Verifica non riuscita.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Verifica token';
  }
}

async function onClearCache() {
  const button = document.getElementById('clear-cache');
  button.disabled = true;
  try {
    await clearExtensionCache();
    setStatus(cacheStatus, 'Cache CardTrader svuotata.', 'success');
  } catch {
    setStatus(cacheStatus, 'Non è stato possibile svuotare la cache.', 'error');
  } finally {
    button.disabled = false;
  }
}

function bindEvents() {
  form.addEventListener('submit', onSave);
  document.getElementById('toggle-token').addEventListener('click', (event) => {
    const showing = tokenInput.type === 'text';
    tokenInput.type = showing ? 'password' : 'text';
    event.currentTarget.textContent = showing ? 'Mostra' : 'Nascondi';
  });
  document.getElementById('verify-token').addEventListener('click', onVerifyToken);
  document.getElementById('clear-cache').addEventListener('click', onClearCache);
  document.getElementById('add-mapping').addEventListener('click', () => {
    addMappingRow();
    markDirty();
  });
  sameAddressInput.addEventListener('change', () => {
    updateShippingState();
    markDirty();
  });
  tokenInput.addEventListener('input', () => {
    updateTokenBadge();
    markDirty();
  });
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);

  document.querySelectorAll('[data-error-for]').forEach((element) => {
    const field = element.closest('.field');
    field?.querySelector('input, select')?.addEventListener('input', () => {
      element.textContent = '';
      field.classList.remove('has-error');
    });
  });
}

async function init() {
  renderSelects();
  bindEvents();
  try {
    const settings = await loadSettings();
    applySettings(settings);
  } catch {
    saveStatus.textContent = 'Impossibile leggere le impostazioni salvate.';
    saveStatus.classList.add('is-error');
  }
}

init();
