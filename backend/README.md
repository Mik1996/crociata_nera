# Backend Crociata Nera

API applicativa in **Next.js 16**: usa solo i route handler dell'App Router, senza pagine. Si occupa di:

- autenticazione degli utenti;
- **sincronizzazione automatica delle guerre**: un'attività pianificata legge l'API di Clash of Clans e salva ogni
  guerra, con tutti i dati disponibili, nella collezione `Wars` di **MongoDB**.

Il frontend Angular continua a leggere i dati di Clash of Clans dal proxy in `../server`. Questo backend non lo sostituisce.

Struttura, busta di risposta, chiavi dei messaggi e limiti di frequenza seguono le convenzioni di `continental-be`.

## Avvio

```bash
cd backend
npm install
cp .env.example .env.local     # poi compila DATABASE_URL e JWT_SECRET
npm run dev                    # http://localhost:3001
```

`npm start` dalla radice serve Angular su 4200 e inoltra `/api/v1` a `localhost:3001` (vedi `../proxy.conf.json`).

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | server di sviluppo sulla porta 3001 |
| `npm run build` / `npm start` | build e avvio in produzione |
| `npm test` | test delle rotte (Vitest + MongoDB in memoria, scaricato al primo avvio) |
| `npm run typecheck` | controllo dei tipi TypeScript |

## Configurazione (`.env.local`)

| Variabile | Descrizione | Default |
| --- | --- | --- |
| `DATABASE_URL` | stringa di connessione MongoDB, locale o Atlas | **obbligatoria** |
| `JWT_SECRET` | segreto HMAC per gli access token, almeno 32 caratteri | **obbligatorio** |
| `ACCESS_TOKEN_EXPIRES_IN` | durata dell'access token | `15m` |
| `REFRESH_TOKEN_EXPIRES_IN` | durata della sessione (refresh token) | `30d` |
| `FRONTEND_URL` | origini ammesse per CORS e per il controllo dell'origine, separate da virgola | `http://localhost:4200` |
| `CLAN_TAG` | clan di cui leggere e salvare le guerre, con `#` | **obbligatorio** per la sincronizzazione |
| `COC_API_TOKEN` | chiave dell'API di Clash of Clans, legata all'IP pubblico del server (vedi sotto) | **obbligatoria** per la sincronizzazione |
| `WAR_SYNC_INTERVAL_MINUTES` | minuti tra due letture della guerra corrente; `0` spegne lo scheduler interno | `10` |
| `CRON_SECRET` | se impostato (almeno 32 caratteri), attiva `POST /api/v1/cron/war-sync` per scheduler esterni | — |
| `COC_API_BASE_URL` | URL dell'API ufficiale (si cambia solo nei test) | `https://api.clashofclans.com/v1` |
| `ADMIN_EMAILS` | email che ricevono il ruolo ADMIN alla registrazione o all'accesso, separate da virgola | — |
| `APP_URL` | URL pubblico usato nei link delle email | il primo `FRONTEND_URL` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | server SMTP per le email di reset e conferma (qualsiasi provider, per esempio Brevo) | — |

Senza SMTP tutto funziona, ma le email non partono. In sviluppo il loro testo, con il link, viene stampato nella
console del backend.

La configurazione viene controllata alla prima richiesta, così `next build` funziona anche senza segreti.

## Struttura

```
src/
├── app/api/v1/                 route handler (un file route.ts per rotta)
│   ├── health/
│   ├── auth/{sign-up,sign-in,refresh,sign-out,me}/
│   ├── wars/ · wars/[warKey]/
│   └── [...notFound]/          404 nella busta standard
├── lib/                        infrastruttura comune
│   ├── config/                 env validato con zod, durate (15m, 30d)
│   ├── db/mongoose.ts          connessione unica e riusata
│   ├── http/                   apiHandler, BaseResult, MessageKey, ApiError, CORS, limiti di frequenza
│   ├── validation/parse.ts     body e query → errori per campo
│   └── auth/                   JWT (jose), password (bcryptjs), cookie del refresh token, ruoli
└── modules/                    un modulo per dominio
    ├── auth/                   User, Session, schemi, servizio
    └── wars/                   War, schemi, servizio
test/                           test delle rotte, MongoDB in memoria
```

### Aggiungere una API

1. Crea `src/modules/<dominio>/` con modello Mongoose, schemi zod (errori come `MessageKey`) e servizio.
2. Crea `src/app/api/v1/<dominio>/route.ts`:

   ```ts
   export const POST = apiHandler({ apiName: ApiName.X, auth: true }, async ({ request, user }) => {
     const input = await parseBody(request, mySchema);
     return { status: 201, result: await create(input, user.id), messages: [{ key: MessageKey.X_CREATED }] };
   });
   export const OPTIONS = preflight;
   ```

3. Aggiungi `ApiName.X` con il suo limite in `lib/http/api-name.ts` e le nuove chiavi in `lib/http/message-key.ts`.

`apiHandler` fa il lavoro che in continental è diviso tra middleware, guard, interceptor e filtro eccezioni:
- limite di frequenza;
- controllo dell'origine;
- autenticazione Bearer e ruoli (`roles: [UserRole.ADMIN]`);
- connessione al database;
- busta di risposta;
- traduzione degli errori in risposte.

## Risposte

Ogni risposta, anche di errore, ha la stessa forma:

```json
{
  "result": { "...": "..." },
  "messages": [{ "key": "ERROR.EMAIL_IS_ALREADY_TAKEN", "field": "email" }],
  "status": { "code": 409, "name": "HTTP_STATUS.CONFLICT" }
}
```

I messaggi sono chiavi (`SUCCESS.*` / `ERROR.*`), non testo: il frontend le traduce. Gli errori imprevisti finiscono nel log del server; al client arriva solo `ERROR.UNHANDLED_ERROR`.

## Rotte

| Metodo | Rotta | Accesso | Descrizione |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | pubblica | stato del servizio, del database (503 se MongoDB non risponde) e della sincronizzazione |
| POST | `/api/v1/cron/war-sync` | `Bearer CRON_SECRET` | esegue una sincronizzazione (attiva solo con `CRON_SECRET`) |
| POST | `/api/v1/auth/sign-up` | pubblica | `{ email, username, password, repeatPassword, playerTag? }`: crea l'account e fa login |
| POST | `/api/v1/auth/sign-in` | pubblica | `{ identifier, password }`: `identifier` è l'email o lo username |
| POST | `/api/v1/auth/refresh` | cookie | nuovo access token; il refresh token viene sostituito |
| POST | `/api/v1/auth/sign-out` | cookie | chiude la sessione e cancella il cookie; si può ripetere senza effetti |
| GET | `/api/v1/auth/me` | Bearer | utente corrente |
| PATCH | `/api/v1/auth/me` | Bearer | `{ playerTag }`: collega il tag giocatore, oppure lo scollega con `null` o `''` |
| POST | `/api/v1/auth/change-password` | Bearer + cookie | `{ currentPassword, password, repeatPassword }`: chiude le altre sessioni |
| POST | `/api/v1/auth/forgot-password` | pubblica | `{ email, language? }`: manda per email un link di reset valido 1 ora; la risposta è la stessa anche se l'email non è registrata |
| POST | `/api/v1/auth/reset-password` | pubblica | `{ token, password, repeatPassword }`: imposta la nuova password e chiude tutte le sessioni |
| POST | `/api/v1/auth/verify-email` | pubblica | `{ token }`: conferma l'email (il link vale 24 ore e viene inviato alla registrazione) |
| POST | `/api/v1/auth/verify-email/resend` | Bearer | `{ language? }`: rimanda l'email di conferma |
| GET | `/api/v1/admin/users?page&limit&search` | ADMIN | utenti registrati |
| PATCH | `/api/v1/admin/users/{id}` | ADMIN | `{ roles?, playerTag? }`: un admin non può togliersi il ruolo da solo; se i ruoli cambiano, le sessioni dell'utente vengono chiuse |
| GET | `/api/v1/wars/archive?limit=60` | Bearer | guerre salvate complete, nel formato `currentwar` dell'API di Clash of Clans: è la fonte dello storico nel frontend |
| GET | `/api/v1/history` · `/api/v1/history/{YYYY-MM\|all}` | Bearer | mesi registrati e classifiche, calcolati da MongoDB con lo stesso formato del proxy |
| GET | `/api/v1/cwl/seasons` · `/api/v1/cwl/seasons/{YYYY-MM}` | Bearer | stagioni della Lega (CWL) salvate e dettaglio di una stagione: girone e tutte le guerre, nel formato dell'API di Clash of Clans. Lo scheduler delle guerre salva anche la CWL (gruppo e guerre; quelle concluse si leggono una volta sola) |
| GET | `/api/v1/raids/seasons?limit=10` | Bearer | Raid Weekend salvati, nel formato di `capitalraidseasons`. L'API elenca i membri (attacchi e oro) solo mentre il weekend è in corso: lo scheduler li salva a ogni lettura e un minuto prima della fine, così restano anche per i weekend passati |
| GET | `/api/v1/wars?page&limit&state` | Bearer | riepilogo delle guerre salvate, dalla più recente, senza membri |
| GET | `/api/v1/wars/{warKey}` | Bearer | dettaglio con membri e attacchi |

Sign-up, sign-in e refresh restituiscono `{ user, accessToken, accessTokenExpiresAt }`.

## Autenticazione

- **Access token:** JWT HS256 di 15 minuti con `sub` (id utente) e `roles`. Si invia in `Authorization: Bearer`. Il frontend lo tiene solo in memoria.
- **Refresh token:** valore casuale di 256 bit in un cookie `cn_refresh` con `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth` e `Secure` in produzione. JavaScript non può leggerlo.
- **Sessioni nel database:** ogni token ha una riga nella collezione `Sessions`, salvato solo come hash SHA-256. MongoDB cancella da solo le sessioni scadute.
- **Rotazione:** a ogni refresh il token vecchio viene annullato. Se qualcuno riusa un token già annullato (segno che è stato rubato), si chiudono **tutte** le sessioni dell'utente.
- **Password:** bcrypt con costo 12; almeno 8 caratteri, con una lettera e un numero.
- **Login:** l'errore è lo stesso per utente inesistente e password sbagliata, e anche il tempo di risposta è simile.
- **Protezione CSRF:** sulle rotte che usano il cookie, oltre a `SameSite=Strict`, si rifiuta un `Origin` non presente in `FRONTEND_URL`.
- **Limiti di frequenza:** per IP e per rotta (`lib/http/api-name.ts`). Sono tenuti in memoria, quindi con più istanze serve uno store condiviso come Redis. L'IP si legge da `X-Forwarded-For`: in produzione il backend deve stare dietro un reverse proxy che sovrascrive quell'header.

**Account**
- **Verifica dell'email:** link valido 24 ore, inviato alla registrazione.
- **Recupero della password:** link valido 1 ora; dopo il reset tutte le sessioni vengono chiuse.
- **Cambio password:** chiude le altre sessioni e lascia attiva quella corrente.
- **Token monouso:** nel database c'è solo il loro hash SHA-256, con la scadenza.
- **Amministratori:** il primo si crea con `ADMIN_EMAILS`, gli altri dalla pagina di amministrazione.

## Sincronizzazione delle guerre

### Dove incollare la chiave API

1. Scopri l'IP pubblico della macchina su cui gira il backend: in locale `curl -s https://api.ipify.org`; in
   produzione l'IP del server o della VM.
2. Su [developer.clashofclans.com](https://developer.clashofclans.com) vai in **My Account → Create New Key**: scegli
   un nome e una descrizione e inserisci quell'IP in **Allowed IP Addresses**.
3. Copia la chiave (il token lungo che inizia con `eyJ…`) e incollala in **`backend/.env.local`**:

   ```
   COC_API_TOKEN=eyJ0eXAiOiJKV1Qi...
   CLAN_TAG=#2J8JVVCLC
   ```

4. Riavvia il backend (`npm run backend`). Nel terminale deve comparire
   `[war-sync] reading the current war of #2J8JVVCLC every 10 min` seguito dall'esito della prima lettura.

`.env.local` è escluso da git. In produzione la chiave va nei secret della piattaforma, mai nel codice. Se il backend
gira sulla stessa macchina del proxy (`server/`), puoi usare la stessa chiave del proxy, perché è legata allo stesso IP.
Se l'IP cambia (per esempio una connessione di casa con IP dinamico), l'API risponde `accessDenied.invalidIp`: crea una
chiave per il nuovo IP.

### Come funziona

`src/instrumentation.ts` avvia lo scheduler (`src/lib/scheduler/war-sync-scheduler.ts`) quando parte il server. A ogni
giro `syncWars` (`src/modules/wars/war-sync.service.ts`) esegue tre passi.

1. **Legge la guerra in corso** (`GET /clans/{tag}/currentwar`) e la salva, sia in preparazione sia in battaglia sia
   terminata. Salva tutti i dati disponibili: formato, date, modificatore, i due clan con livello, stemma, stelle,
   distruzione e attacchi, e ogni membro con municipio, posizione, attacchi fatti (bersaglio, stelle, distruzione,
   ordine, durata), attacchi subiti e miglior attacco subito.
2. **Chiude le guerre di cui non ha visto la fine.** Dopo la fine, l'API mostra `warEnded` solo finché il clan non
   avvia una nuova ricerca. Se nel frattempo è già partita un'altra guerra, quella precedente viene chiusa usando
   l'ultima lettura del giorno di battaglia (`finalizedFrom: "lastSnapshot"`).
3. **La completa con il registro guerre** (`GET /clans/{tag}/warlog`): stelle e distruzione finali ufficiali, esito ed
   esperienza guadagnata dal clan (`warLogMatched: true`). Se il registro è privato, la guerra resta com'è.

**Ritmo:** legge ogni `WAR_SYNC_INTERVAL_MINUTES`, e in più un minuto dopo l'orario di fine della guerra in corso,
per prendere lo stato finale completo (`finalizedFrom: "currentWar"`).

**Garanzie:**
- ogni passo si può ripetere senza effetti: la guerra si aggiorna invece di duplicarsi e non torna mai a uno stato
  precedente;
- gli errori dell'API (chiave scaduta, IP non autorizzato, manutenzione) non fermano il server: finiscono nel log e in
  `GET /api/v1/health` → `warSync.lastError`.

Le giornate della Clan War League non compaiono in `currentwar` e non vengono salvate.

### Dove gira lo scheduler

Lo scheduler interno richiede un server Node sempre acceso (`npm start`, Docker, una VM). Su piattaforme serverless
(per esempio Vercel) imposta `WAR_SYNC_INTERVAL_MINUTES=0` e `CRON_SECRET`, poi fai chiamare ogni 10 minuti:

```bash
curl -X POST https://il-tuo-backend/api/v1/cron/war-sync -H "Authorization: Bearer $CRON_SECRET"
```

La chiave API deve comunque autorizzare l'IP da cui escono le richieste del backend: su serverless gli IP in uscita
cambiano, quindi serve un IP statico.

### Riepilogo per il frontend

`GET /api/v1/wars?state=warEnded&page=1&limit=20` (con access token) restituisce
`{ items, total, page, limit }`. Ogni elemento contiene:
- `warKey`, `state`, `result`, `teamSize`, `attacksPerMember`, `battleModifier`;
- le date (`preparationStartTime`, `startTime`, `endTime`, `endedAt`);
- `finalizedFrom`, `warLogMatched`, `lastSyncedAt`;
- `clan` e `opponent`, ciascuno con `tag`, `name`, `clanLevel`, `badgeUrl`, `stars`, `destructionPercentage`,
  `attacks` ed `expEarned`.

`GET /api/v1/wars/{warKey}` aggiunge i membri con tutti gli attacchi.
