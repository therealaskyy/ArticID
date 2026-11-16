'use strict';
const L = require('./_lib');

// Cambio password da loggato: richiede la password attuale.
// Chiude tutte le sessioni e ne apre una nuova (il token nuovo torna al gioco).
module.exports = async (req, res) => {
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Richiesta non consentita.' });
  try {
    const s = await L.getSession(req);
    const user = s ? await L.getUser(s.uid) : null;
    if (!user) return L.send(res, 401, { error: 'Non hai effettuato l’accesso.' });
    if (!(await L.limit('chg:' + user.id, 5, 900)))
      return L.send(res, 429, { error: 'Troppi tentativi. Riprova più tardi.' });
    const b = L.body(req);
    if (!L.passwordOk(b.newPassword))
      return L.send(res, 400, { error: 'La nuova password deve avere almeno 8 caratteri.' });
    if (!(await L.verifyPassword(String(b.currentPassword || ''), user.passHash)))
      return L.send(res, 401, { error: 'La password attuale non è corretta.' });

    user.passHash = await L.hashPassword(b.newPassword);
    await L.redis.set('user:' + user.id, user);
    await L.destroyUserSessions(user.id);
    const token = await L.createSession(user.id);
    L.setSessionCookie(res, token);
    return L.send(res, 200, { token, user: L.publicUser(user) });
  } catch (e) {
    console.error('change', e);
    return L.send(res, 500, { error: 'Errore del server.' });
  }
};
