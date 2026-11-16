'use strict';
const L = require('./_lib');

const MAX_BYTES = 200 * 1024; // dimensione massima di uno slot
const MAX_SLOTS = 10;

// Cloud save: GET /api/save?slot=main   PUT /api/save?slot=main  { data, baseRev }
// Solo con Authorization: Bearer <token>. Ogni salvataggio ha un numero di revisione:
// se il dispositivo parte da una revisione vecchia, riceve 409 con il salvataggio attuale.
module.exports = async (req, res) => {
  if (L.cors(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return L.send(res, 405, { error: 'Metodo non consentito.' });
  }
  try {
    const s = await L.getSession(req, true);
    if (!s) return L.send(res, 401, { error: 'Non hai effettuato l’accesso.' });
    const slot = String((req.query && req.query.slot) || 'main');
    if (!L.SLOT_RE.test(slot))
      return L.send(res, 400, { error: 'Nome slot non valido (usa a-z, 0-9, trattino, underscore).' });
    if (!(await L.limit('save:' + s.uid, 60, 60)))
      return L.send(res, 429, { error: 'Troppi salvataggi. Riprova tra un minuto.' });

    const key = 'save:' + s.uid + ':' + slot;
    const cur = await L.redis.get(key);
    if (req.method === 'GET') return L.send(res, 200, { save: cur || null });

    const b = L.body(req);
    if (b.data === undefined || b.data === null)
      return L.send(res, 400, { error: 'Manca il campo data.' });
    if (Buffer.byteLength(JSON.stringify(b.data)) > MAX_BYTES)
      return L.send(res, 413, { error: 'Il salvataggio è troppo grande (massimo 200 KB).' });

    const curRev = cur ? cur.rev : 0;
    const baseRev = Number.isInteger(b.baseRev) ? b.baseRev : 0;
    if (baseRev !== curRev && b.force !== true)
      return L.send(res, 409, { error: 'Il salvataggio nel cloud è più recente.', save: cur });

    if (!cur) {
      const n = await L.redis.scard('saves:' + s.uid);
      if (n >= MAX_SLOTS) return L.send(res, 400, { error: 'Hai raggiunto il massimo di ' + MAX_SLOTS + ' slot.' });
    }
    const save = { data: b.data, rev: curRev + 1, updatedAt: new Date().toISOString() };
    await L.redis.set(key, save);
    await L.redis.sadd('saves:' + s.uid, slot);
    return L.send(res, 200, { save });
  } catch (e) {
    console.error('save', e);
    return L.send(res, 500, { error: 'Errore del server. Riprova tra poco.' });
  }
};
