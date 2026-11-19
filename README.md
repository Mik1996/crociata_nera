# Crociata Nera · Guerre di clan

Webapp Angular per il clan **Crociata Nera** di Clash of Clans (tag `#2J8JVVCLC`).
Permette di consultare le guerre del clan e di analizzare nel tempo le performance dei partecipanti.

I dati reali arrivano dall'[API ufficiale di Clash of Clans](https://developer.clashofclans.com) tramite il
**backend** del progetto (`backend/`, Next.js), che conserva il token lontano dal browser, salva guerre, Lega e Raid
Weekend su MongoDB e restituisce al frontend tutti i dati, tabelle comprese (filtrate, ordinate e paginate dal backend).
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
| Statistiche | `/statistics` | Classifica dei membri per **media stelle per guerra** (max 6), per mese o su tutti i mesi, dalle guerre salvate dal backend |

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

1. Configura il backend (chiave dell'API di Clash of Clans, MongoDB, segreto JWT) in `backend/.env.local`, come
   descritto in [backend/README.md](backend/README.md) (vedi anche [Chiave API](#chiave-api)).
2. In due terminali separati:

   ```bash
   npm install && npm --prefix backend install
   npm run backend      # Next.js su http://localhost:3001
   npm start            # app su http://localhost:4200 (le chiamate /api/v1 vanno al backend)
   ```

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
- **Backend**: Next.js 16 (route handler), Mongoose 9, zod 4, Vitest con MongoDB in memoria (vedi
  [backend/README.md](backend/README.md))

## Convenzioni

Il codice è scritto in **inglese**: nomi di file, tipi, variabili, funzioni, classi CSS, chiavi di traduzione,
commenti e descrizioni dei test. L'italiano (come inglese e spagnolo) compare solo nei testi dell'interfaccia,
in `public/i18n/*.json`.

## Struttura del progetto

```
backend/                          Backend applicativo (Next.js): dati di Clash of Clans, account, MongoDB
proxy.conf.json                   Inoltro /api/v1 → backend durante `npm start`
src/
├── environments/                 Configurazione (mock/API, URL del backend, tag clan)
│   ├── environment.ts            produzione (npm run build) – dati reali
│   ├── environment.development.ts sviluppo (npm start) – dati reali dal backend
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
    │   │   ├── http-coc-api.service.ts  Implementazione HTTP (backend /api/v1)
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
                     browser ─► /api/v1 (proxy.conf.json, Caddy) ─► backend/ (token, cache, MongoDB) ─► api.clashofclans.com/v1
```

### Dati di Clash of Clans dal backend

Il frontend non chiama mai l'API ufficiale: ogni dato passa dal backend, che la legge con il suo token
(`backend/src/lib/coc/live-coc.ts`) e tiene in memoria le risposte per un po' (clan 1 minuto, guerra in corso 30
secondi, registro guerre 5 minuti, profili 10 minuti). I dati dell'API mantengono il loro formato (`GET /api/v1/clan`,
`/wars/current`, `/wars/warlog`, `/players/{tag}/profile`) e vengono convertiti dai mapper del frontend. Le rotte del
clan sono riservate ai membri; le pagine pubbliche hanno rotte dedicate con solo i dati che mostrano (`GET /welcome`).
Se l'API non risponde, il backend risponde 502 con `ERROR.COC_API_UNAVAILABLE` e la pagina mostra il messaggio tradotto.

Le tabelle sono filtrate, ordinate e paginate dal backend; KPI e grafici si calcolano lato client in
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
  | guerre salvate, registro guerre, Lega, Raid Weekend | 5 minuti |
  | profilo giocatore | 10 minuti |
  | clan e dati pubblici della pagina di benvenuto | 5 minuti |
  | storico mensile, traduzioni | 15 minuti (default) |

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

La home (`/`) presenta il clan come un banner del gioco, con i dati di `GET /api/v1/welcome`: la rotta pubblica del
backend fatta per questa pagina (i tre clan della Crociata con i membri ridotti a nome e ruolo, e le posizioni in
classifica). È pubblica: è la pagina che vede chi non ha ancora fatto login. La usano anche "Unisciti a noi" e lo stemma
nell'header.

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
`GET /v1/players/{tag}` tramite il backend (`GET /api/v1/players/{tag}/profile`).

- **Intestazione**: municipio (con livello dell'arma), stella dell'esperienza, nome, ruolo, clan, preferenza di guerra,
  etichette, lega con icona ufficiale, trofei e record.
- **Profilo**: stelle di guerra, attacchi e difese vinti, truppe donate e ricevute, contributi alla capitale, trofei
  leggenda, base del costruttore; eroi con livello, barra di avanzamento ed equipaggiamento assegnato.
- **Esercito**: truppe, super truppe (attive a colori), macchine d'assedio, animali, incantesimi, equipaggiamenti e base
  del costruttore, con il livello nell'angolo (oro se al massimo).
- **Obiettivi**: achievement con stelle e avanzamento. **Guerre**: le statistiche di guerra dalle guerre salvate dal backend.

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
| `useMockApi` | `true` = dati mock, `false` = chiamate HTTP al backend | `false` (`true` solo in `environment.mock.ts`) |
| `backendBaseUrl` | URL base del **backend** (`backend/`: tutti i dati e gli account) | `/api/v1` |
| `clanTag` | Tag del clan, con `#` | `#2J8JVVCLC` |
| `clanName` | Nome mostrato nell'header | `Crociata Nera` |
| `mockLatencyMs` | Latenza simulata del mock (ms) | `500` dev / `300` prod |
| `statsWindow` | Numero di guerre usate per le statistiche dei giocatori | `20` |

Le variabili del backend (chiave dell'API, MongoDB, JWT, email) sono in `backend/.env.local` in sviluppo e in
`deploy/.env` in produzione: vedi [backend/README.md](backend/README.md).

## Backend applicativo

`backend/` è un progetto Next.js separato, con il suo `package.json`. Gestisce:

- l'autenticazione: sign-up, sign-in, refresh, sign-out e `me`;
- il **salvataggio automatico delle guerre** su MongoDB: un'attività pianificata del backend legge da sola l'API di
  Clash of Clans, senza browser;
- **tutti i dati di Clash of Clans** che le pagine mostrano (vedi [Dati di Clash of Clans dal backend](#dati-di-clash-of-clans-dal-backend)).

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
  salvate su MongoDB.

Rotte, modello dati e sicurezza sono descritti in [backend/README.md](backend/README.md).

## Dati reali dall'API di Clash of Clans

### Chiave API

1. Accedi a <https://developer.clashofclans.com> e crea una chiave.
2. Nel campo **IP addresses** inserisci l'**IP pubblico della macchina su cui gira il backend**
   (per scoprirlo: `curl https://api.ipify.org`). La chiave funziona **solo** da quegli IP.
3. Copia il token in `COC_API_TOKEN` di `backend/.env.local` (in produzione, di `deploy/.env`).

Se l'IP cambia (le connessioni domestiche hanno spesso IP dinamico) l'API risponde `accessDenied.invalidIp`: le pagine
mostrano "L'API di Clash of Clans non risponde" e il log del backend riporta il motivo. Crea una nuova chiave con
quell'IP; il portale permette più chiavi per account.

**Non inserire mai il token nel codice del frontend** né negli `environment.ts`: sarebbe pubblico.
Il browser non può comunque chiamare l'API direttamente (IP variabili, nessun CORS).

### Rotte del backend con i dati di Clash of Clans

| Rotta | Accesso | Contenuto |
| --- | --- | --- |
| `GET /api/v1/welcome` | pubblica | i tre clan della Crociata (membri: solo nome e ruolo) e le posizioni in classifica |
| `GET /api/v1/clan` | membri | il clan con i membri, come `GET /v1/clans/{tag}` |
| `GET /api/v1/wars/current` | membri | la guerra in corso, come `GET /v1/clans/{tag}/currentwar` (`null` fuori guerra o con registro privato) |
| `GET /api/v1/wars/warlog` | membri | il registro guerre, come `GET /v1/clans/{tag}/warlog` (vuoto se privato) |
| `GET /api/v1/players/{tag}/profile` | membri | il profilo di un giocatore, come `GET /v1/players/{tag}` |
| `GET /api/v1/auth/me/memberships` | utente | gli account collegati che sono in un clan della Crociata |

Le tabelle delle pagine, le guerre salvate, la Lega, i Raid Weekend e le altre rotte sono descritte in
[backend/README.md](backend/README.md) e nella documentazione OpenAPI (`/api/v1/docs`).

### Da dove arriva lo storico

L'API ufficiale **non fornisce gli attacchi individuali delle guerre passate**:

- `/currentwar` contiene partecipanti e attacchi, ma solo per la guerra in corso, o appena finita (`warEnded`);
- `/warlog` elenca le guerre passate con risultato, stelle e distruzione, ma **senza partecipanti**.

Per questo il backend interroga `/currentwar` ogni `WAR_SYNC_INTERVAL_MINUTES` minuti e salva ogni guerra nella
collezione `Wars` di MongoDB. Il frontend unisce le due sorgenti:

- guerre **archiviate**: dettaglio completo, con i totali definitivi presi dal registro;
- guerre presenti **solo nel registro**: segnate come *"solo riepilogo"* nello storico. Il dettaglio mostra
  il tabellone senza la tabella dei partecipanti, e queste guerre sono escluse dalle statistiche dei giocatori.

Conseguenza pratica: le statistiche individuali si costruiscono **da quando il backend salva le guerre**. Va tenuto in
esecuzione con continuità per non perdere guerre: ne basta una lettura durante le ~24 ore di `warEnded`.

### Storico mensile e classifica

Il backend calcola lo storico dalle guerre terminate salvate su MongoDB (`backend/src/modules/wars/history.service.ts`),
raggruppandole per il mese in cui sono terminate (fuso orario Europe/Rome).

Ogni periodo (un mese o tutti i mesi) contiene:

- `wars`: riepilogo di ogni guerra (avversario, risultato, stelle, distruzione) con, per ogni giocatore,
  municipio, posizione, attacchi disponibili, ogni attacco (stelle, distruzione, municipio e posizione del bersaglio),
  attacchi subiti e stelle concesse in difesa;
- `players`: totali per giocatore. Comprendono guerre, attacchi disponibili, usati e
  mancati, stelle, attacchi da 3/2/1/0 stelle, **media stelle per guerra**, media stelle per attacco, % 3 stelle,
  distruzione media, partecipazione e media delle stelle concesse.

Il salvataggio è **idempotente**: la stessa guerra, cioè con lo stesso inizio della preparazione e lo stesso
avversario, aggiorna la precedente invece di essere contata due volte.

La pagina **Statistiche** mostra la classifica ordinata per **media stelle per guerra** = stelle totali ÷ guerre
disputate. Il massimo è 6, cioè due attacchi da 3 stelle, e gli attacchi non usati valgono 0. A parità decidono
distruzione media, partecipazione e numero di guerre. Si può scegliere un mese o "Tutti i mesi", filtrare per numero
minimo di guerre e nascondere gli ex membri.

> Le guerre della Lega (CWL) non passano da `/currentwar` e quindi non entrano nello storico: hanno la loro pagina.

### Casi particolari

| Risposta API | Comportamento dell'app |
| --- | --- |
| `403 accessDenied.invalidIp` | "L'API di Clash of Clans non risponde" (502 dal backend, motivo nel log): crea una chiave per l'IP del backend |
| `403 accessDenied` su `currentwar`/`warlog` | Registro guerre del clan **privato**: nessuna guerra visibile. Rendilo pubblico dalle impostazioni del clan nel gioco |
| `state: notInWar` | "Il clan non è attualmente in guerra" |
| `429 requestThrottled` / `503 inMaintenance` | "L'API di Clash of Clans non risponde" e pulsante Riprova |
| Backend spento | "Servizio non raggiungibile" e pulsante Riprova |
| Voci CWL nel registro (`result: null`) | Ignorate: le guerre della Lega usano endpoint diversi, non ancora gestiti |

### In produzione

Il sito e il backend girano sulla VPS dietro Caddy, che serve l'app e inoltra `/api/v1` al backend: vedi
[Pubblicazione](#pubblicazione-vps). La chiave API deve autorizzare l'IP pubblico della VPS.

## Telegram

Ogni base pubblicata nell'arsenale (caricata da un amministratore o proposta e approvata) viene pubblicata dal
bot nel canale Telegram del suo municipio, con l'immagine, il castello del clan, la descrizione, l'autore (nome
in gioco del suo villaggio di grado più alto) e il pulsante **Copia la base**. Modificare o eliminare la base
sul sito modifica o elimina anche il post. La direzione è sempre sito → Telegram.

- **Canali**: in **Amministrazione → Telegram** (`/admin/telegram`) si sceglie il municipio di ogni canale.
  Un canale compare lì quando il bot ne diventa amministratore (con il permesso di pubblicare). Se il bot lo
  era già prima, basta pubblicare un messaggio nel canale, oppure aggiungerlo con il suo `@username`.
- **Municipio senza canale** (es. TH19): il bot non può creare canali. La base resta "in attesa" e parte
  appena un canale viene collegato a quel municipio.
- **Errori**: un invio non riuscito viene ritentato da solo (dopo 5 minuti, poi a intervalli crescenti) o
  subito con **Riprova ora**.

Configurazione:

| Variabile | Dove | Cosa |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `deploy/.env` (VPS), `backend/.env.local` (sviluppo) | Token del bot da @BotFather. Senza, Telegram è spento |
| `TELEGRAM_WEBHOOK_SECRET` | solo `deploy/.env` | `openssl rand -hex 32`. Con questo Telegram invia gli aggiornamenti a `/api/v1/telegram/webhook` (registrato all'avvio del backend) |

In sviluppo si usa **un altro bot** (es. *Crociata Nera Dev*) con canali di prova. Senza
`TELEGRAM_WEBHOOK_SECRET` il backend legge gli aggiornamenti con `getUpdates`, e un bot ha un solo webhook:
usare in locale il bot di produzione gli toglierebbe il webhook.

## Pubblicazione (VPS)

Il sito gira su una VPS con IP fisso (Aruba Cloud, Ubuntu 24.04) e va online su **https://crociatanera.it**. La
cartella `deploy/` contiene tutto quello che serve:

| File | A cosa serve |
| --- | --- |
| `docker-compose.yml` | i due servizi: `web` (Caddy + Angular) e `backend` (`backend/`) |
| `Caddyfile` | HTTPS automatico con Let's Encrypt; `/api/v1` va al backend, il resto è l'app Angular (`/api/coc`, il vecchio proxy, risponde 410); header di sicurezza, CSP (per ora `Report-Only`), log degli accessi |
| `web.Dockerfile`, `backend.Dockerfile` | le immagini (il backend usa l'output `standalone` di Next.js) |
| `.env.example` | il modello delle impostazioni di produzione: dominio, chiave dell'API di Clash of Clans, MongoDB Atlas, segreto JWT |
| `deploy.sh` | porta il codice al commit da pubblicare, costruisce le immagini una alla volta, controlla il Caddyfile, riavvia e, se i servizi non diventano sani, torna alle immagini precedenti |
| `rollback.sh` | rimette in servizio le immagini di un deploy precedente, senza ricostruire (vedi [Rollback](#rollback)) |
| `lib.sh` | funzioni comuni agli script (lettura di `.env`, immagini, attesa dei controlli di salute) |
| `service-worker.sh` | interruttore d'emergenza del service worker nei browser (`off`, `on`, `status`) |
| `backup.sh` | backup notturno del database (controllato, con copia cifrata fuori sede e allarme facoltativi) |

**Architettura:**
- da internet sono raggiungibili solo le porte 80 e 443, cioè Caddy; il backend resta sulla rete interna di Docker;
- il database è MongoDB Atlas (M0), con l'IP della VPS autorizzato;
- il backend usa la chiave dell'API di Clash of Clans creata per l'IP della VPS.

**Primo avvio**, sulla VPS:

```bash
git clone https://github.com/Mik1996/crociata_nera.git ~/crociata_nera
cd ~/crociata_nera/deploy
cp .env.example .env && nano .env      # compila COC_API_TOKEN, DATABASE_URL e JWT_SECRET (openssl rand -base64 48)
./deploy.sh
```

**Aggiornamenti automatici:** il workflow `.github/workflows/deploy.yml` lancia i test a ogni push e pull request, in
due job paralleli: `Frontend` (lint, test, build di produzione, con la cache di build di Angular conservata tra
un'esecuzione e l'altra) e `Backend` (type check e test). Entrambi segnalano anche le vulnerabilità note delle
dipendenze di produzione (`npm audit --omit=dev --audit-level=high`), per ora senza bloccare. Dependabot
(`.github/dependabot.yml`) apre ogni lunedì le pull request di aggiornamento di pacchetti npm, immagini Docker e
GitHub Actions, raggruppate. Su `master`, se entrambi i job passano:
- si collega alla VPS ed esegue `deploy.sh`, passandogli lo sha del commit appena testato: viene pubblicato
  esattamente quel commit, anche se nel frattempo `master` è andato avanti;
- poi controlla `https://crociatanera.it/api/v1/health`.

La chiave SSH usata da GitHub Actions è dedicata e, sul server, può lanciare solo `deploy.sh` (`command="…"` in
`authorized_keys`): lo sha passato come comando ssh arriva a `deploy.sh` in `SSH_ORIGINAL_COMMAND`, che accetta solo
40 caratteri esadecimali di un commit presente su `origin/master`.

I secret del repository sono:

| Secret | Contenuto |
| --- | --- |
| `VPS_HOST` | IP della VPS |
| `VPS_SSH_KEY` | la chiave privata dedicata |
| `VPS_KNOWN_HOSTS` | l'output di `ssh-keyscan -t ed25519 <IP>` |

Per pubblicare a mano: `~/crociata_nera/deploy/deploy.sh` sulla VPS (l'ultimo `origin/master`; con uno sha completo,
`deploy.sh <sha>`, quel commit di `master`, anche più vecchio), oppure "Run workflow" nella scheda Actions. Il `master`
locale della VPS segue il commit pubblicato (`git checkout -B master <sha>`): non tenere modifiche locali nel clone.

**Controlli di salute e limiti di memoria:** in `docker-compose.yml` il backend ha un `healthcheck` che chiama
`/api/v1/health` con `node` (l'immagine non ha `curl`) e Caddy uno sulla sua API di amministrazione locale. Sono
controlli di vita: per il backend basta una qualsiasi risposta HTTP, perché `/api/v1/health` risponde 503 anche quando
il database o la sincronizzazione delle guerre sono in difficoltà, cosa che un riavvio non risolverebbe. `web` non
aspetta che il backend sia sano (`depends_on` semplice): mentre il backend parte, il sito resta su e mostra i suoi stati
di errore. I limiti di memoria valgono solo per i container in esecuzione (backend 1 GB, Caddy 256 MB); le build hanno
il loro heap da 1,5 GB.

#### Rollback

Ogni deploy etichetta le immagini con ora e commit (`crociata-nera-backend:20261118093000-0123456789ab`, idem
`crociata-nera-web`) e sposta su di esse l'etichetta `current`, quella che `docker-compose.yml` mette in servizio; le
immagini che giravano prima restano come `previous`, e si conservano le ultime 3 build.

- **Automatico:** dopo `docker compose up -d`, `deploy.sh` aspetta fino a 3 minuti che entrambi i container siano
  `healthy`. Se non succede, rimette `previous`, riavvia ed esce con errore (il workflow fallisce e GitHub manda
  l'email).
- **A mano**, sulla VPS:
  ```bash
  cd ~/crociata_nera/deploy
  ./rollback.sh              # le immagini precedenti (rilanciato, torna a quelle di prima)
  ./rollback.sh list         # le build conservate
  ./rollback.sh 0123456      # l'ultima build conservata di quel commit (anche lo sha completo)
  ```
- Il rollback non tocca il codice: il deploy successivo ricostruisce `master`. Per restare sulla versione vecchia,
  annulla il commit difettoso su `master` (`git revert`, il push lo pubblica) oppure, sulla VPS, `./deploy.sh <sha>`
  con lo sha completo di un commit precedente (ricostruisce).

**Backup:**
- `deploy/backup.sh` salva il database con `mongodump` in `/root/backups/mongo-AAAAMMGG-HHMMSS.archive.gz` e lo
  controlla: dev'essere un gzip integro (`gzip -t`) e non più piccolo di `BACKUP_MIN_BYTES` (4096 byte; un database
  vuoto ne dà circa 150: conviene alzarlo a circa metà della dimensione abituale di un dump). I dump restano 14 giorni
  (`KEEP_DAYS`). L'archivio del vecchio proxy (volume `proxy_data`, non più usato, conservato finché le sue guerre non
  vengono importate o scartate) è un solo file, `proxy-data.tar.gz`, rifatto solo se i file del volume cambiano.
- Sulla VPS va pianificato con cron:
  ```bash
  ( crontab -l 2>/dev/null; echo "30 3 * * * /root/crociata_nera/deploy/backup.sh >> /var/log/crociata-backup.log 2>&1" ) | crontab -
  ```
- Le impostazioni, tutte facoltative, vanno in `deploy/.env` (vedi `.env.example`): `BACKUP_DIR`, `KEEP_DAYS`,
  `BACKUP_MIN_BYTES`, `BACKUP_RCLONE_REMOTE`, `BACKUP_RCLONE_KEEP_DAYS`, `BACKUP_HEALTHCHECK_URL`. Gli script leggono
  `.env` riga per riga, alla lettera (non lo eseguono come shell): una password con `$` o `;` resta com'è.
- **Copia fuori dalla VPS** (consigliata: oggi i backup stanno sullo stesso disco del server). Con
  `BACKUP_RCLONE_REMOTE` impostato, ogni dump viene copiato con [rclone](https://rclone.org) e lì tenuto
  `BACKUP_RCLONE_KEEP_DAYS` giorni (60). Il remote dev'essere cifrato (tipo `crypt`): il dump contiene utenti, email e
  hash delle password. Una volta sola, sulla VPS:
  ```bash
  apt install -y rclone
  rclone config
  #  1. n → nome "offsite" → lo spazio scelto (Backblaze B2, S3, Google Drive, …) e le sue credenziali;
  #  2. n → nome "crociata-crypt" → tipo "crypt" → remote "offsite:crociata-backups"
  #     → filename_encryption "standard" → directory_name_encryption true
  #     → password e salt: "g" (generate), e SALVALE nel password manager: senza, i backup non si decifrano.
  rclone copy --no-traverse "$(ls -t /root/backups/mongo-*.archive.gz | head -n 1)" crociata-crypt:   # prova
  rclone ls crociata-crypt:
  echo 'BACKUP_RCLONE_REMOTE=crociata-crypt:' >> ~/crociata_nera/deploy/.env
  ```
  La configurazione di rclone (`/root/.config/rclone/rclone.conf`) contiene le credenziali: resta sulla VPS, e una copia
  delle sole password del `crypt` va tenuta altrove.
- **Allarme se il backup non arriva** (dead man's switch): crea un check gratuito su [healthchecks.io](https://healthchecks.io)
  (periodo 1 giorno, tolleranza 2 ore) e metti l'URL di ping in `deploy/.env`:
  ```bash
  echo 'BACKUP_HEALTHCHECK_URL=https://hc-ping.com/<uuid>' >> ~/crociata_nera/deploy/.env
  ```
  `backup.sh` lo chiama dopo un backup riuscito e chiama `<url>/fail` dopo uno fallito: se non arriva niente (VPS
  spenta, cron rotto) o arriva un fallimento, healthchecks.io manda un'email.
- Ripristino del database (sostituisce i dati di produzione: `--drop`):
  ```bash
  cd ~/crociata_nera/deploy
  docker compose run --rm -T mongo-tools sh -c 'mongorestore --uri="$DATABASE_URL" --archive --gzip --drop' < /root/backups/mongo-AAAAMMGG-HHMMSS.archive.gz
  ```
- **Prova di ripristino, una volta al mese**: un backup mai ripristinato non è un backup. Il dump più recente va in un
  MongoDB usa e getta sulla VPS, senza toccare Atlas:
  ```bash
  dump=$(ls -t /root/backups/mongo-*.archive.gz | head -n 1)
  # oppure dalla copia fuori sede: rclone copy crociata-crypt:<nome del file> /root/restore-test/
  docker run -d --rm --name restore-test mongo:8.0.38
  sleep 10
  docker exec -i restore-test mongorestore --archive --gzip --quiet < "$dump"
  docker exec restore-test mongosh --quiet Prod --eval 'db.getCollectionNames().sort().forEach(c => print(c, db[c].countDocuments()))'
  docker stop restore-test
  ```
  I conteggi devono essere plausibili (utenti, guerre, raid…) e confrontabili con quelli del sito; ogni tanto conviene
  provare anche un file scaricato dalla copia fuori sede, per verificare che le password del `crypt` funzionino.

**Monitoraggio:** `.github/workflows/uptime.yml` controlla ogni 15 minuti il sito, `/api/v1/health` e la lettura
dell'API di Clash of Clans dal backend (`/api/v1/welcome`). Se
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

#### Content Security Policy

Oltre agli header di sicurezza classici, Caddy (`deploy/Caddyfile`) manda `Permissions-Policy` (niente fotocamera,
microfono e posizione), `Cross-Origin-Opener-Policy: same-origin` e una **Content Security Policy in modalità
`Report-Only`**: i browser segnalano nella console (DevTools) quello che bloccherebbero, ma non bloccano niente. Le
politiche sono due: una per il sito e una per Swagger UI (`/api/v1/docs`, che carica i suoi file da `cdn.jsdelivr.net`).

Quella del sito ammette: i file del sito; i due script inline dell'`index.html` costruito, per hash (lo script del tema
di `src/index.html` e quello che la build di Angular aggiunge per caricare gli stili); gli stili inline (li inseriscono
Angular e la build, che incorpora anche il CSS di Google Fonts) e `fonts.googleapis.com`; i font di `fonts.gstatic.com`;
le immagini del sito, `data:`, `blob:` (anteprime degli screenshot delle basi, medaglie 3D) e
`api-assets.clashofclans.com` (stemmi, leghe, etichette); le chiamate a `/api/v1` e ai font (il service worker li
mette in cache); il service worker e il manifest del sito.

**Gli hash vanno tenuti allineati:** ogni modifica allo script inline di `src/index.html` (anche solo agli spazi) o
all'HTML di Swagger UI (`backend/src/app/api/v1/docs/route.ts`) cambia il suo hash. Per ricalcolarli:

```bash
npx ng build --configuration production
node -e "const h=require('fs').readFileSync('dist/crociata_nera/browser/index.html','utf8');for(const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g))console.log(\"'sha256-\"+require('crypto').createHash('sha256').update(m[1]).digest('base64')+\"'\")"
```

**Per passare da `Report-Only` a una politica applicata:**
1. pubblica la versione `Report-Only` e usa il sito per qualche giorno (pagine pubbliche, accesso, profilo, basi con
   caricamento di uno screenshot, medaglie, Swagger UI da amministratore), con la console del browser aperta: non
   devono comparire violazioni `[Report Only]`; se compaiono, correggi la politica o il codice;
2. in `deploy/Caddyfile` rinomina `Content-Security-Policy-Report-Only` in `Content-Security-Policy` (entrambe le
   righe), poi push su `master`;
3. ricontrolla subito il sito: una violazione ora rompe davvero la pagina. Per tornare indietro basta ripristinare il
   nome dell'header (o `./rollback.sh` sulla VPS, che rimette l'immagine precedente di Caddy).

In alternativa agli hash scritti a mano, Angular può calcolarli da sé a ogni build (`security.autoCsp` in
`angular.json`), mettendo la politica in un `<meta>` dell'`index.html`.

**Log degli accessi:** Caddy scrive una riga JSON per richiesta sullo stdout del container (`docker compose logs web`),
con la rotazione dei log di Docker (3 file da 10 MB); cookie e header `Authorization` sono oscurati.

Per provare la build di produzione in locale: `npm run start:prod` (http://localhost:4400; serve
`http://localhost:4400` in `FRONTEND_URL` di `backend/.env.local`).

**Comandi utili:**
- `docker compose logs -f backend` (oppure `web`): mostra i log;
- `docker compose ps`: mostra lo stato dei servizi;
- `curl -s https://crociatanera.it/api/v1/health`: stato del database e della sincronizzazione delle guerre.

**Dati:**
- l'archivio del vecchio proxy è nel volume `proxy_data` (non più usato), i certificati in `caddy_data`;
- `deploy/.env` resta solo sul server ed è escluso da git.

## Test

I test unitari coprono:

- calcolo statistiche e KPI (`war-stats.spec.ts`), ordinamento e ricerca (`sort.spec.ts`);
- generatore mock: determinismo e rispetto delle regole di guerra (`mock-data.spec.ts`);
- mapper dell'API ufficiale, compresi registro guerre, voci CWL e unione con l'archivio (`coc-api.mappers.spec.ts`);
- servizio HTTP con `HttpTestingController`: solo rotte del backend, assenza del token, errori del backend tradotti,
  backend irraggiungibile, unione di archivio e registro;
- storico mensile (`monthly-history.spec.ts`, `backend/test/history.test.ts`): somma delle guerre, medie, ordinamento
  della classifica, mese con fuso italiano;
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
