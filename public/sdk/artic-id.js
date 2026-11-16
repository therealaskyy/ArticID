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
  var session = null;

  function signIn() {
    return new Promise(function (resolve, reject) {
      var w = 440, h = 760;
      var left = Math.max(0, (screen.width - w) / 2), top = Math.max(0, (screen.height - h) / 2);
      var url = BASE + '/?embed=1&origin=' + encodeURIComponent(location.origin);
      var win = window.open(url, 'artic-id', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top);
      if (!win) return reject(new Error('Popup bloccato dal browser.'));
      function onMsg(e) {
        if (e.origin !== BASE || !e.data || e.data.type !== 'artic-id:login') return;
        cleanup(); session = { token: e.data.token, user: e.data.user }; resolve(session);
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
      if (session) { session = null; render(); if (opts.onLogout) opts.onLogout(); return; }
      signIn().then(function (s) { render(); if (opts.onLogin) opts.onLogin(s); }).catch(function () {});
    };
    return b;
  }

  global.ArticID = { mount: mount, signIn: signIn, verify: verify, base: BASE };
})(window);
