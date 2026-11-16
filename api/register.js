'use strict';
const L = require('./_lib');

// Step 1 of 2: validates the form and emails a 6-digit code. The account is created in POST /api/verify.
module.exports = async (req, res) => {
  if (L.cors(req, res)) return;
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Request not allowed.' });
  try {
    if (!(await L.limit('reg:' + L.ipKey(req), 10, 3600)))
      return L.send(res, 429, { error: 'Too many attempts. Please try again in an hour.' });

    const b = L.body(req);
    const nick = String(b.nick || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const birth = String(b.birthdate || '');

    if (!L.NICK_RE.test(nick))
      return L.send(res, 400, { error: 'Player name must be 3–16 characters: letters, numbers, dot, hyphen or underscore.' });
    if (!L.EMAIL_RE.test(email) || email.length > 254)
      return L.send(res, 400, { error: 'Enter a valid email address.' });
    if (!L.passwordOk(password))
      return L.send(res, 400, { error: 'Password must be at least 8 characters.' });
    const age = L.ageFrom(birth);
    if (age === null) return L.send(res, 400, { error: 'Enter a valid date of birth.' });
    if (age < L.MIN_AGE)
      return L.send(res, 403, { error: `You must be at least ${L.MIN_AGE} years old to create an Artic ID. Ask a parent.` });
    if (b.terms !== true)
      return L.send(res, 400, { error: 'You must accept the Terms of Service and the Privacy Policy.' });

    if (await L.redis.exists('email:' + email))
      return L.send(res, 409, { error: 'This email is already registered. Try signing in.' });
    if (await L.redis.exists('nick:' + nick.toLowerCase()))
      return L.send(res, 409, { error: 'That player name is already taken. Pick another one.' });

    const c = await L.startChallenge('register', email, {
      nick, email, birthdate: birth, passHash: await L.hashPassword(password),
      termsAcceptedAt: new Date().toISOString(),
    });
    if (c.error) return L.send(res, c.status, { error: c.error });
    return L.send(res, 200, { step: 'code', challenge: c.id });
  } catch (e) {
    console.error('register', e);
    return L.send(res, 500, { error: 'Server error. Please try again shortly.' });
  }
};
