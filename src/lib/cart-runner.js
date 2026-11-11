export function collectCartItems(plan) {
  if (!plan || !Array.isArray(plan.entries)) return [];
  return plan.entries
    .filter((planned) => planned.status === 'ok' && planned.selection?.items?.length)
    .flatMap((planned) =>
      planned.selection.items.map((item) => ({
        ...item,
        entryName: planned.entry.name,
        lineNumber: planned.entry.lineNumber,
        setCode: planned.entry.setCode,
        printNumber: planned.entry.printNumber,
      }))
    );
}

/**
 * Aggiunge al carrello esclusivamente gli item dell'anteprima già confermata.
 * Non esiste alcun percorso che chiami un endpoint di acquisto.
 */
export async function addPlanToCart(options = {}) {
  const {
    plan,
    api,
    billingAddress,
    shippingAddress,
    onProgress,
    now = () => Date.now(),
  } = options;

  if (!api) throw new TypeError('addPlanToCart richiede un client API.');
  if (!billingAddress || !shippingAddress) {
    throw new TypeError('addPlanToCart richiede fatturazione e spedizione.');
  }

  const items = collectCartItems(plan);
  const startedAt = now();
  const result = {
    startedAt,
    attempted: 0,
    added: [],
    failed: [],
    notAttempted: [],
    totalRequestedQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAddedQuantity: 0,
    totalAddedCents: 0,
    lastCart: null,
  };

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (typeof onProgress === 'function') {
      try {
        onProgress({
          current: index + 1,
          total: items.length,
          message: `Aggiungo ${item.entryName} (${index + 1}/${items.length})…`,
        });
      } catch {
        // ignora errori della UI
      }
    }

    try {
      result.attempted += 1;
      const cart = await api.addToCart({
        productId: item.productId,
        quantity: item.quantity,
        billingAddress,
        shippingAddress,
      });
      result.lastCart = cart;
      result.added.push({
        productId: item.productId,
        quantity: item.quantity,
        totalCents: item.totalCents,
        currency: item.currency,
        condition: item.condition,
        seller: item.seller,
        entryName: item.entryName,
        lineNumber: item.lineNumber,
        setCode: item.setCode,
        printNumber: item.printNumber,
      });
      result.totalAddedQuantity += item.quantity;
      result.totalAddedCents += item.totalCents;
    } catch (error) {
      result.failed.push({
        productId: item.productId,
        quantity: item.quantity,
        entryName: item.entryName,
        lineNumber: item.lineNumber,
        code: error?.code || 'ERRORE_CARRELLO',
        status: error?.status || 0,
        message: error?.message || 'Aggiunta al carrello non riuscita.',
      });

      // Con token non valido ogni altra chiamata fallirebbe: fermati subito.
      if (error?.status === 401 || error?.status === 403) {
        result.notAttempted = items.slice(index + 1).map((pending) => ({
          productId: pending.productId,
          quantity: pending.quantity,
          entryName: pending.entryName,
          lineNumber: pending.lineNumber,
        }));
        break;
      }
    }
  }

  return {
    ...result,
    finishedAt: now(),
    ok: result.failed.length === 0 && result.notAttempted.length === 0,
  };
}
