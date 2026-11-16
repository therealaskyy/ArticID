(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var params = new URLSearchParams(location.search);
  var embed = params.get('embed') === '1' && !!window.opener;
  var targetOrigin = null, minAge = 14;
  // Modalità "redirect": il gioco manda qui con ?return=<url del gioco>&mode=in|up|forgot|password
  // e a operazione finita si torna al gioco con #artic_token=<token> nell'indirizzo.
  var ret = null, mode = params.get('mode') || 'in', wantChange = mode === 'password';
  var views = ['#auth', '#f-forgot', '#f-reset', '#f-change', '#done'];

  function show(sel) {
    views.forEach(function (v) { $(v).hidden = v !== sel; });
  }
  function err(form, m) { form.querySelector('.err').textContent = m || ''; }
  function busy(form, on) { form.querySelector('.btn').disabled = on; }

  function api(path, method, data) {
    var opt = { method: method || 'GET', credentials: 'same-origin', headers: {} };
    if (data) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
    return fetch('/api/' + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Qualcosa è andato storto. Riprova.');
        return d;
      });
    });
  }

  function tab(mode) {
    var isIn = mode === 'in';
    $('#tab-in').setAttribute('aria-selected', isIn);
    $('#tab-up').setAttribute('aria-selected', !isIn);
    $('#f-in').hidden = !isIn; $('#f-up').hidden = isIn;
    err($('#f-in')); err($('#f-up'));
  }
  $('#tab-in').onclick = function () { tab('in'); };
  $('#tab-up').onclick = function () { tab('up'); };

  function showDone(user, fresh) {
    $('#done-title').textContent = fresh ? 'Benvenuto, ' + user.nick + '!' : 'Ciao, ' + user.nick + '!';
    $('#done-sub').textContent = 'Hai effettuato l’accesso come ' + user.email + '.';
    $('#aid').textContent = user.aid;
    show('#done');
  }

  function backToGame(token) {
    var u = new URL(ret);
    if (token) u.hash = 'artic_token=' + encodeURIComponent(token);
    location.replace(u.href);
  }

  function onAuth(data, fresh) {
    if (ret && wantChange) { wantChange = false; show('#f-change'); return; }
    if (ret) {
      showDone(data.user, fresh);
      $('#done-sub').textContent = 'Fatto! Ti riporto al gioco…';
      backToGame(data.token);
      return;
    }
    if (embed && targetOrigin) {
      window.opener.postMessage({ type: 'artic-id:login', token: data.token, user: data.user }, targetOrigin);
      showDone(data.user, fresh);
      $('#done-sub').textContent = 'Fatto! Questa finestra si chiude da sola.';
      setTimeout(function () { window.close(); }, 900);
    } else {
      showDone(data.user, fresh);
    }
  }

  function submit(form, fn) {
    form.onsubmit = function (e) {
      e.preventDefault(); err(form); busy(form, true);
      Promise.resolve().then(fn).catch(function (x) { err(form, x.message); })
        .then(function () { busy(form, false); });
    };
  }

  submit($('#f-in'), function () {
    var email = $('#in-mail').value.trim(), pass = $('#in-pass').value;
    if (!email || !pass) throw new Error('Inserisci email e password.');
    return api('login', 'POST', { email: email, password: pass }).then(function (d) { onAuth(d, false); });
  });

  submit($('#f-up'), function () {
    var nick = $('#up-nick').value.trim(), email = $('#up-mail').value.trim(),
      pass = $('#up-pass').value, date = $('#up-date').value;
    if (nick.length < 3) throw new Error('Il nome giocatore deve avere almeno 3 caratteri.');
    if (!email) throw new Error('Inserisci la tua email.');
    if (pass.length < 8) throw new Error('La password deve avere almeno 8 caratteri.');
    if (!date) throw new Error('Inserisci la tua data di nascita.');
    if (!$('#up-terms').checked) throw new Error('Per continuare accetta i Termini e l’Informativa sulla privacy.');
    return api('register', 'POST', { nick: nick, email: email, password: pass, birthdate: date, terms: true })
      .then(function (d) { onAuth(d, true); });
  });

  $('#to-forgot').onclick = function () { show('#f-forgot'); $('#fg-msg').hidden = true; };
  $('#fg-back').onclick = function () { show('#auth'); };
  submit($('#f-forgot'), function () {
    var email = $('#fg-mail').value.trim();
    if (!email) throw new Error('Inserisci la tua email.');
    return api('forgot', 'POST', { email: email, return: ret || undefined }).then(function (d) {
      $('#fg-msg').textContent = d.message; $('#fg-msg').hidden = false;
    });
  });

  submit($('#f-reset'), function () {
    return api('reset', 'POST', { token: params.get('reset'), password: $('#rs-pass').value })
      .then(function (d) {
        if (ret && d.token) { backToGame(d.token); return; }
        history.replaceState(null, '', '/'); show('#auth'); tab('in'); err($('#f-in'), '');
      });
  });

  $('#to-change').onclick = function () { show('#f-change'); $('#ch-msg').hidden = true; $('#ch-old').focus(); };
  $('#ch-back').onclick = function () {
    if (ret) { backToGame(null); return; }
    api('me').then(function (d) { showDone(d.user, false); }).catch(function () { show('#auth'); });
  };
  submit($('#f-change'), function () {
    var o = $('#ch-old').value, n = $('#ch-new').value;
    if (!o) throw new Error('Inserisci la password attuale.');
    if (n.length < 8) throw new Error('La nuova password deve avere almeno 8 caratteri.');
    return api('change', 'POST', { currentPassword: o, newPassword: n }).then(function (d) {
      $('#f-change').reset();
      if (ret) { backToGame(d.token); return; }
      showDone(d.user, false);
    });
  });
  $('#back-game').onclick = function () { backToGame(null); };

  $('#out').onclick = function () {
    api('logout', 'POST').catch(function () {}).then(function () { show('#auth'); tab('in'); $('#f-in').reset(); });
  };
  $('#to-del').onclick = function () { $('#f-del').hidden = false; $('#del-pass').focus(); };
  submit($('#f-del'), function () {
    if (!confirm('Vuoi davvero eliminare il tuo Artic ID? Non si può annullare.')) return;
    return api('delete', 'POST', { password: $('#del-pass').value }).then(function () {
      $('#f-del').hidden = true; $('#f-del').reset(); show('#auth'); tab('in');
    });
  });

  var today = new Date().toISOString().slice(0, 10);
  $('#up-date').max = today;

  // Avvio
  api('config').then(function (c) {
    minAge = c.minAge || 14;
    if (embed) {
      var o = params.get('origin');
      if (c.origins && c.origins.indexOf(o) !== -1) targetOrigin = o;
    }
    var r = params.get('return');
    if (r && !embed) {
      try {
        var ru = new URL(r);
        if (c.origins && c.origins.indexOf(ru.origin) !== -1) ret = ru.href.split('#')[0];
      } catch (e) {}
      if (!ret) { ret = 'invalid'; }
    }
  }).catch(function () {}).then(function () {
    if (ret === 'invalid') {
      $('#fatal').textContent = 'Questo gioco non è autorizzato a usare Artic ID.';
      $('#fatal').hidden = false; ret = null; return;
    }
    if (ret) $('#back-game').hidden = false;
    if (embed && !targetOrigin) {
      $('#fatal').textContent = 'Questo gioco non è autorizzato a usare Artic ID.';
      $('#fatal').hidden = false; return;
    }
    if (params.get('reset')) { show('#f-reset'); return; }
    if (embed) { show('#auth'); return; }
    if (ret) {
      if (mode === 'forgot') { show('#f-forgot'); return; }
      if (mode === 'password') {
        api('me').then(function () { wantChange = false; show('#f-change'); })
          .catch(function () { show('#auth'); tab('in'); });
        return;
      }
      show('#auth'); tab(mode === 'up' ? 'up' : 'in'); return;
    }
    api('me').then(function (d) { showDone(d.user, false); })
      .catch(function () { show('#auth'); });
  });
})();
