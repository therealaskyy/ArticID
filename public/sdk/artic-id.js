/*! Artic ID SDK (giochi web). Uso:
 *   <script src="https://TUO-DOMINIO-ARTIC-ID/sdk/artic-id.js"></script>
 *   ArticID.mount(document.getElementById('slot'), {
 *     onLogin: function (s) { s.token, s.user.aid, s.user.nick },
 *     onLogout: function () {}
 *   });
 */
(function (global) {
  'use strict';
  var script = document.currentScript;
  var BASE = script ? new URL(script.src).origin : '';
  var session = null, KEY = 'artic-id-session';

  function persist() {
    try { if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); } catch (e) {}
  }

  function signIn() {
    return new Promise(function (resolve, reject) {
      var w = 440, h = 760;
      var left = Math.max(0, (screen.width - w) / 2), top = Math.max(0, (screen.height - h) / 2);
      var url = BASE + '/?embed=1&origin=' + encodeURIComponent(location.origin);
      var win = window.open(url, 'artic-id', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top);
      if (!win) return reject(new Error('Popup bloccato dal browser.'));
      function onMsg(e) {
        if (e.origin !== BASE || !e.data || e.data.type !== 'artic-id:login') return;
        cleanup(); session = { token: e.data.token, user: e.data.user }; persist(); resolve(session);
      }
      var timer = setInterval(function () { if (win.closed) { cleanup(); reject(new Error('Finestra chiusa.')); } }, 500);
      function cleanup() { window.removeEventListener('message', onMsg); clearInterval(timer); }
      window.addEventListener('message', onMsg);
    });
  }

  // Verifica un token. Meglio farlo dal TUO SERVER: GET /api/me con Authorization: Bearer <token>.
  function verify(token) {
    return fetch(BASE + '/api/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { if (!r.ok) throw new Error('Token non valido'); return r.json(); })
      .then(function (d) { return d.user; });
  }

  // Rientra da solo al prossimo avvio del gioco (il token dura 30 giorni).
  function restore() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s || !s.token) return Promise.resolve(null);
      return verify(s.token).then(function (u) { session = { token: s.token, user: u }; return session; })
        .catch(function () { session = null; persist(); return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function signOut() {
    var t = session && session.token; session = null; persist();
    if (t) fetch(BASE + '/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(function () {});
  }

  function call(method, slot, body) {
    if (!session) return Promise.reject(new Error('You are not signed in.'));
    return fetch(BASE + '/api/save?slot=' + encodeURIComponent(slot || 'main'), {
      method: method,
      headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().then(function (d) {
        if (r.status === 409) { var e = new Error('conflict'); e.conflict = true; e.save = d.save; throw e; }
        if (!r.ok) throw new Error(d.error || 'Error');
        return d.save;
      });
    });
  }

  // load(slot) -> { data, rev, updatedAt } oppure null
  // save(slot, data, baseRev) -> nuovo salvataggio; se in conflitto lancia un errore con .conflict e .save
  var cloudSave = {
    load: function (slot) { return call('GET', slot); },
    save: function (slot, data, baseRev, force) { return call('PUT', slot, { data: data, baseRev: baseRev || 0, force: !!force }); }
  };

  function mount(el, opts) {
    opts = opts || {};
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('style', 'display:inline-flex;align-items:center;gap:8px;padding:8px 14px 8px 8px;border:0;border-radius:999px;' +
      'background:#0B8FC4;color:#fff;font:600 15px ui-rounded,"SF Pro Rounded",system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 0 rgba(0,0,0,.25)');
    var img = document.createElement('img');
    img.src = BASE + '/logo-mark.svg'; img.alt = ''; img.width = 28; img.height = 28;
    var label = document.createElement('span'); label.textContent = 'Artic ID';
    b.appendChild(img); b.appendChild(label); el.appendChild(b);
    function render() { label.textContent = session ? session.user.nick : 'Artic ID'; }
    b.onclick = function () {
      if (session) { signOut(); render(); if (opts.onLogout) opts.onLogout(); return; }
      signIn().then(function (s) { render(); if (opts.onLogin) opts.onLogin(s); }).catch(function () {});
    };
    restore().then(function (s) { if (s) { render(); if (opts.onLogin) opts.onLogin(s); } });
    return b;
  }

  global.ArticID = { mount: mount, signIn: signIn, signOut: signOut, restore: restore, verify: verify,
    cloudSave: cloudSave, session: function () { return session; }, base: BASE };
})(window);
