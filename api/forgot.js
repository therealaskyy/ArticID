'use strict';
const L = require('./_lib');

// Invia un link di reset via Resend. Risponde sempre allo stesso modo (niente enumerazione account).
module.exports = async (req, res) => {
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Richiesta non consentita.' });
  const generic = { ok: true, message: 'Se l’email è registrata, riceverai un link per reimpostare la password.' };
  try {
    const email = String(L.body(req).email || '').trim().toLowerCase();
    if (!L.EMAIL_RE.test(email)) return L.send(res, 400, { error: 'Inserisci un’email valida.' });
    const okIp = await L.limit('forgot-ip:' + L.ipKey(req), 10, 3600);
    const okMail = await L.limit('forgot-mail:' + L.sha(email), 3, 3600);
    if (!okIp || !okMail) return L.send(res, 200, generic);

    const uid = await L.redis.get('email:' + email);
    if (!uid) return L.send(res, 200, generic);

    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.error('RESEND_API_KEY mancante: impossibile inviare il reset');
      return L.send(res, 503, { error: 'Il recupero password non è ancora attivo. Scrivi al supporto.' });
    }
    const token = L.crypto.randomBytes(32).toString('base64url');
    await L.redis.set('reset:' + L.sha(token), { uid }, { ex: 3600 });

    const base = process.env.APP_URL || ('https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL);
    const link = base.replace(/\/$/, '') + '/?reset=' + token;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [email],
        subject: 'Reimposta la password del tuo Artic ID',
        text: 'Ciao!\n\nHai chiesto di reimpostare la password del tuo Artic ID.\n' +
          'Apri questo link entro 1 ora:\n' + link + '\n\n' +
          'Se non sei stato tu, ignora questa email: la tua password non cambierà.\n\nArtic Studio',
      }),
    });
    if (!r.ok) console.error('resend', r.status, await r.text());
    return L.send(res, 200, generic);
  } catch (e) {
    console.error('forgot', e);
    return L.send(res, 500, { error: 'Errore del server. Riprova tra poco.' });
  }
};
