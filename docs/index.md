---
layout: default
title: Privacy Policy — CardTrader Deck Cart
description: Informativa sul trattamento dei dati personali dell'estensione Chrome CardTrader Deck Cart.
---

# Informativa sulla privacy — CardTrader Deck Cart

**Ultimo aggiornamento:** 15 novembre 2026  
**Versione dell'estensione:** 1.0.0

La presente informativa descrive come l'estensione Chrome **CardTrader Deck Cart** (di seguito “Estensione”) tratta i dati personali dell'utente. L'Estensione non è affiliata a CardTrader.

## In breve

- L'Estensione **non ha un server dell'autore**, non usa analytics, telemetria, pubblicità o profilazione e **non vende dati**.
- Token API, indirizzi, lista del mazzo e preferenze sono salvati **localmente** in `chrome.storage.local`, nel profilo Chrome dell'utente.
- Per funzionare, l'Estensione invia a **CardTrader** (`api.cardtrader.com`) solo i dati necessari alla ricerca delle offerte e all'aggiunta al carrello.
- **Nessun dato di pagamento** viene trattato dall'Estensione: l'acquisto, se effettuato, avviene sul sito CardTrader.
- Lo sviluppatore **non riceve automaticamente** token, indirizzi o lista del mazzo.

## Titolare del trattamento e contatti

Il titolare del trattamento è lo sviluppatore indipendente dell'Estensione, identificato su GitHub come **Dante4566789**.

- Repository: <https://github.com/Dante4566789/YourDeckTrader>
- Contatti e richieste: <https://github.com/Dante4566789/YourDeckTrader/issues>

Per le richieste privacy, non inserire token, indirizzi o altri dati personali in una issue pubblica: apri una issue chiedendo un canale privato. Se la scheda Chrome Web Store indica un recapito privacy dedicato, usa quello.

CardTrader è un servizio di terze parti. Per il trattamento dei dati che riceve tramite la propria API, consulta l'informativa privacy pubblicata sul sito <https://www.cardtrader.com/>.

## Ambito

Questa informativa riguarda:

- l'Estensione Chrome **CardTrader Deck Cart**, versione 1.0.0, Manifest V3;
- la presente pagina pubblicata tramite GitHub Pages.

Non riguarda i siti, i servizi o le app di terze parti, inclusi CardTrader, GitHub, Google e Chrome Web Store.

## Dati trattati

| Dato | Esempi | Dove viene conservato | Trasmesso a |
|---|---|---|---|
| Token API CardTrader | token personale usato per autenticare le chiamate | `chrome.storage.local` (`ctdc.settings`) | CardTrader, nell'header `Authorization` di ogni chiamata API |
| Indirizzo di fatturazione e spedizione | nome e cognome, via e numero civico, CAP, città, provincia/stato, paese | `chrome.storage.local` (`ctdc.settings`) | CardTrader, nel corpo di `/cart/add` |
| Lista del mazzo | nomi delle carte, codici espansione, numeri di stampa, quantità | `chrome.storage.local` (`ctdc.draft`) | CardTrader, come singole ricerche di carte/blueprint; il testo completo della lista non viene inviato in un'unica richiesta |
| Preferenze di ricerca | lingua, condizione minima, mapping delle espansioni | `chrome.storage.local` (`ctdc.settings`) | CardTrader, per la lingua nella ricerca marketplace; i mapping restano locali |
| Dati di offerte e carrello | ID prodotto, quantità, prezzo, valuta, condizione, nome venditore, paese del venditore | memoria dell'Estensione, interfaccia e report | CardTrader, con ID prodotto e quantità in `/cart/add`; nessun dato di pagamento |
| Cache di dati pubblici CardTrader | giochi, espansioni, blueprint | `chrome.storage.local` (`ctdc.cache.*`) | resta locale; gli ID necessari vengono usati nelle chiamate a CardTrader |
| Report copiabile | carte, prezzi, venditori, problemi e avvisi dell'anteprima | memoria dell'Estensione e appunti, solo su azione dell'utente | non viene inviato automaticamente a nessuno; l'utente decide se copiarlo o condividerlo |

Il report è generato localmente e non include intenzionalmente token o indirizzi; può includere messaggi restituiti dall'API. Controllalo prima di condividerlo.

### Dati di terzi mostrati dall'Estensione

L'Estensione mostra dati pubblici del marketplace CardTrader, come username del venditore, paese, condizione e prezzo. Questi dati riguardano venditori terzi e sono visualizzati o inclusi nel report su richiesta dell'utente; non sono dati raccolti dall'utente dell'Estensione.

## Dati non trattati

L'Estensione **non** raccoglie o tratta:

- dati di pagamento, numeri di carta, IBAN o credenziali bancarie;
- cronologia di navigazione, cronologia delle ricerche web o contenuti di altri siti;
- cookie propri o di profilazione;
- posizione, contatti, calendario, salute, dati biometrici o dati relativi a categorie particolari;
- battiture, contenuto degli appunti in lettura o telemetria d'uso;
- identificatori pubblicitari, analytics, crash report o dati di tracciamento;
- dati per profilazione, pubblicità, vendita a terzi o valutazione creditizia.

L'Estensione **non legge** gli appunti: li usa solo per **scrivere** il report quando l'utente preme “Copia report”.

## Finalità e basi giuridiche

I dati sono trattati per:

1. **autenticare l'utente** presso CardTrader tramite il token API;
2. **cercare le carte e le offerte** CardTrader Zero;
3. **mostrare l'anteprima** di prezzi, disponibilità e venditori;
4. **aggiungere al carrello** i prodotti confermati, con gli indirizzi forniti dall'utente;
5. **ricordare le preferenze** e la lista del mazzo nel profilo Chrome;
6. **generare il report** richiesto dall'utente.

Ove si applica il GDPR, la base giuridica è l'esecuzione del servizio richiesto dall'utente (art. 6, par. 1, lett. b) e, se necessario, l'adempimento di obblighi legali. Non viene svolta attività di marketing, profilazione o decisione automatizzata. Eventuali trattamenti opzionali futuri saranno attivati solo con una base giuridica adeguata e con un aggiornamento della presente informativa.

## Destinatari e condivisione

I dati possono essere comunicati esclusivamente a:

- **CardTrader**, tramite `https://api.cardtrader.com/api/v2`, per autenticazione, ricerca offerte e aggiunta al carrello; CardTrader tratta i dati ricevuti secondo la propria informativa privacy;
- **GitHub Pages**, che ospita questa pagina e può trattare dati tecnici di navigazione (ad esempio indirizzo IP e user agent) secondo la propria informativa;
- **Chrome Web Store / Google**, in quanto piattaforma di distribuzione e aggiornamento dell'Estensione, secondo le proprie politiche.

Non ci sono altri destinatari. I dati **non vengono venduti**, non vengono usati per pubblicità e non vengono condivisi con altri siti o servizi.

## Trasferimenti internazionali

Le chiamate a CardTrader avvengono su HTTPS. CardTrader, GitHub e Google possono trattare dati anche fuori dallo Spazio Economico Europeo secondo le proprie garanzie e informative. Lo sviluppatore non gestisce un server proprio e non riceve direttamente token, indirizzi o lista del mazzo.

## Conservazione

- **Token, indirizzi, lista del mazzo e preferenze:** restano in `chrome.storage.local` finché l'utente non li sovrascrive, cancella i dati dell'Estensione o rimuove l'Estensione dal profilo Chrome. Non esiste una scadenza automatica.
- **Cache di giochi, espansioni e blueprint:** ha una durata tecnica di 12–24 ore ed è soggetta a pulizia; può essere svuotata dalle opzioni dell'Estensione.
- **Risposta del carrello:** può essere conservata solo in memoria durante la sessione della pagina e viene persa alla chiusura; può includere i dati dell'indirizzo usati per l'aggiunta.
- **Report:** resta in memoria e, se l'utente lo copia, negli appunti del dispositivo; non viene conservato su un server dell'Estensione.
- **CardTrader, GitHub e Google:** conservano i dati secondo le rispettive informative.

## Sicurezza

- Le chiamate API usano **HTTPS**.
- Il token viaggia solo nell'header `Authorization`; non viene inserito nell'URL, nei report o nei messaggi di errore dell'Estensione.
- Le chiamate usano `credentials: 'omit'` e non inviano cookie.
- Token e indirizzi sono memorizzati **in chiaro** in `chrome.storage.local`; l'Estensione non applica una cifratura aggiuntiva. Sono protetti dalle difese del profilo Chrome e del sistema operativo.
- Il token è una credenziale: non condividerlo e, se il profilo Chrome o il dispositivo viene compromesso, revocalo dalle impostazioni CardTrader.
- L'Estensione **non effettua acquisti**: aggiunge prodotti al carrello. L'utente deve sempre verificare il carrello su CardTrader.

## Diritti dell'interessato

Nei casi previsti dalla legge, l'utente può chiedere:

- accesso, rettifica o cancellazione dei dati;
- limitazione o opposizione al trattamento;
- portabilità dei dati, ove applicabile;
- revoca del consenso, ove il trattamento si basi sul consenso;
- reclamo all'autorità di controllo competente (in Italia, il Garante per la protezione dei dati personali: <https://www.garanteprivacy.it/>).

Per i dati locali, l'utente può:

- sovrascrivere o rimuovere token e indirizzi dalle opzioni dell'Estensione;
- svuotare la cache dalle opzioni;
- rimuovere l'Estensione dal profilo Chrome per cancellare i dati locali associati;
- cancellare il report dagli appunti o dal documento in cui lo ha incollato.

Per i dati trattati da CardTrader, la richiesta va rivolta a CardTrader secondo la sua informativa. Per i dati eventualmente inviati allo sviluppatore tramite GitHub, usa il contatto indicato sopra.

## Minori

L'Estensione non è destinata a minori e non raccoglie consapevolmente dati di minori. Se un minore ha fornito dati tramite l'Estensione o tramite un contatto, il titolare provvederà alla cancellazione su richiesta.

## Cookie e tecnologie simili

L'Estensione non usa cookie propri, `localStorage`, `sessionStorage` o tecnologie di profilazione. Usa esclusivamente `chrome.storage.local` per le funzioni descritte e invia le chiamate API senza credenziali cookie. La pagina GitHub Pages e i siti di CardTrader, GitHub e Google possono usare cookie o tecnologie proprie secondo le rispettive informative.

## Hosting della presente pagina

Questa informativa è pubblicata tramite **GitHub Pages**. GitHub può registrare dati tecnici relativi alle visite alla pagina (ad esempio indirizzo IP, user agent, data e ora) per fornire e proteggere il servizio, secondo la GitHub Privacy Statement: <https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement>. Lo sviluppatore non usa questi dati per profilazione o marketing.

## Modifiche

La presente informativa può essere aggiornata per riflettere modifiche all'Estensione, alla legge o ai servizi utilizzati. La data di ultimo aggiornamento è indicata in cima alla pagina. Le modifiche sostanziali saranno pubblicate su questa pagina e, se necessario, segnalate tramite l'aggiornamento dell'Estensione o il repository GitHub.

## Dichiarazioni per la scheda Privacy practices di Chrome Web Store

| Categoria / dichiarazione | Risposta |
|---|---|
| Authentication information | **Sì** — token API CardTrader, usato per autenticare le chiamate a CardTrader |
| Personally identifiable information | **Sì** — nome e indirizzo di fatturazione/spedizione, usati per `/cart/add` |
| User-generated content | **Sì** — lista del mazzo e preferenze, salvate localmente; i dati delle singole carte sono inviati a CardTrader per la ricerca |
| Financial and payment information | **No** — nessun dato di pagamento; prezzi e carrello sono solo visualizzati |
| Health information | **No** |
| Location | **No** |
| Web history | **No** |
| User activity / analytics | **No** — nessun analytics o telemetria |
| Website content | **No** |
| Data sold to third parties | **No** |
| Data used for advertising | **No** |
| Data used for creditworthiness or lending | **No** |
| Data transferred off-device | **Sì** — a CardTrader per le funzioni richieste |
| Data encrypted in transit | **Sì** — HTTPS |
| Privacy policy URL | questa pagina |

## English summary

This is the privacy policy for the **CardTrader Deck Cart** Chrome extension. The developer does not operate a server, analytics, advertising, or data sale. The extension stores the CardTrader API token, billing/shipping addresses, deck list, preferences, and a public reference cache locally in `chrome.storage.local`. It sends to `api.cardtrader.com` only the data needed to search offers and add items to the cart: the token in the `Authorization` header, card/blueprint queries, language, product IDs, quantities, and addresses for `/cart/add`. No payment data is processed. The Italian version prevails.

## Contatti

Per domande sulla presente informativa o per esercitare i diritti privacy:

- GitHub: <https://github.com/Dante4566789/YourDeckTrader/issues>
- Non pubblicare token, indirizzi o altri dati personali in una issue pubblica; chiedi prima un canale privato.
- Per i dati trattati da CardTrader, usa i contatti indicati sul sito CardTrader.
