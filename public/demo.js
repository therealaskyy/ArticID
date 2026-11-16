ArticID.mount(document.getElementById('slot'), {
  onLogin: function (s) { document.getElementById('out').textContent = 'Signed in as ' + s.user.nick + ' (' + s.user.aid + ')'; },
  onLogout: function () { document.getElementById('out').textContent = 'You are not signed in yet.'; }
});
