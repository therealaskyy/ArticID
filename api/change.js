'use strict';
const L = require('./_lib');

// Step 1 of 2: checks the current password and emails a 6-digit code. Step 2 is POST /api/verify.
module.exports = async (req, res) => {
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Request not allowed.' });
  try {
    const s = await L.getSession(req);
    const user = s ? await L.getUser(s.uid) : null;
    if (!user) return L.send(res, 401, { error: 'You are not signed in.' });
    if (!(await L.limit('chg:' + user.id, 5, 900)))
      return L.send(res, 429, { error: 'Too many attempts. Please try again later.' });
    const b = L.body(req);
    if (!L.passwordOk(b.newPassword))
      return L.send(res, 400, { error: 'The new password must be at least 8 characters.' });
    if (!(await L.verifyPassword(String(b.currentPassword || ''), user.passHash)))
      return L.send(res, 401, { error: 'Your current password is not correct.' });

    const c = await L.startChallenge('change', user.email, {
      uid: user.id, passHash: await L.hashPassword(b.newPassword),
    });
    if (c.error) return L.send(res, c.status, { error: c.error });
    return L.send(res, 200, { step: 'code', challenge: c.id });
  } catch (e) {
    console.error('change', e);
    return L.send(res, 500, { error: 'Server error.' });
  }
};
