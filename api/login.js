'use strict';
const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Richiesta non consentita.' });
  try {
    const b = L.body(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!L.EMAIL_RE.test(email) || !password || password.length > 128)
      return L.send(res, 400, { error: 'Inserisci email e password.' });

    const okIp = await L.limit('login-ip:' + L.ipKey(req), 30, 900);
    const okMail = await L.limit('login-mail:' + L.sha(email), 8, 900);
    if (!okIp || !okMail)
      return L.send(res, 429, { error: 'Troppi tentativi. Riprova tra 15 minuti.' });

    const uid = await L.redis.get('email:' + email);
    const user = uid ? await L.getUser(uid) : null;
    if (!user) {
      await L.dummyVerify(password);
      return L.send(res, 401, { error: 'Email o password non corretti.' });
    }
    if (!(await L.verifyPassword(password, user.passHash)))
      return L.send(res, 401, { error: 'Email o password non corretti.' });

    await L.redis.del('rl:login-mail:' + L.sha(email));
    const token = await L.createSession(user.id);
    L.setSessionCookie(res, token);
    return L.send(res, 200, { token, user: L.publicUser(user) });
  } catch (e) {
    console.error('login', e);
    return L.send(res, 500, { error: 'Errore del server. Riprova tra poco.' });
  }
};
