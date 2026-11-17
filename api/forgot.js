'use strict';
const L = require('./_lib');

// Emails a password reset link. Always answers the same way (no account enumeration).
module.exports = async (req, res) => {
  if (!L.methodOnly(req, res, 'POST')) return;
  if (!L.sameOrigin(req)) return L.send(res, 403, { error: 'Request not allowed.' });
  const generic = { ok: true, message: 'If that email is registered, you’ll get a link to reset your password.' };
  try {
    const email = String(L.body(req).email || '').trim().toLowerCase();
    if (!L.EMAIL_RE.test(email)) return L.send(res, 400, { error: 'Enter a valid email address.' });
    const okIp = await L.limit('forgot-ip:' + L.ipKey(req), 10, 3600);
    const okMail = await L.limit('forgot-mail:' + L.sha(email), 3, 3600);
    if (!okIp || !okMail) return L.send(res, 200, generic);

    const uid = await L.redis.get('email:' + email);
    if (!uid) return L.send(res, 200, generic);

    if (!L.emailConfigured())
      return L.send(res, 503, { error: 'Password recovery isn’t available yet. Please contact support.' });

    const token = L.crypto.randomBytes(32).toString('base64url');
    await L.redis.set('reset:' + L.sha(token), { uid }, { ex: 3600 });

    // If the request comes from an authorized game, the link brings the player back to it after the reset.
    let ret = '';
    try {
      const u = new URL(String(L.body(req).return || ''));
      if (L.allowedOrigins().includes(u.origin)) ret = u.href.split('#')[0];
    } catch (e) {}

    const base = process.env.APP_URL || ('https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL);
    const link = base.replace(/\/$/, '') + '/?reset=' + token + (ret ? '&return=' + encodeURIComponent(ret) : '');
    await L.sendEmail(email, 'Reset your Artic ID password',
      'Hi!\n\nYou asked to reset the password of your Artic ID.\n' +
      'Open this link within 1 hour:\n' + link + '\n\n' +
      'If this wasn’t you, ignore this email: your password won’t change.\n\nArtic Studio');
    return L.send(res, 200, generic);
  } catch (e) {
    console.error('forgot', e);
    return L.send(res, 500, { error: 'Server error. Please try again shortly.' });
  }
};
