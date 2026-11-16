'use strict';
const L = require('./_lib');

// Step 1 of 2: checks email + password and emails a 6-digit code. Step 2 is POST /api/verify.
module.exports = async (req, res) => {
  if (L.cors(req, res)) return;
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Request not allowed.' });
  try {
    const b = L.body(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!L.EMAIL_RE.test(email) || !password || password.length > 128)
      return L.send(res, 400, { error: 'Enter your email and password.' });

    const okIp = await L.limit('login-ip:' + L.ipKey(req), 30, 900);
    const okMail = await L.limit('login-mail:' + L.sha(email), 8, 900);
    if (!okIp || !okMail)
      return L.send(res, 429, { error: 'Too many attempts. Please try again in 15 minutes.' });

    const uid = await L.redis.get('email:' + email);
    const user = uid ? await L.getUser(uid) : null;
    if (!user) {
      await L.dummyVerify(password);
      return L.send(res, 401, { error: 'Incorrect email or password.' });
    }
    if (!(await L.verifyPassword(password, user.passHash)))
      return L.send(res, 401, { error: 'Incorrect email or password.' });

    await L.redis.del('rl:login-mail:' + L.sha(email));
    const c = await L.startChallenge('login', user.email, { uid: user.id });
    if (c.error) return L.send(res, c.status, { error: c.error });
    return L.send(res, 200, { step: 'code', challenge: c.id });
  } catch (e) {
    console.error('login', e);
    return L.send(res, 500, { error: 'Server error. Please try again shortly.' });
  }
};
