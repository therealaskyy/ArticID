(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var params = new URLSearchParams(location.search);
  var embed = params.get('embed') === '1' && !!window.opener;
  var targetOrigin = null, minAge = 14;
  // "Redirect" mode: a game sends the player here with ?return=<game url>&mode=in|up|forgot|password
  // and, when done, the player goes back to the game with #artic_token=<token> in the address.
  var ret = null, mode = params.get('mode') || 'in', wantChange = mode === 'password';
  var views = ['#auth', '#f-forgot', '#f-reset', '#f-change', '#f-code', '#done'];
  var challenge = null, codeBack = '#auth';

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
        if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
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
    $('#done-title').textContent = fresh ? 'Welcome, ' + user.nick + '!' : 'Hi, ' + user.nick + '!';
    $('#done-sub').textContent = 'You are signed in as ' + user.email + '.';
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
      $('#done-sub').textContent = 'Done! Taking you back to the game…';
      backToGame(data.token);
      return;
    }
    if (embed && targetOrigin) {
      window.opener.postMessage({ type: 'artic-id:login', token: data.token, user: data.user }, targetOrigin);
      showDone(data.user, fresh);
      $('#done-sub').textContent = 'Done! This window will close by itself.';
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

  // Step 2 of sign-in, sign-up and password change: the 6-digit code we email.
  function showCode(d, email, back) {
    challenge = d.challenge; codeBack = back;
    $('#code-sub').textContent = 'We sent a 6-digit code to ' + email + '. It expires in 10 minutes.';
    $('#code').value = ''; err($('#f-code'));
    show('#f-code'); $('#code').focus();
  }
  $('#code-back').onclick = function () { show(codeBack); };
  submit($('#f-code'), function () {
    var code = $('#code').value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code from the email.');
    return api('verify', 'POST', { challenge: challenge, code: code }).then(function (d) {
      if (d.purpose === 'change') {
        $('#f-change').reset();
        if (ret) { backToGame(d.token); return; }
        showDone(d.user, false);
        $('#done-sub').textContent = 'Your password was changed. You are signed in as ' + d.user.email + '.';
        return;
      }
      onAuth(d, d.purpose === 'register');
    });
  });

  submit($('#f-in'), function () {
    var email = $('#in-mail').value.trim(), pass = $('#in-pass').value;
    if (!email || !pass) throw new Error('Enter your email and password.');
    return api('login', 'POST', { email: email, password: pass })
      .then(function (d) { $('#in-pass').value = ''; showCode(d, email, '#auth'); });
  });

  submit($('#f-up'), function () {
    var nick = $('#up-nick').value.trim(), email = $('#up-mail').value.trim(),
      pass = $('#up-pass').value, date = $('#up-date').value;
    if (nick.length < 3) throw new Error('Player name must be at least 3 characters.');
    if (!email) throw new Error('Enter your email.');
    if (pass.length < 8) throw new Error('Password must be at least 8 characters.');
    if (!date) throw new Error('Enter your date of birth.');
    if (!$('#up-terms').checked) throw new Error('To continue, accept the Terms of Service and the Privacy Policy.');
    return api('register', 'POST', { nick: nick, email: email, password: pass, birthdate: date, terms: true })
      .then(function (d) { $('#up-pass').value = ''; showCode(d, email, '#auth'); });
  });

  $('#to-forgot').onclick = function () { show('#f-forgot'); $('#fg-msg').hidden = true; };
  $('#fg-back').onclick = function () { show('#auth'); };
  submit($('#f-forgot'), function () {
    var email = $('#fg-mail').value.trim();
    if (!email) throw new Error('Enter your email.');
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

  // Change password: current + new password, then the emailed code.
  $('#to-change').onclick = function () { show('#f-change'); err($('#f-change')); $('#ch-old').focus(); };
  $('#ch-back').onclick = function () {
    if (ret) { backToGame(null); return; }
    api('me').then(function (d) { showDone(d.user, false); }).catch(function () { show('#auth'); });
  };
  submit($('#f-change'), function () {
    var o = $('#ch-old').value, n = $('#ch-new').value;
    if (!o) throw new Error('Enter your current password.');
    if (n.length < 8) throw new Error('The new password must be at least 8 characters.');
    return api('change', 'POST', { currentPassword: o, newPassword: n })
      .then(function (d) {
        return api('me').then(function (m) { showCode(d, m.user.email, '#f-change'); });
      });
  });
  $('#back-game').onclick = function () { backToGame(null); };

  $('#out').onclick = function () {
    api('logout', 'POST').catch(function () {}).then(function () { show('#auth'); tab('in'); $('#f-in').reset(); });
  };
  $('#to-del').onclick = function () { $('#f-del').hidden = false; $('#del-pass').focus(); };
  submit($('#f-del'), function () {
    if (!confirm('Do you really want to delete your Artic ID? This cannot be undone.')) return;
    return api('delete', 'POST', { password: $('#del-pass').value }).then(function () {
      $('#f-del').hidden = true; $('#f-del').reset(); show('#auth'); tab('in');
    });
  });

  var today = new Date().toISOString().slice(0, 10);
  $('#up-date').max = today;

  // Start
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
      if (!ret) ret = 'invalid';
    }
  }).catch(function () {}).then(function () {
    if (ret === 'invalid') {
      $('#fatal').textContent = 'This game is not authorized to use Artic ID.';
      $('#fatal').hidden = false; ret = null; return;
    }
    if (ret) $('#back-game').hidden = false;
    if (embed && !targetOrigin) {
      $('#fatal').textContent = 'This game is not authorized to use Artic ID.';
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
