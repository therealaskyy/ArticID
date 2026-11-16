'use strict';
const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Richiesta non consentita.' });
  try {
    const s = await L.getSession(req);
    if (s) await L.destroySession(s);
    L.clearSessionCookie(res);
    return L.send(res, 200, { ok: true });
  } catch (e) {
    console.error('logout', e);
    return L.send(res, 500, { error: 'Errore del server.' });
  }
};
