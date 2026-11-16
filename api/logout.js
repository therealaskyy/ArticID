'use strict';
const L = require('./_lib');

module.exports = async (req, res) => {
  if (L.cors(req, res)) return;
  if (!L.methodOnly(req, res, 'POST')) return;
  const bearer = /^Bearer /.test(String(req.headers.authorization || ''));
  if (!bearer && !L.sameOrigin(req)) return L.send(res, 403, { error: 'Request not allowed.' });
  try {
    const s = await L.getSession(req);
    if (s) await L.destroySession(s);
    L.clearSessionCookie(res);
    return L.send(res, 200, { ok: true });
  } catch (e) {
    console.error('logout', e);
    return L.send(res, 500, { error: 'Server error.' });
  }
};
