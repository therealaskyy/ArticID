(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var params = new URLSearchParams(location.search);
  var embed = params.get('embed') === '1' && !!window.opener;
  var targetOrigin = null, minAge = 14;
  var views = ['#auth', '#f-forgot', '#f-reset', '#done'];

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

  function onAuth(data, fresh) {
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
    return api('forgot', 'POST', { email: email }).then(function (d) {
      $('#fg-msg').textContent = d.message; $('#fg-msg').hidden = false;
    });
  });

  submit($('#f-reset'), function () {
    return api('reset', 'POST', { token: params.get('reset'), password: $('#rs-pass').value })
      .then(function () { history.replaceState(null, '', '/'); show('#auth'); tab('in'); err($('#f-in'), ''); });
  });

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
  }).catch(function () {}).then(function () {
    if (embed && !targetOrigin) {
      $('#fatal').textContent = 'Questo gioco non è autorizzato a usare Artic ID.';
      $('#fatal').hidden = false; return;
    }
    if (params.get('reset')) { show('#f-reset'); return; }
    if (embed) { show('#auth'); return; }
    api('me').then(function (d) { showDone(d.user, false); })
      .catch(function () { show('#auth'); });
  });
})();
