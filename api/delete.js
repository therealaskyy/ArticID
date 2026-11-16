'use strict';
const L = require('./_lib');

// Cancellazione account (diritto all’oblio, art. 17 GDPR)
module.exports = async (req, res) => {
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Richiesta non consentita.' });
  try {
    const s = await L.getSession(req);
    const user = s ? await L.getUser(s.uid) : null;
    if (!user) return L.send(res, 401, { error: 'Non hai effettuato l’accesso.' });
    if (!(await L.limit('del:' + user.id, 5, 900)))
      return L.send(res, 429, { error: 'Troppi tentativi. Riprova più tardi.' });
    if (!(await L.verifyPassword(String(L.body(req).password || ''), user.passHash)))
      return L.send(res, 401, { error: 'Password non corretta.' });

    await L.destroyUserSessions(user.id);
    await L.redis.del('email:' + user.email, 'nick:' + user.nick.toLowerCase(), 'user:' + user.id);
    L.clearSessionCookie(res);
    return L.send(res, 200, { ok: true });
  } catch (e) {
    console.error('delete', e);
    return L.send(res, 500, { error: 'Errore del server.' });
  }
};
