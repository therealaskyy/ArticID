'use strict';
const L = require('./_lib');

// Cookie (pagina Artic ID) oppure Authorization: Bearer <token> (giochi e server dei giochi)
module.exports = async (req, res) => {
  if (L.cors(req, res)) return;
  if (!L.methodOnly(req, res, 'GET')) return;
  try {
    const s = await L.getSession(req);
    const user = s ? await L.getUser(s.uid) : null;
    if (!user) return L.send(res, 401, { error: 'You are not signed in.' });
    return L.send(res, 200, { user: L.publicUser(user) });
  } catch (e) {
    console.error('me', e);
    return L.send(res, 500, { error: 'Server error.' });
  }
};
