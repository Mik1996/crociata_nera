# Backend Crociata Nera

API applicativa in **Next.js 16**: usa solo i route handler dell'App Router, senza pagine. Si occupa di:

- autenticazione degli utenti;
- salvataggio automatico delle guerre su **MongoDB**.

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
| `CLAN_TAG` | se impostato, accetta solo le guerre di questo clan | — |

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
| GET | `/api/v1/health` | pubblica | stato del servizio e del database (503 se MongoDB non risponde) |
| POST | `/api/v1/auth/sign-up` | pubblica | `{ email, username, password, repeatPassword, playerTag? }`: crea l'account e fa login |
| POST | `/api/v1/auth/sign-in` | pubblica | `{ identifier, password }`: `identifier` è l'email o lo username |
| POST | `/api/v1/auth/refresh` | cookie | nuovo access token; il refresh token viene sostituito |
| POST | `/api/v1/auth/sign-out` | cookie | chiude la sessione e cancella il cookie; si può ripetere senza effetti |
| GET | `/api/v1/auth/me` | Bearer | utente corrente |
| POST | `/api/v1/wars` | Bearer | salva il JSON `currentwar` di Clash of Clans (201 creata, 200 aggiornata o invariata) |
| GET | `/api/v1/wars?page&limit&state` | Bearer | guerre salvate, dalla più recente, senza membri |
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

Verifica dell'email e recupero della password non ci sono ancora. Il campo `emailVerified` è già pronto per aggiungerli.

## Salvataggio delle guerre

Il frontend (`src/app/core/backend/war-sync.service.ts`) manda in automatico al backend ogni guerra che riceve dal proxy: guerra in corso e archivio.

- **Quando:** solo se c'è un utente con login e solo se la guerra è cambiata. Le guerre terminate già salvate vengono ricordate nel browser e non si rimandano.
- **Chiave:** `warKey` = `YYYYMMDDTHHMMSS-TAGAVVERSARIO`, la stessa usata dall'archivio del proxy e dal frontend.
- **Nessun duplicato:** rimandare la stessa guerra la aggiorna invece di crearne una nuova.
- **Nessun passo indietro:** una guerra `warEnded` non torna a `inWar`. In quel caso la risposta è `SUCCESS.WAR_UNCHANGED`.
- **Dati salvati:** stato, date, esito calcolato, i due clan con membri e attacchi, `firstSavedBy`/`lastSavedBy`.
