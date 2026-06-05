// ═══════════════════════════════════════
//  ANT COACH — Configuration Supabase
//  Ce fichier est importé par toutes les pages
// ═══════════════════════════════════════

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://bidsffgrvkjscxmolthh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHNmZmdydmtqc2N4bW9sdGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NTQyNzEsImV4cCI6MjA5NjIzMDI3MX0.CFKrxi6x_ohjIJqfSh20sX2AZ8LgCLGGGdsTmlHcf0Q'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── AUTH HELPERS ──

// Connexion
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

// Inscription
export async function register(email, password, role = 'challenger') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role } }
  })
  if (error) throw error
  return data
}

// Déconnexion
export async function logout() {
  await supabase.auth.signOut()
  window.location.href = '/ant_coach_hub.html'
}

// Utilisateur connecté
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return { ...user, profile }
}

// Redirection selon le rôle
export function redirectByRole(role) {
  const routes = {
    coach:                  '/ant_coach_dashboard_final.html',
    coaching_presentiel:    '/ant_coach_app_complete_final.html',
    coaching_distanciel:    '/ant_coach_app_complete_final.html',
    challenger:             '/ant_coach_app_challenger.html',
  }
  window.location.href = routes[role] || '/ant_coach_hub.html'
}

// Garde de route : redirige si pas connecté ou mauvais rôle
export async function requireAuth(allowedRoles = []) {
  const user = await getCurrentUser()
  if (!user) {
    window.location.href = '/ant_coach_hub.html'
    return null
  }
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.profile?.role)) {
    window.location.href = '/ant_coach_hub.html'
    return null
  }
  return user
}

// ── DATA HELPERS ──

// Profil
export async function getProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return data
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles').update(updates).eq('id', userId).select().single()
  if (error) throw error
  return data
}

// Pesées
export async function getPesees(clientId) {
  const { data } = await supabase
    .from('pesees').select('*').eq('client_id', clientId)
    .order('date_pesee', { ascending: false })
  return data || []
}

export async function addPesee(clientId, dateP, poidsKg, note = '') {
  const { data, error } = await supabase.from('pesees')
    .insert({ client_id: clientId, date_pesee: dateP, poids_kg: poidsKg, note })
    .select().single()
  if (error) throw error
  return data
}

// Mensurations
export async function getMensurations(clientId) {
  const { data } = await supabase
    .from('mensurations').select('*').eq('client_id', clientId)
    .order('date_mesure', { ascending: false })
  return data || []
}

export async function addMensuration(clientId, dateMesure, valeurs) {
  const { data, error } = await supabase.from('mensurations')
    .insert({ client_id: clientId, date_mesure: dateMesure, ...valeurs })
    .select().single()
  if (error) throw error
  return data
}

// Suivi quotidien (eau, sommeil, pas)
export async function getSuiviToday(clientId) {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('suivi_quotidien').select('*')
    .eq('client_id', clientId).eq('date_suivi', today).single()
  return data
}

export async function upsertSuivi(clientId, updates) {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase.from('suivi_quotidien')
    .upsert({ client_id: clientId, date_suivi: today, ...updates },
             { onConflict: 'client_id,date_suivi' })
    .select().single()
  if (error) throw error
  return data
}

// Niveau & XP
export async function getNiveau(clientId) {
  const { data } = await supabase
    .from('niveaux').select('*').eq('client_id', clientId).single()
  return data
}

export async function addXP(clientId, source, xp) {
  // Insère dans le log
  await supabase.from('xp_log').insert({ client_id: clientId, source, xp })
  // Met à jour le total
  const niveau = await getNiveau(clientId)
  const newTotal = (niveau?.xp_total || 0) + xp
  const newNiveau = calculerNiveau(newTotal)
  await supabase.from('niveaux').update({
    xp_total: newTotal,
    niveau: newNiveau,
    derniere_activite: new Date().toISOString().split('T')[0]
  }).eq('client_id', clientId)
  return { xp_total: newTotal, niveau: newNiveau }
}

export function calculerNiveau(xpTotal) {
  let lvl = 1, cumul = 0
  while (true) {
    const need = lvl * 5 + 5
    if (cumul + need > xpTotal) return lvl
    cumul += need
    lvl++
  }
}

export function xpPourNiveau(lvl) {
  return lvl * 5 + 5
}

export function xpDansNiveau(xpTotal) {
  let lvl = 1, cumul = 0
  while (true) {
    const need = lvl * 5 + 5
    if (cumul + need > xpTotal) return { xpIn: xpTotal - cumul, need, lvl }
    cumul += need
    lvl++
  }
}

// Défis
export async function getDefisAujourdhui(clientId) {
  const today = new Date().toISOString().split('T')[0]
  // Vérifier si les défis du jour existent déjà
  const { data: existing } = await supabase
    .from('defis_quotidiens').select('*, defi:defis_bank(*)')
    .eq('client_id', clientId).eq('date_defi', today)
  if (existing && existing.length === 5) return existing
  // Sinon, tirer 5 défis aléatoires
  const { data: banque } = await supabase
    .from('defis_bank').select('*').eq('actif', true)
  const shuffled = banque.sort(() => Math.random() - 0.5).slice(0, 5)
  const rows = shuffled.map(d => ({
    client_id: clientId, defi_id: d.id, date_defi: today
  }))
  await supabase.from('defis_quotidiens').insert(rows)
  // Relire avec le détail
  const { data: fresh } = await supabase
    .from('defis_quotidiens').select('*, defi:defis_bank(*)')
    .eq('client_id', clientId).eq('date_defi', today)
  return fresh || []
}

export async function toggleDefi(defiQuotidienId, complete, clientId) {
  const xpGagne = complete ? 2 : 0
  await supabase.from('defis_quotidiens')
    .update({ complete, xp_gagne: xpGagne })
    .eq('id', defiQuotidienId)
  if (complete) {
    await addXP(clientId, 'defi', 2)
    // Bonus 5/5
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('defis_quotidiens')
      .select('complete').eq('client_id', clientId).eq('date_defi', today)
    const tous = data?.every(d => d.complete)
    if (tous) await addXP(clientId, 'bonus_5_defis', 10)
  }
}

// Séances
export async function saveSeance(clientId, jourId, series) {
  const today = new Date().toISOString().split('T')[0]
  // Créer la séance
  const { data: seance } = await supabase.from('seances_realisees')
    .insert({ client_id: clientId, jour_id: jourId, date_seance: today })
    .select().single()
  // Insérer les séries
  if (series && series.length > 0) {
    await supabase.from('series_realisees').insert(
      series.map(s => ({ seance_id: seance.id, ...s }))
    )
  }
  // +2 XP
  await addXP(clientId, 'seance', 2)
  return seance
}

// Programme
export async function getProgramme(clientId) {
  const { data } = await supabase
    .from('programmes').select(`
      *,
      jours:jours_programme(
        *,
        exercices:exercices_jour(*, exercice:exercices(*))
      )
    `)
    .eq('client_id', clientId)
    .eq('actif', true)
    .single()
  return data
}

// Diète
export async function getDiete(clientId) {
  const { data } = await supabase
    .from('dietes').select('*').eq('client_id', clientId).eq('actif', true).single()
  return data
}

// Messages
export async function getMessages(userId, otherId) {
  const { data } = await supabase
    .from('messages').select('*')
    .or(`and(expediteur_id.eq.${userId},destinataire_id.eq.${otherId}),and(expediteur_id.eq.${otherId},destinataire_id.eq.${userId})`)
    .order('created_at', { ascending: true })
  return data || []
}

export async function sendMessage(expediteurId, destinataireId, contenu) {
  const { data, error } = await supabase.from('messages')
    .insert({ expediteur_id: expediteurId, destinataire_id: destinataireId, contenu })
    .select().single()
  if (error) throw error
  return data
}

// Écran client (KPIs, victoires, points attention)
export async function getEcranClient(clientId) {
  const { data } = await supabase
    .from('ecran_client').select('*').eq('client_id', clientId).single()
  return data
}

// Questionnaire (depuis la landing)
export async function submitQuestionnaire(reponses) {
  const { data, error } = await supabase.from('questionnaires')
    .insert(reponses).select().single()
  if (error) throw error
  return data
}

// ── REALTIME (temps réel) ──

// Écouter les nouveaux messages
export function subscribeMessages(userId, otherId, callback) {
  return supabase.channel('messages')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `destinataire_id=eq.${userId}`
    }, callback)
    .subscribe()
}

// Écouter les modifications de l'écran client (programme coach → client voit en live)
export function subscribeEcranClient(clientId, callback) {
  return supabase.channel('ecran_client')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'ecran_client',
      filter: `client_id=eq.${clientId}`
    }, callback)
    .subscribe()
}
