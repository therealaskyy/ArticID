'use strict';
const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Request not allowed.' });
  try {
    if (!(await L.limit('reset-ip:' + L.ipKey(req), 20, 3600)))
      return L.send(res, 429, { error: 'Too many attempts. Please try again later.' });
    const b = L.body(req);
    if (!L.passwordOk(b.password))
      return L.send(res, 400, { error: 'Password must be at least 8 characters.' });
    const k = 'reset:' + L.sha(String(b.token || ''));
    const r = await L.redis.get(k);
    const user = r && r.uid ? await L.getUser(r.uid) : null;
    if (!user) return L.send(res, 400, { error: 'This link is invalid or has expired. Request a new one.' });

    user.passHash = await L.hashPassword(b.password);
    await L.redis.set('user:' + user.id, user);
    await L.redis.del(k);
    await L.destroyUserSessions(user.id); // signs out everywhere
    // The link came by email, so identity is proven: open a fresh session right away.
    const token = await L.createSession(user.id);
    L.setSessionCookie(res, token);
    return L.send(res, 200, { ok: true, token, user: L.publicUser(user) });
  } catch (e) {
    console.error('reset', e);
    return L.send(res, 500, { error: 'Server error.' });
  }
};
