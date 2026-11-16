ArticID.mount(document.getElementById('slot'), {
  onLogin: function (s) { document.getElementById('out').textContent = 'Connesso come ' + s.user.nick + ' (' + s.user.aid + ')'; },
  onLogout: function () { document.getElementById('out').textContent = 'Non hai ancora fatto l’accesso.'; }
});
