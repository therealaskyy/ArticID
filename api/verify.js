'use strict';
const L = require('./_lib');

// Step 2 of 2 for sign-in, sign-up and password change: checks the emailed code and completes the action.
module.exports = async (req, res) => {
  if (L.cors(req, res)) return;
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Request not allowed.' });
  try {
    const b = L.body(req);
    const id = String(b.challenge || '');
    const code = String(b.code || '').replace(/\s/g, '');
    if (!id || !/^\d{6}$/.test(code)) return L.send(res, 400, { error: 'Enter the 6-digit code from the email.' });
    if (!(await L.limit('verify-ip:' + L.ipKey(req), 30, 900)))
      return L.send(res, 429, { error: 'Too many attempts. Please try again later.' });

    const h = L.sha(id);
    const key = 'ch:' + h, triesKey = 'cht:' + h;
    const ch = await L.redis.get(key);
    if (!ch) return L.send(res, 400, { error: 'This code has expired. Go back and try again.' });

    const n = await L.redis.incr(triesKey);
    if (n === 1) await L.redis.expire(triesKey, L.CODE_TTL);
    if (n > L.CODE_TRIES) {
      await L.redis.del(key, triesKey);
      return L.send(res, 429, { error: 'Too many wrong codes. Go back and start again.' });
    }
    const a = Buffer.from(L.sha(id + ':' + code), 'hex'), c = Buffer.from(String(ch.codeHash), 'hex');
    if (a.length !== c.length || !L.crypto.timingSafeEqual(a, c))
      return L.send(res, 400, { error: 'That code is not correct.' });
    await L.redis.del(key, triesKey);

    const d = ch.data || {};
    if (ch.purpose === 'login') {
      const user = await L.getUser(d.uid);
      if (!user) return L.send(res, 401, { error: 'Account not found.' });
      const token = await L.createSession(user.id);
      L.setSessionCookie(res, token);
      return L.send(res, 200, { purpose: 'login', token, user: L.publicUser(user) });
    }

    if (ch.purpose === 'register') {
      const uid = L.crypto.randomUUID();
      if (!(await L.redis.set('email:' + d.email, uid, { nx: true })))
        return L.send(res, 409, { error: 'This email is already registered. Try signing in.' });
      if (!(await L.redis.set('nick:' + d.nick.toLowerCase(), uid, { nx: true }))) {
        await L.redis.del('email:' + d.email);
        return L.send(res, 409, { error: 'That player name is already taken. Pick another one.' });
      }
      const user = {
        id: uid, aid: L.newAid(), nick: d.nick, email: d.email, birthdate: d.birthdate,
        passHash: d.passHash, termsVersion: L.TERMS_VERSION,
        termsAcceptedAt: d.termsAcceptedAt, createdAt: new Date().toISOString(),
      };
      await L.redis.set('user:' + uid, user);
      const token = await L.createSession(uid);
      L.setSessionCookie(res, token);
      return L.send(res, 201, { purpose: 'register', token, user: L.publicUser(user) });
    }

    if (ch.purpose === 'change') {
      const user = await L.getUser(d.uid);
      if (!user) return L.send(res, 401, { error: 'Account not found.' });
      user.passHash = d.passHash;
      await L.redis.set('user:' + user.id, user);
      await L.destroyUserSessions(user.id); // signs out everywhere, then opens a fresh session
      const token = await L.createSession(user.id);
      L.setSessionCookie(res, token);
      return L.send(res, 200, { purpose: 'change', token, user: L.publicUser(user) });
    }

    return L.send(res, 400, { error: 'Invalid request.' });
  } catch (e) {
    console.error('verify', e);
    return L.send(res, 500, { error: 'Server error. Please try again shortly.' });
  }
};
