import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const sb = createClient(
  'https://uumgpbruxsxskfrvjlzt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1bWdwYnJ1eHN4c2tmcnZqbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMjY3ODYsImV4cCI6MjA5NzgwMjc4Nn0.T7qiBNtmGPuKhjgd0LobYbbhRz0Yffm0iZ9A8Y4pPJw'
)

// Init au chargement
async function init() {
  await sb.auth.signOut()

  // Retour Stripe checkout
  var params = new URLSearchParams(window.location.search)
  if(params.get('checkout') === 'success'){
    var msg = document.createElement('div')
    msg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:9999;flex-direction:column;gap:16px'
    msg.innerHTML = '<div style="font-family:Bebas Neue,sans-serif;font-size:36px;color:#FFD700;letter-spacing:3px">ABONNEMENT ACTIVÉ !</div>'
      + '<div style="color:rgba(255,255,255,0.7);font-size:14px">Bienvenue dans le Challenger ANT COACH</div>'
      + '<a href="challenger.html" style="background:#8B0000;color:#fff;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;margin-top:8px">Accéder à mon espace →</a>'
    document.body.appendChild(msg)
  }
}

init()

async function redirectByRole(user) {
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  const role = p?.role || 'challenger'
  const map = {
    coach:               'dashboard.html',
    coaching:            'coaching.html',
    coaching_presentiel: 'coaching.html',
    coaching_distanciel: 'coaching.html',
    challenger:          'challenger.html',
    challenger_elite:    'elite.html',
  }
  console.log('ROLE DETECTE:', role)
  const { data: { session } } = await sb.auth.getSession()
  var token = session ? session.access_token : ''
  var uid = session ? session.user.id : ''
  var dest = map[role] || 'challenger.html'
  window.location.href = dest + '?t=' + encodeURIComponent(token) + '&u=' + encodeURIComponent(uid) + '&_=' + Date.now()
}

window.doLogin = async function() {
  const email = document.getElementById('email').value.trim().toLowerCase()
  const pwd   = document.getElementById('pwd').value
  const err   = document.getElementById('err-msg')
  const btn   = document.getElementById('login-btn')
  err.classList.remove('show')
  if (!email || !pwd) {
    err.textContent = 'Remplis tous les champs.'
    err.classList.add('show')
    return
  }
  btn.disabled = true
  btn.innerHTML = '<div class="spinner"></div> Connexion...'
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pwd })
    if (error) throw error
    await redirectByRole(data.user)
  } catch(e) {
    err.textContent = e.message.includes('Invalid') ? 'Email ou mot de passe incorrect.' : e.message
    err.classList.add('show')
    btn.disabled = false
    btn.innerHTML = 'Se connecter →'
  }
}