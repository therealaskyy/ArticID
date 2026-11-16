# Artic ID

Account unico per i giochi di Artic Studio: registrazione, accesso, recupero password, eliminazione account.
Frontend statico + funzioni serverless su **Vercel**, dati su **Upstash Redis**.

## Cosa c'è dentro

```
api/        register, login, logout, me, save (cloud save), delete, forgot, reset, config
public/     index.html (pagina Artic ID), termini.html, privacy.html,
            logo.svg, logo-mark.svg, favicon, icone PNG, manifest,
            sdk/artic-id.js (pulsante "Artic ID" per i giochi web), demo.html
vercel.json intestazioni di sicurezza (CSP, HSTS...) e regione fra1 (Francoforte)
```

## Messa online (10 minuti)

1. Carica la cartella su un repository GitHub e importalo su vercel.com (oppure `npx vercel --prod`).
2. Su Vercel apri **Storage → Marketplace → Upstash → Redis**, crea il database in una **regione UE** e collegalo al progetto. Le variabili `KV_REST_API_URL` e `KV_REST_API_TOKEN` arrivano da sole (il codice accetta anche `UPSTASH_REDIS_REST_*`).
3. In **Settings → Environment Variables** aggiungi (vedi `.env.example`):
   - `APP_URL`: l'indirizzo pubblico di Artic ID, per esempio `https://id.tuodominio.it`
   - `ALLOWED_ORIGINS`: gli indirizzi dei tuoi giochi web, separati da virgola
   - `RESEND_API_KEY` e `RESEND_FROM`: per le email di recupero password (account gratuito su resend.com, dominio verificato)
4. Rifai il deploy e collega il tuo dominio (per esempio `id.articstudio.it`).

## Prima di pubblicare: da completare

- In `public/termini.html` e `public/privacy.html` sostituisci i segnaposto gialli `[RAGIONE SOCIALE]`, `[INDIRIZZO]`, `[P. IVA]`, `[EMAIL...]`.
- I testi sono una base seria, ma **fai controllare Termini e Privacy da un avvocato o da un consulente privacy**: dipendono dai tuoi giochi, dagli acquisti e dai dati che raccogli davvero.
- Età minima: 14 anni (consenso digitale in Italia). Cambiala in `api/_lib.js` (`MIN_AGE`) e nei due testi legali.

## Il pulsante Artic ID nei giochi

**Giochi web**

```html
<script src="https://id.tuodominio.it/sdk/artic-id.js"></script>
<div id="slot"></div>
<script>
  ArticID.mount(document.getElementById('slot'), {
    onLogin: function (s) { /* s.token, s.user.aid, s.user.nick */ },
    onLogout: function () {}
  });
</script>
```
Il pulsante apre una finestra Artic ID. Dopo l'accesso il gioco riceve un token, solo se il suo indirizzo è in `ALLOWED_ORIGINS`.

**Giochi nativi (Unity, mobile...)**: apri la pagina Artic ID in un browser di sistema o WebView, oppure chiama direttamente `POST /api/login` e `POST /api/register` (JSON) e salva il `token` che ricevi.

**Verifica sul server del gioco** (da fare sempre prima di fidarti di un giocatore):

```
GET https://id.tuodominio.it/api/me
Authorization: Bearer <token>
→ 200 { "user": { "aid": "AID-XXXX-XXXX", "nick": "...", "email": "...", "createdAt": "..." } }
```
Usa `user.aid` come identificativo del giocatore nei tuoi database.

## Cloud save con Artic ID

Ogni giocatore ha fino a **10 slot** da 200 KB l'uno. Il salvataggio è un JSON qualsiasi (livelli, monete, impostazioni...). Funziona solo con `Authorization: Bearer <token>`, il token che il gioco riceve dopo l'accesso.

```
GET  /api/save?slot=main        → { "save": { "data": {...}, "rev": 3, "updatedAt": "..." } }   (oppure "save": null)
PUT  /api/save?slot=main        body: { "data": {...}, "baseRev": 3 }
                                → 200 { "save": { ..., "rev": 4 } }
                                → 409 se nel cloud c'è una revisione più recente: la risposta contiene il salvataggio attuale
                                  (per sovrascrivere comunque aggiungi "force": true)
```

`baseRev` è la `rev` dell'ultimo salvataggio che il dispositivo ha letto (0 se non ne ha mai letti). Serve a non perdere i progressi quando due dispositivi giocano insieme.

**Giochi web (con l'SDK)**

```js
ArticID.cloudSave.load('main').then(function (save) {
  if (save) { carica(save.data); rev = save.rev; }
});
ArticID.cloudSave.save('main', statoDelGioco, rev)
  .then(function (s) { rev = s.rev; })
  .catch(function (e) { if (e.conflict) { /* chiedi: tenere il locale o il cloud? e.save è quello del cloud */ } });
```

L'SDK ricorda l'accesso nel browser per 30 giorni (`ArticID.restore()` parte da solo con `mount`).

**Altri motori (Unity, Godot, mobile...)**: sono semplici richieste HTTPS con JSON. Salva il token in modo sicuro sul dispositivo e invia l'header `Authorization: Bearer <token>`.

Consiglio: salva in locale a ogni momento e invia al cloud ogni tanto (per esempio a fine livello o ogni minuto). Il limite è 60 richieste al minuto per giocatore.

## Come sono salvati i dati su Upstash

| Chiave | Contenuto |
|---|---|
| `user:{uuid}` | profilo, hash scrypt della password, data di nascita, accettazione Termini |
| `email:{email}` / `nick:{nick}` | indice di unicità, verso l'uuid |
| `save:{uuid}:{slot}` / `saves:{uuid}` | salvataggi cloud e elenco degli slot |
| `sess:{sha256(token)}` | sessione (30 giorni) |
| `usess:{uuid}` | elenco sessioni dell'utente, per chiuderle tutte |
| `reset:{sha256(token)}` | link di reset (1 ora) |
| `rl:*` | contatori anti-abuso (IP salvato solo come hash) |

## Sicurezza

Password con scrypt e sale casuale, token di sessione salvati solo come hash, cookie `HttpOnly; Secure; SameSite=Lax`, controllo dell'origine contro il CSRF, limiti di tentativi su accesso, registrazione e reset, CSP rigida, risposta identica per email esistenti e non esistenti nel recupero password.

## Cosa non è incluso

- **Verifica dell'email alla registrazione**: chiunque può registrare un'email. Si può aggiungere con lo stesso flusso di `forgot.js`/`reset.js`.
- **Font**: per rispetto del GDPR non carichiamo Google Fonts. Se vuoi un font tuo, mettilo in `public/` e aggiungilo con `@font-face` in `style.css`.
- **Login con Google/Apple, 2FA, pannello admin**.
- Il logo è un marchio generato in SVG: se hai un designer, sostituisci `public/logo*.svg` e le icone PNG.

## Sviluppo in locale

```
npm install
npx vercel dev     # con le variabili d'ambiente di Upstash in .env.local
```
