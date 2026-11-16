'use strict';
const L = require('./_lib');

module.exports = async (req, res) => {
  if (L.cors(req, res)) return;
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Richiesta non consentita.' });
  try {
    if (!(await L.limit('reg:' + L.ipKey(req), 10, 3600)))
      return L.send(res, 429, { error: 'Troppi tentativi. Riprova tra un’ora.' });

    const b = L.body(req);
    const nick = String(b.nick || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const birth = String(b.birthdate || '');

    if (!L.NICK_RE.test(nick))
      return L.send(res, 400, { error: 'Il nome giocatore deve avere 3–16 caratteri: lettere, numeri, punto, trattino o underscore.' });
    if (!L.EMAIL_RE.test(email) || email.length > 254)
      return L.send(res, 400, { error: 'Inserisci un’email valida.' });
    if (!L.passwordOk(password))
      return L.send(res, 400, { error: 'La password deve avere almeno 8 caratteri.' });
    const age = L.ageFrom(birth);
    if (age === null) return L.send(res, 400, { error: 'Inserisci una data di nascita valida.' });
    if (age < L.MIN_AGE)
      return L.send(res, 403, { error: `Per creare un Artic ID devi avere almeno ${L.MIN_AGE} anni. Chiedi a un genitore.` });
    if (b.terms !== true)
      return L.send(res, 400, { error: 'Devi accettare i Termini di servizio e l’Informativa sulla privacy.' });

    const id = L.crypto.randomUUID();
    if (!(await L.redis.set('email:' + email, id, { nx: true })))
      return L.send(res, 409, { error: 'Questa email è già registrata. Prova ad accedere.' });
    if (!(await L.redis.set('nick:' + nick.toLowerCase(), id, { nx: true }))) {
      await L.redis.del('email:' + email);
      return L.send(res, 409, { error: 'Questo nome giocatore è già preso. Scegline un altro.' });
    }

    const now = new Date().toISOString();
    const user = {
      id, aid: L.newAid(), nick, email, birthdate: birth,
      passHash: await L.hashPassword(password),
      termsVersion: L.TERMS_VERSION, termsAcceptedAt: now, createdAt: now,
    };
    await L.redis.set('user:' + id, user);

    const token = await L.createSession(id);
    L.setSessionCookie(res, token);
    return L.send(res, 201, { token, user: L.publicUser(user) });
  } catch (e) {
    console.error('register', e);
    return L.send(res, 500, { error: 'Errore del server. Riprova tra poco.' });
  }
};
