'use strict';
const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Richiesta non consentita.' });
  try {
    if (!(await L.limit('reset-ip:' + L.ipKey(req), 20, 3600)))
      return L.send(res, 429, { error: 'Troppi tentativi. Riprova più tardi.' });
    const b = L.body(req);
    if (!L.passwordOk(b.password))
      return L.send(res, 400, { error: 'La password deve avere almeno 8 caratteri.' });
    const k = 'reset:' + L.sha(String(b.token || ''));
    const r = await L.redis.get(k);
    const user = r && r.uid ? await L.getUser(r.uid) : null;
    if (!user) return L.send(res, 400, { error: 'Il link non è valido o è scaduto. Richiedine uno nuovo.' });

    user.passHash = await L.hashPassword(b.password);
    await L.redis.set('user:' + user.id, user);
    await L.redis.del(k);
    await L.destroyUserSessions(user.id); // esce da tutti i dispositivi
    return L.send(res, 200, { ok: true });
  } catch (e) {
    console.error('reset', e);
    return L.send(res, 500, { error: 'Errore del server.' });
  }
};
