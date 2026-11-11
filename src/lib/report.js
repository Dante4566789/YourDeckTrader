import { formatPrice } from './normalize.js';

function formatDate(date) {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return String(date);
  }
}

function lineForEntry(planned) {
  const { entry } = planned;
  const heading = `${entry.quantity}× ${entry.name} (${entry.setCode} ${entry.printNumber})`;

  if (planned.status !== 'ok' || !planned.selection) {
    const reasons = (planned.problems || [])
      .map((problem) => problem.message)
      .filter(Boolean);
    return [`[PROBLEMA] ${heading}`, ...reasons.map((reason) => `  Motivo: ${reason}`)];
  }

  const { selection } = planned;
  const tag =
    selection.strategy === 'split' ? '[OK · DIVISA]' : '[OK]';
  const lines = [`${tag} ${heading}`];
  for (const item of selection.items) {
    lines.push(
      `  - ${item.quantity}× ${item.condition} · ${item.seller || 'venditore sconosciuto'} · ${formatPrice(item.unitPriceCents, item.currency)} cad.`
    );
  }
  lines.push(
    `  Totale riga: ${formatPrice(selection.totalCents, selection.currency)}`
  );
  if (selection.strategy === 'split') {
    lines.push('  Quantità divisa su più venditori.');
  }
  for (const warning of planned.warnings || []) {
    lines.push(`  Avviso: ${warning.message}`);
  }
  return lines;
}

/**
 * Report testuale pronto per gli appunti. Non legge token o indirizzi:
 * riceve solo il piano e l'esito del carrello, che non li contengono.
 */
export function buildReport(options = {}) {
  const { plan, cartResult = null, generatedAt = new Date() } = options;
  if (!plan || !plan.summary) {
    return 'CardTrader Deck Cart — Report\nNessuna analisi disponibile.';
  }

  const { summary, config } = plan;
  const lines = [
    'CardTrader Deck Cart — Report',
    `Data: ${formatDate(generatedAt)}`,
    `Lingua: ${config?.language || '—'} · Condizione minima: ${config?.minCondition || '—'}`,
    '',
    'RIEPILOGO',
    `Righe valide: ${summary.parsedEntries} · Carte richieste: ${summary.requestedCards}`,
    `Righe pronte: ${summary.readyEntries} · Righe con problemi: ${summary.problemEntries}`,
    `Copie pronte: ${summary.readyCards}/${summary.requestedCards}`,
    `Totale anteprima: ${
      summary.mixedCurrencies
        ? 'valute miste, totale non affidabile'
        : formatPrice(summary.totalCents, summary.currency || 'EUR')
    }`,
    `Righe con quantità divisa: ${summary.splitEntries}`,
    '',
    'CARTE',
  ];

  if (!plan.entries.length) {
    lines.push('(nessuna riga valida)');
  } else {
    for (const planned of plan.entries) {
      lines.push(...lineForEntry(planned));
      lines.push('');
    }
    if (lines[lines.length - 1] === '') lines.pop();
  }

  const problems = (plan.problems || []).filter(
    (problem) => problem.code === 'RIGA_NON_RICONOSCIUTA'
  );
  if (problems.length) {
    lines.push('', 'PROBLEMI DI FORMATO');
    for (const problem of problems) {
      lines.push(`- Riga ${problem.lineNumber}: ${problem.message}`);
      if (problem.raw) lines.push(`  Testo: ${problem.raw}`);
    }
  }

  const otherProblems = (plan.problems || []).filter(
    (problem) => problem.code !== 'RIGA_NON_RICONOSCIUTA' && !problem.card
  );
  if (otherProblems.length) {
    lines.push('', 'ALTRI PROBLEMI');
    for (const problem of otherProblems) {
      lines.push(`- ${problem.message}`);
    }
  }

  const warnings = plan.warnings || [];
  if (warnings.length) {
    lines.push('', 'AVVISI');
    for (const warning of warnings) {
      lines.push(
        `- ${warning.card ? `${warning.card}: ` : ''}${warning.message}`
      );
    }
  }

  lines.push('', 'CARRELLO');
  if (!cartResult) {
    lines.push('Anteprima non ancora aggiunta al carrello.');
  } else {
    lines.push(
      `Aggiunte riuscite: ${cartResult.added.length} righe, ${cartResult.totalAddedQuantity} copie.`
    );
    if (cartResult.totalAddedCents > 0) {
      const currency = cartResult.added[0]?.currency || 'EUR';
      lines.push(
        `Totale aggiunto (anteprima): ${formatPrice(cartResult.totalAddedCents, currency)}`
      );
    }
    if (cartResult.failed.length) {
      lines.push('Errori:');
      for (const failure of cartResult.failed) {
        lines.push(
          `- ${failure.entryName}: ${failure.quantity} copie — ${failure.message}`
        );
      }
    }
    if (cartResult.notAttempted.length) {
      lines.push(
        `Non tentate per interruzione: ${cartResult.notAttempted.length} righe.`
      );
    }
  }

  lines.push(
    '',
    'Nessun acquisto è stato effettuato. Verifica sempre il carrello su CardTrader.'
  );

  return lines.join('\n');
}
