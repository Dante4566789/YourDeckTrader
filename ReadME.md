# CardTrader Deck Cart

Estensione Chrome (Manifest V3) per trasformare una lista mazzo Pokémon TCG Live in
un'anteprima delle migliori offerte **CardTrader Zero** e, solo dopo conferma esplicita,
aggiungerle al carrello CardTrader.

L'estensione **non acquista mai**: non chiama l'endpoint di acquisto e non gestisce
pagamenti. L'utente deve sempre verificare il carrello sul sito CardTrader.

## Sicurezza e privacy

- Permessi richiesti: solo `storage`.
- Host autorizzato: solo `https://api.cardtrader.com/*`.
- Token e indirizzi sono salvati in `chrome.storage.local`.
- Il token viaggia solo nell'header `Authorization` verso `api.cardtrader.com`; non viene
  scritto nei report, nei log o nell'URL.
- Il campo `shared_secret` restituito da `/info` viene scartato dal client.
- `cart/add` viene chiamato sempre con `via_cardtrader_zero: true`.
- Il report copiabile non contiene token né indirizzi.
- Privacy Policy completa: [`docs/index.md`](docs/index.md), pubblicabile tramite GitHub Pages.

## Requisiti

- Chrome 116 o successivo.
- Un account CardTrader con token API.
- Node.js 20 o successivo solo per eseguire i test; l'estensione non ha dipendenze npm.

## Installazione in Chrome

1. Scarica o clona questa cartella.
2. Apri `chrome://extensions`.
3. Attiva **Modalità sviluppatore** in alto a destra.
4. Premi **Carica estensione non pacchettizzata**.
5. Seleziona la cartella che contiene `manifest.json`.
6. Facoltativamente, fissa l'estensione nella barra degli strumenti.

Per aggiornare il codice dopo una modifica, premi **Aggiorna** nella scheda
dell'estensione e riapri il popup.

## Configurazione

Apri **Opzioni** dal popup o dalla scheda dell'estensione.

1. **Token API CardTrader**: incollalo dal profilo CardTrader e premi **Verifica token**.
2. **Lingua**: lingua delle carte da cercare (predefinita: italiano).
3. **Condizione minima**: le condizioni migliori sono sempre accettate. L'ordine è
   `Mint > Near Mint > Slightly Played > Moderately Played > Played > Heavily Played > Poor`.
4. **Indirizzi**: fatturazione e, se diversa, spedizione. CardTrader richiede entrambi a
   ogni aggiunta al carrello.
5. **Mapping espansioni**: solo se il codice del mazzo non coincide con quello CardTrader.
6. Premi **Salva impostazioni**.

La riga precompilata `MEG → Mega Evolution` è un fallback dichiarato **non verificato**
contro l'API. Il codice esatto CardTrader ha sempre la precedenza; se il codice o il nome
sono diversi, modificare o rimuovere la riga.

## Uso

1. Apri il popup.
2. Incolla la lista mazzo Pokémon TCG Live.
3. Premi **Calcola anteprima**.
4. Controlla:
   - riepilogo e totale delle offerte selezionate;
   - righe pronte e righe con problemi;
   - eventuale badge **Quantità divisa su più venditori**;
   - avvisi sui campi API non rilevati.
5. Se l'anteprima è corretta, premi **Aggiungi al carrello** e conferma.
6. Apri CardTrader e verifica il carrello. L'acquisto resta un'azione manuale.

**Apri in scheda** è consigliato per i mazzi grandi: il popup si chiude quando perde il
focus, mentre la scheda continua l'analisi. Le chiamate marketplace sono limitate a circa
una al secondo, quindi un mazzo con molte carte uniche richiede tempo.

**Copia report** copia un riepilogo testuale con prezzi, problemi, avvisi ed esito del
carrello, senza token o indirizzi.

### Formato della lista

```text
4 Lillie's Determination MEG 119
2 Charizard ex OBF 125
1 Iron Leaves ex TEF 025/162
```

Formato per riga: `<quantità> <nome carta> <codice espansione> <numero di stampa>`.

- Il numero di stampa è quello impresso sulla carta, non l'ID blueprint CardTrader.
- Gli zeri iniziali e il suffisso `/162` vengono ignorati nel confronto.
- Intestazioni di sezione (`Pokémon: 25`, `Trainer: 28`, `Trainers: 28`, `Energy: 7`,
  `Allenatori: 28`, `Energia: 7`, `Total Cards`, `Totale Carte`), righe vuote e
  decorazioni PTCGO vengono ignorate automaticamente, anche con accenti decomposti,
  bullet o emoji iniziali.
- Le energie base senza set (es. `4 Basic Fire Energy`) finiscono nei problemi, come le
  altre righe incomplete.

## Come vengono scelte le offerte

Per ogni carta:

1. Il codice espansione viene risolto prima per codice esatto, poi tramite i mapping.
2. Il blueprint viene cercato per nome e numero di stampa. Prima si prova il nome esatto;
   se non c'è, si cercano nomi con prefisso, contenimento o similarità (es. la lista
   contiene `Boss's Orders` e CardTrader ha `Boss's Orders - Ghetsis`). Il numero di
   stampa resta obbligatorio e la scelta approssimativa produce l'avviso
   **NOME_APPROSSIMATIVO**. Se il numero non è disponibile nei dati CardTrader, la riga è
   segnalata; non viene fatto un fallback per solo nome.
3. Le offerte sono filtrate per:
   - `user.can_sell_via_hub === true` (CardTrader Zero);
   - `user.country_code` uguale a `IT` (confronto senza distinzione tra maiuscole e
     minuscole). I venditori esteri non vengono usati;
   - venditore non in ferie (`on_vacation` assente o `false`);
   - carte non gradate e bundle non singoli (`bundle_size` assente o `1`);
   - lingua richiesta;
   - condizione uguale o migliore della minima;
   - esclusione di foil e reverse holo;
   - prezzo e quantità validi.
4. Le offerte sono ordinate per `price.cents` crescente. Se un'unica offerta copre la
   quantità richiesta, si sceglie la prima di queste (a parità di prezzo, la condizione
   migliore).
5. Altrimenti si combinano le offerte più economiche. La riga viene marcata
   **Quantità divisa su più venditori**.
6. Se la quantità totale non basta, la riga non è aggiungibile e il motivo compare nel
   report.

I conteggi di ogni passaggio sono nel report e nei messaggi di problema:
`156 offerte, 74 Zero, 33 Zero in Italia`. Se non ci sono offerte Zero italiane, il
messaggio elenca i paesi in cui sono disponibili le offerte Zero.

### Carte Holo ed energie

CardTrader rappresenta la finitura in due modi:

- parole nel nome o nella versione del blueprint (`Holo`, `Reverse Holo`,
  `Cosmos Holo`, `Cracked Ice Holo`, ...);
- proprietà booleana `properties_hash.pokemon_reverse` sulle singole offerte.

L'estensione riconosce entrambi. Se la riga contiene `Holo` o `Reverse Holo`, preferisce
il blueprint con quella finitura e, quando il blueprint contiene sia copie normali sia
reverse, scarta le copie normali. Senza richiesta esplicita continua a preferire la
versione base non foil.

Le energie sono un caso particolare. TCG Live può esportare 16 varianti (per esempio
`MEE 001`-`MEE 016`), mentre CardTrader può distribuirle in espansioni diverse:

- `Basic Psychic Energy` `MEE 005` nell'espansione *Mega Evolution Energies*;
- `Basic Psychic Energy` `Holo | MEE 013` nell'espansione *30th Celebration*
  (blueprint 409562).

L'estensione cerca quindi il blueprint anche fuori dal set indicato, usando la ricerca
globale `GET /blueprints?name=...` e verificando che la versione contenga lo stesso set e
numero (`MEE 013`). Se lo trova, usa il blueprint corretto e mostra l'avviso
**BLUEPRINT_IN_ALTRA_ESPANSIONE**. Solo se la ricerca globale non trova nulla usa il
fallback per nome nell'espansione scelta, con avviso **NUMERO_STAMPA_APPROSSIMATIVO**.
Esempio verificato:

```text
1 Psychic Energy MEE 13
→ Basic Psychic Energy, Holo | MEE 013, blueprint 409562
→ espansione 30th Celebration
→ offerta italiana CardTrader Zero da €0,11
```

Quando il blueprint dichiara già `Holo` nella versione, tutte le sue offerte sono Holo e
non vengono filtrate per `pokemon_reverse`; il filtro serve solo per i blueprint ambigui
che contengono sia copie normali sia reverse.

La risposta marketplace di CardTrader contiene al massimo le 25 offerte più economiche per
blueprint. Prezzi e disponibilità possono cambiare tra anteprima e aggiunta: eventuali
errori di `cart/add` vengono riportati e non bloccano le altre righe.

## Campi API e verifiche

La documentazione ufficiale
([CardTrader API reference](https://www.cardtrader.com/en-EU/docs/api/full/reference))
conferma che:

- `GET /games` **restituisce realmente** `{"array": [...]}` (verificato l'11 novembre 2026),
  anche se la reference dichiara un array. Gli oggetti `Game` hanno `id`, `name`,
  `display_name`; il client normalizza entrambe le forme con `asList`;
- `GET /expansions` restituisce un array con `id`, `game_id`, `code`, `name`;
- `GET /marketplace/products` restituisce un oggetto con l'ID blueprint come chiave e un
  array di prodotti; il prezzo è in `price.cents` / `price.currency`, il venditore è in
  `user` con `user.can_sell_via_hub` e `user.country_code`, le proprietà sono in
  `properties_hash`. Verificato sul blueprint reale 370830: 156 offerte, 74 Zero,
  33 Zero in Italia; il campione è in `tests/fixtures/offers-370830.json` e i campi
  corrispondono alla reference;
- `POST /cart/add` accetta `product_id`, `quantity`, `via_cardtrader_zero`,
  `billing_address` e `shipping_address`, con i campi dell'oggetto `Address`
  (`name`, `street`, `zip`, `city`, `state_or_province`, `country_code`).

La lingua e il foil Pokémon sono stati verificati sul campione reale: la risposta usa
`properties_hash.pokemon_language` e `properties_hash.pokemon_reverse` (oltre a
`pokemon_foil` e `pokemon_rarity` quando presenti). L'estensione rileva comunque i campi
a runtime con pattern (`condition`, `lang`, `foil|holo|reverse`) e mostra nel report quali
ha usato.

Se la risposta non espone la lingua o il foil:

- la lingua può essere filtrata lato server (`language=...`), mentre foil e reverse
  sono sempre filtrati lato client;
- l'anteprima mostra un avviso **Dati non disponibili**;
- il report riporta l'avviso.

Il parametro `foil=false` **non viene inviato**: sul blueprint 370830 l'API restituiva
156 offerte senza parametro e 0 offerte con `foil=false`, pur esistendo offerte non foil.
Il filtro foil/reverse è quindi applicato solo su `properties_hash`.

Allo stesso modo, il campo del numero di stampa viene cercato tra più candidati
(`fixed_properties.collector_number`, `card_number`, `number`, `version`, ecc.) e il campo
realmente usato è visibile nell'anteprima. `fixed_properties.collector_number` è presente
nei blueprint reali restituiti dall'API (esempi ufficiali/community), anche se non è
elencato esplicitamente nella reference. Se nessun campo è disponibile, la riga viene
segnalata come problema.

Se `GET https://api.cardtrader.com/api/v2/info` viene reindirizzato alla home page e
restituisce una pagina HTML, l'API è in manutenzione. L'estensione riconosce questo caso e
mostra **“CardTrader non è disponibile in questo momento…”** invece di **“Risposta
inattesa da /games”**. Per distinguere un problema di token da un'API in manutenzione
esegui:

```powershell
npm run check:api
```

Il comando è in sola lettura, non richiede token e non modifica nulla. Se `/games` risponde
con un JSON di forma diversa, l'estensione accetta sia l'array documentato sia
`{"array": [...]}`. Per qualsiasi altra forma l'errore riporta `Object.keys` e i primi 200
caratteri della risposta, mai il token. I test live restano predisposti ma richiedono
`CARDTRADER_TOKEN`.

## Sviluppo e test

```powershell
npm test
```

Esegue tutti i test Node senza dipendenze esterne. I moduli puri (parser, matcher,
selezione offerte, planner, report, coda) non usano `chrome.*`.

Per ispezionare la forma reale delle risposte e aggiornare i campioni:

```powershell
$env:CARDTRADER_TOKEN="il_tuo_token"
node scripts/inspect-api.mjs
```

Lo script salva `tests/fixtures/games.json` e `tests/fixtures/expansions.json`; i test in
`tests/as-list.test.js` verificano `asList` su quei campioni reali.

Per scaricare il campione marketplace usato dai test delle offerte:

```powershell
$env:CARDTRADER_TOKEN="il_tuo_token"
node -e "const fs=require('fs');(async()=>{const r=await fetch('https://api.cardtrader.com/api/v2/marketplace/products?blueprint_id=370830',{headers:{Authorization:'Bearer '+process.env.CARDTRADER_TOKEN,Accept:'application/json'}});fs.writeFileSync('tests/fixtures/offers-370830.json',JSON.stringify(await r.json(),null,2))})()"
```

I test in `tests/offers-marketplace.test.js` usano quel file e casi simulati (nessuna
offerta Zero, Zero non italiana, Zero italiana con quantità 1 e 4).

Diagnostica dell'API, senza token e in sola lettura:

```powershell
npm run check:api
```

Test live in sola lettura:

```powershell
$env:CARDTRADER_TOKEN="il_tuo_token"
npm run test:live
npm run probe:api
npm run inspect:api
```

`probe:api` stampa status HTTP, content-type e forma JSON di `/info`, `/games` e
`/expansions`, senza mostrare il token: è il comando da usare se compare ancora
**Risposta inattesa**.

I test live effettuano solo GET (`/info`, `/games`, `/expansions`). `cart/add` è testato
esclusivamente con `fetch` simulato. Senza `CARDTRADER_TOKEN` i test live vengono saltati.
Se `check:api` rileva HTML o un reindirizzamento alla home page, l'API è in manutenzione:
i test live vengono saltati con il motivo **API CardTrader in manutenzione** finché il
servizio non torna disponibile.

### Struttura principale

```text
manifest.json
popup.html / popup.js          flusso principale e anteprima
options.html / options.js      token, lingua, condizione, indirizzi, mapping
src/constants.js
src/lib/deck-parser.js         parsing lista PTCG Live
src/lib/matcher.js            espansioni, blueprint, numero di stampa
src/lib/reference-data.js     giochi/espansioni/blueprint con cache
src/lib/offers.js             filtri Zero e scelta singola/divisa
src/lib/planner.js            orchestrazione anteprima
src/lib/cart-runner.js        aggiunta al carrello solo dopo conferma
src/lib/report.js             report testuale
src/lib/api-client.js         unico accesso HTTP
src/lib/rate-scheduler.js     1,1 s marketplace + 200 richieste/10 s
tools/check-api.mjs           diagnostica manutenzione/token in sola lettura
tools/inspect-api.mjs          verifica campi reali in sola lettura
tests/                         test Node
```

## Risoluzione problemi

- **401 / token non valido**: rigenera il token nelle opzioni e verifica di nuovo.
- **403**: CardTrader può essere in manutenzione o negare l'accesso; riprova più tardi.
- **CardTrader non è disponibile / Risposta inattesa da /games**: l'API può essere in
  manutenzione e reindirizzare a una pagina HTML. Esegui `npm run check:api`: se la
  risposta è HTML, non rigenerare il token e riprova più tardi.
- **429**: la coda rallenta e ritenta una volta; se persiste, attendi.
- **Nessuna offerta Zero**: prova un'altra condizione minima o lingua, verifica il mapping.
- **Il popup si chiude**: usa **Apri in scheda**.
- **Errore su una riga del carrello**: l'offerta potrebbe non essere più disponibile.
  Controlla il carrello CardTrader; il pulsante di aggiunta viene disattivato dopo un
  tentativo per evitare duplicati. Ricalcola l'anteprima solo dopo aver verificato il
  carrello.
- **Campi lingua/foil non rilevati**: leggi gli avvisi; il filtro server-side resta attivo,
  ma verifica il carrello.

Il totale dell'anteprima somma solo le offerte selezionate: spedizione, commissioni
CardTrader Zero e altre voci del carrello possono modificare il totale finale.
