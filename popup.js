import { STORAGE_KEYS } from './src/constants.js';
import { createApiClient } from './src/lib/api-client.js';
import { addPlanToCart } from './src/lib/cart-runner.js';
import {
  createReferenceCache,
  loadDraft,
  loadSettings,
  saveDraft,
} from './src/lib/chrome-storage.js';
import { createDeckPlanner } from './src/lib/planner.js';
import { createRequestScheduler } from './src/lib/rate-scheduler.js';
import { createReferenceData } from './src/lib/reference-data.js';
import { buildReport } from './src/lib/report.js';
import { effectiveShippingAddress, toApiAddress, validateSettingsForRun } from './src/lib/settings.js';
import { formatPrice } from './src/lib/normalize.js';

const deckInput = document.getElementById('deck-input');
const analyzeBtn = document.getElementById('analyze-btn');
const clearBtn = document.getElementById('clear-btn');
const runStatus = document.getElementById('run-status');
const setupBanner = document.getElementById('setup-banner');
const setupMessage = document.getElementById('setup-message');
const progressSection = document.getElementById('progress-section');
const progressLabel = document.getElementById('progress-label');
const progressCount = document.getElementById('progress-count');
const progressBar = document.getElementById('progress-bar');
const summarySection = document.getElementById('summary-section');
const summaryCards = document.getElementById('summary-cards');
const summaryTotal = document.getElementById('summary-total');
const summaryEntries = document.getElementById('summary-entries');
const summarySplit = document.getElementById('summary-split');
const problemsSection = document.getElementById('problems-section');
const problemsBadge = document.getElementById('problems-badge');
const problemsList = document.getElementById('problems-list');
const warningsSection = document.getElementById('warnings-section');
const warningsBadge = document.getElementById('warnings-badge');
const warningsList = document.getElementById('warnings-list');
const previewSection = document.getElementById('preview-section');
const previewBadge = document.getElementById('preview-badge');
const previewList = document.getElementById('preview-list');
const cartSection = document.getElementById('cart-section');
const cartDescription = document.getElementById('cart-description');
const cartStatus = document.getElementById('cart-status');
const addCartBtn = document.getElementById('add-cart-btn');
const copyReportBtn = document.getElementById('copy-report');
const openTabBtn = document.getElementById('open-tab');
const openOptionsBtn = document.getElementById('open-options');
const setupOptionsBtn = document.getElementById('setup-options');

const state = {
  settings: null,
  plan: null,
  cartResult: null,
  reportText: '',
  analyzedText: '',
  stale: false,
  busy: false,
  draftTimer: null,
};

function create(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function setStatus(element, message, type = 'info', visible = true) {
  element.textContent = message;
  element.className = `status status-${type}`;
  element.hidden = !visible;
}

function setRunStatus(message, type = 'info', visible = true) {
  setStatus(runStatus, message, type, visible);
}

function setCartStatus(message, type = 'info', visible = true) {
  setStatus(cartStatus, message, type, visible);
}

function settingsIssues() {
  if (!state.settings) {
    return [{ field: 'token', message: 'Impostazioni non disponibili.' }];
  }
  return validateSettingsForRun(state.settings);
}

function hasIssue(field) {
  return settingsIssues().some((issue) => issue.field === field);
}

function showProgress(event) {
  progressSection.hidden = false;
  progressLabel.textContent = event?.message || 'Elaborazione…';
  if (Number.isFinite(event?.current) && Number.isFinite(event?.total) && event.total > 0) {
    progressBar.max = event.total;
    progressBar.value = event.current;
    progressCount.textContent = `${event.current}/${event.total}`;
  } else {
    progressBar.max = 1;
    progressBar.removeAttribute('value');
    progressCount.textContent = '';
  }
}

function hideProgress() {
  progressSection.hidden = true;
  progressBar.max = 1;
  progressBar.value = 0;
  progressCount.textContent = '';
}

function refreshSetupBanner() {
  if (!state.settings) {
    setupMessage.textContent = 'Impostazioni non disponibili. Apri le opzioni.';
    setupBanner.hidden = false;
    return;
  }

  if (hasIssue('token')) {
    setupMessage.textContent =
      'Token API CardTrader non configurato: aprilo dalle opzioni per calcolare l’anteprima.';
    setupBanner.hidden = false;
    return;
  }

  if (hasIssue('billingAddress') || hasIssue('shippingAddress')) {
    setupMessage.textContent =
      'Indirizzi incompleti: puoi calcolare l’anteprima, ma non aggiungere al carrello.';
    setupBanner.hidden = false;
    return;
  }

  setupBanner.hidden = true;
}

function refreshActionState() {
  const hasText = deckInput.value.trim().length > 0;
  const tokenIssue = hasIssue('token');
  const addressIssue = hasIssue('billingAddress') || hasIssue('shippingAddress');
  const ready = state.plan?.summary?.readyEntries || 0;

  analyzeBtn.disabled = state.busy || tokenIssue || !hasText;
  analyzeBtn.textContent = state.busy ? 'Analisi…' : 'Calcola anteprima';
  deckInput.disabled = state.busy;
  clearBtn.disabled = state.busy;
  copyReportBtn.disabled = !state.plan;

  const canAdd =
    Boolean(state.plan) &&
    !state.busy &&
    !state.stale &&
    !state.cartResult &&
    ready > 0 &&
    !tokenIssue &&
    !addressIssue;

  addCartBtn.disabled = !canAdd;
  addCartBtn.textContent = state.cartResult ? 'Aggiunta eseguita' : 'Aggiungi al carrello';

  if (state.plan) {
    if (state.cartResult) {
      cartDescription.textContent = state.cartResult.ok
        ? 'Aggiunta completata. Controlla il carrello su CardTrader: nessun acquisto è stato effettuato.'
        : 'Aggiunta completata con errori. Controlla il carrello su CardTrader prima di procedere.';
    } else if (addressIssue) {
      cartDescription.textContent =
        'Completa gli indirizzi nelle opzioni per poter aggiungere le offerte al carrello.';
    } else if (state.stale) {
      cartDescription.textContent =
        'La lista è cambiata dopo l’anteprima: ricalcola prima di aggiungere al carrello.';
    } else if (!ready) {
      cartDescription.textContent =
        'Nessuna riga pronta: correggi i problemi e ricalcola l’anteprima.';
    } else {
      cartDescription.textContent = `Pronto: ${state.plan.summary.readyCards} carte in ${ready} righe. L’aggiunta non effettua alcun acquisto.`;
    }
  }

  refreshSetupBanner();
}

function clearList(element) {
  element.replaceChildren();
}

function renderProblems(plan) {
  const problems = plan.problems || [];
  problemsSection.hidden = problems.length === 0;
  problemsBadge.textContent = String(problems.length);
  clearList(problemsList);

  for (const problem of problems) {
    const item = create('li', 'problem-item');
    if (problem.lineNumber) {
      item.append(create('span', 'badge badge-red', `Riga ${problem.lineNumber}`));
    }
    const text = create('span', 'problem-text');
    if (problem.card) {
      text.append(create('span', 'problem-card', `${problem.card}: `));
    }
    text.append(document.createTextNode(problem.message));
    if (problem.raw) {
      text.append(create('span', 'entry-meta', ` — ${problem.raw}`));
    }
    item.append(text);
    problemsList.append(item);
  }
}

function renderWarnings(plan) {
  const warnings = plan.warnings || [];
  warningsSection.hidden = warnings.length === 0;
  warningsBadge.textContent = String(warnings.length);
  clearList(warningsList);

  for (const warning of warnings) {
    const item = create('li', 'problem-item');
    item.append(create('span', 'badge badge-amber', 'Avviso'));
    const text = create('span', 'problem-text');
    if (warning.card) {
      text.append(create('span', 'problem-card', `${warning.card}: `));
    }
    text.append(document.createTextNode(warning.message));
    item.append(text);
    warningsList.append(item);
  }
}

function renderEntry(planned) {
  const article = create(
    'article',
    `entry-card ${planned.status === 'ok' ? 'is-ok' : 'is-problem'}`
  );

  const head = create('div', 'entry-head');
  const title = create('div', 'entry-title');
  title.append(
    create(
      'strong',
      '',
      `${planned.entry.quantity}× ${planned.entry.name}`
    )
  );
  title.append(
    create(
      'span',
      'entry-code',
      `${planned.entry.setCode} ${planned.entry.printNumber}`
    )
  );
  head.append(title);

  const badges = create('div', 'entry-badges');
  if (planned.status === 'ok') {
    if (planned.selection?.strategy === 'split') {
      badges.append(create('span', 'badge badge-amber', 'OK · divisa'));
    } else {
      badges.append(create('span', 'badge badge-green', 'OK'));
    }
  } else {
    badges.append(create('span', 'badge badge-red', 'Problema'));
  }
  if (planned.blueprint?.finish === 'holo') {
    badges.append(create('span', 'badge badge-neutral', 'Holo'));
  } else if (planned.blueprint?.finish === 'reverse') {
    badges.append(create('span', 'badge badge-neutral', 'Reverse'));
  }
  head.append(badges);
  article.append(head);

  const metaParts = [];
  if (planned.expansion) {
    metaParts.push(`${planned.expansion.name} (${planned.expansion.code})`);
  }
  if (planned.blueprint) {
    const version = planned.blueprint.version
      ? ` (${planned.blueprint.version})`
      : '';
    metaParts.push(
      `blueprint #${planned.blueprint.id} · ${planned.blueprint.name}${version}`
    );
  }
  if (planned.printField) {
    metaParts.push(`numero da ${planned.printField}`);
  }
  if (metaParts.length) {
    article.append(create('p', 'entry-meta', metaParts.join(' · ')));
  }

  if (planned.status === 'ok' && planned.selection) {
    const selection = planned.selection;
    const list = create('ul', 'offer-lines');
    for (const item of selection.items) {
      const row = create('li', 'offer-line');
      row.append(create('span', 'offer-qty', `${item.quantity}×`));
      row.append(
        create(
          'span',
          'offer-desc',
          `${item.condition} · ${item.seller || 'venditore sconosciuto'}`
        )
      );
      row.append(
        create(
          'span',
          'offer-price',
          `${formatPrice(item.unitPriceCents, item.currency)} cad.`
        )
      );
      list.append(row);
    }
    article.append(list);

    const total = create('div', 'entry-total');
    total.append(create('span', '', 'Totale riga'));
    total.append(
      create('span', '', formatPrice(selection.totalCents, selection.currency))
    );
    article.append(total);

    if (selection.strategy === 'split') {
      article.append(
        create('p', 'entry-meta', 'Quantità divisa su più venditori.')
      );
    }
  } else {
    const reasons = (planned.problems || []).map((problem) => problem.message);
    if (planned.selection?.partialItems?.length) {
      reasons.push(
        `Copie disponibili: ${planned.selection.coveredQuantity}/${planned.selection.requestedQuantity}.`
      );
    }
    for (const reason of reasons) {
      article.append(create('p', 'entry-reason', reason));
    }
  }

  return article;
}

function renderPreview(plan) {
  const entries = plan.entries || [];
  previewSection.hidden = entries.length === 0;
  previewBadge.textContent = `${entries.length} ${entries.length === 1 ? 'riga' : 'righe'}`;
  previewList.replaceChildren(...entries.map(renderEntry));
}

function renderSummary(plan) {
  const { summary } = plan;
  summarySection.hidden = false;
  summaryCards.textContent = `${summary.readyCards}/${summary.requestedCards}`;
  summaryTotal.textContent = summary.mixedCurrencies
    ? 'Valute miste'
    : summary.readyEntries
      ? formatPrice(summary.totalCents, summary.currency || 'EUR')
      : '—';
  summaryEntries.textContent = `${summary.readyEntries}/${summary.parsedEntries}`;
  summarySplit.textContent = String(summary.splitEntries);
}

function renderPlan(plan) {
  renderSummary(plan);
  renderProblems(plan);
  renderWarnings(plan);
  renderPreview(plan);

  cartSection.hidden = false;
  setCartStatus('', 'info', false);
  refreshActionState();
}

function resetPlanView() {
  state.plan = null;
  state.cartResult = null;
  state.reportText = '';
  state.stale = false;
  summarySection.hidden = true;
  problemsSection.hidden = true;
  warningsSection.hidden = true;
  previewSection.hidden = true;
  cartSection.hidden = true;
  clearList(problemsList);
  clearList(warningsList);
  previewList.replaceChildren();
  setCartStatus('', 'info', false);
  refreshActionState();
}

function scheduleDraftSave() {
  clearTimeout(state.draftTimer);
  state.draftTimer = setTimeout(() => {
    saveDraft(deckInput.value).catch(() => {});
  }, 350);
}

function markStaleIfNeeded() {
  if (!state.plan) return;
  state.stale = deckInput.value !== state.analyzedText;
  refreshActionState();
}

async function onAnalyze() {
  if (state.busy) return;

  const text = deckInput.value;
  if (!text.trim()) {
    setRunStatus('Incolla una lista mazzo prima di analizzare.', 'error');
    return;
  }

  const tokenIssue = settingsIssues().find((issue) => issue.field === 'token');
  if (tokenIssue) {
    setRunStatus(tokenIssue.message, 'error');
    refreshSetupBanner();
    return;
  }

  state.busy = true;
  resetPlanView();
  setRunStatus('Analisi in corso…', 'info');
  showProgress({ message: 'Preparazione…' });
  refreshActionState();

  try {
    const api = createApiClient({
      token: state.settings.token,
      scheduler: createRequestScheduler(),
    });
    const reference = createReferenceData({
      api,
      cache: createReferenceCache(),
    });
    const planner = createDeckPlanner({
      api,
      reference,
      onProgress: showProgress,
    });

    const plan = await planner.plan({ text, settings: state.settings });
    state.plan = plan;
    state.analyzedText = text;
    state.stale = false;
    state.reportText = buildReport({ plan });
    renderPlan(plan);

    if (!plan.entries.length) {
      setRunStatus('Nessuna riga valida: controlla i problemi.', 'warning');
    } else if (plan.summary.problemEntries > 0) {
      setRunStatus(
        `Anteprima pronta: ${plan.summary.readyEntries} righe OK, ${plan.summary.problemEntries} con problemi.`,
        'warning'
      );
    } else {
      setRunStatus(
        `Anteprima pronta: ${plan.summary.readyCards} carte per ${formatPrice(plan.summary.totalCents, plan.summary.currency || 'EUR')}.`,
        'success'
      );
    }
    saveDraft(text).catch(() => {});
  } catch (error) {
    resetPlanView();
    setRunStatus(error?.message || 'Analisi non riuscita. Riprova.', 'error');
  } finally {
    state.busy = false;
    hideProgress();
    refreshActionState();
  }
}

function onClear() {
  if (state.busy) return;
  deckInput.value = '';
  state.analyzedText = '';
  resetPlanView();
  setRunStatus('', 'info', false);
  saveDraft('').catch(() => {});
  refreshActionState();
  deckInput.focus();
}

async function onAddToCart() {
  if (state.busy || !state.plan || state.stale || state.cartResult) return;

  const issues = settingsIssues();
  if (issues.length) {
    setCartStatus(
      'Completa token e indirizzi nelle opzioni prima di aggiungere al carrello.',
      'error'
    );
    refreshSetupBanner();
    return;
  }

  const { summary } = state.plan;
  if (summary.readyEntries < 1) {
    setCartStatus('Nessuna riga pronta da aggiungere.', 'warning');
    return;
  }

  const confirmed = window.confirm(
    `Aggiungere ${summary.readyCards} carte (${summary.readyEntries} righe) al carrello CardTrader?\n\n` +
      'Verranno usate le offerte CardTrader Zero dell’anteprima. Nessun acquisto verrà effettuato.'
  );
  if (!confirmed) return;

  state.busy = true;
  refreshActionState();
  setCartStatus('Aggiunta al carrello in corso…', 'info');

  try {
    const api = createApiClient({
      token: state.settings.token,
      scheduler: createRequestScheduler(),
    });
    const result = await addPlanToCart({
      plan: state.plan,
      api,
      billingAddress: toApiAddress(state.settings.billingAddress),
      shippingAddress: toApiAddress(effectiveShippingAddress(state.settings)),
      onProgress: (event) => setCartStatus(event.message, 'info'),
    });

    state.cartResult = result;
    state.reportText = buildReport({
      plan: state.plan,
      cartResult: result,
    });

    if (result.ok) {
      setCartStatus(
        `Aggiunte ${result.added.length} righe (${result.totalAddedQuantity} copie). Nessun acquisto effettuato: verifica il carrello CardTrader.`,
        'success'
      );
    } else {
      setCartStatus(
        `Aggiunte ${result.added.length} righe, ${result.failed.length} errori, ${result.notAttempted.length} non tentate. Controlla il carrello CardTrader.`,
        result.added.length ? 'warning' : 'error'
      );
    }
  } catch (error) {
    setCartStatus(error?.message || 'Aggiunta al carrello non riuscita.', 'error');
  } finally {
    state.busy = false;
    refreshActionState();
  }
}

async function copyReport() {
  if (!state.reportText) {
    if (!state.plan) return;
    state.reportText = buildReport({
      plan: state.plan,
      cartResult: state.cartResult,
    });
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(state.reportText);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = state.reportText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('Copia non disponibile');
    }
    setCartStatus('Report copiato negli appunti.', 'success');
  } catch {
    setCartStatus('Non è stato possibile copiare il report.', 'error');
  }
}

function openOptions() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
    return;
  }
  window.open('options.html', '_blank');
}

function openInTab() {
  const url =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('popup.html?view=tab')
      : 'popup.html?view=tab';
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }
  window.open(url, '_blank');
}

function bindEvents() {
  analyzeBtn.addEventListener('click', onAnalyze);
  clearBtn.addEventListener('click', onClear);
  addCartBtn.addEventListener('click', onAddToCart);
  copyReportBtn.addEventListener('click', copyReport);
  openTabBtn.addEventListener('click', openInTab);
  openOptionsBtn.addEventListener('click', openOptions);
  setupOptionsBtn.addEventListener('click', openOptions);

  deckInput.addEventListener('input', () => {
    scheduleDraftSave();
    markStaleIfNeeded();
    refreshActionState();
  });

  window.addEventListener('pagehide', () => {
    if (state.draftTimer) {
      clearTimeout(state.draftTimer);
      state.draftTimer = null;
    }
    saveDraft(deckInput.value).catch(() => {});
  });

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEYS.settings]) return;
      loadSettings()
        .then((settings) => {
          state.settings = settings;
          if (state.plan) state.stale = true;
          refreshActionState();
        })
        .catch(() => {});
    });
  }
}

async function init() {
  if (new URLSearchParams(window.location.search).get('view') === 'tab') {
    document.body.classList.add('view-tab');
    openTabBtn.hidden = true;
  }

  bindEvents();
  refreshActionState();

  try {
    const [settings, draft] = await Promise.all([loadSettings(), loadDraft()]);
    state.settings = settings;
    if (draft) deckInput.value = draft;
  } catch {
    setRunStatus('Impossibile leggere le impostazioni salvate.', 'error');
  }

  refreshActionState();
}

init();
