# Crociata Nera · Guerre di clan

Webapp Angular per il clan **Crociata Nera** di Clash of Clans (tag `#2J8JVVCLC`).
Permette di consultare le guerre del clan e di analizzare nel tempo le performance dei partecipanti.

I dati reali arrivano dall'[API ufficiale di Clash of Clans](https://developer.clashofclans.com) tramite un
piccolo **proxy Node** incluso nel progetto (`server/`), che conserva il token lontano dal browser.
Per provare l'interfaccia senza token è disponibile una modalità con **dati mock** di fantasia.

## Funzionalità

| Pagina | Percorso | Contenuto |
| --- | --- | --- |
| Dashboard | `/dashboard` | Riepilogo dell'ultima guerra, KPI (attacchi, media stelle, % 3 stelle, partecipazione), classifica migliori e peggiori, grafici di andamento |
| Guerra corrente | `/current-war` | Clan contro avversario, tempo residuo, partecipanti con filtri (nome, municipio, stelle) ed evidenza di chi non ha ancora attaccato |
| Lega (CWL) | `/cwl` | Classifica del girone (stelle + 10 per vittoria), le 7 giornate del clan e il rendimento dei giocatori, stagione per stagione (salvate dal backend) |
| Raid Weekend | `/raids` | Oro della capitale e attacchi di ogni membro, weekend per weekend, con l'elenco dei membri che non hanno partecipato. I membri dei weekend passati vengono dal backend, che li salva mentre il weekend è in corso (l'API li mostra solo in quel momento) |
| Storico guerre | `/wars` | Tabella con ricerca, filtro per risultato, ordinamento e paginazione |
| Dettaglio guerra | `/wars/:id` | Performance individuali di una guerra |
| Giocatori | `/players` | Elenco membri con statistiche di guerra, ricerca e ordinamento |
| Scheda giocatore | `/players/:tag` | Profilo in stile Clash of Clans (municipio, livello, lega, trofei, eroi con equipaggiamento, esercito, obiettivi) e statistiche di guerra con grafici e storico |
| Statistiche | `/statistics` | Classifica dei membri per **media stelle per guerra** (max 6), per mese o su tutti i mesi, dallo storico mensile del proxy |

Inoltre:

- stati di caricamento, assenza dati ed errore (con pulsante "Riprova") su ogni sezione;
- accessibilità di base: link "Vai al contenuto", focus visibile, etichette ARIA, stato non affidato al solo colore, palette dei grafici verificata per contrasto e daltonismo;
- layout responsive: menu laterale fisso su desktop, a scomparsa su mobile; tabelle con scorrimento orizzontale;
- interfaccia in **italiano, inglese e spagnolo**, con selettore della lingua nell'header (vedi [Lingue](#lingue));
- **tema chiaro e scuro**: di default segue il sistema, si cambia dal menu accanto alle lingue (vedi [Temi](#temi)).

## Requisiti

- Node.js 24 (vedi `.nvmrc`) e npm 11

## Avvio

### Con i dati reali

1. Crea il file `.env` partendo dall'esempio e inserisci il token (vedi [Chiave API](#chiave-api)):

   ```bash
   cp .env.example .env
   ```

2. In due terminali separati:

   ```bash
   npm install
   npm run server       # proxy su http://localhost:3000
   npm start            # app su http://localhost:4200 (le chiamate /api/coc vanno al proxy)
   ```

3. Facoltativo: per login e salvataggio automatico delle guerre avvia anche il backend applicativo, in un terzo terminale
   (configurazione in [backend/README.md](backend/README.md)):

   ```bash
   npm run backend      # Next.js su http://localhost:3001 (le chiamate /api/v1 vanno al backend)
   ```

   Senza backend il sito funziona lo stesso: il ripristino della sessione fallisce senza conseguenze e le guerre non
   vengono salvate.

### Con i dati mock (senza token né backend)

```bash
npm run start:mock
```

Apri http://localhost:4200: tutte le pagine sono accessibili senza login. I dati simulano circa un
anno di guerre (120, circa 10 al mese con la pausa della Lega a inizio mese), con giocatori che
entrano ed escono dal clan, migliorano il Municipio e cambiano rendimento nel tempo
(`src/app/core/mock/mock-data.ts`). I dati sono sempre gli stessi a ogni avvio.

### Altri comandi

```bash
npm test                    # test unitari del frontend (Vitest) in modalità watch
npx ng test --watch=false   # esecuzione singola, per CI
npm run test:server         # test del proxy (node:test)
npm --prefix backend test   # test del backend (Vitest + MongoDB in memoria)
npm run build               # build di produzione in dist/crociata_nera
```

## Stack

- **Angular 22**: componenti standalone, signals, `rxResource`, change detection zoneless, controllo di flusso `@if`/`@for`
- **Angular Material 22**: tema Material 3 scuro personalizzato (nero/antracite, oro, rosso scuro)
- **Chart.js 4 + ng2-charts 11** per i grafici
- **ngx-translate 18** per le traduzioni
- **Font**: Inter (Google Fonts) per il testo; **Clash** di Supercell (Regular e Bold, in `src/assets/fonts/`) per
  titoli, nome del clan e numeri grandi, dichiarato con `@font-face` in `src/styles.scss` (`--cn-font-display`).
  Il font Clash è © Supercell, tutti i diritti riservati: è usato come contenuto da fan, non commerciale, secondo la
  [Fan Content Policy di Supercell](https://supercell.com/en/fan-content-policy/).
- **Tipografia fluida**: le dimensioni dei testi sono token `--cn-fs-*` in `src/styles.scss`, definiti con `clamp()`:
  crescono linearmente tra 360 e 1440 px di larghezza (per esempio i titoli di pagina da 22 a 30 px) e seguono lo zoom
  del browser. Anche testi di tabelle, campi e pulsanti di Material usano la stessa scala.
- **Vitest** + jsdom per i test unitari
- **Proxy**: Node.js 24 senza dipendenze (`node:http`, `fetch` nativa, `node:test`)

## Convenzioni

Il codice è scritto in **inglese**: nomi di file, tipi, variabili, funzioni, classi CSS, chiavi di traduzione,
commenti e descrizioni dei test. L'italiano (come inglese e spagnolo) compare solo nei testi dell'interfaccia,
in `public/i18n/*.json`.

## Struttura del progetto

```
server/                           Proxy verso l'API ufficiale
├── index.mjs                     Avvio, lettura .env, aggiornamento periodico dell'archivio
├── app.mjs                       Server HTTP con le sole rotte consentite
├── coc-routes.mjs                Elenco degli endpoint ufficiali inoltrati, con validazione dei parametri
├── rate-limit.mjs                Limite di richieste per IP sugli endpoint generici
├── coc-client.mjs                Client API con token e cache in memoria (al massimo 1000 risposte)
├── archive.mjs                   Archivio delle guerre (server/data/wars.json)
├── history.mjs                   Storico mensile e statistiche cumulative (server/data/history/AAAA-MM.json)
├── server.test.mjs               Test del proxy
└── history.test.mjs              Test dello storico mensile
proxy.conf.json                   Inoltro /api/coc → proxy durante `npm start`
.env.example                      Modello delle variabili d'ambiente del proxy
src/
├── environments/                 Configurazione (mock/API, URL proxy, tag clan)
│   ├── environment.ts            produzione (npm run build) – dati reali
│   ├── environment.development.ts sviluppo (npm start) – dati reali via proxy
│   └── environment.mock.ts       demo (npm run start:mock) – dati mock
└── app/
    ├── app.config.ts             Provider globali (router, HTTP, grafici, traduzioni)
    ├── app.routes.ts             Rotte con caricamento lazy delle pagine
    ├── core/
    │   ├── models/               Interfacce: Clan, War, WarParticipant, Attack, PlayerStats, HistoryPeriod…
    │   ├── config/app-config.ts  Interfaccia AppConfig + token APP_CONFIG
    │   ├── api/
    │   │   ├── coc-api.ts            Contratto astratto CocApiService
    │   │   ├── mock-coc-api.service.ts  Implementazione mock
    │   │   ├── http-coc-api.service.ts  Implementazione HTTP (via proxy)
    │   │   ├── coc-api-client.ts     Client grezzo di tutti gli endpoint GET dell'API ufficiale
    │   │   ├── coc-api.types.ts      Tipi della risposta dell'API ufficiale
    │   │   ├── coc-api.mappers.ts    Conversione API → modelli dell'app
    │   │   └── provide-coc-api.ts    Sceglie mock o HTTP in base alla configurazione
    │   ├── mock/                 Generatore di dati mock deterministico
    │   ├── services/             WarService (guerre), PlayerService (membri e statistiche), HistoryService (storico mensile)
    │   ├── utils/                Calcolo statistiche (war-stats), ordinamento e ricerca
    │   ├── theme/                ThemeService e definizione dei temi
    │   └── i18n/                 Lingue, LanguageService, pipe localNumber/localDate, titolo pagina e paginatore tradotti
    ├── shared/
    │   ├── components/           LoadState, KpiCard, ResultBadge, Stars, PageHeader
    │   ├── charts/chart-theme.ts Tema e helper per i grafici
    │   └── labels.ts             Chiavi di traduzione per stati, risultati e ruoli
    ├── layout/                   Shell: header "Crociata Nera" + menu laterale
    ├── features/
    │   ├── dashboard/
    │   ├── wars/                 Guerra corrente, storico, dettaglio + componenti condivisi
    │   ├── players/              Elenco e scheda giocatore
    │   ├── statistics/           Classifica dallo storico mensile
    │   └── not-found/
    └── testing/                  Dati e provider per i test (fixtures.ts, i18n.ts)
public/
├── i18n/                         Traduzioni: it-IT.json, en-US.json, es-ES.json
├── flags/                        Bandiere del selettore lingua
└── game/                         Immagini del Supercell Fan Kit (municipi, eroi, truppe, incantesimi, equipaggiamenti)
```

### Flusso dei dati

```
Pagine (rxResource) ─► WarService / PlayerService ─► CocApiService (astratto)
                                                        ├─ MockCocApiService  (useMockApi: true)
                                                        └─ HttpCocApiService  (useMockApi: false)
                                                              │
                              browser ─► /api/coc (proxy.conf.json) ─► server/ (token) ─► api.clashofclans.com/v1
```

### Tutti gli endpoint dell'API ufficiale

`CocApiClient` (`core/api/coc-api-client.ts`) espone un metodo per ogni endpoint GET dell'API di
Clash of Clans (giocatori, clan, leghe, posizioni e classifiche), con le risposte così come arrivano
dall'API. Il proxy li inoltra solo se sono nell'elenco di `server/coc-routes.mjs`: percorsi e
parametri vengono validati, le richieste sono limitate a 60 al minuto per IP (le rotte del nostro
clan non hanno limite) e le risposte restano in cache da 1 minuto a 1 ora a seconda del tipo di dato.

Le statistiche (KPI, medie, percentuali, rendimento) si calcolano lato client in
`core/utils/war-stats.ts`, quindi funzionano allo stesso modo con i dati mock e con quelli reali.

### Definizioni delle metriche

- **Media stelle**: stelle totali / attacchi usati.
- **% 3 stelle**: attacchi da 3 stelle / attacchi usati.
- **Partecipazione** (KPI di guerra): partecipanti con almeno un attacco / partecipanti schierati.
- **Partecipazione** (grafico): attacchi usati / attacchi disponibili.
- **Presenza** (giocatore): guerre in cui era schierato / guerre analizzate (ultime `statsWindow`).
- **Rendimento** (classifica): stelle totali / attacchi *disponibili*. Un attacco non usato vale 0 stelle.
  Nella classifica entra solo chi ha disputato almeno 3 guerre.

Le statistiche dei giocatori considerano solo le guerre **terminate** e **con dettaglio dei partecipanti**
(vedi [Da dove arriva lo storico](#da-dove-arriva-lo-storico)). I grafici di andamento del clan usano invece
i totali, quindi includono anche le guerre con solo riepilogo.

## Cache delle chiamate HTTP

`cacheInterceptor` (`src/app/core/http/`) tiene in memoria le risposte delle GET, così cambiando pagina le stesse API non
vengono richiamate.

- **GET:** una risposta riuscita resta in cache per `CACHE_DURATION`, 15 minuti di default. Per cambiarla su una
  singola chiamata si usa `{ context: cacheFor({ minutes: 2 }) }`; con `noCache()` la chiamata va sempre in rete.
  Richieste identiche fatte nello stesso momento partono una volta sola. Gli errori non vengono salvati.
- **POST, PUT, PATCH, DELETE:** se riescono, cancellano le GET in cache della stessa API (una chiamata a `/api/v1/…`
  svuota le `/api/v1/…`). Con `CACHE_INVALIDATES` si scelgono altri prefissi; `['']` svuota tutto. Una GET partita
  prima dell'invalidazione non salva la sua risposta.
- **Durate per tipo di dato** (`HttpCocApiService`):

  | Dato | Durata |
  | --- | --- |
  | guerra corrente | 2 minuti |
  | archivio del proxy | 5 minuti |
  | profilo giocatore | 10 minuti |
  | clan, registro guerre, storico mensile, traduzioni | 15 minuti (default) |

- **Aggiornamento manuale:** "Aggiorna" nella guerra corrente salta la cache (`WarService.refreshCurrentWar()`); per lo
  storico c'è `WarService.refreshHistory()`.
- **Durata della cache:** è in memoria per scheda, quindi ricaricando la pagina riparte vuota. Gli header
  `Cache-Control` del server non vengono considerati.

## Aree scorrevoli e riga del giocatore

- **Indicatore di scorrimento:** la direttiva `crnScrollFade` (`src/app/shared/directives/scroll-fade.ts`) aggiunge in
  cima e in fondo alle aree scorrevoli una leggera fascia sfocata, visibile solo se in quella direzione c'è altro
  contenuto. Vale per le pagine e per le schede del giocatore. Si aggiorna quando si scorre, quando cambiano le
  dimensioni e quando arrivano i dati. Gli stili `.cn-scroll-fade` sono in `styles.scss`.
- **Le tue righe:** se uno degli account di Clash of Clans **verificati** collegati all'utente ha lo stesso tag di un giocatore restituito dall'API, la sua riga è verde
  e accanto al nome compare il badge "Tu". Succede nelle tabelle Giocatori, Statistiche e partecipanti alla guerra. Il
  controllo è `AuthService.isMyPlayer(tag)`.

## Pagina di benvenuto

La home (`/`) presenta il clan come un banner del gioco, con i dati di `GET /clans/{tag}`. È pubblica: è la pagina che
vede chi non ha ancora fatto login.

- **Nome del clan** in testa: lettere in metallo grigio scuro con bordo argento, riflesso in movimento e fiamme che
  salgono dalle lettere.
- **Stemma** (`badgeUrls.large`) al centro, con raggi rotanti, bagliore e braci che salgono; sullo sfondo la Capitale
  del clan.
- **Cifre e etichette:** membri, guerre vinte, serie di vittorie, punti clan ed etichette con le icone ufficiali.
- **Capitale del clan:** immagine del Capital Hall del livello del clan, Capital League con lo stemma, punti Capitale.
- **Lega delle guerre tra clan:** coppa della lega con la divisione, vittorie, pareggi, sconfitte e percentuale di
  vittorie.
- **Descrizione del clan** in fondo, su una pergamena.

Le immagini vengono dal Supercell Fan Kit e sono in `public/game/`:
- `capital-halls/` (livelli 1–10);
- `leagues/` (stemmi delle leghe, usati per la Capital League);
- `war-leagues/` (coppe della Clan War League, `master-1` = Master League I);
- `misc/capital-trophy.webp`.

Lo sfondo della welcome page (i cavalieri neri) è un'immagine del clan, non del Fan Kit:
`public/images/welcome-crusaders.webp`.

La scelta dell'immagine dal nome della lega è in `src/app/core/game/clan-assets.ts`. Le animazioni si fermano con
`prefers-reduced-motion`.

## Scheda giocatore

Cliccando un giocatore si apre la sua scheda, ispirata al profilo del gioco. I dati arrivano da
`GET /v1/players/{tag}` tramite il proxy.

- **Intestazione**: municipio (con livello dell'arma), stella dell'esperienza, nome, ruolo, clan, preferenza di guerra,
  etichette, lega con icona ufficiale, trofei e record.
- **Profilo**: stelle di guerra, attacchi e difese vinti, truppe donate e ricevute, contributi alla capitale, trofei
  leggenda, base del costruttore; eroi con livello, barra di avanzamento ed equipaggiamento assegnato.
- **Esercito**: truppe, super truppe (attive a colori), macchine d'assedio, animali, incantesimi, equipaggiamenti e base
  del costruttore, con il livello nell'angolo (oro se al massimo).
- **Obiettivi**: achievement con stelle e avanzamento. **Guerre**: le statistiche di guerra dall'archivio del proxy.

Immagini: municipi, eroi, truppe, incantesimi ed equipaggiamenti vengono dal
[Supercell Fan Kit](https://fankit.supercell.com/d/vkEdmkUCngKw/game-assets), ritagliati, ridimensionati e salvati in WebP
in `public/game/` (circa 1,6 MB); `src/app/core/game/game-assets.ts` collega i nomi dell'API ai file. Le icone di
leghe, etichette e stemmi arrivano direttamente dall'API. Le poche unità senza immagine nel fan kit mostrano le
iniziali. Nel menu laterale c'è la nota richiesta dalla
[Fan Content Policy di Supercell](https://supercell.com/en/fan-content-policy/).

## Lingue

L'interfaccia è disponibile in italiano (`it-IT`), inglese (`en-US`) e spagnolo (`es-ES`). Il pulsante con la
bandiera a destra nell'header apre il menu delle lingue; la scelta viene ricordata nel browser (`localStorage`).
Al primo accesso si usa la lingua del browser, se supportata, altrimenti l'italiano.

- I testi sono in `public/i18n/<codice>.json` e vengono caricati con ngx-translate al cambio lingua.
  L'italiano è anche la lingua di riserva per le chiavi mancanti.
- Numeri e date seguono la lingua scelta (`1.234,5` / `1,234.5`; `05/11/2026` / `11/05/2026`) tramite le pipe
  `localNumber` e `localDate` in `core/i18n/locale-pipes.ts`; i formati di data sono nei file di traduzione (`formats.*`).
- Anche titolo della scheda del browser, etichette dei grafici, paginatore, testi per screen reader e messaggi
  d'errore dell'API cambiano lingua. Restano invariati i dati di gioco (nomi di clan e giocatori, tag).

Per aggiungere una lingua: crea `public/i18n/<codice>.json` con le stesse chiavi dell'italiano, aggiungi la bandiera
in `public/flags/`, la voce in `LANGUAGES` (`core/i18n/languages.ts`) e, se serve, i dati di formattazione con
`registerLocaleData` in `locale-pipes.ts`. Un test verifica che tutti i file abbiano le stesse chiavi e gli stessi
segnaposto.

## Temi

Lo stile riprende l'interfaccia di Clash of Clans: pannelli con contorno scuro spesso e smusso in rilievo, titoli nel
font Clash, pulsanti verdi "da gioco", voce di menu attiva come pulsante dorato. Sono disponibili un tema **chiaro**
(pannelli pergamena con contorno marrone, come le finestre informative del gioco) e uno **scuro** (pannelli blu
ardesia, come i menu notturni), entrambi con oro per titoli e valori. Al primo accesso si usa il tema del sistema operativo e lo si segue se cambia; scegliendo un tema dal
menu nell'header (pallino bianco = Chiaro, pallino nero = Scuro) la scelta viene ricordata nel browser.

- I colori sono variabili CSS (`--cn-*`) definite per i due temi in `src/styles.scss`; il tema attivo è
  `<html data-theme="light|dark">`, impostato da `ThemeService` (`core/theme/`) e, prima dell'avvio dell'app, da
  un piccolo script in `index.html` per evitare il lampeggio del tema sbagliato.
- Angular Material segue il tema tramite `color-scheme`; i grafici ricevono i colori di assi, griglia e tooltip dal
  tema corrente (`CHART_CHROME` in `shared/charts/chart-theme.ts`) e si ridisegnano al cambio.
- Il passaggio da un tema all'altro è una dissolvenza ease-out di 300 ms su tutta la pagina (View Transitions API).
  Non c'è animazione se il browser non la supporta o se l'utente ha attivato "riduci movimento".
- Contrasti verificati: i testi sono almeno 4,5:1 su tutti i fondi del proprio tema, icone e bordi almeno 3:1;
  i colori delle serie dei grafici superano i controlli di contrasto e daltonismo su entrambi i fondi. Un audit
  axe-core (`color-contrast`) su tutte le pagine non segnala problemi in nessuno dei due temi.

## Configurazione

### Frontend

Le opzioni sono in `src/environments/environment*.ts` (interfaccia `AppConfig`):

| Chiave | Descrizione | Default |
| --- | --- | --- |
| `useMockApi` | `true` = dati mock, `false` = chiamate HTTP al proxy | `false` (`true` solo in `environment.mock.ts`) |
| `apiBaseUrl` | URL base del **proxy backend** | `/api/coc` |
| `backendBaseUrl` | URL base del **backend applicativo** (`backend/`: login, guerre salvate) | `/api/v1` |
| `clanTag` | Tag del clan, con `#` | `#2J8JVVCLC` |
| `clanName` | Nome mostrato nell'header | `Crociata Nera` |
| `mockLatencyMs` | Latenza simulata del mock (ms) | `500` dev / `300` prod |
| `statsWindow` | Numero di guerre usate per le statistiche dei giocatori | `20` |

### Proxy (`.env`)

| Variabile | Descrizione | Default |
| --- | --- | --- |
| `COC_API_TOKEN` | Token dell'API (obbligatorio) | — |
| `COC_CLAN_TAG` | Tag del clan, **tra virgolette** (in `.env` il `#` inizia un commento) | `"#2J8JVVCLC"` |
| `PORT` | Porta del proxy; deve coincidere con `target` in `proxy.conf.json` | `3000` |
| `COC_POLL_MINUTES` | Ogni quanti minuti archiviare la guerra corrente (`0` = mai) | `15` |
| `COC_ARCHIVE_FILE` | File dell'archivio | `server/data/wars.json` |
| `COC_HISTORY_DIR` | Cartella dello storico mensile | `server/data/history` |

`.env` e `server/data/` sono esclusi da git.

## Backend applicativo

`backend/` è un progetto Next.js separato, con il suo `package.json`. Gestisce:

- l'autenticazione: sign-up, sign-in, refresh, sign-out e `me`;
- il **salvataggio automatico delle guerre** su MongoDB: un'attività pianificata del backend legge da sola l'API di
  Clash of Clans, senza browser né proxy.

Il frontend continua a leggere i dati di Clash of Clans dal proxy. Il backend si aggiunge, non sostituisce niente.

- **Sessione:** l'access token resta in memoria (`AuthService`). Il refresh token è un cookie httpOnly; all'avvio
  l'app lo usa per ripristinare la sessione.
- **Header:** `authInterceptor` aggiunge `Authorization: Bearer` solo alle chiamate verso `backendBaseUrl`. Se la
  risposta è 401, rinnova il token una volta e ripete la richiesta.
- **Guerre salvate:** le scrive solo il backend, con la sua chiave API. Il frontend può leggerne il riepilogo con
  `GET /api/v1/wars` (vedi [backend/README.md](backend/README.md#sincronizzazione-delle-guerre)).

- **Pagine:** `/sign-in` (email o username + password) e `/sign-up` (email, username, password, conferma, tag
  giocatore facoltativo), nello stile del sito: pannello con banner dorato e pulsante verde.
  - Il form controlla le stesse regole del backend prima di inviare.
  - Gli errori del backend arrivano come chiavi (`ERROR.*`), tradotte nelle tre lingue e mostrate sotto il campo
    interessato oppure in un avviso.
  - Dopo l'accesso si torna alla pagina indicata da `?returnUrl=`, solo se è un percorso interno del sito.
  - `guestGuard` porta alla dashboard chi ha già fatto login.
- **Accesso riservato:** sono pubbliche solo la pagina di benvenuto (`/`), `/sign-in` e `/sign-up`. Tutte le altre
  pagine stanno in un gruppo di rotte protetto da `authGuard`.
  - Chi non ha fatto login e apre una pagina riservata torna alla pagina di benvenuto, che si ricorda la pagina chiesta
    (`/?returnUrl=/statistics`). "Accedi" nell'header passa quell'indirizzo alla pagina di accesso e, dopo il login,
    si torna lì. Vale anche per il 404 e per i link diretti.
  - La guardia aspetta che all'avvio venga ripristinata la sessione dal cookie, così chi ha già fatto login non viene
    rimandato indietro.
  - Senza login l'header mostra solo tema, lingua e "Accedi"; la navigazione laterale è nascosta e l'avviso della Fan
    Content Policy appare in fondo alla pagina.
  - Se la sessione finisce (logout, scadenza o revoca), si torna alla pagina di benvenuto.
  - Con i dati mock (`start:mock`) non c'è backend: tutte le pagine restano aperte e quelle di accesso non si
    raggiungono.
- **Header:** a destra c'è il pulsante "Accedi" oppure il menu dell'utente (iniziale, nome, email, "Esci"). Con i
  dati mock è nascosto.

- **Account:**
  - `/profile`: dati dell'account, conferma dell'email, collegamento di uno o più account di gioco (fino a 10, ciascuno verificato con il token API mostrato nel gioco, in Impostazioni → Altre impostazioni: chi non è il proprietario dell'account non può leggerlo) e cambio password;
  - `/forgot-password`, `/reset-password` e `/verify-email`: pagine pubbliche raggiunte dai link delle email;
  - `/admin`: elenco utenti, ruolo amministratore e account di gioco collegati (verificati o no; l'admin può solo scollegarli, uno alla volta); protetta da `adminGuard`.

  Profilo e amministrazione si aprono dal menu account nell'header.
- **Storico e statistiche:** arrivano dal backend (`/api/v1/wars/archive`, `/api/v1/history`), cioè dalle guerre
  salvate su MongoDB. Se il backend non risponde, il frontend usa l'archivio del proxy.

Rotte, modello dati e sicurezza sono descritti in [backend/README.md](backend/README.md).

## Dati reali dall'API di Clash of Clans

### Chiave API

1. Accedi a <https://developer.clashofclans.com> e crea una chiave.
2. Nel campo **IP addresses** inserisci l'**IP pubblico della macchina su cui gira il proxy**
   (per scoprirlo: `curl https://api.ipify.org`). La chiave funziona **solo** da quegli IP.
3. Copia il token in `COC_API_TOKEN` nel file `.env`.

Se l'IP cambia (le connessioni domestiche hanno spesso IP dinamico) l'app mostra l'errore
*"La chiave API non autorizza l'indirizzo IP del server proxy"* con l'IP rilevato: crea una nuova chiave
con quell'IP. Il portale permette più chiavi per account.

**Non inserire mai il token nel codice del frontend** né negli `environment.ts`: sarebbe pubblico.
Il browser non può comunque chiamare l'API direttamente (IP variabili, nessun CORS).

### Endpoint del proxy

Il proxy accetta solo `GET` sulle rotte del clan configurato, quindi non funziona come inoltro aperto:

| Endpoint del proxy | Sorgente |
| --- | --- |
| `GET /api/coc/clans/{tag}` | `GET /v1/clans/{tag}`: dati del clan e `memberList` |
| `GET /api/coc/clans/{tag}/currentwar` | `GET /v1/clans/{tag}/currentwar`: guerra corrente con attacchi |
| `GET /api/coc/clans/{tag}/warlog` | `GET /v1/clans/{tag}/warlog?limit=50`: riepiloghi delle guerre passate |
| `GET /api/coc/archive/wars` | Snapshot `currentwar` salvati dal proxy |
| `GET /api/coc/history` | Elenco dei mesi dello storico, con il bilancio delle guerre |
| `GET /api/coc/history/AAAA-MM` | Guerre e statistiche dei giocatori di un mese (404 se vuoto) |
| `GET /api/coc/history/all` | Tutti i mesi sommati |
| `GET /api/coc/players/{tag}` | Profilo completo di un giocatore (`/v1/players/{tag}`), solo per i membri attuali del clan |
| `GET /api/health` | Stato del proxy |

Le risposte dell'API restano in cache per 60 secondi. Gli errori dell'API (`{ reason, message }`) vengono
inoltrati invariati, così il frontend distingue i casi.

### Da dove arriva lo storico

L'API ufficiale **non fornisce gli attacchi individuali delle guerre passate**:

- `/currentwar` contiene partecipanti e attacchi, ma solo per la guerra in corso, o appena finita (`warEnded`);
- `/warlog` elenca le guerre passate con risultato, stelle e distruzione, ma **senza partecipanti**.

Per questo il proxy interroga `/currentwar` ogni `COC_POLL_MINUTES` minuti e salva l'ultimo snapshot di
ogni guerra in `server/data/wars.json`. Il frontend unisce le due sorgenti:

- guerre **archiviate**: dettaglio completo, con i totali definitivi presi dal registro;
- guerre presenti **solo nel registro**: segnate come *"solo riepilogo"* nello storico. Il dettaglio mostra
  il tabellone senza la tabella dei partecipanti, e queste guerre sono escluse dalle statistiche dei giocatori.

Conseguenza pratica: le statistiche individuali si costruiscono **da quando il proxy è attivo**. Tienilo in
esecuzione con continuità (server, Raspberry Pi, VPS…) per non perdere guerre: ne basta uno snapshot
durante le ~24 ore di `warEnded`.

### Storico mensile e classifica

Quando una guerra arriva allo stato `warEnded` (sia con il controllo periodico sia quando qualcuno apre la guerra
corrente), il proxy la **somma allo storico del mese in cui è terminata** (fuso orario Europe/Rome):
`server/data/history/2026-11.json`. All'avvio recupera anche le guerre terminate già presenti nell'archivio.

Ogni file mensile contiene:

- `guerre`: riepilogo di ogni guerra (avversario, risultato, stelle, distruzione) con, per ogni giocatore,
  municipio, posizione, attacchi disponibili, ogni attacco (stelle, distruzione, municipio e posizione del bersaglio),
  attacchi subiti e stelle concesse in difesa;
- `giocatori`: totali per giocatore ricalcolati a ogni guerra. Comprendono guerre, attacchi disponibili, usati e
  mancati, stelle, attacchi da 3/2/1/0 stelle, **media stelle per guerra**, media stelle per attacco, % 3 stelle,
  distruzione media, partecipazione e media delle stelle concesse.

La registrazione è **idempotente**: la stessa guerra, cioè con lo stesso inizio della preparazione e lo stesso
avversario, sostituisce la precedente invece di essere contata due volte.

La pagina **Statistiche** mostra la classifica ordinata per **media stelle per guerra** = stelle totali ÷ guerre
disputate. Il massimo è 6, cioè due attacchi da 3 stelle, e gli attacchi non usati valgono 0. A parità decidono
distruzione media, partecipazione e numero di guerre. Si può scegliere un mese o "Tutti i mesi", filtrare per numero
minimo di guerre e nascondere gli ex membri.

> Le guerre della Lega (CWL) non passano da `/currentwar` e quindi non entrano nello storico.
> Per un backup basta copiare la cartella `server/data/`.

### Casi particolari

| Risposta API | Comportamento dell'app |
| --- | --- |
| `403 accessDenied.invalidIp` | Errore con l'IP rilevato: crea una chiave per quell'IP |
| `403 accessDenied` su `currentwar`/`warlog` | Registro guerre del clan **privato**: nessuna guerra visibile. Rendilo pubblico dalle impostazioni del clan nel gioco |
| `state: notInWar` | "Il clan non è attualmente in guerra" |
| `429 requestThrottled` / `503 inMaintenance` | Messaggio dedicato e pulsante Riprova |
| Proxy spento | "Proxy non raggiungibile. Avvia il backend con npm run server" |
| Voci CWL nel registro (`result: null`) | Ignorate: le guerre della Lega usano endpoint diversi, non ancora gestiti |

### In produzione

Pubblica `dist/crociata_nera/browser` come sito statico e rendi raggiungibile il proxy sotto `/api/coc`
dello stesso dominio, per esempio con un reverse proxy nginx verso `node server/index.mjs`. In alternativa
imposta in `environment.ts` l'URL completo del proxy e abilita CORS sul proxy. La chiave API deve
autorizzare l'IP pubblico del server dove gira il proxy.

## Pubblicazione (VPS)

Il sito gira su una VPS con IP fisso (Aruba Cloud, Ubuntu 24.04) e va online su **https://crociatanera.it**. La
cartella `deploy/` contiene tutto quello che serve:

| File | A cosa serve |
| --- | --- |
| `docker-compose.yml` | i tre servizi: `web` (Caddy + Angular), `proxy` (`server/`) e `backend` (`backend/`) |
| `Caddyfile` | HTTPS automatico con Let's Encrypt; `/api/coc` va al proxy, `/api/v1` al backend, il resto è l'app Angular |
| `web.Dockerfile`, `proxy.Dockerfile`, `backend.Dockerfile` | le immagini (il backend usa l'output `standalone` di Next.js) |
| `.env.example` | il modello delle impostazioni di produzione: dominio, chiave dell'API di Clash of Clans, MongoDB Atlas, segreto JWT |
| `deploy.sh` | aggiorna il codice, costruisce le immagini una alla volta, controlla il Caddyfile e riavvia |
| `service-worker.sh` | interruttore d'emergenza del service worker nei browser (`off`, `on`, `status`) |

**Architettura:**
- da internet sono raggiungibili solo le porte 80 e 443, cioè Caddy; proxy e backend restano sulla rete interna di
  Docker;
- il database è MongoDB Atlas (M0), con l'IP della VPS autorizzato;
- proxy e backend usano la stessa chiave dell'API di Clash of Clans, creata per l'IP della VPS.

**Primo avvio**, sulla VPS:

```bash
git clone https://github.com/Mik1996/crociata_nera.git ~/crociata_nera
cd ~/crociata_nera/deploy
cp .env.example .env && nano .env      # compila COC_API_TOKEN, DATABASE_URL e JWT_SECRET (openssl rand -base64 48)
./deploy.sh
```

**Aggiornamenti automatici:** il workflow `.github/workflows/deploy.yml` lancia i test a ogni push e pull request. Su
`master`, se i test passano:
- si collega alla VPS ed esegue `deploy.sh`;
- poi controlla `https://crociatanera.it/api/v1/health`.

La chiave SSH usata da GitHub Actions è dedicata e, sul server, può lanciare solo `deploy.sh` (`command="…"` in
`authorized_keys`).

I secret del repository sono:

| Secret | Contenuto |
| --- | --- |
| `VPS_HOST` | IP della VPS |
| `VPS_SSH_KEY` | la chiave privata dedicata |
| `VPS_KNOWN_HOSTS` | l'output di `ssh-keyscan -t ed25519 <IP>` |

Per pubblicare a mano: `~/crociata_nera/deploy/deploy.sh` sulla VPS, oppure "Run workflow" nella scheda Actions.

**Backup:**
- `deploy/backup.sh` salva il database con `mongodump` e l'archivio del proxy in `/root/backups`, per 14 giorni. Sulla
  VPS va pianificato con cron:
  ```bash
  ( crontab -l 2>/dev/null; echo "30 3 * * * /root/crociata_nera/deploy/backup.sh >> /var/log/crociata-backup.log 2>&1" ) | crontab -
  ```
- Ripristino del database:
  ```bash
  set -a; . ./.env; set +a
  docker run --rm -i -e DATABASE_URL mongo:8 sh -c 'mongorestore --uri="$DATABASE_URL" --archive --gzip --drop' < /root/backups/mongo-AAAAMMGG-HHMMSS.archive.gz
  ```

**Monitoraggio:** `.github/workflows/uptime.yml` controlla ogni 15 minuti il sito, `/api/v1/health` e il proxy. Se
qualcosa non risponde, GitHub manda un'email di "workflow fallito".

**Service worker (cache offline) e interruttore d'emergenza:**
il sito installa nei browser un service worker che conserva una copia del sito e degli ultimi dati, per l'uso offline.
Chi ha già visitato il sito riceve una nuova versione solo dopo l'avviso "Aggiorna" o alla visita successiva. Se una
versione pubblicata si rivela difettosa e quell'avviso non basta (per esempio, la pagina non si carica più), il service
worker si spegne nei browser di tutti.

1. **Subito**, sulla VPS:
   ```bash
   ~/crociata_nera/deploy/service-worker.sh off
   ```
   Al posto del service worker viene servito il "safety worker" di Angular, e `ngsw.json` risponde 404. Alla prossima
   visita di ogni browser il service worker si disinstalla e cancella le sue cache, entro circa mezzo minuto; da lì il
   sito arriva sempre dalla rete. Vale fino al prossimo deploy.
2. **Per tenerlo spento anche dopo i deploy**, finché il problema non è risolto: `SW_DISABLED=1` in `deploy/.env`,
   poi `./deploy.sh`. L'immagine viene costruita direttamente con il safety worker.
3. **Per riaccenderlo:** togli `SW_DISABLED` da `deploy/.env` (o mettilo a `0`) e lancia `./deploy.sh`. Senza
   `SW_DISABLED` basta `./service-worker.sh on`. I browser lo reinstallano alla visita successiva.

`./service-worker.sh status` mostra cosa sta servendo il sito in quel momento.

Per provare la build di produzione in locale: `npm run start:prod` (http://localhost:4400; serve
`http://localhost:4400` in `FRONTEND_URL` di `backend/.env.local`).

**Comandi utili:**
- `docker compose logs -f backend` (oppure `web` o `proxy`): mostra i log;
- `docker compose ps`: mostra lo stato dei servizi;
- `curl -s https://crociatanera.it/api/v1/health`: stato del database e della sincronizzazione delle guerre.

**Dati:**
- l'archivio del proxy è nel volume `proxy_data`, i certificati in `caddy_data`;
- `deploy/.env` resta solo sul server ed è escluso da git.

## Test

I test unitari coprono:

- calcolo statistiche e KPI (`war-stats.spec.ts`), ordinamento e ricerca (`sort.spec.ts`);
- generatore mock: determinismo e rispetto delle regole di guerra (`mock-data.spec.ts`);
- mapper dell'API ufficiale, compresi registro guerre, voci CWL e unione con l'archivio (`coc-api.mappers.spec.ts`);
- servizio HTTP con `HttpTestingController`: tag codificato, assenza del token, distinzione tra registro privato e IP
  non autorizzato, proxy spento, unione di archivio e registro;
- proxy (`server/server.test.mjs`): archiviazione, inoltro con token, errori, rotte non consentite, cache;
- storico mensile (`server/history.test.mjs`, `monthly-history.spec.ts`): somma delle guerre, medie, ordinamento della
  classifica, mese con fuso italiano, idempotenza, registrazioni concorrenti, rotte;
- pagina Statistiche: ordinamento per media stelle, filtro sul minimo di guerre, storico vuoto;
- traduzioni (`i18n.spec.ts`): stesse chiavi e segnaposto in tutti i file, scelta della lingua iniziale, cambio
  lingua, formattazione di numeri e date;
- `WarService` e `PlayerService`;
- cache HTTP (`cache.interceptor.spec.ts`): durata di default e personalizzata, `noCache`, parametri di query, richieste
  contemporanee condivise, errori non salvati, invalidazione dopo POST/PUT/PATCH/DELETE riusciti e solo per la stessa
  API, risposte partite prima dell'invalidazione non salvate;
- sessione con il backend (`auth.service.spec.ts`): access token in memoria, ripristino dal cookie, un solo refresh
  anche con chiamate contemporanee, Bearer solo verso il backend, nuovo tentativo dopo un 401, sign-out;
- pagine di accesso e registrazione (`sign-in-page.spec.ts`, `sign-up-page.spec.ts`): errori di validazione tradotti,
  normalizzazione del tag, errori del backend sotto i campi o in un avviso, backend irraggiungibile, ritorno solo a
  pagine interne; guard (`auth.guards.spec.ts`) e rotte protette (`app.routes.spec.ts`: ogni pagina rimanda
  alla pagina di benvenuto senza login ricordando la pagina chiesta, attesa del ripristino della sessione, modalità
  mock);
- backend (`backend/test`): registrazione, login, rotazione e riuso dei refresh token, sign-out, controllo
  dell'origine, limiti di frequenza; sincronizzazione delle guerre con l'API simulata (stato finale, guerra chiusa
  dall'ultima lettura, registro guerre privato, errori dell'API, rotta cron) e lettura del riepilogo;
- componenti: shell e header (badge del clan, menu lingue), `LoadState` (errori tradotti), tabella partecipanti (filtri ed evidenza di chi non ha attaccato),
  pagina guerra corrente (dati, assenza guerra, errore).
