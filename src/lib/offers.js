import {
  canonicalCondition,
  conditionRank,
  meetsMinimumCondition,
} from './conditions.js';
import {
  normalizeLanguageCode,
  normalizeName,
} from './normalize.js';

const PROBLEM = Object.freeze({
  NESSUNA_OFFERTA_ZERO: 'NESSUNA_OFFERTA_ZERO',
  NESSUNA_OFFERTA_ZERO_ITALIA: 'NESSUNA_OFFERTA_ZERO_ITALIA',
  NESSUNA_OFFERTA_VALIDA: 'NESSUNA_OFFERTA_VALIDA',
  QUANTITA_INSUFFICIENTE: 'QUANTITA_INSUFFICIENTE',
  VALUTE_MISTE: 'VALUTE_MISTE',
  DATI_NON_DISPONIBILI: 'DATI_NON_DISPONIBILI',
});

const COUNTRY_LABELS = Object.freeze({
  IT: 'Italia',
});

const CONDITION_PATTERN = /condition/i;
const LANGUAGE_PATTERN = /lang/i;
const FOIL_PATTERN = /foil|holo|reverse/i;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCurrency(value) {
  const currency = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : '';
}

function readPath(object, path) {
  if (!path) return undefined;
  return path.split('.').reduce((value, key) => {
    if (!isPlainObject(value) && !Array.isArray(value)) return undefined;
    return value[key];
  }, object);
}

function unique(objects, pick) {
  const values = new Set();
  for (const object of objects) {
    const target = pick(object);
    if (isPlainObject(target)) {
      Object.keys(target).forEach((key) => values.add(key));
    }
  }
  return [...values];
}

function preferredField(keys, preferred, pattern) {
  for (const candidate of preferred) {
    if (keys.includes(candidate)) return candidate;
  }
  return keys.filter((key) => pattern.test(key)).sort()[0] || null;
}

/**
 * Rileva i nomi reali dei campi usati dalla risposta marketplace.
 * I nomi delle proprietà cambiano per gioco: per Pokémon non si può
 * assumere "language" o "foil" a livello superiore.
 */
export function detectOfferSchema(offers) {
  const list = Array.isArray(offers) ? offers : [];
  const topKeys = unique(list, (offer) => offer);
  const propertyKeys = unique(list, (offer) => offer?.properties_hash);

  const conditionTop = preferredField(
    topKeys,
    ['condition', 'condition_name', 'card_condition'],
    CONDITION_PATTERN
  );
  const conditionProperty = preferredField(
    propertyKeys,
    ['condition', 'card_condition'],
    CONDITION_PATTERN
  );

  const languageTop = preferredField(
    topKeys,
    ['language', 'lang', 'language_code', 'card_language'],
    LANGUAGE_PATTERN
  );
  const languageProperty = preferredField(
    propertyKeys,
    ['language', 'lang', 'language_code', 'card_language'],
    LANGUAGE_PATTERN
  );

  const foilTop = topKeys
    .filter((key) => FOIL_PATTERN.test(key))
    .map((key) => key);
  const foilProperties = propertyKeys
    .filter((key) => FOIL_PATTERN.test(key))
    .map((key) => `properties_hash.${key}`);

  const hasPriceObject = list.some((offer) => isPlainObject(offer?.price));
  const hasPriceCents = list.some(
    (offer) => offer?.price_cents !== undefined && offer?.price_cents !== null
  );

  return {
    conditionField: conditionTop || (conditionProperty ? `properties_hash.${conditionProperty}` : null),
    languageField: languageTop || (languageProperty ? `properties_hash.${languageProperty}` : null),
    foilFields: [...foilTop, ...foilProperties],
    priceFormat: hasPriceObject ? 'price' : hasPriceCents ? 'price_cents' : null,
    hubField: list.some((offer) => isPlainObject(offer?.user) && 'can_sell_via_hub' in offer.user)
      ? 'user.can_sell_via_hub'
      : null,
  };
}

/**
 * La risposta di /marketplace/products è un oggetto con l'ID blueprint come
 * chiave. Se la chiave manca usiamo tutti gli array presenti, senza trattare
 * la risposta intera come un elenco.
 */
export function extractMarketplaceOffers(payload, blueprintId) {
  if (Array.isArray(payload)) return payload;
  if (!isPlainObject(payload)) return [];

  const key = String(blueprintId);
  if (Array.isArray(payload[key])) return payload[key];

  return Object.values(payload)
    .flat()
    .filter((offer) => isPlainObject(offer));
}

export function readOfferPrice(offer) {
  if (isPlainObject(offer?.price)) {
    const cents = asNumber(offer.price.cents);
    if (cents !== null) {
      return { cents, currency: normalizeCurrency(offer.price.currency) };
    }
  }

  const cents = asNumber(offer?.price_cents);
  if (cents !== null) {
    return {
      cents,
      currency: normalizeCurrency(offer?.price_currency ?? offer?.currency),
    };
  }

  return null;
}

function markerState(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const key = normalizeName(value);
  if (!key) return null;

  if (
    key === 'false' ||
    key === 'no' ||
    key === 'none' ||
    key === 'normal' ||
    key === 'nonfoil' ||
    key === 'non foil' ||
    key === 'regular'
  ) {
    return false;
  }
  if (
    key === 'true' ||
    key === 'yes' ||
    key === 'si' ||
    key === 'foil' ||
    key === 'holo' ||
    key === 'holofoil' ||
    key === 'reverse' ||
    key === 'reverseholo' ||
    key === 'reverse holo'
  ) {
    return true;
  }
  if (key.startsWith('non')) return false;
  if (key.includes('reverse') || key.includes('holo') || key.includes('foil')) {
    return true;
  }
  return null;
}

function readFoilState(offer, foilFields) {
  const states = foilFields
    .map((field) => markerState(readPath(offer, field)))
    .filter((state) => state !== null);

  if (states.includes(true)) return true;
  if (states.includes(false)) return false;
  return null;
}

export function normalizeOffer(offer, schema = detectOfferSchema([offer])) {
  const price = readOfferPrice(offer);
  const conditionRaw = schema.conditionField
    ? readPath(offer, schema.conditionField)
    : null;
  const languageRaw = schema.languageField
    ? readPath(offer, schema.languageField)
    : null;
  const seller = isPlainObject(offer?.user) ? offer.user : {};

  return {
    productId: asNumber(offer?.id),
    blueprintId: asNumber(offer?.blueprint_id),
    quantity: asNumber(offer?.quantity),
    priceCents: price ? price.cents : null,
    currency: price ? price.currency : '',
    conditionRaw: conditionRaw === undefined ? null : conditionRaw,
    condition: canonicalCondition(conditionRaw),
    languageRaw: languageRaw === undefined ? null : languageRaw,
    language: normalizeLanguageCode(languageRaw),
    foil: readFoilState(offer, schema.foilFields),
    sellerId: asNumber(seller.id),
    seller: String(seller.username ?? '').trim(),
    countryCode: String(seller.country_code ?? '').trim().toUpperCase(),
    canSellViaHub: seller.can_sell_via_hub === true,
    onVacation: offer?.on_vacation === true,
    graded: offer?.graded === true,
    bundleSize: asNumber(offer?.bundle_size),
  };
}

function compareOffers(a, b) {
  if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents;
  const rankA = conditionRank(a.condition) ?? Number.MAX_SAFE_INTEGER;
  const rankB = conditionRank(b.condition) ?? Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;
  return (a.productId ?? Number.MAX_SAFE_INTEGER) - (b.productId ?? Number.MAX_SAFE_INTEGER);
}

function toCartItem(offer, quantity) {
  return {
    productId: offer.productId,
    blueprintId: offer.blueprintId,
    quantity,
    unitPriceCents: offer.priceCents,
    totalCents: offer.priceCents * quantity,
    currency: offer.currency,
    condition: offer.condition,
    conditionRaw: offer.conditionRaw,
    language: offer.language,
    seller: offer.seller,
    sellerCountry: offer.countryCode,
    foil: offer.foil,
  };
}

function countryLabel(code) {
  return COUNTRY_LABELS[code] || code;
}

/**
 * Conteggi richiesti: ricevute → Zero → Zero nel paese scelto.
 * Se nessuna offerta Zero è italiana, elenca i paesi disponibili.
 */
function zeroCountsMessage({ total, zero, zeroInCountry, country, countries }) {
  let message = `${total} offerte, ${zero} Zero, ${zeroInCountry} Zero in ${countryLabel(country)}`;
  if (zero > 0 && zeroInCountry === 0 && countries.length) {
    message += ` (paesi con Zero: ${countries.join(', ')})`;
  }
  return message;
}

function exclusionSummary(excluded, total) {
  const parts = [];
  if (excluded.notZero) parts.push(`${excluded.notZero} non Zero`);
  if (excluded.country) parts.push(`${excluded.country} fuori dall'Italia`);
  if (excluded.vacation) parts.push(`${excluded.vacation} venditori in ferie`);
  if (excluded.graded) parts.push(`${excluded.graded} carte gradate`);
  if (excluded.bundle) parts.push(`${excluded.bundle} bundle non singoli`);
  if (excluded.foil) parts.push(`${excluded.foil} variante errata`);
  if (excluded.language) parts.push(`${excluded.language} altra lingua`);
  if (excluded.condition) parts.push(`${excluded.condition} sotto la condizione minima`);
  if (excluded.conditionUnknown) parts.push(`${excluded.conditionUnknown} senza condizione`);
  if (excluded.price) parts.push(`${excluded.price} senza prezzo valido`);
  if (excluded.quantity) parts.push(`${excluded.quantity} senza quantità valida`);
  if (excluded.productId) parts.push(`${excluded.productId} senza ID prodotto`);
  if (!parts.length) return `${total} offerte esaminate.`;
  return `${total} offerte esaminate: ${parts.join(', ')}.`;
}

/**
 * Filtra le offerte e sceglie una singola offerta se copre tutta la quantità,
 * altrimenti la combinazione più economica. Non chiama API e non modifica
 * il carrello.
 */
export function selectOffersForEntry(options) {
  const {
    offers,
    quantity,
    language = 'it',
    minCondition = 'Near Mint',
    countryCode = 'IT',
    finish = null,
  } = options || {};

  const requested = asNumber(quantity);
  if (!Number.isInteger(requested) || requested < 1) {
    throw new TypeError('La quantità richiesta deve essere un intero positivo.');
  }

  const requestedLanguage = normalizeLanguageCode(language);
  if (!requestedLanguage) {
    throw new TypeError('La lingua richiesta non è valida.');
  }

  const minimumCondition = canonicalCondition(minCondition);
  if (!minimumCondition) {
    throw new TypeError('La condizione minima non è valida.');
  }

  const requestedCountry = String(countryCode ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(requestedCountry)) {
    throw new TypeError('Il paese richiesto non è valido.');
  }

  const finishKey = String(finish ?? '').trim().toLowerCase();
  const requestedFinish =
    finishKey === 'holo' || finishKey === 'reverse' || finishKey === 'foil'
      ? 'holo'
      : finishKey === 'nonfoil' || finishKey === 'normal'
        ? 'nonfoil'
        : null;

  const rawOffers = Array.isArray(offers) ? offers : [];
  const schema = detectOfferSchema(rawOffers);
  const excluded = {
    notZero: 0,
    country: 0,
    vacation: 0,
    graded: 0,
    bundle: 0,
    foil: 0,
    language: 0,
    condition: 0,
    conditionUnknown: 0,
    price: 0,
    quantity: 0,
    productId: 0,
  };
  let languageUnverified = 0;
  let foilUnverified = 0;
  let zeroOffers = 0;
  let zeroInCountryOffers = 0;
  const zeroCountries = new Set();
  const eligible = [];

  for (const raw of rawOffers) {
    const offer = normalizeOffer(raw, schema);

    if (!offer.canSellViaHub) {
      excluded.notZero += 1;
      continue;
    }

    zeroOffers += 1;
    if (offer.countryCode) zeroCountries.add(offer.countryCode);

    // Richiesta esplicita: solo venditori CardTrader Zero in Italia.
    if (offer.countryCode !== requestedCountry) {
      excluded.country += 1;
      continue;
    }
    zeroInCountryOffers += 1;

    // Campi documentati da /marketplace/products: un venditore in ferie non
    // può vendere, una carta gradata non è giocabile e un bundle non è una
    // singola copia. Scartarli evita aggiunte al carrello non volute.
    if (offer.onVacation) {
      excluded.vacation += 1;
      continue;
    }
    if (offer.graded) {
      excluded.graded += 1;
      continue;
    }
    if (offer.bundleSize !== null && offer.bundleSize !== 1) {
      excluded.bundle += 1;
      continue;
    }

    if (requestedFinish === 'holo') {
      // Holo/Reverse richiesto: scarta le copie normali; se la risposta non
      // espone il dato, l'offerta viene inclusa con un avviso.
      if (offer.foil === false) {
        excluded.foil += 1;
        continue;
      }
      if (offer.foil === null) foilUnverified += 1;
    } else {
      // Comportamento predefinito e richiesta non-foil: scarta holo/reverse.
      if (offer.foil === true) {
        excluded.foil += 1;
        continue;
      }
      if (offer.foil === null) foilUnverified += 1;
    }

    if (!schema.languageField) {
      languageUnverified += 1;
    } else if (!offer.language) {
      excluded.language += 1;
      languageUnverified += 1;
      continue;
    } else if (offer.language !== requestedLanguage) {
      excluded.language += 1;
      continue;
    }

    if (offer.priceCents === null || offer.priceCents < 0) {
      excluded.price += 1;
      continue;
    }
    if (!Number.isInteger(offer.quantity) || offer.quantity < 1) {
      excluded.quantity += 1;
      continue;
    }
    if (offer.productId === null || offer.productId <= 0) {
      excluded.productId += 1;
      continue;
    }
    if (!offer.condition) {
      excluded.conditionUnknown += 1;
      continue;
    }
    if (!meetsMinimumCondition(offer.condition, minimumCondition)) {
      excluded.condition += 1;
      continue;
    }

    eligible.push(offer);
  }

  const zeroCountryList = [...zeroCountries].sort();
  const counts = {
    total: rawOffers.length,
    zero: zeroOffers,
    zeroInCountry: zeroInCountryOffers,
    country: requestedCountry,
    zeroCountries: zeroCountryList,
  };
  const countsMessage = zeroCountsMessage({
    total: rawOffers.length,
    zero: zeroOffers,
    zeroInCountry: zeroInCountryOffers,
    country: requestedCountry,
    countries: zeroCountryList,
  });

  const diagnostics = {
    schema,
    totalOffers: rawOffers.length,
    zeroOffers,
    zeroInCountryOffers,
    zeroCountries: zeroCountryList,
    eligibleOffers: eligible.length,
    excluded,
    language: {
      field: schema.languageField,
      serverFiltered: !schema.languageField,
      unverifiedOffers: languageUnverified,
      verified: Boolean(schema.languageField) && languageUnverified === 0,
    },
    foil: {
      fields: schema.foilFields,
      // Il parametro server foil=false svuota la risposta: il filtro è solo
      // lato client, quindi non è mai "serverFiltered".
      serverFiltered: false,
      requested: requestedFinish,
      unverifiedOffers: foilUnverified,
      verified: schema.foilFields.length > 0 && foilUnverified === 0,
    },
  };

  const warnings = [];
  if (!schema.languageField) {
    warnings.push({
      code: PROBLEM.DATI_NON_DISPONIBILI,
      message:
        'La risposta non espone la lingua delle offerte: il filtro è stato applicato solo lato server.',
    });
  }
  if (!schema.foilFields.length) {
    warnings.push({
      code: PROBLEM.DATI_NON_DISPONIBILI,
      message:
        requestedFinish === 'holo'
          ? 'La risposta non espone holo/reverse: non è possibile verificare la variante, ma il blueprint identifica già la carta Holo.'
          : 'La risposta non espone foil/reverse: non è possibile verificare che le offerte non siano foil.',
    });
  } else if (foilUnverified > 0) {
    warnings.push({
      code: PROBLEM.DATI_NON_DISPONIBILI,
      message: `${foilUnverified} offerte non indicano chiaramente la variante holo/reverse e sono state incluse.`,
    });
  }
  if (!schema.conditionField) {
    warnings.push({
      code: PROBLEM.DATI_NON_DISPONIBILI,
      message:
        'La risposta non espone la condizione: nessuna offerta può essere verificata.',
    });
  }

  const base = {
    requestedQuantity: requested,
    strategy: null,
    items: [],
    partialItems: [],
    coveredQuantity: 0,
    totalCents: 0,
    currency: '',
    problems: [],
    warnings,
    diagnostics,
  };

  if (!rawOffers.length) {
    return {
      ...base,
      status: 'unavailable',
      problems: [
        {
          code: PROBLEM.NESSUNA_OFFERTA_ZERO,
          message: `Nessuna offerta restituita da CardTrader per questa carta (${countsMessage}).`,
        },
      ],
    };
  }

  if (!eligible.length) {
    if (zeroInCountryOffers === 0) {
      return {
        ...base,
        status: 'unavailable',
        problems: [
          {
            code:
              zeroOffers === 0
                ? PROBLEM.NESSUNA_OFFERTA_ZERO
                : PROBLEM.NESSUNA_OFFERTA_ZERO_ITALIA,
            message:
              zeroOffers === 0
                ? `Nessuna offerta CardTrader Zero per questa carta (${countsMessage}).`
                : `Nessuna offerta CardTrader Zero in ${countryLabel(requestedCountry)} (${countsMessage}).`,
          },
        ],
      };
    }

    return {
      ...base,
      status: 'unavailable',
      problems: [
        {
          code: PROBLEM.NESSUNA_OFFERTA_VALIDA,
          message: `Nessuna offerta CardTrader Zero in ${countryLabel(requestedCountry)} valida per lingua ${requestedLanguage} e condizione ${minimumCondition} (${countsMessage}). ${exclusionSummary(excluded, rawOffers.length)}`,
        },
      ],
    };
  }

  const currencies = [...new Set(eligible.map((offer) => offer.currency).filter(Boolean))];
  const missingCurrency = eligible.some((offer) => !offer.currency);
  if (currencies.length > 1 || missingCurrency) {
    return {
      ...base,
      status: 'unavailable',
      problems: [
        {
          code: PROBLEM.VALUTE_MISTE,
          message: `Le offerte non hanno una valuta unica (${currencies.join(', ') || 'valuta assente'}): totale non calcolabile.`,
        },
      ],
    };
  }

  const currency = currencies[0] || '';
  const sorted = [...eligible].sort(compareOffers);
  const singlePool = sorted.filter((offer) => offer.quantity >= requested);

  if (singlePool.length) {
    const chosen = singlePool[0];
    const item = toCartItem(chosen, requested);
    return {
      ...base,
      status: 'ok',
      strategy: 'single',
      items: [item],
      coveredQuantity: requested,
      totalCents: item.totalCents,
      currency,
    };
  }

  const partialItems = [];
  let remaining = requested;
  for (const offer of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(offer.quantity, remaining);
    partialItems.push(toCartItem(offer, take));
    remaining -= take;
  }

  if (remaining > 0) {
    return {
      ...base,
      status: 'insufficient',
      strategy: 'split',
      partialItems,
      coveredQuantity: requested - remaining,
      problems: [
        {
          code: PROBLEM.QUANTITA_INSUFFICIENTE,
          message: `Disponibili ${requested - remaining} copie su ${requested} con le offerte CardTrader Zero selezionate.`,
        },
      ],
    };
  }

  const items = partialItems;
  const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  return {
    ...base,
    status: 'ok',
    strategy: 'split',
    items,
    partialItems: items,
    coveredQuantity: requested,
    totalCents,
    currency,
  };
}
