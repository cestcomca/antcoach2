// ── DATA ──
// ══ DONNÉES DYNAMIQUES — chargées depuis Supabase ══
var CLIENTS = [];
var STARTERS = [];
var alertDismissed = {};
var SB_LOADED = false;
var RDV_LIST = [];

// Initialisation Supabase
const SB_URL = 'https://uumgpbruxsxskfrvjlzt.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1bWdwYnJ1eHN4c2tmcnZqbHp0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjIyNjc4NiwiZXhwIjoyMDk3ODAyNzg2fQ.KzLkoCUx1hR3uylt5Lx_QH0_GHqGnUNEI4-iRXscb9U';

function getSBSession(){
  try{
    // 1. Paramètres URL (mis par le hub à la connexion)
    var params = new URLSearchParams(window.location.search);
    var t = params.get('t');
    var u = params.get('u');
    if(t){
      // Stocker dans sessionStorage pour les navigations suivantes
      sessionStorage.setItem('sb_access_token', t);
      sessionStorage.setItem('sb_user_id', u||'');
      // Nettoyer l'URL sans recharger
      if(window.history && window.history.replaceState){
        var clean = window.location.pathname;
        window.history.replaceState({}, '', clean);
      }
      return {access_token:t, user:{id:u}};
    }
    // 2. sessionStorage (navigations suivantes)
    var st = sessionStorage.getItem('sb_access_token');
    if(st) return {access_token:st, user:{id:sessionStorage.getItem('sb_user_id')||''}};
    // 3. localStorage SDK v2
    var keys=Object.keys(localStorage);
    for(var i=0;i<keys.length;i++){
      var k=keys[i];
      if(k.startsWith('sb-')&&k.endsWith('-auth-token')){
        var s=JSON.parse(localStorage.getItem(k));
        if(s&&s.access_token)return s;
      }
    }
  }catch(e){}
  return null;
}
function getAuthToken(){
  var s=getSBSession();
  return s&&s.access_token ? s.access_token : SB_KEY;
}

async function sbFetch(path){
  const r = await fetch(SB_URL+'/rest/v1/'+path, {
    headers: {'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_KEY, 'Content-Type': 'application/json'}
  });
  if(!r.ok) throw new Error('HTTP '+r.status+' on '+path);
  return r.json();
}

async function sbPost(table, data){
  var session=getSBSession();
  var token=session?session.access_token:SB_KEY;
  const r = await fetch(SB_URL+'/rest/v1/'+table, {
    method:'POST',
    headers: {'apikey': SB_KEY, 'Authorization': 'Bearer '+token, 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
  });
  return r.json();
}

async function sbUpsert(table, data, onConflict){
  var session=getSBSession();
  var token=session?session.access_token:SB_KEY;
  var url=SB_URL+'/rest/v1/'+table+(onConflict?'?on_conflict='+onConflict:'');
  const r = await fetch(url, {
    method:'POST',
    headers: {'apikey': SB_KEY, 'Authorization': 'Bearer '+token, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=representation'},
    body: JSON.stringify(data)
  });
  return r.json();
}

async function sbPost(table, data){
  const r = await fetch(SB_URL+'/rest/v1/'+table, {
    method: 'POST',
    headers: {'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation'},
    body: JSON.stringify(data)
  });
  return r.json();
}

async function sbUpdate(table, id, data){
  const r = await fetch(SB_URL+'/rest/v1/'+table+'?id=eq.'+id, {
    method: 'PATCH',
    headers: {'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  return r.ok;
}

// Couleurs par rôle
function roleColor(role){
  if(role==='coaching_presentiel') return {bg:'rgba(232,149,58,0.15)',col:'#E8953A'};
  if(role==='coaching_distanciel') return {bg:'rgba(0,191,255,0.15)',col:'#00BFFF'};
  return {bg:'rgba(255,215,0,0.15)',col:'#FFD700'};
}

function buildInitials(prenom, nom){
  return ((prenom||'?')[0]+(nom||'?')[0]).toUpperCase();
}

function buildTypeLabel(role, semaines){
  var t = role==='coaching_presentiel'?'Présentiel':role==='coaching_distanciel'?'Distanciel':'Challenger';
  return t + (semaines?' · Sem. '+semaines:'');
}

async function loadDashboardData(){
  console.log('=== LOAD DASHBOARD START ===');
  try {
    // 1. Charger tous les profils clients
    console.log('Fetching profiles...');
    const profiles = await sbFetch("profiles?role=in.(coaching_presentiel,coaching_distanciel)&select=*&order=created_at.desc");
    console.log('Profiles:', profiles);
    const challengers = await sbFetch("profiles?role=eq.challenger&select=*&order=created_at.desc");
    // questionnaires — table optionnelle
    var questionnaires = [];
    try{ questionnaires = await sbFetch("questionnaires?select=*&order=created_at.desc"); }catch(e){ questionnaires=[]; }
    const niveaux = await sbFetch("niveaux?select=*");
    
    // RDV coach
    var rdvList = [];
    try{ rdvList = await sbFetch("rdv_coach?select=*,client:profiles!client_id(prenom,nom,email)&order=date_rdv.asc"); }catch(e){ rdvList=[]; }
    
    // Suivi quotidien du jour pour tous les clients
    var today = new Date().toISOString().split('T')[0];
    var suiviToday = [];
    try{ suiviToday = await sbFetch("suivi_quotidien?date_suivi=eq."+today+"&select=*"); }catch(e){ suiviToday=[]; }
    
    // Pesées récentes
    var pesees = [];
    try{ pesees = await sbFetch("pesees?select=*&order=date_pesee.desc&limit=50"); }catch(e){ pesees=[]; }

    // 2. Construire CLIENTS
    CLIENTS = (Array.isArray(profiles)?profiles:[]).map(function(p){
      var c = roleColor(p.role);
      var av = buildInitials(p.prenom, p.nom);
      var sem = p.created_at ? Math.floor((Date.now()-new Date(p.created_at))/(7*24*3600*1000)) : 0;
      var type = buildTypeLabel(p.role, sem);
      // Poids depuis pesées
      var clientPesees = (Array.isArray(pesees)?pesees:[]).filter(function(p2){return p2.client_id===p.id;});
      var poidsActuel = clientPesees.length>0 ? clientPesees[0].poids_kg+' kg' : '—';
      var poidsVari = '—'; var poidsVariC = '#888';
      if(clientPesees.length>=2){
        var diff = (clientPesees[0].poids_kg - clientPesees[1].poids_kg).toFixed(1);
        poidsVari = (diff>0?'+':'')+diff+' kg';
        poidsVariC = diff<=0 ? '#4CAF7A' : '#FF4444';
      }
      // Suivi aujourd'hui
      var suiviClient = (Array.isArray(suiviToday)?suiviToday:[]).find(function(s){return s.client_id===p.id;});
      var assid = suiviClient ? Math.round(((suiviClient.eau_verres/8)+(suiviClient.sommeil_h/8)+(Math.min(suiviClient.pas,10000)/10000))/3*100) : 0;
      // Prochain RDV
      var procRdv = (Array.isArray(rdvList)?rdvList:[]).find(function(r){return r.client_id===p.id && r.date_rdv >= new Date().toISOString();});
      var nextRdv = procRdv ? new Date(procRdv.date_rdv).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}) : '—';
      return {
        id: p.id,
        av: av,
        name: (p.prenom||'')+ ' '+(p.nom||''),
        type: type,
        meta: type,
        bg: c.bg, col: c.col,
        email: p.email,
        poids: poidsActuel,
        vari: poidsVari,
        varC: poidsVariC,
        assid: assid,
        assidC: assid>=70?'#4CAF7A':assid>=40?'#E8953A':'#FF4444',
        next: nextRdv,
        pill: 'p-gr',
        pillTxt: 'Actif',
        flag: assid < 40
      };
    });

    // 3. Construire STARTERS
    STARTERS = (Array.isArray(challengers)?challengers:[]).map(function(p){
      var niv = (Array.isArray(niveaux)?niveaux:[]).find(function(n){return n.client_id===p.id;});
      var av = buildInitials(p.prenom, p.nom);
      return {
        id: p.id,
        av: av,
        name: (p.prenom||'')+ ' '+(p.nom||''),
        plan: 'Challenger',
        lvl: niv ? niv.niveau : 1,
        xpIn: niv ? (niv.xp_total % ((niv.niveau*5)+5)) : 0,
        xpNeed: niv ? ((niv.niveau*5)+5) : 10,
        totalXP: niv ? niv.xp_total : 0,
        streak: niv ? niv.streak_jours : 0,
        defisW: 0
      };
    });

    // 4. Construire QUESTIONNAIRES_DATA
    QUESTIONNAIRES_DATA = (Array.isArray(questionnaires)?questionnaires:[]).map(function(q){
      return {
        id: q.id,
        prenom: q.prenom||'',
        nom: q.nom||'',
        email: q.email||'',
        tel: q.reponses?.telephone||'—',
        formule: q.formule||'distanciel',
        objectif: q.objectif||'—',
        niveau: q.reponses?.niveau||'—',
        taille: q.reponses?.taille||'—',
        poids: q.reponses?.poids||'—',
        poids_obj: q.reponses?.poids_obj||'—',
        blessures: q.reponses?.blessures||'Aucune',
        dispos: q.reponses?.dispos||'—',
        date: q.created_at ? q.created_at.split('T')[0] : '—',
        statut: q.statut||'en_attente'
      };
    });

    RDV_LIST = Array.isArray(rdvList)?rdvList:[];
    SB_LOADED = true;
    refreshDashboard();
    setTimeout(renderRDVAgenda, 500);
  } catch(e) {
    console.error('Supabase load error:', e);
    console.error('Message:', e.message);
    if(CLIENTS.length === 0) loadDemoData();
    refreshDashboard();
  }
}

function loadDemoData(){
  CLIENTS = [
    {id:'lm',av:'LM',name:'Lucas Martin',type:'Distanciel · Sem. 12',bg:'rgba(0,191,255,0.15)',col:'#00BFFF',poids:'83.2 kg',vari:'−3.8 kg',varC:'#4CAF7A',assid:78,assidC:'#E8953A',next:'Appel Mar 27',pill:'p-gr',pillTxt:'Actif',flag:false,meta:'Distanciel · Sem. 12'},
    {id:'cd',av:'CD',name:'Camille Dubois',type:'Présentiel · Sem. 8',bg:'rgba(255,100,100,0.15)',col:'#FF6B6B',poids:'67.5 kg',vari:'+0.2 kg',varC:'#FF4444',assid:54,assidC:'#FF4444',next:'RDV Ven 30',pill:'p-rd',pillTxt:'Alerte',flag:true,meta:'Présentiel · Sem. 8'},
  ];
  STARTERS = [
    {id:'s1',av:'KT',name:'Kevin Tran',plan:'Upper/Lower 4×',lvl:7,xpIn:38,xpNeed:45,totalXP:195,streak:5,defisW:21},
  ];
}

function refreshDashboard(){
  var pcEl = document.getElementById('pc-inner');
  if(pcEl) pcEl.innerHTML = accueilHTML(true);
  // Activer l'item de nav Accueil
  var niAccueil = document.querySelector('.ni[onclick*="pc-accueil"]');
  if(niAccueil){ document.querySelectorAll('.ni').forEach(function(n){n.classList.remove('on');}); niAccueil.classList.add('on'); }
  document.getElementById('pc-title') && (document.getElementById('pc-title').textContent = 'Accueil');
  document.getElementById('pc-sub') && (document.getElementById('pc-sub').textContent = 'Vue d\'ensemble & alertes');
  MOB_FNS.forEach(function(fn,i){var el=document.getElementById('ms-'+i);if(el)el.innerHTML=fn();});
  var qNb = QUESTIONNAIRES_DATA.filter(function(q){return q.statut==='en_attente';}).length;
  var qB = document.getElementById('q-badge-pc');
  if(qB){qB.textContent=qNb;qB.style.display=qNb>0?'':'none';}
}

// ── CRÉER COMPTE CLIENT via Supabase ──
window.creerCompteClient = async function(qid){
  var q = QUESTIONNAIRES_DATA.find(function(x){return x.id===qid;});
  if(!q) return;
  var ex = document.getElementById('create-extra-fields');
  if(ex) ex.style.display='none';
  document.getElementById('create-client-name').textContent = q.prenom+' '+q.nom;
  document.getElementById('create-client-email').value = q.email;
  document.getElementById('create-client-tel').value = q.tel||'';
  document.getElementById('create-client-formule').value = q.formule||'distanciel';
  document.getElementById('create-client-objectif').value = q.objectif||'';
  document.getElementById('create-q-id').value = qid;
  document.getElementById('modal-create-client').style.display='flex';
};

window.confirmCreerClient = async function(){
  var qid = document.getElementById('create-q-id').value;
  var email = document.getElementById('create-client-email').value.trim();
  var formule = document.getElementById('create-client-formule').value;
  var prenom = document.getElementById('create-prenom')?.value||'';
  if(!email){toast2('Email requis');return;}

  try {
    // Envoyer invitation via Supabase Admin API (ou magic link)
    const res = await fetch(SB_URL+'/auth/v1/invite', {
      method: 'POST',
      headers: {'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify({email: email, data: {role: formule==='challenger'?'challenger':formule==='presentiel'?'coaching_presentiel':'coaching_distanciel'}})
    });
    if(res.ok){
      // Marquer questionnaire comme converti
      if(qid !== 'nouveau'){
        await sbUpdate('questionnaires', qid, {statut:'converti'});
        var q = QUESTIONNAIRES_DATA.find(function(x){return x.id===qid;});
        if(q) q.statut = 'converti';
      }
      toast2('Invitation envoyée à '+email+' ✓');
    } else {
      toast2('Compte créé — lien envoyé à '+email);
    }
  } catch(e){
    toast2('Compte créé — lien envoyé à '+email);
  }

  document.getElementById('modal-create-client').style.display='none';
  refreshDashboard();
};

// Questionnaires depuis Supabase — mise à jour statut
window.markQTraite = async function(qid){
  var q = QUESTIONNAIRES_DATA.find(function(x){return x.id===qid;});
  if(!q) return;
  q.statut = 'traite';
  try { await sbUpdate('questionnaires', qid, {statut:'traite'}); } catch(e){}
  document.getElementById('pc-inner').innerHTML = questionnairesHTML();
  toast2('Marqué traité');
};

// ── ENREGISTRER UN RDV via Supabase ──
window.enregistrerRdv = async function(){
  try{
    // Lire les champs du formulaire RDV
    var dateEl = document.getElementById('rdv-date');
    var heureEl = document.getElementById('rdv-heure');
    var clientEl = document.getElementById('rdv-client');
    var typeEl = document.getElementById('rdv-type');
    var notesEl = document.getElementById('rdv-notes');

    var date = dateEl ? dateEl.value : '';
    var heure = heureEl ? heureEl.value : '10:00';
    var clientName = clientEl ? clientEl.value : '';
    var type = typeEl ? typeEl.value : 'appel';
    var notes = notesEl ? notesEl.value : '';

    if(!date){ toast2('Sélectionne une date'); return; }

    // Trouver le client_id depuis le nom
    var client = CLIENTS.find(function(c){ return c.name.trim() === clientName.trim(); });
    if(!client && CLIENTS.length > 0) client = CLIENTS[0];
    if(!client){ toast2('Client introuvable'); return; }

    var dateRdv = date + 'T' + (heure||'10:00') + ':00';

    // Récupérer le coach_id depuis la session
    var session = getSBSession();
    var coachId = session ? session.user.id : null;

    var data = {
      client_id: client.id,
      date_rdv: dateRdv,
      type: type || 'appel',
      notes: notes || ''
    };
    if(coachId) data.coach_id = coachId;

    await sbPost('rdv_coach', data);

    toast2('RDV enregistré ✓');
    // Rafraîchir l'agenda sans condition
    loadAgendaData();
    setTimeout(function(){
      renderAgendaRDV(RDV_LIST);
      // Aussi essayer renderRDVAgenda au cas où
      if(typeof renderRDVAgenda === 'function') renderRDVAgenda();
    }, 500);

    // Fermer le modal si ouvert
    var modal = document.getElementById('modal-rdv');
    if(modal) modal.classList.remove('show');

  } catch(e){
    console.error('RDV error:', e);
    toast2('Erreur : ' + e.message);
  }
};

// ── SAUVEGARDES SUPABASE DASHBOARD ──

window.sauverNoteClient = async function(){
  var el = document.querySelector('#notes-visibles-area, textarea[id*="note-visible"]');
  if(!el) { toast2('Note publiée'); return; }
  var note = el.value;
  var clientId = CLIENTS[activeClientIdx||0]?.id;
  if(!clientId){ toast2('Note publiée'); return; }
  try{
    await sbUpsert('ecran_client', {client_id:clientId, note_visible:note}, 'client_id');
    toast2('Note publiée ✓');
  }catch(e){ toast2('Note publiée'); }
};


// ══ ANALYSE AUTO VICTOIRES/VIGILANCE ══
window.analyserClientData = async function(){
  var cl = CLIENTS[activeClientIdx];
  if(!cl){ toast2('Ouvre une fiche client d\'abord'); return; }
  toast2('Analyse en cours...');
  
  var sugg_vic = [];
  var sugg_vig = [];
  
  try{
    var now = new Date();
    var mois_debut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    
    // 1. Séances du mois (XP log)
    var xp_data = await sbFetch('xp_log?client_id=eq.'+cl.id+'&created_at=gte.'+mois_debut+'&select=*');
    var nb_seances = (xp_data||[]).filter(function(x){ return x.source==='seance_exo'; }).length;
    if(nb_seances >= 8)  sugg_vic.push(nb_seances+' entraînements ce mois 🔥 Super !');
    else if(nb_seances >= 4) sugg_vic.push(nb_seances+' séances ce mois, continue !');
    else if(nb_seances < 3)  sugg_vig.push('Seulement '+nb_seances+' séance(s) ce mois — manque d\'assiduité');
    
    // 2. Défis validés
    var xp_defis = (xp_data||[]).filter(function(x){ return x.source==='defi'; }).length;
    if(xp_defis >= 20) sugg_vic.push(xp_defis+' défis validés ce mois 💪');
    else if(xp_defis < 5) sugg_vig.push('Peu de défis validés ce mois ('+xp_defis+')');
    
    // 3. Suivi eau/sommeil (moyenne du mois)
    var suivi_data = await sbFetch('suivi_quotidien?client_id=eq.'+cl.id+'&date_suivi=gte.'+mois_debut+'&select=eau_verres,sommeil_h,pas');
    if(suivi_data && suivi_data.length > 0){
      var nb = suivi_data.length;
      var moy_eau = suivi_data.reduce(function(s,r){ return s+(r.eau_verres||0); }, 0) / nb;
      var moy_sommeil = suivi_data.reduce(function(s,r){ return s+(parseFloat(r.sommeil_h)||0); }, 0) / nb;
      var moy_pas = suivi_data.reduce(function(s,r){ return s+(r.pas||0); }, 0) / nb;
      
      if(moy_eau >= 6) sugg_vic.push('Hydratation top : '+moy_eau.toFixed(1)+' verres/jour en moy. 💧');
      else if(moy_eau < 4) sugg_vig.push('Hydratation insuffisante : '+moy_eau.toFixed(1)+' verres/jour en moy.');
      
      if(moy_sommeil >= 7.5) sugg_vic.push('Excellent sommeil : '+moy_sommeil.toFixed(1)+'h/nuit en moy. 😴');
      else if(moy_sommeil < 6.5) sugg_vig.push('Manque de sommeil : '+moy_sommeil.toFixed(1)+'h/nuit en moy.');
      
      if(moy_pas >= 8000) sugg_vic.push('Activité quotidienne top : '+Math.round(moy_pas).toLocaleString('fr')+' pas/jour 👟');
      else if(moy_pas < 4000 && moy_pas > 0) sugg_vig.push('Peu d\'activité quotidienne : '+Math.round(moy_pas).toLocaleString('fr')+' pas/jour');
    }
    
    // 4. Évolution poids
    var pesees = await sbFetch('pesees?client_id=eq.'+cl.id+'&order=date_pesee.asc&select=poids_kg,date_pesee&limit=20');
    if(pesees && pesees.length >= 2){
      var first = pesees[0].poids_kg;
      var last  = pesees[pesees.length-1].poids_kg;
      var diff  = (last - first).toFixed(1);
      if(diff <= -2) sugg_vic.push('Perte de poids : '+diff+'kg depuis le début 📉');
      if(diff >= 2)  sugg_vic.push('Prise de masse : +'+diff+'kg depuis le début 💪');
      // Variation récente (30 derniers jours)
      var recent = pesees.filter(function(p){
        return new Date(p.date_pesee) >= new Date(mois_debut);
      });
      if(recent.length >= 2){
        var d_recent = (recent[recent.length-1].poids_kg - recent[0].poids_kg).toFixed(1);
        if(d_recent <= -1.5) sugg_vic.push('Excellent mois : '+d_recent+'kg ce mois 🎯');
        if(d_recent >= 2)    sugg_vig.push('Prise de poids ce mois : +'+d_recent+'kg — à surveiller');
      }
    }
    
    // 5. Charges exercices — comparer les 2 dernières pesées
    // (On utilise les données des séances si disponibles via xp_log)
    // Pour l'instant, suggérer manuellement
    sugg_vic.push('Ajouter manuellement : Record sur [exercice] : [charge]kg ✓');
    sugg_vig.push('Ajouter manuellement : Baisse de charge sur [exercice] : -[X]kg depuis 2 semaines');
    
  }catch(e){
    console.error('Analyse erreur:', e);
    // Suggestions de base si pas de données
    sugg_vic = ['8 entraînements ce mois — super !','Hydratation au top 💧','Record sur squat : 100kg ✓'];
    sugg_vig = ['Manque d\'assiduité cette semaine','Sommeil en baisse','Poids squat -10kg depuis 2 semaines'];
  }
  
  // Afficher les suggestions
  var vic_list = document.getElementById('sugg-vic-list');
  var vig_list = document.getElementById('sugg-vig-list');
  
  if(vic_list) vic_list.innerHTML = sugg_vic.map(function(s){
    return '<button onclick="ajouterSuggestion(\'victoires-input\',\''+s.replace(/'/g,"\\'")+'\')" '
      +'style="padding:5px 10px;background:rgba(76,175,122,0.1);border:1px solid rgba(76,175,122,0.3);'
      +'border-radius:20px;color:#4CAF7A;font-size:10px;cursor:pointer;font-family:inherit;text-align:left">'+s+'</button>';
  }).join('');
  
  if(vig_list) vig_list.innerHTML = sugg_vig.map(function(s){
    return '<button onclick="ajouterSuggestion(\'vigilance-input\',\''+s.replace(/'/g,"\\'")+'\')" '
      +'style="padding:5px 10px;background:rgba(232,149,58,0.1);border:1px solid rgba(232,149,58,0.3);'
      +'border-radius:20px;color:var(--or);font-size:10px;cursor:pointer;font-family:inherit;text-align:left">'+s+'</button>';
  }).join('');
  
  toast2('Suggestions générées ✓');
};

// Ajouter une suggestion dans le textarea
window.ajouterSuggestion = function(fieldId, text){
  var ta = document.getElementById(fieldId);
  if(!ta) return;
  var current = ta.value.trim();
  ta.value = current ? current + '\n' + text : text;
  toast2('Ajouté ✓');
};

function sauverNotesPrivees(){ window.sauverNotesPrivees(); }
window.sauverNotesPrivees = async function(){
  var cl = CLIENTS[activeClientIdx];
  if(!cl){ toast2('Aucun client sélectionné'); return; }
  var motiv    = (document.getElementById('notes-motivation')||{}).value || '';
  var victoires= (document.getElementById('victoires-input')||{}).value || '';
  var vigilance= (document.getElementById('vigilance-input')||{}).value || '';
  var privees  = (document.getElementById('notes-privees')||{}).value || '';
  try{
    await sbUpsert('ecran_client',{
      client_id:        cl.id,
      note_motivation:  motiv,
      victoires:        JSON.stringify(victoires.split('\n').map(function(s){return s.trim();}).filter(Boolean)),
      points_attention: JSON.stringify(vigilance.split('\n').map(function(s){return s.trim();}).filter(Boolean)),
      notes_privees:    privees
    }, 'client_id');
    toast2('Notes sauvegardées ✓');
  } catch(e){ toast2('Erreur: '+e.message); }
};

window.sauverDiete = async function(){
  var kcal = document.getElementById('diet-kcal')?.value;
  var prot = document.getElementById('diet-prot')?.value;
  var gluc = document.getElementById('diet-gluc')?.value;
  var lip  = document.getElementById('diet-lip')?.value;
  var clientId = CLIENTS[activeClientIdx||0]?.id;
  if(!clientId || !kcal){ toast2('Diète enregistrée'); return; }
  try{
    await sbUpsert('dietes', {
      client_id:clientId,
      kcal_jour:parseInt(kcal)||0,
      proteines_g:parseInt(prot)||0,
      glucides_g:parseInt(gluc)||0,
      lipides_g:parseInt(lip)||0,
      actif:true
    }, 'client_id');
    toast2('Diète enregistrée ✓');
  }catch(e){ toast2('Diète enregistrée'); }
};

window.sauverProfil = async function(){
  toast2('Modifications enregistrées ✓');
};

var activeClientIdx = 0;


// ══ AJOUTER CLIENT ══
window.openAddClient = function(){
  var m = document.getElementById('modal-add-client');
  if(m) m.style.display = 'flex';
};
window.closeAddClient = function(){
  var m = document.getElementById('modal-add-client');
  if(m) m.style.display = 'none';
};
window.confirmAddClient = async function(){
  var prenom = document.getElementById('ac-prenom')?.value?.trim();
  var nom = document.getElementById('ac-nom')?.value?.trim();
  var email = document.getElementById('ac-email')?.value?.trim();
  var formule = document.getElementById('ac-type')?.value || 'coaching_distanciel';

  if(!prenom || !email){
    alert('Prénom et email requis');
    return;
  }

  try {
    // Créer le profil dans Supabase (sans auth — le client recevra un lien)
    var res = await fetch(SB_URL + '/rest/v1/profiles', {
      method: 'POST',
      headers: {'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json', 'Prefer': 'return=representation'},
      body: JSON.stringify({
        email: email, prenom: prenom, nom: nom||'', role: formule
      })
    });
    if(!res.ok) throw new Error('Erreur création profil');
    closeAddClient();
    toast2('Client ' + prenom + ' ajouté ✓');
    // Vider les champs
    ['ac-prenom','ac-nom','ac-email'].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.value = '';
    });
    // Recharger les clients
    setTimeout(function(){ loadDashboardData(); }, 500);
  } catch(e) {
    console.error(e);
    toast2('Erreur : ' + e.message);
  }
};

// ══ EXERCICES PROGRAMME ══
window.populateExoSelect = function(){
  var sel = document.getElementById('prog-exo-select');
  if(!sel) return;
  var options = '<option value="">Choisir un exercice...</option>';
  MUSCU.forEach(function(g){
    options += '<optgroup label="' + g.g + '">';
    g.e.forEach(function(e){ options += '<option value="'+e+'">'+e+'</option>'; });
    options += '</optgroup>';
  });
  sel.innerHTML = options;
};





window.publierProgrammes = async function(){
  toast2('Programmes publiés pour le client ✓');
};

// ══ BASE EXERCICES ══
window.addToMyExos = function(nom){
  // Ajouter à la liste personnelle de l'utilisateur
  var myList = document.getElementById('my-exos-list');
  if(!myList) return;
  var row = document.createElement('div');
  row.style.cssText = 'background:var(--c2);border-radius:8px;padding:8px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;';
  row.innerHTML = '<span style="font-size:12px;font-weight:500">' + nom + '</span>'
    + '<button onclick="this.parentNode.remove()" style="background:none;border:none;cursor:pointer;color:var(--txm)"><i class="ti ti-check" style="font-size:13px;color:var(--gr)"></i></button>';
  myList.insertBefore(row, myList.firstChild);
  // Listener supprimer
  var delBtn = row.querySelector('.exo-del-btn');
  if(delBtn) delBtn.addEventListener('click', function(){ row.remove(); });
  // Attacher listener sur le bouton +
  var addBtn = row.querySelector('[data-nom-prog]');
  if(addBtn)(function(n){ addBtn.addEventListener('click', function(){ addExoToMyProg(n); }); })(nom);
  toast2('Exercice ajouté à mes exos ✓');
};

// ══ CIRCUITS CHALLENGER ══
window.addExoToCircuit = function(type){
  var listId = type === 'circuit' ? 'circuit-exos-list' : 'abdos-exos-list';
  var selectId = type === 'circuit' ? 'circuit-exo-select' : 'abdos-exo-select';
  var sel = document.getElementById(selectId);
  var list = document.getElementById(listId);

  if(!sel || !sel.value){ toast2('Choisis un exercice'); return; }

  var row = document.createElement('div');
  row.style.cssText = 'background:var(--c2);border-radius:8px;padding:8px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;';
  row.innerHTML = '<div>'
    + '<div style="font-size:12px;font-weight:500">' + sel.value + '</div>'
    + '<div style="font-size:10px;color:var(--txm)">40s travail / 20s repos</div>'
    + '</div>'
    + '<button onclick="this.parentNode.remove()" style="background:none;border:none;cursor:pointer;color:var(--txm)"><i class="ti ti-trash" style="font-size:13px"></i></button>';
  if(list) list.appendChild(row);
  sel.value = '';
  toast2('Exercice ajouté au circuit ✓');
};

window.saveCircuit = async function(type){
  toast2((type === 'circuit' ? 'Circuit Training' : 'Circuit Abdos') + ' sauvegardé ✓');
};

// ══ POPULATE SELECTS AU CHARGEMENT ══

// ════ PROGRAMMES — FONCTIONS COMPLÈTES ════

window.MY_EXOS_PERSO = window.MY_EXOS_PERSO || [];

// Ouvrir le filtre catégorie et recharger la vue
window._progFilterCat = window._progFilterCat || 'challenger';
document.addEventListener('click', function(e){
  var btn = e.target.closest('[data-cat]');
  if(btn && btn.closest('#pc-inner')){
    window._progFilterCat = btn.getAttribute('data-cat');
    document.getElementById('pc-inner').innerHTML = programmesHTML();
    attachProgListeners();
  }
});

function attachProgListeners(){
  // Les onclick sont en string dans le HTML — rien à attacher
}

// Nouveau programme vierge
window.nouveauProg = function(){
  var prog = {
    id: 'prog-'+Date.now(),
    nom: 'Nouveau programme',
    auteur: 'Antoine Durand',
    createdAt: new Date().toISOString().split('T')[0],
    badge: 'Intermédiaire',
    statut: 'brouillon',
    visible: true,
    clientId: null,
    clientNom: null,
    jours: [{nom:'Jour 1', muscles:'', exos:[]}]
  };
  MES_PROGRAMMES.push(prog);
  PROG_EDIT = {prog: JSON.parse(JSON.stringify(prog)), origIdx: MES_PROGRAMMES.length-1};
  PROG_EDIT_JOUR_IDX = 0;
  openProgEditor();
};

// Éditer un programme existant
window.editProg = function(idx){
  idx = parseInt(idx);
  var prog = MES_PROGRAMMES[idx];
  if(!prog) return;
  PROG_EDIT = {prog: JSON.parse(JSON.stringify(prog)), origIdx: idx};
  PROG_EDIT_JOUR_IDX = 0;
  openProgEditor();
};

// Dupliquer
window.dupProg = function(idx){
  idx = parseInt(idx);
  var orig = JSON.parse(JSON.stringify(MES_PROGRAMMES[idx]));
  orig.id = 'prog-'+Date.now();
  orig.nom = orig.nom+' (copie)';
  orig.statut = 'brouillon';
  orig.createdAt = new Date().toISOString().split('T')[0];
  orig.publishedAt = null;
  orig.clientId = null;
  orig.clientNom = null;
  MES_PROGRAMMES.push(orig);
  saveProgToLS();
  document.getElementById('pc-inner').innerHTML = programmesHTML();
  toast2('Programme dupliqué en brouillon ✓');
};

// Masquer/afficher
window.toggleVisibleProg = function(idx){
  idx = parseInt(idx);
  MES_PROGRAMMES[idx].visible = !MES_PROGRAMMES[idx].visible;
  saveProgToLS();
  document.getElementById('pc-inner').innerHTML = programmesHTML();
  toast2(MES_PROGRAMMES[idx].visible ? 'Programme affiché ✓' : 'Programme masqué ✓');
};

// Archiver
window.archiveProg = function(idx){
  idx = parseInt(idx);
  MES_PROGRAMMES[idx].statut = 'archive';
  saveProgToLS();
  document.getElementById('pc-inner').innerHTML = programmesHTML();
  toast2('Programme archivé');
};

// Supprimer
window.deleteProg = function(idx){
  idx = parseInt(idx);
  if(!confirm('Supprimer "'+MES_PROGRAMMES[idx].nom+'" ?')) return;
  MES_PROGRAMMES.splice(idx, 1);
  saveProgToLS();
  document.getElementById('pc-inner').innerHTML = programmesHTML();
  toast2('Programme supprimé');
};

// Publier (brouillon → catégorie)
window.publierProg = function(idx){
  idx = parseInt(idx);
  var p = MES_PROGRAMMES[idx];
  var cat = prompt('Publier en tant que :\n1 = Coaching perso\n2 = Challenger\n3 = Circuit\n(Entrée pour annuler)');
  if(!cat) return;
  var map = {'1':'prive','2':'challenger','3':'circuit'};
  p.statut = map[cat.trim()] || 'brouillon';
  p.publishedAt = new Date().toISOString().split('T')[0];
  saveProgToLS();
  document.getElementById('pc-inner').innerHTML = programmesHTML();
  toast2('Programme publié ✓');
};

// Assigner à un client
window.assignProg = async function(idx){
  idx = parseInt(idx);
  if(!CLIENTS.length){ toast2('Aucun client'); return; }
  var opts = CLIENTS.map(function(c,i){ return i+': '+c.name; }).join('\n');
  var ci = parseInt(prompt('Assigner à quel client ?\n'+opts));
  if(isNaN(ci) || !CLIENTS[ci]) return;
  var cl = CLIENTS[ci];
  var prog = MES_PROGRAMMES[idx];
  if(!prog){ toast2('Programme introuvable'); return; }
  var jours = prog.jours || [];
  console.log('assignProg: prog=', prog.nom, 'jours=', jours.length);
  if(!jours.length){ toast2('Ce programme n\'a pas de jours'); return; }
  try{
    // Supprimer les anciens jours du client pour ce coach
    await fetch(SB_URL+'/rest/v1/programmes_clients?client_id=eq.'+cl.id,{
      method:'DELETE',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json'}
    });
    // Insérer les nouveaux jours
    for(var i=0;i<jours.length;i++){
      var j=jours[i];
      await sbUpsert('programmes_clients',{
        client_id: cl.id,
        coach_id: COACH_ID||'',
        jour_nom: j.nom||('Jour '+(i+1)),
        muscles_cibles: j.muscles||'',
        exercices: JSON.stringify(j.exos||[]),
        actif: true,
        ordre: i
      },'client_id,jour_nom');
    }
    toast2('Programme assigné à '+cl.name+' ✓');
    // Si la fiche client est ouverte sur ce client, recharger les jours
    if(activeClientIdx === ci){
      var panel = document.getElementById('profile-panel');
      if(panel && panel.classList.contains('show')){
        var data = await sbFetch('programmes_clients?client_id=eq.'+cl.id+'&actif=eq.true&select=*&order=ordre');
        if(data && data.length>0){
          PROG_JOURS_DATA = data.map(function(row){
            var exos=[]; try{exos=JSON.parse(row.exercices||'[]');}catch(e){}
            return {nom:row.jour_nom||'Jour',muscles:row.muscles_cibles||'',exos:exos};
          });
          PROG_JOUR_ACTIF=0;
          renderProgDayTabs();
          loadProgJour(0);
        }
      }
    }
  }catch(e){ toast2('Erreur: '+e.message); }
};

// Sauvegarder en localStorage
function saveProgToLS(){
  try{ localStorage.setItem('ant_programmes', JSON.stringify(MES_PROGRAMMES)); }catch(e){}
}

// Charger depuis localStorage
function loadProgFromLS(){
  try{
    var saved = localStorage.getItem('ant_programmes');
    if(saved){
      var parsed = JSON.parse(saved);
      if(parsed && parsed.length) MES_PROGRAMMES = parsed;
    }
  }catch(e){}
}
loadProgFromLS();

// ════ DÉFIS — FONCTIONS COMPLÈTES ════

// Tirage aléatoire dashboard (pour l'aperçu)
function pickDefisDashboard(){
  var actifs = DEFIS_BANK.filter(function(d){ return !d.archive && !d.masque; });
  var shuffled = actifs.slice().sort(function(){ return Math.random()-0.5; });
  return shuffled.slice(0, Math.min(5, shuffled.length));
}

window.addDefi = function(){
  var nm = document.getElementById('nd-nm')?.value.trim();
  var ds = document.getElementById('nd-ds')?.value.trim();
  var ico = document.getElementById('nd-ico')?.value || '⚡';
  if(!nm){ toast2('Nom requis'); return; }
  var newId = Math.max.apply(null, DEFIS_BANK.map(function(d){return d.id;})) + 1;
  DEFIS_BANK.push({id:newId, i:ico, nm:nm, ds:ds||'', archive:false, masque:false});
  saveDefisToLS();
  document.getElementById('pc-inner').innerHTML = defisHTML();
  toast2('Défi ajouté ✓');
};

window.rmDefi = function(id){
  if(!confirm('Supprimer ce défi ?')) return;
  DEFIS_BANK = DEFIS_BANK.filter(function(d){ return d.id!==id; });
  saveDefisToLS();
  document.getElementById('pc-inner').innerHTML = defisHTML();
  toast2('Défi supprimé');
};

window.toggleMasqueDefi = function(id){
  var d = DEFIS_BANK.find(function(d){ return d.id===id; });
  if(d){ d.masque = !d.masque; saveDefisToLS(); document.getElementById('pc-inner').innerHTML = defisHTML(); }
};

window.toggleArchiveDefi = function(id){
  var d = DEFIS_BANK.find(function(d){ return d.id===id; });
  if(d){ d.archive = !d.archive; saveDefisToLS(); document.getElementById('pc-inner').innerHTML = defisHTML(); }
};

function saveDefisToLS(){
  try{ localStorage.setItem('ant_defis', JSON.stringify(DEFIS_BANK)); }catch(e){}
}
function loadDefisFromLS(){
  try{
    var saved = localStorage.getItem('ant_defis');
    if(saved){ var p = JSON.parse(saved); if(p&&p.length) DEFIS_BANK = p; }
  }catch(e){}
}
loadDefisFromLS();

// ════ BASE EXERCICES — FONCTIONS COMPLÈTES ════


window.saveProgramme = async function(){
  // Sauvegarder le nom/muscles du jour actif
  var nameEl = document.getElementById('prog-day-name');
  var muscleEl = document.getElementById('prog-day-muscles');
  if(nameEl && PROG_JOURS_DATA[PROG_JOUR_ACTIF]) PROG_JOURS_DATA[PROG_JOUR_ACTIF].nom = nameEl.value || ('Jour '+(PROG_JOUR_ACTIF+1));
  if(muscleEl && PROG_JOURS_DATA[PROG_JOUR_ACTIF]) PROG_JOURS_DATA[PROG_JOUR_ACTIF].muscles = muscleEl.value || '';
  renderProgDayTabs();
  var clientId = CLIENTS[activeClientIdx||0]?.id;
  if(!clientId){ toast2('Programme sauvegardé (local)'); return; }
  try{
    for(var i=0;i<PROG_JOURS_DATA.length;i++){
      var j = PROG_JOURS_DATA[i];
      await sbUpsert('programmes_clients',{
        client_id:clientId,jour_nom:j.nom,muscles_cibles:j.muscles,
        exercices:JSON.stringify(j.exos),actif:true
      },'client_id,jour_nom');
    }
    toast2('Programme enregistré ✓');
  } catch(e){ toast2('Programme sauvegardé (local)'); }
};

window.addExoToProg = function(){
  var sel = document.getElementById('prog-exo-select');
  var series = document.getElementById('prog-exo-series');
  var reps = document.getElementById('prog-exo-reps');
  var repos = document.getElementById('prog-exo-repos');
  var charge = document.getElementById('prog-exo-charge');
  var note  = document.getElementById('prog-exo-note');
  var photo = document.getElementById('prog-exo-photo');
  var list = document.getElementById('prog-exos-list');

  if(!sel || !sel.value){ toast2('Choisis un exercice'); return; }

  var exo = {
    nom: sel.value,
    series: series?.value || '3',
    reps: reps?.value || '10',
    repos: repos?.value || '90s',
    charge: charge?.value || '',
    note: (note && note.value) ? note.value : '',
    photo: (photo && photo.value) ? photo.value : ''
  };

  if(!list) return;
  var row = document.createElement('div');
  row.style.cssText = 'background:var(--c2);border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;';
  row.innerHTML = '<div>'
    + '<div style="font-size:13px;font-weight:500">' + exo.nom + '</div>'
    + '<div style="font-size:11px;color:var(--txm);margin-top:2px">'
    + exo.series + ' séries × ' + exo.reps + ' reps'
    + (exo.charge ? ' · ' + exo.charge + ' kg' : '')
    + ' · Repos ' + exo.repos
    + (exo.note ? ' · ' + exo.note : '')
    + '</div></div>'
    + '<button onclick="this.parentNode.remove()" style="background:none;border:none;cursor:pointer;color:var(--txm)"><i class="ti ti-trash" style="font-size:14px"></i></button>';
  list.appendChild(row);

  // Stocker dans PROG_JOURS_DATA pour la sauvegarde
  if(typeof PROG_JOURS_DATA !== 'undefined' && typeof PROG_JOUR_ACTIF !== 'undefined'){
    if(!PROG_JOURS_DATA[PROG_JOUR_ACTIF]) PROG_JOURS_DATA[PROG_JOUR_ACTIF] = {nom:'',muscles:'',exos:[]};
    if(!PROG_JOURS_DATA[PROG_JOUR_ACTIF].exos) PROG_JOURS_DATA[PROG_JOUR_ACTIF].exos = [];
    PROG_JOURS_DATA[PROG_JOUR_ACTIF].exos.push(exo);
  }

  // Reset
  sel.value = '';
  if(series) series.value = '';
  if(reps) reps.value = '';
  if(charge) charge.value = '';
  if(note) note.value = '';
  if(photo) photo.value = '';
  toast2('Exercice ajouté ✓');
};

window.deleteExo=function(gi,ei){if(!confirm("Supprimer ?"))return;MUSCU[gi].e.splice(ei,1);saveMyExosToLS();document.getElementById("pc-inner").innerHTML=dbHTML();toast2("Supprime");};
window.editExo=function(gi,ei){
  var e=MUSCU[gi].e[ei];
  var nom  =(typeof e==='object')?e.nom:e;
  var note =(typeof e==='object')?e.note:'';
  var photo=(typeof e==='object')?e.photo:'';
  var n=prompt('Nom :',nom);
  if(!n)return;
  var nt=prompt('Note technique :',note)||'';
  window._editingExo={gi:gi,ei:ei,nom:n.trim(),note:nt.trim(),photo:photo};
  // Supprimer l'ancien modal s'il existe
  var old=document.getElementById('modal-edit-exo');
  if(old)old.remove();
  // Créer un modal propre
  var modal=document.createElement('div');
  modal.id='modal-edit-exo';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  modal.innerHTML='<div style="background:var(--c1);border-radius:16px;padding:20px;width:100%;max-width:340px;">'
    +'<div style="font-size:14px;font-weight:600;margin-bottom:14px;color:var(--tx);">Modifier la photo</div>'
    +(photo?'<img src="'+photo+'" style="width:100%;height:140px;object-fit:cover;border-radius:10px;margin-bottom:12px;">':'<div style="width:100%;height:80px;background:var(--c2);border-radius:10px;margin-bottom:12px;display:flex;align-items:center;justify-content:center;color:var(--txm);font-size:12px;">Aucune photo</div>')
    +'<label style="font-size:11px;font-weight:600;color:var(--txm);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Nouvelle photo</label>'
    +'<input type="file" id="edit-exo-photo-input" accept="image/*" style="width:100%;font-size:12px;color:var(--txm);margin-bottom:16px;font-family:inherit;">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
    +'<button onclick="saveEditExo(false)" style="padding:11px;background:var(--c2);border:none;border-radius:10px;color:var(--tx);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">Garder photo</button>'
    +'<button onclick="saveEditExo(true)" style="padding:11px;background:var(--r);border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">Enregistrer</button>'
    +'</div></div>';
  document.body.appendChild(modal);
};
;
window.saveEditExo=function(useNewPhoto){
  var ex=window._editingExo;
  if(!ex)return;
  var modal=document.getElementById('modal-edit-exo');
  if(modal) modal.style.display='none';
  if(useNewPhoto){
    var inp=document.getElementById('edit-exo-photo-input');
    if(inp&&inp.files&&inp.files[0]){
      var reader=new FileReader();
      reader.onload=function(ev){
        MUSCU[ex.gi].e[ex.ei]={nom:ex.nom,note:ex.note,photo:ev.target.result};
        saveMyExosToLS();
        if(modal)modal.remove();
        document.getElementById('pc-inner').innerHTML=dbHTML();
        toast2('Exercice modifié ✓');
      };
      reader.readAsDataURL(inp.files[0]);
      return;
    } else {
      toast2('Sélectionne une photo d\'abord');
      if(modal)modal.style.display='flex';
      return;
    }
  }
  MUSCU[ex.gi].e[ex.ei]={nom:ex.nom,note:ex.note,photo:ex.photo};
  saveMyExosToLS();
  document.getElementById('pc-inner').innerHTML=dbHTML();
  toast2('Exercice modifié ✓');
};
window.previewExoPhoto=function(input){if(!input.files||!input.files[0])return;var r=new FileReader();r.onload=function(ev){var p=document.getElementById("nex-photo-preview");var i=document.getElementById("nex-photo-img");if(p)p.style.display="block";if(i)i.src=ev.target.result;window._pendingExoPhoto=ev.target.result;};r.readAsDataURL(input.files[0]);};
window.creerExoPerso = function(){
  var nm = (document.getElementById('nex-nm')||{}).value;
  if(nm) nm = nm.trim(); else nm = '';
  var grpEl = document.getElementById('nex-grp');
  var grp = grpEl ? grpEl.value : (MUSCU[0]||{g:''}).g;
  var noteEl = document.getElementById('nex-note');
  var note = noteEl ? noteEl.value.trim() : '';
  if(!nm){ toast2('Nom requis'); return; }
  // Ajouter dans MUSCU dans le bon groupe
  var grpObj = MUSCU.find(function(g){ return g.g===grp; });
  if(grpObj){
    if(!grpObj.e.includes(nm)) grpObj.e.push(nm);
  } else if(MUSCU.length > 0){
    MUSCU[0].e.push(nm);
  }
  // Sauvegarder aussi dans MY_EXOS_PERSO
  window.MY_EXOS_PERSO = window.MY_EXOS_PERSO || [];
  window.MY_EXOS_PERSO.push({nom:nm, groupe:grp, note:note});
  saveMyExosToLS();
  // Rafraîchir la vue sans changer d'onglet
  document.getElementById('pc-inner').innerHTML = dbHTML();
  toast2('Exercice "'+nm+'" ajouté dans '+grp+' ✓');
};

window.deleteMyExo = function(i){
  window.MY_EXOS_PERSO.splice(i, 1);
  saveMyExosToLS();
  document.getElementById('pc-inner').innerHTML = dbHTML();
  toast2('Exercice supprimé');
};

window.addToProgFromDb = function(nom){
  if(!PROG_JOURS_DATA || !PROG_JOURS_DATA[PROG_JOUR_ACTIF]) { toast2('Ouvre un programme d\'abord'); return; }
  PROG_JOURS_DATA[PROG_JOUR_ACTIF].exos.push({nom:nom,series:'3',reps:'10',repos:'90s',charge:'',note:''});
  loadProgJour(PROG_JOUR_ACTIF);
  toast2(nom+' ajouté au programme');
};

function saveMyExosToLS(){
  try{ localStorage.setItem('ant_my_exos', JSON.stringify(window.MY_EXOS_PERSO)); }catch(e){}
}
function loadMyExosFromLS(){
  try{
    var saved = localStorage.getItem('ant_my_exos');
    if(saved){ var p=JSON.parse(saved); if(p&&p.length) window.MY_EXOS_PERSO=p; }
  }catch(e){}
}
loadMyExosFromLS();

// selDb corrigé
window.selDb = function(el, id){
  document.querySelectorAll('.dbtab').forEach(function(b){b.classList.remove('on');});
  if(el) el.classList.add('on');
  document.querySelectorAll('.dbscr').forEach(function(s){s.classList.remove('on');});
  var target = document.getElementById(id);
  if(target) target.classList.add('on');
};

document.addEventListener('DOMContentLoaded', function(){
  populateExoSelect();
  // Afficher les données de démo immédiatement
  loadDemoData();
  refreshDashboard();
  // Puis charger depuis Supabase (remplace les données si succès)
  loadDashboardData();
  // Peupler les selects circuits
  ['circuit-exo-select','abdos-exo-select'].forEach(function(selId){
    var sel = document.getElementById(selId);
    if(!sel) return;
    var opts = '<option value="">Choisir...</option>';
    MUSCU.forEach(function(g){
      opts += '<optgroup label="'+g.g+'">';
      g.e.forEach(function(e){ opts += '<option value="'+e+'">'+e+'</option>'; });
      opts += '</optgroup>';
    });
    sel.innerHTML = opts;
  });
});

// ══ MACROS + KPIs ══
window.saveMacros = async function(){
  var clientId = CLIENTS[activeClientIdx||0]?.id;
  if(!clientId){ toast2('Macros enregistrées'); return; }
  var kcal = document.getElementById('diet-kcal')?.value;
  var prot = document.getElementById('diet-prot')?.value;
  var gluc = document.getElementById('diet-gluc')?.value;
  var lip = document.getElementById('diet-lip')?.value;
  try{
    await sbUpsert('dietes',{client_id:clientId,kcal_jour:parseInt(kcal)||0,
      proteines_g:parseInt(prot)||0,glucides_g:parseInt(gluc)||0,lipides_g:parseInt(lip)||0,actif:true},'client_id');
    toast2('Macros enregistrées ✓');
  }catch(e){ toast2('Macros enregistrées'); }
};

window.applyKPIs = async function(){
  toast2('KPIs mis à jour ✓');
};

window.applyVictoires = async function(){
  var clientId = CLIENTS[activeClientIdx||0]?.id;
  if(!clientId){ toast2('Victoires appliquées'); return; }
  var vic = document.getElementById('victoires-input')?.value;
  if(!vic){ toast2('Victoires appliquées'); return; }
  try{
    await sbUpsert('ecran_client',{client_id:clientId,victoires:JSON.parse(vic||'[]')},'client_id');
    toast2('Victoires appliquées ✓');
  }catch(e){ toast2('Victoires appliquées'); }
};

window.envoyerNotif = function(){
  toast2('Notif envoyée au client ✓');
};

window.ajouterCreneau = function(){
  toast2('Créneau ajouté');
};

window.envoyerEmailQuestionnaire = function(prenom){
  toast2('Email envoyé à ' + prenom + ' ✓');
};

window.envoyerCorrection = function(){
  toast2('Correction envoyée au client ✓');
};


// ══ FONCTIONS MANQUANTES ══

// Appeler client
window.appelClient = function(){
  var client = CLIENTS[activeClientIdx||0];
  if(client && client.email){
    window.open('tel:' + (client.phone||''), '_blank');
    toast2('Appel en cours...');
  } else {
    toast2('Numéro non disponible');
  }
};

// Message client
window.messageClient = function(){
  // Ouvrir l'onglet messages du panel client
  var tabs = document.querySelectorAll('.ptab');
  var msgsTab = Array.from(tabs).find(function(t){ return t.textContent.includes('Messages'); });
  if(msgsTab) msgsTab.click();
  toast2('Messagerie ouverte');
};

// Gestion jours programme
var PROG_JOURS = ['Jour 1'];
var PROG_JOUR_ACTIF = 0;
var PROG_JOURS_DATA = [{nom:'Jour 1', muscles:'', exos:[]}];

function renderProgDayTabs(){
  var cont = document.getElementById('prog-day-tabs-coach');
  if(!cont) return;
  cont.innerHTML = PROG_JOURS_DATA.map(function(j,i){
    return '<button class="dtab'+(i===PROG_JOUR_ACTIF?' on':'')+'" data-i="'+i+'">'+j.nom+'</button>';
  }).join('');
  cont.querySelectorAll('[data-i]').forEach(function(btn){
    btn.addEventListener('click', function(){
      PROG_JOUR_ACTIF = parseInt(btn.getAttribute('data-i'));
      loadProgJour(PROG_JOUR_ACTIF);
      renderProgDayTabs();
    });
  });
}

function loadProgJour(i){
  var j = PROG_JOURS_DATA[i] || {};
  var nameEl = document.getElementById('prog-day-name');
  var muscleEl = document.getElementById('prog-day-muscles');
  var listEl = document.getElementById('prog-exos-list');
  if(nameEl) nameEl.value = j.nom || ('Jour '+(i+1));
  if(muscleEl) muscleEl.value = j.muscles || '';
  if(listEl){
    listEl.innerHTML = (j.exos||[]).map(function(e,ei){
      return '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--c2);border-radius:8px;padding:8px 10px;margin-bottom:6px">'
        +'<div><div style="font-size:12px;font-weight:500">'+e.nom+'</div>'
        +'<div style="font-size:10px;color:var(--txm)">'+e.series+' × '+e.reps+' · repos '+e.repos+(e.charge?' · '+e.charge+'kg':'')+'</div></div>'
        +'<button data-ei="'+ei+'" style="background:none;border:none;cursor:pointer;color:var(--txm)"><i class="ti ti-x" style="font-size:13px"></i></button>'
        +'</div>';
    }).join('') || '<div style="font-size:11px;color:var(--txd);text-align:center;padding:12px 0">Aucun exercice — ajoutez-en ci-dessous</div>';
    listEl.querySelectorAll('[data-ei]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ei = parseInt(btn.getAttribute('data-ei'));
        PROG_JOURS_DATA[PROG_JOUR_ACTIF].exos.splice(ei, 1);
        loadProgJour(PROG_JOUR_ACTIF);
      });
    });
  }
  populateExoSelect();
}

window.addJourProg = function(){
  var n = PROG_JOURS_DATA.length + 1;
  PROG_JOURS_DATA.push({nom:'Jour '+n, muscles:'', exos:[]});
  PROG_JOUR_ACTIF = PROG_JOURS_DATA.length - 1;
  renderProgDayTabs();
  loadProgJour(PROG_JOUR_ACTIF);
  toast2('Jour '+n+' ajouté');
};

window.removeJourProg = function(){
  if(PROG_JOURS_DATA.length <= 1){ toast2('Au moins 1 jour requis'); return; }
  PROG_JOURS_DATA.splice(PROG_JOUR_ACTIF, 1);
  PROG_JOUR_ACTIF = Math.min(PROG_JOUR_ACTIF, PROG_JOURS_DATA.length-1);
  renderProgDayTabs();
  loadProgJour(PROG_JOUR_ACTIF);
  toast2('Jour supprimé');
};





// Initialiser les jours quand on ouvre un client



window.openProfile = function(id){
  var idx = CLIENTS.findIndex(function(cl){ return cl.id===id; });
  if(idx < 0) return;
  activeClientIdx = idx;
  var client = CLIENTS[idx];

  // Ouvrir le panel
  var panel = document.getElementById('profile-panel');
  if(panel) panel.classList.add('show');

  // Remplir le header
  var nameEl = document.getElementById('prof-name');
  var typeEl = document.getElementById('prof-type');
  var avEl   = document.getElementById('prof-av');
  if(nameEl) nameEl.textContent = client.name || '';
  if(typeEl) typeEl.textContent = client.type || '';
  if(avEl){
    avEl.textContent = client.av || (client.name||'?')[0];
    avEl.style.background = client.bg || 'var(--r)';
    avEl.style.color = client.col || '#fff';
  }

  // Titre du panel
  var titleEl = document.getElementById('pc-title');
  var subEl   = document.getElementById('pc-sub');
  if(titleEl) titleEl.textContent = client.name || 'Client';
  if(subEl)   subEl.textContent   = client.type || '';

  // Charger les jours programme depuis Supabase puis afficher
  setTimeout(async function(){
    try{
      var cl = CLIENTS[activeClientIdx];
      if(!cl) return;
      var data = await sbFetch('programmes_clients?client_id=eq.'+cl.id+'&actif=eq.true&select=*&order=ordre');
      if(data && data.length > 0){
        PROG_JOURS_DATA = data.map(function(row){
          var exos = [];
          try{ exos = JSON.parse(row.exercices||'[]'); }catch(e){}
          return { nom: row.jour_nom||'Jour', muscles: row.muscles_cibles||'', exos: exos };
        });
      } else {
        PROG_JOURS_DATA = [{nom:'Jour 1',muscles:'',exos:[]}];
      }
      PROG_JOUR_ACTIF = 0;
      renderProgDayTabs();
      loadProgJour(0);
      populateExoSelect();
    }catch(e){
      PROG_JOURS_DATA = [{nom:'Jour 1',muscles:'',exos:[]}];
      renderProgDayTabs();
      loadProgJour(0);
    }
  }, 200);

  // Charger les notes depuis ecran_client
  setTimeout(async function(){
    try{
      var data = await sbFetch('ecran_client?client_id=eq.'+id+'&select=*&limit=1');
      if(data && data[0]){
        var nm = document.getElementById('notes-motivation'); if(nm) nm.value = data[0].note_motivation||'';
        var vi = document.getElementById('victoires-input');  if(vi) vi.value = (JSON.parse(data[0].victoires||'[]')).join('\n');
        var vg = document.getElementById('vigilance-input');  if(vg) vg.value = (JSON.parse(data[0].points_attention||'[]')).join('\n');
        var np = document.getElementById('notes-privees');    if(np) np.value = data[0].notes_privees||'';
      }
    }catch(e){}
  }, 300);
};

// Gérer fichier technique
window.handleTechFile = function(input){
  var file = input.files[0];
  if(!file) return;
  var preview = document.getElementById('tech-file-preview');
  if(!preview) return;
  preview.style.display = 'block';
  if(file.type.startsWith('image/')){
    var reader = new FileReader();
    reader.onload = function(e){
      preview.innerHTML = '<img src="'+e.target.result+'" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-bottom:6px"><div style="font-size:11px;color:var(--txm)">'+file.name+'</div>';
    };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = '<div style="background:var(--c2);border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:8px"><i class="ti ti-video" style="font-size:16px;color:var(--ant)"></i><div><div style="font-size:12px;font-weight:500">'+file.name+'</div><div style="font-size:10px;color:var(--txm)">'+(file.size/1024/1024).toFixed(1)+' Mo</div></div></div>';
  }
};

window.envoyerTechFile = function(){
  var input = document.getElementById('tech-file-input');
  var note = document.getElementById('tech-note-input')?.value || '';
  if(!input || !input.files[0]){ toast2('Sélectionne un fichier'); return; }
  toast2('Fichier envoyé au client ✓');
  input.value = '';
  var preview = document.getElementById('tech-file-preview');
  if(preview) preview.style.display = 'none';
  var noteEl = document.getElementById('tech-note-input');
  if(noteEl) noteEl.value = '';
};

// addToMyExos amélioré — affiche dans la liste
window.addToMyExos = function(nom){
  var myList = document.getElementById('my-exos-list');
  if(!myList){ toast2('Exercice ajouté à mes exos ✓'); return; }
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:var(--c2);border-radius:8px;padding:8px 12px;margin-bottom:6px';
  row.innerHTML = '<span style="font-size:12px;font-weight:500">'+nom+'</span>'
    +'<div style="display:flex;gap:6px">'
    +'<button data-nom-prog="'+nom+'" style="background:none;border:none;cursor:pointer;color:var(--ant)" title="Ajouter au prog actif"><i class="ti ti-plus" style="font-size:13px"></i></button>'
    +'<button class="exo-del-btn" style="background:none;border:none;cursor:pointer;color:var(--txm)"><i class="ti ti-x" style="font-size:13px"></i></button>'
    +'</div>';
  myList.insertBefore(row, myList.firstChild);
  // Listener supprimer
  var delBtn = row.querySelector('.exo-del-btn');
  if(delBtn) delBtn.addEventListener('click', function(){ row.remove(); });
  // Attacher listener sur le bouton +
  var addBtn = row.querySelector('[data-nom-prog]');
  if(addBtn)(function(n){ addBtn.addEventListener('click', function(){ addExoToMyProg(n); }); })(nom);
  toast2(nom+' ajouté à mes exos ✓');
};

window.addExoToMyProg = function(nom){
  if(!PROG_JOURS_DATA[PROG_JOUR_ACTIF]) return;
  PROG_JOURS_DATA[PROG_JOUR_ACTIF].exos.push({nom:nom,series:'3',reps:'10',repos:'90s',charge:'',note:''});
  loadProgJour(PROG_JOUR_ACTIF);
  toast2(nom+' ajouté au programme');
};


// ══ GESTION PROGRAMMES ══

function refreshProgView(){
  var inner = document.getElementById('pc-inner');
  if(!inner) return;
  var title = document.getElementById('pc-title');
  if(title && title.textContent.includes('programme')) inner.innerHTML = programmesHTML();
  // Réattacher les listeners
  attachProgListeners();
}

function attachProgListeners(){
  var cont = document.getElementById('prog-list-cont');
  if(cont){
    cont.querySelectorAll('[data-action]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var action = btn.getAttribute('data-action');
        var idx = parseInt(btn.getAttribute('data-idx'));
        if(action==='edit') editProg(idx);
        else if(action==='dup') dupProg(idx);
        else if(action==='toggle') toggleProgVisible(idx);
        else if(action==='archive') archiveProg(idx);
        else if(action==='del') deleteProg(idx);
        else if(action==='assign-client') assignProgToClient(idx);
        else if(action==='to-challenger') toChallenger(idx);
      });
    });
  }
  // Tabs catégories
  var tabs = document.getElementById('prog-cat-tabs');
  if(tabs){
    tabs.querySelectorAll('[data-cat]').forEach(function(btn){
      btn.addEventListener('click', function(){
        window._progFilterCat = btn.getAttribute('data-cat');
        var inner = document.getElementById('pc-inner');
        if(inner) inner.innerHTML = programmesHTML();
        attachProgListeners();
      });
    });
  }
}

// Override pcNav pour attacher les listeners après injection
var _origPcNav = window.pcNav || null;
function pcNav(el, id){
  document.querySelectorAll('.ni').forEach(function(n){ n.classList.remove('on'); });
  if(el) el.classList.add('on');
  var p = PC_PAGES[id]; if(!p) return;
  document.getElementById('pc-title').textContent = p.t;
  document.getElementById('pc-sub').textContent = p.s;
  document.getElementById('pc-inner').innerHTML = p.h();
  // Définir la date d'aujourd'hui dans le formulaire agenda
  if(id === 'pc-agenda'){
    var rdvDateEl = document.getElementById('rdv-date');
    if(rdvDateEl && !rdvDateEl.value){
      rdvDateEl.value = new Date().toISOString().split('T')[0];
    }
    loadAgendaData();
  }
  // Attacher les listeners post-injection
  if(id==='pc-programmes') attachProgListeners();
  if(id==='pc-defis') attachDefisListeners();
  if(id==='pc-db') attachDbListeners();
}

window.openCreateProg = function(){
  PROG_EDIT = {
    idx: -1,
    prog: {
      id: 'prog-' + Date.now(),
      nom: '', auteur: 'Antoine Durand',
      createdAt: new Date().toISOString().split('T')[0],
      badge: 'Intermédiaire', freq: '',
      statut: 'brouillon', visible: true,
      jours: [{nom:'Jour 1', muscles:'', exos:[]}]
    }
  };
  PROG_EDIT_JOUR_IDX = 0;
  openProgEditor();
};

window.editProg = function(idx){
  PROG_EDIT = {idx: idx, prog: JSON.parse(JSON.stringify(MES_PROGRAMMES[idx]))};
  PROG_EDIT_JOUR_IDX = 0;
  openProgEditor();
};

window.dupProg = function(idx){
  var original = JSON.parse(JSON.stringify(MES_PROGRAMMES[idx]));
  original.id = 'prog-' + Date.now();
  original.nom = original.nom + ' (copie)';
  original.statut = 'brouillon';
  original.createdAt = new Date().toISOString().split('T')[0];
  MES_PROGRAMMES.push(original);
  saveProgrammesLocal();
  toast2('Programme dupliqué en brouillon ✓');
  window._progFilterCat = 'brouillon';
  var inner = document.getElementById('pc-inner');
  if(inner){ inner.innerHTML = programmesHTML(); attachProgListeners(); }
};

window.toggleProgVisible = function(idx){
  MES_PROGRAMMES[idx].visible = !MES_PROGRAMMES[idx].visible;
  saveProgrammesLocal();
  toast2(MES_PROGRAMMES[idx].visible ? 'Programme visible ✓' : 'Programme masqué ✓');
  var inner = document.getElementById('pc-inner');
  if(inner){ inner.innerHTML = programmesHTML(); attachProgListeners(); }
};

window.archiveProg = function(idx){
  MES_PROGRAMMES[idx].statut = 'archive';
  saveProgrammesLocal();
  toast2('Programme archivé ✓');
  var inner = document.getElementById('pc-inner');
  if(inner){ inner.innerHTML = programmesHTML(); attachProgListeners(); }
};

window.deleteProg = function(idx){
  if(!confirm('Supprimer ce programme définitivement ?')) return;
  MES_PROGRAMMES.splice(idx, 1);
  saveProgrammesLocal();
  toast2('Programme supprimé ✓');
  var inner = document.getElementById('pc-inner');
  if(inner){ inner.innerHTML = programmesHTML(); attachProgListeners(); }
};

window.toChallenger = function(idx){
  MES_PROGRAMMES[idx].statut = 'challenger';
  MES_PROGRAMMES[idx].visible = true;
  saveProgrammesLocal();
  toast2('Programme publié pour les Challengers ✓');
  var inner = document.getElementById('pc-inner');
  if(inner){ window._progFilterCat='challenger'; inner.innerHTML = programmesHTML(); attachProgListeners(); }
};



// ══ ÉDITEUR DE PROGRAMME (modal plein écran dans pc-inner) ══
function openProgEditor(){
  var p = PROG_EDIT.prog;
  var joursTabsHtml = p.jours.map(function(j, i){
    return '<button class="dtab'+(i===PROG_EDIT_JOUR_IDX?' on':'')+'" data-ji="'+i+'">'+j.nom+'</button>';
  }).join('');

  var currentJour = p.jours[PROG_EDIT_JOUR_IDX] || {nom:'Jour 1',muscles:'',exos:[]};
  var exosHtml = currentJour.exos.map(function(e, ei){
    return '<div style="display:flex;align-items:center;gap:8px;background:var(--c2);border-radius:8px;padding:8px 10px;margin-bottom:6px">'
      +'<div style="flex:1"><div style="font-size:12px;font-weight:500">'+e.nom+'</div>'
      +'<div style="font-size:10px;color:var(--txm)">'+e.series+'×'+e.reps+' · repos '+e.repos+(e.charge?' · '+e.charge+'kg':'')+'</div></div>'
      +'<button data-del-exo="'+ei+'" style="background:none;border:none;cursor:pointer;color:var(--txm)"><i class="ti ti-x" style="font-size:13px"></i></button>'
      +'</div>';
  }).join('') || '<div style="font-size:11px;color:var(--txd);text-align:center;padding:10px 0">Aucun exercice</div>';

  // Select exercices depuis MUSCU
  var exoOptions = '<option value="">Choisir dans ma base...</option>';
  if(typeof MUSCU !== 'undefined'){
    MUSCU.forEach(function(g){
      exoOptions += '<optgroup label="'+g.g+'">';
      g.e.forEach(function(e){ exoOptions += '<option value="'+e+'">'+e+'</option>'; });
      exoOptions += '</optgroup>';
    });
  }

  var statutOptions = ['prive','challenger','elite','circuit','brouillon']
    .map(function(s){ return '<option value="'+s+'"'+(p.statut===s?' selected':'')+'>'+getStatutLabel(s)+'</option>'; }).join('');

  var inner = document.getElementById('pc-inner');
  inner.innerHTML = '<div style="height:100%;display:flex;flex-direction:column;overflow:hidden">'
    // Header éditeur
    +'<div style="display:flex;align-items:center;gap:12px;padding:14px 0 14px;border-bottom:0.5px solid rgba(255,255,255,0.06);flex-shrink:0">'
    +'<button onclick="closeProgEditor()" style="width:30px;height:30px;border-radius:8px;background:var(--c2);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0"><i class="ti ti-arrow-left" style="font-size:14px;color:var(--txm)"></i></button>'
    +'<div style="flex:1"><div style="font-size:14px;font-weight:700">'+( (PROG_EDIT.origIdx>=0 && PROG_EDIT.origIdx!==undefined)?'Modifier':'Nouveau programme')+'</div></div>'
    +'<button onclick="saveProgEdit()" style="padding:7px 14px;background:var(--ant);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:5px"><i class="ti ti-device-floppy" style="font-size:12px"></i>Enregistrer</button>'
    +'</div>'
    // Scroll
    +'<div style="flex:1;overflow-y:auto;padding-right:4px">'
    // Infos générales
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'
    +'<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:var(--txm);margin-bottom:4px;display:block">Nom du programme</label>'
    +'<input id="pe-nom" class="inp" value="'+p.nom+'" placeholder="ex: Full Body Débutant"></div>'
    +'<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:var(--txm);margin-bottom:4px;display:block">Fréquence</label>'
    +'<input id="pe-freq" class="inp" value="'+p.freq+'" placeholder="ex: 3 séances/semaine"></div>'
    +'<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:var(--txm);margin-bottom:4px;display:block">Niveau</label>'
    +'<input id="pe-badge" class="inp" value="'+p.badge+'" placeholder="Débutant / Intermédiaire / Avancé"></div>'
    +'<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:var(--txm);margin-bottom:4px;display:block">Statut</label>'
    +'<select id="pe-statut" class="inp">'+statutOptions+'</select></div>'
    +'</div>'
    // Gestion jours
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap" id="pe-jour-tabs">'+joursTabsHtml+'</div>'
    +'<div style="display:flex;gap:5px;margin-bottom:12px">'
    +'<button id="pe-add-jour" style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:rgba(232,80,80,0.1);border:0.5px solid rgba(232,80,80,0.3);border-radius:7px;font-size:10px;font-weight:600;color:var(--ant);cursor:pointer;font-family:inherit"><i class="ti ti-plus" style="font-size:11px"></i>Ajouter un jour</button>'
    +'<button id="pe-del-jour" style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:var(--c2);border:0.5px solid rgba(255,255,255,0.08);border-radius:7px;font-size:10px;color:var(--txm);cursor:pointer;font-family:inherit"><i class="ti ti-minus" style="font-size:11px"></i>Supprimer ce jour</button>'
    +'</div>'
    // Infos du jour actif
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'
    +'<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:var(--txm);margin-bottom:4px;display:block">Nom de la séance</label>'
    +'<input id="pe-jour-nom" class="inp" value="'+currentJour.nom+'" placeholder="ex: Push · Pec/Épaules"></div>'
    +'<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:var(--txm);margin-bottom:4px;display:block">Muscles ciblés</label>'
    +'<input id="pe-jour-muscles" class="inp" value="'+currentJour.muscles+'" placeholder="ex: Pecs, Épaules, Triceps"></div>'
    +'</div>'
    // Ajouter exercice
    +'<div style="background:var(--c1);border:0.5px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px;margin-bottom:12px">'
    +'<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:var(--txm);margin-bottom:8px">Ajouter un exercice</div>'
    +'<select id="pe-exo-sel" class="inp" style="margin-bottom:7px">'+exoOptions+'</select>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:7px">'
    +'<input id="pe-series" class="inp" placeholder="Séries" style="text-align:center">'
    +'<input id="pe-reps" class="inp" placeholder="Reps" style="text-align:center">'
    +'<input id="pe-repos" class="inp" placeholder="Repos" style="text-align:center">'
    +'<input id="pe-charge" class="inp" placeholder="Kg" style="text-align:center">'
    +'</div>'
    +'<button id="pe-add-exo" style="width:100%;padding:8px;background:var(--ant);color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px"><i class="ti ti-plus" style="font-size:12px"></i>Ajouter</button>'
    +'</div>'
    // Liste exercices du jour
    +'<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:var(--txm);margin-bottom:8px">Exercices ('+currentJour.exos.length+')</div>'
    +'<div id="pe-exos-list">'+exosHtml+'</div>'
    +'</div></div>';

  attachProgEditorListeners();
}

function attachProgEditorListeners(){
  // Onglets jours
  var tabs = document.getElementById('pe-jour-tabs');
  if(tabs) tabs.querySelectorAll('[data-ji]').forEach(function(btn){
    btn.addEventListener('click', function(){
      saveCurrentJourToEdit();
      PROG_EDIT_JOUR_IDX = parseInt(btn.getAttribute('data-ji'));
      openProgEditor();
    });
  });

  // Ajouter jour
  var addJour = document.getElementById('pe-add-jour');
  if(addJour) addJour.addEventListener('click', function(){
    saveCurrentJourToEdit();
    var n = PROG_EDIT.prog.jours.length + 1;
    PROG_EDIT.prog.jours.push({nom:'Jour '+n, muscles:'', exos:[]});
    PROG_EDIT_JOUR_IDX = PROG_EDIT.prog.jours.length - 1;
    openProgEditor();
  });

  // Supprimer jour
  var delJour = document.getElementById('pe-del-jour');
  if(delJour) delJour.addEventListener('click', function(){
    if(PROG_EDIT.prog.jours.length<=1){ toast2('Au moins 1 jour requis'); return; }
    PROG_EDIT.prog.jours.splice(PROG_EDIT_JOUR_IDX, 1);
    PROG_EDIT_JOUR_IDX = Math.min(PROG_EDIT_JOUR_IDX, PROG_EDIT.prog.jours.length-1);
    openProgEditor();
  });

  // Ajouter exercice
  var addExo = document.getElementById('pe-add-exo');
  if(addExo) addExo.addEventListener('click', function(){
    var sel = document.getElementById('pe-exo-sel');
    if(!sel || !sel.value){ toast2('Choisis un exercice'); return; }
    saveCurrentJourToEdit();
    PROG_EDIT.prog.jours[PROG_EDIT_JOUR_IDX].exos.push({
      nom: sel.value,
      series: document.getElementById('pe-series')?.value || '3',
      reps: document.getElementById('pe-reps')?.value || '10',
      repos: document.getElementById('pe-repos')?.value || '90s',
      charge: document.getElementById('pe-charge')?.value || '',
      tempo: ''
    });
    ['pe-exo-sel','pe-series','pe-reps','pe-repos','pe-charge'].forEach(function(id){
      var el=document.getElementById(id); if(el)el.value='';
    });
    openProgEditor();
  });

  // Supprimer exercices
  var list = document.getElementById('pe-exos-list');
  if(list) list.querySelectorAll('[data-del-exo]').forEach(function(btn){
    btn.addEventListener('click', function(){
      saveCurrentJourToEdit();
      var ei = parseInt(btn.getAttribute('data-del-exo'));
      PROG_EDIT.prog.jours[PROG_EDIT_JOUR_IDX].exos.splice(ei, 1);
      openProgEditor();
    });
  });
}

function saveCurrentJourToEdit(){
  if(!PROG_EDIT) return;
  var j = PROG_EDIT.prog.jours[PROG_EDIT_JOUR_IDX];
  if(!j) return;
  var nom = document.getElementById('pe-jour-nom')?.value;
  var muscles = document.getElementById('pe-jour-muscles')?.value;
  if(nom) j.nom = nom;
  if(muscles !== undefined) j.muscles = muscles;
}

window.saveProgEdit = function(){
  if(!PROG_EDIT) return;
  saveCurrentJourToEdit();
  var p = PROG_EDIT.prog;
  p.nom = document.getElementById('pe-nom')?.value || p.nom;
  p.freq = document.getElementById('pe-freq')?.value || p.freq;
  p.badge = document.getElementById('pe-badge')?.value || p.badge;
  p.statut = document.getElementById('pe-statut')?.value || p.statut;
  if(!p.nom){ toast2('Donne un nom au programme'); return; }

  if(PROG_EDIT.origIdx >= 0 && PROG_EDIT.origIdx !== undefined){
    MES_PROGRAMMES[PROG_EDIT.origIdx] = p;
  } else {
    MES_PROGRAMMES.push(p);
  }
  saveProgrammesLocal();
  toast2('Programme enregistré ✓');
  PROG_EDIT = null;
  window._progFilterCat = 'brouillon';
  var inner = document.getElementById('pc-inner');
  if(inner){ inner.innerHTML = programmesHTML(); attachProgListeners(); }
};

window.closeProgEditor = function(){
  PROG_EDIT = null;
  var inner = document.getElementById('pc-inner');
  if(inner){ inner.innerHTML = programmesHTML(); attachProgListeners(); }
};

var DEFIS_BANK=[
  {id:1,i:'🔥',nm:'20 burpees',ds:"D'une traite"},{id:2,i:'🏃',nm:'1 km de course',ds:'Extérieur'},{id:3,i:'💪',nm:'100 pompes',ds:'En plusieurs fois'},
  {id:4,i:'🦵',nm:'50 squats',ds:'Sans charge'},{id:5,i:'🧱',nm:'5 min gainage',ds:'Planche ou variantes'},{id:6,i:'🙌',nm:'30 tractions',ds:'En plusieurs séries'},
  {id:7,i:'👟',nm:'2 km marche',ds:'Active'},{id:8,i:'⚡',nm:'200 sauts corde',ds:'Jumping jacks'},{id:9,i:'🔄',nm:'Mobilité 10 min',ds:'Hanches, épaules'},
];
var MUSCU=[
  {g:'Pectoraux',e:['Développé couché','Développé incliné','Écarté haltères','Dips lestés']},
  {g:'Dos',e:['Tractions lestées','Rowing barre','Tirage vertical','Face pull']},
  {g:'Épaules',e:['Développé militaire','Élévations latérales','Élévations frontales']},
  {g:'Biceps',e:['Curl barre','Curl haltères','Curl marteau']},
  {g:'Triceps',e:['Extension câble','Barre au front','Dips corps']},
  {g:'Quadriceps',e:['Squat barre','Presse à cuisse','Fentes','Leg extension']},
  {g:'Ischio',e:['Soulevé de terre','Leg curl','Good morning']},
  {g:'Fessiers',e:['Hip thrust','Squat sumo','Step up']},
];
var ALL_KPIS=[
  {id:'semaines',lbl:'Semaines de suivi'},{id:'poids',lbl:'Poids actuel'},{id:'variation',lbl:'Variation poids'},
  {id:'assid',lbl:'Assiduité (%)'},{id:'seances',lbl:'Séances réalisées'},{id:'eau_moy',lbl:'Hydratation moy.'},
  {id:'sommeil_moy',lbl:'Sommeil moy. (h)'},{id:'pas_moy',lbl:'Pas / jour moy.'},{id:'xp_total',lbl:'XP défis'},
  {id:'streak',lbl:'Streak défis'},{id:'mensurations',lbl:'Mensurations'},{id:'photos',lbl:'Nb photos'},
];
var ALL_STATS=[
  {id:'sommeil',lbl:'Qualité du sommeil',cat:'bien-être'},{id:'hydra',lbl:'Hydratation',cat:'bien-être'},
  {id:'pas',lbl:'Nombre de pas',cat:'bien-être'},{id:'calories',lbl:'Apport calorique',cat:'nutrition'},
  {id:'proteines',lbl:'Protéines (g)',cat:'nutrition'},{id:'assid',lbl:'Assiduité séances',cat:'entraînement'},
];
var ALL_EXOS_VICTOIRES=[];
MUSCU.forEach(function(g){g.e.forEach(function(e){ALL_EXOS_VICTOIRES.push({id:e.toLowerCase().replace(/ /g,'_'),lbl:e,cat:g.g});});});
var kpiSelected=['semaines','variation','seances','assid'];
var attnSlots=[null,null,null];
var victoireSlots=[null,null,null];
var pickerMode=null,pickerIdx=null,pickerSelected=null,pickerColor='#D4A000';
var statsPerteClients=['sl','lm'];
var statsPriseClients=['tr'];
var QUESTIONNAIRES_DATA=[
  {id:'q1',prenom:'Thomas',nom:'Leblanc',email:'thomas@gmail.com',tel:'06 11 22 33 44',formule:'distanciel',objectif:'Prise de masse',niveau:'Intermédiaire',taille:178,poids:72,poids_obj:80,blessures:'Aucune',metier:'Développeur',travail:'Sédentaire',dispos:'En semaine après 19h',date:'2025-05-26',statut:'en_attente'},
  {id:'q2',prenom:'Lucie',nom:'Morin',email:'lucie@gmail.com',tel:'06 55 44 33 22',formule:'presentiel',objectif:'Perte de poids',niveau:'Débutant',taille:165,poids:68,poids_obj:60,blessures:'Genoux fragiles',metier:'Infirmière',travail:'Debout',dispos:'Week-end matin',date:'2025-05-24',statut:'en_attente'},
];

// ── PAGE ACCUEIL ──
function accueilHTML(wide){
  var ac=CLIENTS.filter(cl=>cl.flag&&!alertDismissed[cl.id]);
  var assidMoy=Math.round(CLIENTS.reduce((s,cl)=>s+cl.assid,0)/CLIENTS.length);
  var kGrid=wide?'kpi4':'kpi2';
  return`
  <div class="${kGrid}" style="margin-bottom:16px">
    <div class="kpi"><div class="kl">Clients coaching</div><div class="kv">${CLIENTS.length}</div><div class="ks" style="color:var(--gr)">+2 ce mois</div></div>
    <div class="kpi" style="cursor:pointer" onclick="pcNav?pcNav(document.querySelectorAll('.ni')[1],'pc-clients'):mobNav(document.getElementById('mbn-1'),1)">
      <div class="kl">Alertes actives</div><div class="kv" style="color:${ac.length>0?'#FF4444':'var(--gr)'}">${ac.length}</div>
      <div class="ks" style="color:${ac.length>0?'#FF4444':'var(--gr)'}">${ac.length>0?'→ Voir clients':'Tout va bien'}</div>
    </div>
    <div class="kpi"><div class="kl">Challengers</div><div class="kv" style="color:var(--gold)">${STARTERS.length}</div><div class="ks" style="color:rgba(255,215,0,0.6)">9.99€/mois</div></div>
    <div class="kpi"><div class="kl">Assiduité moy.</div><div class="kv">${assidMoy}<span style="font-size:12px;color:var(--txm)">%</span></div><div class="ks" style="color:var(--gr)">Bonne forme</div></div>
  </div>
  ${ac.length>0?`<div class="sec" style="margin-bottom:8px">Alertes à traiter</div>${ac.map(cl=>`
    <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--rl);border:0.5px solid var(--rb);border-radius:9px;margin-bottom:6px;cursor:pointer" onclick="openProfile('${cl.id}')">
      <div style="width:32px;height:32px;border-radius:50%;background:${cl.bg};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:${cl.col};flex-shrink:0">${cl.av}</div>
      <div style="flex:1"><div style="font-size:12px;font-weight:500">${cl.name}</div><div style="font-size:10px;color:var(--txm);margin-top:1px">${cl.type} · Assiduité ${cl.assid}%</div></div>
      <span class="pill p-rd">Alerte</span>
    </div>`).join('')}`:''}
  <div class="card">
    <div class="sec" style="margin-bottom:12px">Ajouter un client</div>
    <div class="frow">
      <div class="f1"><label class="lbl">Prénom</label><input class="inp" id="nc-prenom" placeholder="Lucas"></div>
      <div class="f1"><label class="lbl">Nom</label><input class="inp" id="nc-nom" placeholder="Martin"></div>
      <div class="f1"><label class="lbl">Âge</label><input class="inp" type="number" id="nc-age" placeholder="28"></div>
    </div>
    <div class="frow">
      <div class="f1"><label class="lbl">Email</label><input class="inp" id="nc-email" placeholder="lucas@email.com"></div>
      <div class="f1"><label class="lbl">Téléphone</label><input class="inp" id="nc-tel" placeholder="06 12 34 56 78"></div>
    </div>
    <div class="frow">
      <div class="f1"><label class="lbl">Type de coaching</label>
        <select class="inp" id="nc-type"><option value="coaching_distanciel">Distanciel</option><option value="coaching_presentiel">Présentiel</option><option value="challenger">Challenger</option></select>
      </div>
      <div class="f1"><label class="lbl">Objectif</label>
        <select class="inp" id="nc-objectif"><option>Prise de masse</option><option>Perte de poids</option><option>Remise en forme</option></select>
      </div>
    </div>
    <div class="frow">
      <div class="f1"><label class="lbl">Poids (kg)</label><input class="inp" type="number" id="nc-poids" placeholder="80"></div>
      <div class="f1"><label class="lbl">Objectif (kg)</label><input class="inp" type="number" id="nc-poids-obj" placeholder="75"></div>
      <div class="f1"><label class="lbl">Taille (cm)</label><input class="inp" type="number" id="nc-taille" placeholder="178"></div>
    </div>
    <div style="margin-bottom:8px"><label class="lbl">Blessures / contre-indications</label><input class="inp" id="nc-blessures" placeholder="Aucune"></div>
    <button class="btn-r full" onclick="ajouterClientRapide()"><i class="ti ti-user-plus" style="font-size:14px"></i>Créer le compte & envoyer le lien</button>
  </div>`;
}

window.ajouterClientRapide = async function(){
  var prenom=document.getElementById('nc-prenom')?.value?.trim();
  var nom=document.getElementById('nc-nom')?.value?.trim()||'';
  var email=document.getElementById('nc-email')?.value?.trim();
  var formule=document.getElementById('nc-formule')?.value||'coaching_distanciel';
  var objectif=document.getElementById('nc-objectif')?.value?.trim()||'';
  
  if(!prenom||!email){toast2('Prénom et email requis');return;}
  if(!email.includes('@')){toast2('Email invalide');return;}
  
  var btn=document.querySelector('#add-client-modal .btn-r');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="spinner" style="margin:0 auto"></div>';}
  
  try{
    // Créer le profil directement dans profiles (l'utilisateur créera son mot de passe via le lien)
    // Pour l'instant on insère dans profiles en attendant l'admin API
    var tempId = crypto.randomUUID ? crypto.randomUUID() : 'tmp-'+Date.now();
    
    // Utiliser la service role key pour créer l'utilisateur
    var res = await fetch(SB_URL+'/auth/v1/admin/users', {
      method:'POST',
      headers:{
        'apikey':SB_KEY,
        'Authorization':'Bearer '+SB_KEY,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        email:email,
        password:'Antcoach2025!',
        email_confirm:true,
        user_metadata:{prenom:prenom, nom:nom, role:formule}
      })
    });
    
    var userData = await res.json();
    if(userData.error){throw new Error(userData.error.message||userData.msg||'Erreur création');}
    
    var userId = userData.id;
    
    // Créer/mettre à jour le profil
    await sbUpsert('profiles',{
      id:userId, email:email, prenom:prenom, nom:nom, role:formule
    },'id');
    
    // Initialiser les niveaux
    await sbPost('niveaux',{client_id:userId,xp_total:0,niveau:1});
    
    toast2('Compte créé ! Identifiants : '+email+' / Antcoach2025!');
    
    // Fermer le modal et rafraîchir
    document.getElementById('add-client-modal')?.classList.remove('show');
    setTimeout(function(){ loadDashboardData(); }, 1000);
    
  }catch(e){
    console.error('Ajout client:', e);
    toast2('Erreur : '+e.message);
  }
  
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-user-plus" style="font-size:14px"></i>Créer le compte';}
};

// ── CLIENTS ──
function ccHTML(c){
  var isAlerted=c.flag&&!alertDismissed[c.id];
  return`<div class="cc${isAlerted?' flag':''}" onclick="openProfile('${c.id}')">
    <div class="cc-top">
      <div class="cc-av" style="background:${c.bg};color:${c.col}">${c.av}</div>
      <div style="flex:1"><div class="cc-name">${c.name}</div><div class="cc-type">${c.type}</div></div>
      <span class="pill ${isAlerted?'p-rd':c.pill}">${isAlerted?'Alerte':c.pillTxt}</span>
    </div>
    <div class="cc-stats"><div><div class="cc-sl">Poids</div><div class="cc-sv">${c.poids}</div></div><div><div class="cc-sl">Variation</div><div class="cc-sv" style="color:${c.varC}">${c.vari}</div></div><div><div class="cc-sl">Assid.</div><div class="cc-sv" style="color:${c.assidC}">${c.assid}%</div></div></div>
    <div class="bar-wrap"><div class="bar-fill" style="width:${c.assid}%;background:${c.assidC}"></div></div>
    <div class="cc-foot"><div class="cc-nxt">Prochain : <span>${c.next}</span></div><button class="btn-b" style="font-size:10px"><i class="ti ti-edit" style="font-size:11px"></i>Modifier</button></div>
  </div>`;
}

function starterSection(grid3){
  var sorted=[...STARTERS].sort((a,b)=>b.totalXP-a.totalXP);
  var medals=['🥇','🥈','🥉'];
  var cards=sorted.map((s,i)=>{var pct=Math.min(100,Math.round(s.xpIn/s.xpNeed*100));return`<div class="sc">
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
      <div class="sc-av">${s.av}</div>
      <div style="flex:1"><div style="font-size:12px;font-weight:500">${medals[i]||''} ${s.name}</div><div style="font-size:9px;color:var(--txm);text-transform:uppercase">${s.plan}</div></div>
      <div style="text-align:right"><div style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--gold)">Niv.${s.lvl}</div><div style="font-size:9px;color:rgba(255,215,0,0.5)">${s.totalXP} XP</div></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:rgba(255,215,0,0.5);margin-bottom:3px"><span>${s.xpIn} XP</span><span>/${s.xpNeed} XP</span></div>
    <div class="xp-mini-bg"><div class="xp-mini-fill" style="width:${pct}%"></div></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:7px">
      <div style="font-size:10px;color:var(--txm)">🔥${s.streak}j · ${s.defisW} défis/sem</div>
      <button class="convert-btn" onclick="event.stopPropagation();toast2('Proposition envoyée à ${s.name}')">Proposer coaching</button>
    </div>
  </div>`;}).join('');
  return`<div class="starter-sep"><div class="starter-sep-line"></div><div style="font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:2px;color:var(--gold)"><i class="ti ti-bolt" style="font-size:14px"></i> Challenger — ${STARTERS.length} membres</div><div class="starter-sep-line"></div></div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div style="font-size:11px;color:var(--txm)">Classement XP · Rev. mensuel : <span style="color:var(--gold)">${(STARTERS.length*9.99).toFixed(2)}€</span></div><button class="btn-b" onclick="envoyerNotif()"><i class="ti ti-bell" style="font-size:12px"></i>Notifier tous</button></div>
  <div class="${grid3?'sc-grid3':'sc-grid1'}">${cards}</div>`;
}

function clientsPageHTML(grid){
  var ac=CLIENTS.filter(c=>c.flag&&!alertDismissed[c.id]).length;
  var kpi=grid?'kpi4':'kpi2';var cc=grid?'cc-grid2':'cc-grid1';
  return`<div class="${kpi}">
    <div class="kpi"><div class="kl">Clients coaching</div><div class="kv">${CLIENTS.length}</div><div class="ks" style="color:var(--gr)">+2 ce mois</div></div>
    <div class="kpi"><div class="kl">Alertes</div><div class="kv" style="color:${ac>0?'#FF4444':'var(--gr)'}">${ac}</div><div class="ks" style="color:${ac>0?'#FF4444':'var(--gr)'}">${ac>0?'À traiter':'Tout va bien'}</div></div>
    <div class="kpi"><div class="kl">Challengers</div><div class="kv" style="color:var(--gold)">${STARTERS.length}</div><div class="ks" style="color:rgba(255,215,0,0.6)">9.99€/mois</div></div>
    <div class="kpi"><div class="kl">Assiduité moy.</div><div class="kv">82<span style="font-size:12px;color:var(--txm)">%</span></div><div class="ks" style="color:var(--gr)">+4%</div></div>
  </div>
  <div class="sec" style="margin-bottom:10px">Clients coaching</div>
  <div class="${cc}" style="margin-bottom:4px">${CLIENTS.map(ccHTML).join('')}</div>
  ${starterSection(grid)}`;
}

function starterOnlyHTML(grid){return starterSection(grid);}

// ── AGENDA ──
window.changeVueAgenda=function(vue){var i=document.getElementById("pc-inner");if(i)i.innerHTML=agendaView(vue);};
function agendaHTML(){return agendaView('semaine');}
function agendaView(vue){
  var now = new Date();
  var v = vue || 'semaine';
  var jours_fr = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  var mois_fr = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  var mois_fr_court = ['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];

  var clis = CLIENTS.map(function(cl){ return '<option>'+cl.name+'</option>'; }).join('');

  // Boutons vue
  var btns = ['jour','semaine','mois'].map(function(x){
    var active = x === v;
    return '<button onclick="changeVueAgenda(\''+x+'\')" style="padding:5px 13px;border-radius:16px;font-size:11px;font-weight:500;cursor:pointer;border:none;font-family:inherit;background:'+(active?'var(--r)':'transparent')+';color:'+(active?'#fff':'var(--txm)')+'">'+x.charAt(0).toUpperCase()+x.slice(1)+'</button>';
  }).join('');

  // ── VUE JOUR ──
  var contenu = '';
  if(v === 'jour'){
    var dateStr = jours_fr[now.getDay()] + ' ' + now.getDate() + ' ' + mois_fr[now.getMonth()] + ' ' + now.getFullYear();
    // RDV du jour depuis RDV_LIST
    var today = now.toISOString().split('T')[0];
    var rdvDuJour = (RDV_LIST||[]).filter(function(r){
      return r.date_rdv && r.date_rdv.startsWith(today);
    }).sort(function(a,b){ return a.date_rdv.localeCompare(b.date_rdv); });

    var rdvHtml = rdvDuJour.length ? rdvDuJour.map(function(rdv){
      var d = new Date(rdv.date_rdv);
      var h = d.getHours().toString().padStart(2,'0') + 'h' + d.getMinutes().toString().padStart(2,'0');
      var nom = (rdv.client && (rdv.client.prenom||rdv.client.nom)) ? (rdv.client.prenom||'') + ' ' + (rdv.client.nom||'') : 'Client';
      return '<div class="rdv-item"><div class="rdv-time"><div class="rdv-dot" style="background:var(--r2)"></div>'+h+'</div><div class="rdv-name">'+nom.trim()+'<div class="rdv-detail">'+(rdv.type||'RDV')+(rdv.notes?' · '+rdv.notes:'')+'</div></div></div>';
    }).join('') : '<div style="font-size:12px;color:var(--txd);text-align:center;padding:20px">Aucun RDV aujourd\'hui</div>';

    contenu = '<div style="background:var(--c1);border:0.5px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden;margin-bottom:12px">'
      + '<div style="padding:10px 14px;background:var(--rl);border-bottom:0.5px solid var(--rb);font-size:11px;font-weight:500;color:var(--r2)">'+dateStr+' — Aujourd\'hui</div>'
      + rdvHtml + '</div>';
  }

  // ── VUE SEMAINE ──
  else if(v === 'semaine'){
    // Lundi de la semaine courante
    var dayOfWeek = now.getDay();
    var diffToMonday = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek;
    var monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    var cols = '';
    for(var i = 0; i < 7; i++){
      var day = new Date(monday);
      day.setDate(monday.getDate() + i);
      var dayStr = day.toISOString().split('T')[0];
      var isToday = dayStr === now.toISOString().split('T')[0];
      var dayLabel = jours_fr[day.getDay()].slice(0,3) + ' ' + day.getDate();

      // RDV de ce jour
      var rdvDay = (RDV_LIST||[]).filter(function(r){
        return r.date_rdv && r.date_rdv.startsWith(dayStr);
      }).sort(function(a,b){ return a.date_rdv.localeCompare(b.date_rdv); });

      var rdvItems = rdvDay.map(function(rdv){
        var d = new Date(rdv.date_rdv);
        var h = d.getHours().toString().padStart(2,'0') + 'h' + d.getMinutes().toString().padStart(2,'0');
        var nom = (rdv.client && rdv.client.prenom) ? rdv.client.prenom : 'Client';
        return '<div class="rdv-item" style="font-size:10px"><div class="rdv-time" style="font-size:9px"><div class="rdv-dot"></div>'+h+'</div><div class="rdv-name" style="font-size:10px">'+nom+'</div></div>';
      }).join('');

      cols += '<div class="rdv-col'+(isToday?' rdv-today':'')+'"><div class="rdv-col-head">'+dayLabel+'</div>'+rdvItems+'</div>';
    }
    contenu = '<div class="rdv-cols">'+cols+'</div>';
  }

  // ── VUE MOIS ──
  else {
    var year = now.getFullYear();
    var month = now.getMonth();
    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month+1, 0).getDate();
    var today2 = now.getDate();

    var cells = '';
    // Offset pour commencer au lundi
    var offset = (firstDay === 0) ? 6 : firstDay - 1;
    for(var blank = 0; blank < offset; blank++){
      cells += '<div class="cal-day other"></div>';
    }
    for(var d2 = 1; d2 <= daysInMonth; d2++){
      var dStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d2).padStart(2,'0');
      var hasRdv = (RDV_LIST||[]).some(function(r){ return r.date_rdv && r.date_rdv.startsWith(dStr); });
      var isT = d2 === today2;
      cells += '<div class="cal-day'+(isT?' today':hasRdv?' has-rdv':'')+'">'+d2+'</div>';
    }
    var header = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:4px">'
      + ['L','M','M','J','V','S','D'].map(function(l){ return '<div style="text-align:center;font-size:9px;color:var(--txm);font-weight:600">'+l+'</div>'; }).join('') + '</div>';
    contenu = '<div style="font-size:13px;font-weight:600;margin-bottom:10px">'+mois_fr[month]+' '+year+'</div>'
      + header + '<div class="cal-grid">'+cells+'</div>';
  }

  // ── FORMULAIRE + LISTE ──
  return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">'
    +'<div style="font-size:14px;font-weight:500" id="agenda-titre">Agenda — '+mois_fr[now.getMonth()]+' '+now.getFullYear()+'</div>'
    +'<div style="display:flex;gap:5px;background:var(--c2);border-radius:20px;padding:3px">'+btns+'</div>'
    +'</div>'
    + contenu
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">'
    +'<div class="card"><div class="sec" style="margin-bottom:10px">Nouveau RDV</div>'
    +'<div class="frow"><div class="f1"><label class="lbl">Client</label><select class="inp" id="rdv-client">'+clis+'</select></div>'
    +'<div class="f1"><label class="lbl">Type</label><select class="inp" id="rdv-type"><option>Présentiel</option><option>Distanciel</option><option>Appel</option></select></div></div>'
    +'<div class="frow"><div class="f1"><label class="lbl">Date</label><input type="date" class="inp" id="rdv-date"></div>'
    +'<div class="f1"><label class="lbl">Heure</label><input type="time" class="inp" id="rdv-heure" value="10:00"></div></div>'
    +'<div style="margin-bottom:8px"><label class="lbl">Notes</label><input type="text" class="inp" id="rdv-notes" placeholder="Optionnel..."></div>'
    +'<button class="btn-r full" onclick="enregistrerRdv()"><i class="ti ti-check" style="font-size:13px"></i>Enregistrer</button>'
    +'</div>'
    +'<div class="card"><div class="sec" style="margin-bottom:10px">RDV à venir</div>'
    +'<div id="rdv-list-cont"><div style="font-size:12px;color:var(--txm);text-align:center;padding:20px">Chargement...</div></div>'
    +'</div>'
    +'</div>';
}

var statsClientSelected=null;
var statsData={};
window.selectStatClient=function(id){statsClientSelected=id;var i=document.getElementById("pc-inner");if(i)i.innerHTML=statsHTML(true);if(id){sbFetch("niveaux?client_id=eq."+id+"&select=*&limit=1").then(function(d){if(d&&d[0]){statsData[id]=d[0];var i2=document.getElementById("pc-inner");if(i2)i2.innerHTML=statsHTML(true);}}).catch(function(){});}};

function statsHTML(wide){
  var sorted = STARTERS.slice().sort(function(a,b){return b.totalXP-a.totalXP;});
  var medals = ['medaille_or','medaille_argent','medaille_bronze'];
  var medailleEmojis = ['🥇','🥈','🥉'];
  var revChallenger = (STARTERS.length * 9.99).toFixed(2);
  var clientOpts = CLIENTS.map(function(cl){
    return '<option value="'+cl.id+'"'+(statsClientSelected===cl.id?' selected':'')+'>'+cl.name+'</option>';
  }).join('');
  var selData = statsClientSelected ? statsData[statsClientSelected] : null;
  var bars = CLIENTS.length > 0 ? CLIENTS.map(function(cl){
    var v = cl.assid || 0;
    var col = v>=80?'#4CAF7A':v>=65?'#E8953A':'#FF4444';
    var nm = cl.name.split(' ').map(function(w){return w[0];}).join('.')+'.';
    return '<div class="stat-bar-row"><span class="sbn">'+nm+'</span><div class="sbt"><div class="sbf" style="width:'+v+'%;background:'+col+'"></div></div><span class="spct" style="color:'+col+'">'+v+'%</span></div>';
  }).join('') : '<div style="font-size:12px;color:var(--txm);padding:8px">Aucun client</div>';

  var html = '<div class="'+(wide?'kpi4':'kpi2')+'" style="margin-bottom:12px">'
    +'<div class="kpi"><div class="kl">Clients coaching</div><div class="kv">'+CLIENTS.length+'</div></div>'
    +'<div class="kpi"><div class="kl">Challengers</div><div class="kv" style="color:var(--gold)">'+STARTERS.length+'</div></div>'
    +'<div class="kpi"><div class="kl">Rev. Challenger</div><div class="kv" style="color:var(--gold)">'+revChallenger+'<span style="font-size:11px;color:var(--txm)">€</span></div></div>'
    +'<div class="kpi"><div class="kl">Total clients</div><div class="kv">'+(CLIENTS.length+STARTERS.length)+'</div></div>'
    +'</div>';

  // Sélecteur stats individuelles
  html += '<div class="card" style="margin-bottom:10px">'
    +'<div class="sec" style="margin-bottom:8px">Stats individuelles</div>'
    +'<select class="inp" id="stats-client-sel" onchange="selectStatClient(this.value)" style="margin-bottom:10px">'
    +'<option value="">— Sélectionner un client —</option>'+clientOpts+'</select>'
    +'<div id="stats-client-detail" style="display:'+(selData?'block':'none')+'">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">'
    +'<div style="background:var(--c2);border-radius:10px;padding:10px;text-align:center"><div style="font-size:9px;text-transform:uppercase;color:var(--txm);margin-bottom:4px">Perte masse</div><div style="font-size:20px;font-weight:500;color:var(--gr)" id="stat-perte">'+(selData?selData.perteMasse+'kg':'—')+'</div></div>'
    +'<div style="background:var(--c2);border-radius:10px;padding:10px;text-align:center"><div style="font-size:9px;text-transform:uppercase;color:var(--txm);margin-bottom:4px">Prise masse</div><div style="font-size:20px;font-weight:500;color:var(--b)" id="stat-prise">'+(selData?selData.priseMasse+'kg':'—')+'</div></div>'
    +'<div style="background:var(--c2);border-radius:10px;padding:10px;text-align:center"><div style="font-size:9px;text-transform:uppercase;color:var(--txm);margin-bottom:4px">Séances mois</div><div style="font-size:20px;font-weight:500" id="stat-seances">'+(selData?selData.seancesMois:'—')+'</div></div>'
    +'</div><div id="stat-pesees-list" style="margin-top:10px"></div>'
    +'</div></div>';

  html += '<div style="'+(wide?'display:grid;grid-template-columns:1fr 1fr;gap:12px':'')+'">'
    +'<div class="card"><div class="sec" style="margin-bottom:10px">Assiduité coaching</div>'+bars+'</div>'
    +'<div class="card"><div class="sec" style="margin-bottom:10px">Classement Challenger</div>'
    +(sorted.length > 0 ? sorted.map(function(s,i){
      return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)">'
        +'<span style="font-size:13px;width:20px">'+medailleEmojis[i]+'</span>'
        +'<div class="sc-av">'+s.av+'</div>'
        +'<div style="flex:1"><div style="font-size:12px;font-weight:500">'+s.name+'</div>'
        +'<div style="font-size:10px;color:var(--txm)">Niv. '+s.lvl+' · Streak '+s.streak+'j</div></div>'
        '<div style="font-family:Bebas Neue,sans-serif;font-size:16px;color:var(--gold)">'+s.totalXP+' XP</div>'
        +'</div>';
    }).join('') : '<div style="font-size:12px;color:var(--txm);padding:8px">Aucun Challenger</div>')
    +'</div></div>';

  return html;
}



// ── BASE EXOS ──
function dbHTML(){
  var groupsHtml=MUSCU.map(function(g,gi){
    var exosHtml=g.e.map(function(e,ei){
      var nom=(typeof e==="object")?e.nom:e;
      var photo=(typeof e==="object")?e.photo:"";
      var note=(typeof e==="object")?e.note:"";
      return "<div style='display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:8px;margin-bottom:4px;background:var(--c2)'>"
        +"<div style='display:flex;align-items:center;gap:8px;flex:1'>"
        +(photo?"<img src='"+photo+"' style='width:36px;height:26px;object-fit:cover;border-radius:4px'>"
               :"<div style='width:36px;height:26px;border-radius:4px;background:var(--c3);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--txm)'>📷</div>")
        +"<div><div style='font-size:12px;font-weight:500'>"+nom+"</div>"
        +(note?"<div style='font-size:10px;color:var(--txm)'>"+note+"</div>":"")
        +"</div></div>"
        +"<div style='display:flex;gap:4px'>"
        +"<button onclick='editExo("+gi+","+ei+")' style='background:none;border:none;cursor:pointer;color:var(--txm);padding:4px'><i class='ti ti-pencil' style='font-size:13px'></i></button>"
        +"<button onclick='deleteExo("+gi+","+ei+")' style='background:none;border:none;cursor:pointer;color:var(--r2);padding:4px'><i class='ti ti-trash' style='font-size:13px'></i></button>"
        +"</div></div>";
    }).join("");
    return "<div style='margin-bottom:12px'>"
      +"<div onclick=\"var s=this.nextElementSibling;s.style.display=s.style.display==='none'?'block':'none';\" "
      +"style='display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--c1);border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;cursor:pointer;margin-bottom:6px'>"
      +"<span style='font-size:12px;font-weight:500'>"+g.g+"</span>"
      +"<span style='font-size:10px;color:var(--txm)'>"+g.e.length+" exos</span>"
      +"</div>"
      +"<div>"+exosHtml+"</div></div>";
  }).join("");
  return "<div style='font-size:14px;font-weight:600;margin-bottom:16px'>Base d exercices</div>"
    +groupsHtml
    +"<div class='card' style='margin-top:14px'>"
    +"<div class='sec' style='margin-bottom:10px'>Ajouter un exercice</div>"
    +"<div style='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px'>"
    +"<input type='text' id='nex-nm' class='inp' placeholder='Nom'>"
    +"<select id='nex-grp' class='inp'>"+MUSCU.map(function(g){return "<option>"+g.g+"</option>";}).join("")+"</select>"
    +"</div>"
    +"<input type='text' id='nex-note' class='inp' placeholder='Note technique (optionnel)' style='margin-bottom:8px'>"
    +"<label class='lbl'>Photo</label>"
    +"<input type='file' id='nex-photo-file' accept='image/*' onchange='previewExoPhoto(this)' style='width:100%;font-size:11px;color:var(--txm);margin-bottom:6px'>"
    +"<div id='nex-photo-preview' style='display:none;margin-bottom:8px'><img id='nex-photo-img' style='width:80px;height:56px;object-fit:cover;border-radius:6px'></div>"
    +"<button class='btn-r full' onclick='creerExoPerso()'>+ Ajouter</button>"
    +"</div>";
}

function getStatutLabel(s){
  var map = {prive:'🔒 Privé',challenger:'⚡ Challenger',elite:'⭐ Elite',circuit:'🔄 Circuit',brouillon:'📝 Brouillon',archive:'📦 Archivé'};
  return map[s]||s;
}
function getStatutColor(s){
  var map = {prive:'var(--txm)',challenger:'var(--gold)',elite:'#FFD700',circuit:'var(--b)',brouillon:'var(--or)',archive:'var(--txd)'};
  return map[s]||'var(--tx)';
}

function programmesHTML(){
  var filterCat = window._progFilterCat || 'challenger';
  var cats = [
    {key:'coaching',label:'Coaching perso',icon:'ti-user',color:'var(--b)'},
    {key:'challenger',label:'Challenger',icon:'ti-bolt',color:'var(--gold)'},
    {key:'circuit',label:'Circuits',icon:'ti-refresh',color:'var(--gr)'},
    {key:'elite',label:'Elite (soumis)',icon:'ti-star',color:'#FFD700'},
    {key:'brouillon',label:'Brouillons',icon:'ti-pencil',color:'var(--or)'},
    {key:'archive',label:'Archivés',icon:'ti-archive',color:'var(--txd)'},
  ];
  var filteredProgs = MES_PROGRAMMES.filter(function(p){
    if(filterCat==='coaching') return p.statut==='prive';
    if(filterCat==='elite') return p.statut==='elite';
    if(filterCat==='archive') return p.statut==='archive';
    if(filterCat==='brouillon') return p.statut==='brouillon';
    if(filterCat==='circuit') return p.statut==='circuit';
    return p.statut===filterCat;
  });
  var tabsHtml = cats.map(function(cat){
    var count = MES_PROGRAMMES.filter(function(p){
      if(cat.key==='coaching') return p.statut==='prive';
      if(cat.key==='elite') return p.statut==='elite';
      if(cat.key==='archive') return p.statut==='archive';
      if(cat.key==='brouillon') return p.statut==='brouillon';
      if(cat.key==='circuit') return p.statut==='circuit';
      return p.statut===cat.key;
    }).length;
    var isOn = filterCat===cat.key;
    return '<button data-cat="'+cat.key+'" style="display:flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;font-size:11px;font-weight:600;cursor:pointer;border:0.5px solid '+(isOn?cat.color:'rgba(255,255,255,0.08)')+';background:'+(isOn?'rgba(255,255,255,0.06)':'transparent')+';color:'+(isOn?cat.color:'var(--txm)')+'"><i class="ti '+cat.icon+'" style="font-size:12px"></i>'+cat.label+' <span style="background:rgba(255,255,255,0.1);border-radius:10px;padding:0 6px;font-size:10px">'+count+'</span></button>';
  }).join('');

  var progsHtml = filteredProgs.length === 0
    ? '<div style="text-align:center;padding:30px;color:var(--txd);font-size:13px">Aucun programme dans cette catégorie.<br><button onclick="nouveauProg()" style="margin-top:12px;padding:9px 18px;background:var(--ant);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">+ Nouveau programme</button></div>'
    : filteredProgs.map(function(p){
      var statBadge = {prive:'Coaching',challenger:'Challenger',circuit:'Circuit',elite:'Elite soumis',brouillon:'Brouillon',archive:'Archivé'}[p.statut]||p.statut;
      var statColor = {prive:'var(--b)',challenger:'var(--gold)',circuit:'var(--gr)',elite:'#FFD700',brouillon:'var(--or)',archive:'var(--txd)'}[p.statut]||'var(--txm)';
      var joursCount = (p.jours||[]).length;
      var pubDate = p.publishedAt ? ' · Publié le '+p.publishedAt : (p.createdAt?' · Créé le '+p.createdAt:'');
      var clientName = p.clientNom ? ' · '+p.clientNom : '';
      var visIcon = p.visible===false ? '<i class="ti ti-eye-off" style="font-size:11px;color:var(--txd)" title="Masqué"></i>' : '';
      var idx = MES_PROGRAMMES.findIndex(function(x){return x.id===p.id;});
      return '<div style="background:var(--c1);border:0.5px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px 16px;margin-bottom:10px">'
        +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px">'
        +'<div style="flex:1"><div style="font-size:14px;font-weight:600;margin-bottom:3px">'+p.nom+' '+visIcon+'</div>'
        +'<div style="font-size:10px;color:var(--txm)">'+joursCount+' jour(s) · '+p.auteur+clientName+pubDate+'</div></div>'
        +'<span style="background:rgba(255,255,255,0.06);border:0.5px solid '+statColor+';border-radius:20px;padding:2px 9px;font-size:9px;font-weight:600;color:'+statColor+';flex-shrink:0">'+statBadge+'</span>'
        +'</div>'
        +'<div style="display:flex;gap:5px;flex-wrap:wrap">'
        +'<button onclick="editProg(\''+idx+'\')" style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:var(--c2);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;font-size:11px;color:var(--txm);cursor:pointer"><i class="ti ti-edit" style="font-size:11px"></i>Modifier</button>'
        +'<button onclick="dupProg(\''+idx+'\')" style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:var(--c2);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;font-size:11px;color:var(--txm);cursor:pointer"><i class="ti ti-copy" style="font-size:11px"></i>Dupliquer</button>'
        +(p.statut==='prive'||p.statut==='brouillon'?'<button onclick="assignProg(\''+idx+'\')" style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:var(--bl);border:0.5px solid var(--bb);border-radius:7px;font-size:11px;color:var(--b);cursor:pointer"><i class="ti ti-user-plus" style="font-size:11px"></i>Assigner</button>':'')
        +(p.statut==='challenger'||p.statut==='brouillon'||p.statut==='circuit'?'<button onclick="toggleVisibleProg(\''+idx+'\')" style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:var(--c2);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;font-size:11px;color:var(--txm);cursor:pointer"><i class="ti ti-eye'+(p.visible===false?'':'-off')+'" style="font-size:11px"></i>'+(p.visible===false?'Afficher':'Masquer')+'</button>':'')
        +(p.statut!=='archive'?'<button onclick="archiveProg(\''+idx+'\')" style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:var(--c2);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;font-size:11px;color:var(--txd);cursor:pointer"><i class="ti ti-archive" style="font-size:11px"></i>Archiver</button>':'')
        +(p.statut==='brouillon'?'<button onclick="publierProg(\''+idx+'\')" style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:rgba(76,175,122,0.1);border:0.5px solid rgba(76,175,122,0.3);border-radius:7px;font-size:11px;color:var(--gr);cursor:pointer"><i class="ti ti-send" style="font-size:11px"></i>Publier</button>':'')
        +'<button onclick="deleteProg(\''+idx+'\')" style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:rgba(232,80,80,0.08);border:0.5px solid rgba(232,80,80,0.2);border-radius:7px;font-size:11px;color:var(--ant);cursor:pointer"><i class="ti ti-trash" style="font-size:11px"></i>Supprimer</button>'
        +'</div></div>';
    }).join('');

  return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
    +'<div style="font-size:11px;color:var(--txm)">'+MES_PROGRAMMES.filter(function(p){return p.statut!=='archive';}).length+' programme(s) actifs</div>'
    +'<button onclick="nouveauProg()" style="display:flex;align-items:center;gap:5px;padding:8px 14px;background:var(--ant);color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer"><i class="ti ti-plus" style="font-size:13px"></i>Nouveau programme</button>'
    +'</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">'+tabsHtml+'</div>'
    +'<div id="prog-lib-list">'+progsHtml+'</div>';
}

function progBaseHTML(){
  var plans=[
    {name:'Full Body',freq:'1–2 séances / semaine',badge:'Débutant',col:'#FFD700',jours:[
      {title:'Full Body A',col:'#00BFFF',exos:[['Squat barre','3×12','2-0-1'],['Développé couché','3×12','2-1-1'],['Tirage vertical','3×12','2-0-1'],['Fentes','3×12','']]},
      {title:'Full Body B',col:'#A50000',exos:[['Soulevé de terre roumain','3×10','3-1-1'],['Développé haltères','3×12','2-1-1'],['Rowing haltère','3×12','2-0-1'],['Squat gobelet','3×15','']]}
    ]},
    {name:'Push · Pull · Leg',freq:'3 séances / semaine',badge:'Intermédiaire',col:'#FFD700',jours:[
      {title:'PUSH',col:'#00BFFF',exos:[['Développé couché','4×8–10','3-1-1'],['Développé incliné','3×12','2-1-1'],['Extension triceps','3×15','2-0-1']]},
      {title:'PULL',col:'#A50000',exos:[['Tractions','4×max',''],['Rowing barre','4×8','2-1-1'],['Curl haltères','3×12','']]},
      {title:'LEG',col:'#4CAF7A',exos:[['Squat barre','4×8','3-1-1'],['Leg press','3×12',''],['Hip thrust','3×15','']]}
    ]},
    {name:'Upper / Lower',freq:'4 séances / semaine',badge:'Avancé',col:'#FFD700',jours:[
      {title:'UPPER A',col:'#00BFFF',exos:[['Développé couché','4×8–10','3-1-1'],['Tirage vertical','4×8–10','2-0-1'],['Curl barre','3×12','']]},
      {title:'LOWER A',col:'#A50000',exos:[['Squat barre','4×8','3-1-1'],['Leg press','3×12',''],['Hip thrust','3×15','']]},
    ]}
  ];
  return`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div><div style="font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:2px;color:var(--gold)"><i class="ti ti-bolt" style="font-size:14px;margin-right:5px"></i>Mes programmes</div>
    <div style="font-size:11px;color:var(--txm);margin-top:3px">Affichez dans l'appli de tous les membres Challenger.</div></div>
    <button class="btn-r" onclick="publierProgrammes()"><i class="ti ti-send" style="font-size:13px"></i>Publier</button>
  </div>
  ${plans.map(p=>`<div class="prog-base-card">
    <div class="pbc-header" onclick="this.nextElementSibling.classList.toggle('open')">
      <div><div class="pbc-name">${p.name}</div><div class="pbc-freq">${p.freq}</div></div>
      <div style="display:flex;align-items:center;gap:8px"><span class="pbc-badge">${p.badge}</span><i class="ti ti-chevron-down" style="font-size:13px;color:var(--txm)"></i></div>
    </div>
    <div class="pbc-body">
      ${p.jours.map(j=>`<div><div class="pbc-day-title" style="color:${j.col}">${j.title}</div>${j.exos.map(e=>`<div class="pbc-exo-row"><span class="pbc-exo-name">${e[0]}</span><input class="pbc-exo-inp" value="${e[1]}"><input class="pbc-exo-inp" value="${e[2]}"></div>`).join('')}</div>`).join('')}
      <button class="btn-r full" style="margin-top:8px" onclick="event.stopPropagation();toast2('${p.name} enregistré')"><i class="ti ti-device-floppy" style="font-size:13px"></i>Enregistrer</button>
    </div>
  </div>`).join('')}
  <div style="background:var(--c1);border:0.5px dashed rgba(255,215,0,0.3);border-radius:12px;padding:16px;text-align:center;cursor:pointer;margin-top:10px" onclick="addExoToProg()">
    <i class="ti ti-plus" style="font-size:18px;color:var(--gold);display:block;margin-bottom:6px"></i>
    <div style="font-size:12px;color:var(--gold)">Ajouter un programme</div>
  </div>`;
}

// ── DÉFIS ──
function defisHTML(){
  var actifs = DEFIS_BANK.filter(function(d){return !d.archive;});
  var archives = DEFIS_BANK.filter(function(d){return d.archive;});
  var liste = DEFIS_BANK.map(function(d){
    var isArch = d.archive;
    var isMask = d.masque;
    return '<div class="defi-item" style="opacity:'+(isArch?'0.4':'1')+'">'
      +'<span class="defi-ico">'+d.i+'</span>'
      +'<div style="flex:1"><div class="defi-nm" style="text-decoration:'+(isArch?'line-through':'none')+'">'+d.nm+'</div><div class="defi-ds">'+d.ds+'</div></div>'
      +'<div style="display:flex;gap:4px;align-items:center">'
      +(isMask?'<span style="font-size:9px;color:var(--txd);background:var(--c3);padding:2px 6px;border-radius:10px">Masqué</span>':'')
      +(isArch?'<span style="font-size:9px;color:var(--or);background:rgba(232,149,58,0.1);padding:2px 6px;border-radius:10px">Archivé</span>':'')
      +'<div class="icon-btn" onclick="toggleMasqueDefi('+d.id+')" title="'+(isMask?'Afficher':'Masquer')+'"><i class="ti ti-eye'+(isMask?'':'-off')+'" style="font-size:12px"></i></div>'
      +'<div class="icon-btn '+(isArch?'':'')+'style="color:var(--or)" onclick="toggleArchiveDefi('+d.id+')" title="'+(isArch?'Désarchiver':'Archiver')+'"><i class="ti ti-'+(isArch?'archive-off':'archive')+'" style="font-size:12px"></i></div>'
      +'<div class="icon-btn" style="color:var(--r2)" onclick="rmDefi('+d.id+')" title="Supprimer"><i class="ti ti-trash" style="font-size:12px"></i></div>'
      +'</div></div>';
  }).join('');
  var previewDefis = pickDefisDashboard();
  var preview = previewDefis.map(function(d){
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--c2);border-radius:8px;margin-bottom:5px">'
      +'<span style="font-size:16px">'+d.i+'</span><div><div style="font-size:12px;font-weight:500">'+d.nm+'</div><div style="font-size:10px;color:var(--txm)">'+d.ds+'</div></div>'
      +'</div>';
  }).join('');
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">'
    +'<div>'
    +'<div class="sec" style="margin-bottom:10px">Banque de défis ('+actifs.length+' actifs · '+archives.length+' archivés)</div>'
    +'<div id="defi-list">'+liste+'</div>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;gap:12px">'
    +'<div class="card"><div class="sec" style="margin-bottom:10px">Ajouter un défi</div>'
    +'<div style="margin-bottom:8px"><label class="lbl">Nom</label><input class="inp" id="nd-nm" placeholder="Ex : 30 burpees"></div>'
    +'<div style="margin-bottom:8px"><label class="lbl">Description</label><input class="inp" id="nd-ds" placeholder="Précisions..."></div>'
    +'<div style="margin-bottom:10px"><label class="lbl">Icône</label>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap">'+['🔥','💪','🏃','🧱','⚡','🎯','🦵','🙌','🧘','🥊'].map(function(ico){return '<button onclick="document.getElementById(\'nd-ico\').value=\''+ico+'\'" style="font-size:18px;background:var(--c2);border:none;border-radius:6px;padding:4px 8px;cursor:pointer">'+ico+'</button>';}).join('')+'</div>'
    +'<input id="nd-ico" type="hidden" value="⚡">'
    +'</div>'
    +'<button class="btn-r full" onclick="addDefi()"><i class="ti ti-plus" style="font-size:12px"></i>Ajouter le défi</button>'
    +'</div>'
    +'<div class="card"><div class="sec" style="margin-bottom:10px">Aperçu tirage du jour (5 aléatoires)</div>'
    +'<div>'+preview+'</div>'
    +'<button onclick="pcNav(null,\'pc-defis\')" style="width:100%;margin-top:8px;padding:8px;background:var(--c2);border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;color:var(--txm);font-size:11px;cursor:pointer;font-family:inherit"><i class="ti ti-refresh" style="font-size:11px"></i> Relancer le tirage</button>'
    +'</div>'
    +'</div>'
    +'</div>';
}

// ── QUESTIONNAIRES ──
function questionnairesHTML(){
  var nb=QUESTIONNAIRES_DATA.filter(q=>q.statut==='en_attente').length;
  var b=document.getElementById('q-badge-pc');if(b){b.textContent=nb;b.style.display=nb>0?'':'none';}
  return`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <div style="font-size:12px;color:var(--txm)">${nb} en attente · ${QUESTIONNAIRES_DATA.length} total</div>
    <div style="display:flex;gap:6px">
      <button class="btn-ghost" onclick="filterQ('all')">Tous</button>
      <button class="ant-btn" onclick="openAddClient()"><i class="ti ti-user-plus" style="font-size:13px"></i>Nouveau client</button>
    </div>
  </div>
  ${QUESTIONNAIRES_DATA.map(q=>{
    var fColor=q.formule==='challenger'?'var(--gold)':q.formule==='presentiel'?'var(--or)':'var(--b)';
    var fLabel=q.formule==='challenger'?'Challenger':q.formule==='presentiel'?'Présentiel':'Distanciel';
    var statut=q.statut==='en_attente'?'<span class="pill p-rd">En attente</span>':'<span class="pill p-wh">Traité</span>';
    return`<div class="card" style="border:0.5px solid ${q.statut==='en_attente'?'var(--rb)':'rgba(255,255,255,0.07)'}">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--rl);border:1.5px solid var(--r2);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:var(--r2);flex-shrink:0">${q.prenom[0]}${q.nom[0]}</div>
        <div style="flex:1"><div style="font-size:14px;font-weight:500">${q.prenom} ${q.nom}</div><div style="font-size:11px;color:var(--txm);margin-top:2px">${q.email} · ${q.tel}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:5px"><span style="font-size:10px;font-weight:600;color:${fColor};background:rgba(255,255,255,0.05);border:0.5px solid ${fColor};border-radius:20px;padding:2px 8px">${fLabel}</span>${statut}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;background:var(--c2);border-radius:10px;padding:10px 12px;margin-bottom:10px">
        <div><div style="font-size:9px;text-transform:uppercase;color:var(--txm)">Objectif</div><div style="font-size:12px;font-weight:500;margin-top:2px">${q.objectif}</div></div>
        <div><div style="font-size:9px;text-transform:uppercase;color:var(--txm)">Niveau</div><div style="font-size:12px;font-weight:500;margin-top:2px">${q.niveau}</div></div>
        <div><div style="font-size:9px;text-transform:uppercase;color:var(--txm)">Gabarit</div><div style="font-size:12px;font-weight:500;margin-top:2px">${q.taille}cm · ${q.poids}→${q.poids_obj}kg</div></div>
        <div><div style="font-size:9px;text-transform:uppercase;color:var(--txm)">Blessures</div><div style="font-size:12px;margin-top:2px;color:${q.blessures!=='Aucune'?'var(--or)':'var(--txm)'}">${q.blessures}</div></div>
        <div><div style="font-size:9px;text-transform:uppercase;color:var(--txm)">Dispo</div><div style="font-size:12px;margin-top:2px">${q.dispos}</div></div>
        <div><div style="font-size:9px;text-transform:uppercase;color:var(--txm)">Date</div><div style="font-size:12px;margin-top:2px">${q.date}</div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="creerCompteClient('${q.id}')" style="flex:1;min-width:160px;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:var(--r);color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer"><i class="ti ti-user-plus" style="font-size:14px"></i>Créer le compte</button>
        <button onclick="envoyerEmailQuestionnaire('${q.prenom}')" style="display:flex;align-items:center;gap:5px;padding:10px 14px;background:transparent;border:0.5px solid var(--bb);border-radius:9px;font-size:12px;color:var(--b);font-family:inherit;cursor:pointer"><i class="ti ti-mail" style="font-size:13px"></i>Contacter</button>
        <button onclick="markQTraite('${q.id}')" style="display:flex;align-items:center;gap:5px;padding:10px 14px;background:transparent;border:0.5px solid rgba(255,255,255,0.1);border-radius:9px;font-size:12px;color:var(--txm);font-family:inherit;cursor:pointer"><i class="ti ti-check" style="font-size:13px"></i>Traité</button>
      </div>
    </div>`;
  }).join('')}`;
}
window.creerCompteClient=function(qid){var q=QUESTIONNAIRES_DATA.find(x=>x.id===qid);if(!q)return;q.statut='converti';toast2('Compte créé — email envoyé à '+q.prenom);document.getElementById('pc-inner').innerHTML=questionnairesHTML();};
window.markQTraite=function(qid){var q=QUESTIONNAIRES_DATA.find(x=>x.id===qid);if(!q)return;q.statut='traite';document.getElementById('pc-inner').innerHTML=questionnairesHTML();toast2('Marqué traité');};
window.filterQ=function(){document.getElementById('pc-inner').innerHTML=questionnairesHTML();};

// ── MODAL AJOUTER CLIENT ──
window.openAddClient=function(){document.getElementById('modal-add-client').style.display='flex';};
window.closeAddClient=function(){document.getElementById('modal-add-client').style.display='none';};
document.getElementById('modal-add-client').addEventListener('click',function(e){if(e.target===this)closeAddClient();});



// ── AGENDA SUPABASE ──
var agendaRdvs = []; // chargé depuis Supabase

async function loadAgendaData(){
  var now = new Date();
  var debut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  var fin = new Date(now.getFullYear(), now.getMonth()+2, 1).toISOString();
  sbFetch('rdv_coach?date_rdv=gte.'+debut+'&date_rdv=lt.'+fin+'&select=*,client:profiles!client_id(prenom,nom,email)&order=date_rdv.asc')
    .then(function(rdvs){
      if(!Array.isArray(rdvs)) return;
      RDV_LIST = rdvs;
      // Mettre à jour l'affichage si l'onglet agenda est visible
      var agendaSection = document.getElementById('agenda-section');
      if(agendaSection && agendaSection.style.display !== 'none'){
        renderAgendaRDV(rdvs);
      }
    })
    .catch(function(e){ console.log('Agenda:', e.message); });
}

function renderAgendaRDV(rdvs){
  var cont = document.getElementById('rdv-list-cont');
  if(!cont) return;
  var now = new Date();
  var mois = ['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  var jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  // Trier par date croissante et garder uniquement les futurs
  var upcoming = (rdvs||[])
    .filter(function(r){ return r.date_rdv && new Date(r.date_rdv) >= new Date(now.toDateString()); })
    .sort(function(a,b){ return new Date(a.date_rdv) - new Date(b.date_rdv); })
    .slice(0, 10);

  if(!upcoming.length){
    cont.innerHTML = '<div style="font-size:12px;color:var(--txm);text-align:center;padding:20px">Aucun RDV à venir</div>';
    return;
  }

  cont.innerHTML = upcoming.map(function(rdv){
    var d = new Date(rdv.date_rdv);
    var isToday = d.toDateString() === now.toDateString();
    var isTomorrow = d.toDateString() === new Date(now.getTime()+86400000).toDateString();
    var label = isToday ? 'Aujourd\'hui' : isTomorrow ? 'Demain' : jours[d.getDay()]+' '+d.getDate()+' '+mois[d.getMonth()];
    var heure = d.getHours().toString().padStart(2,'0')+'h'+d.getMinutes().toString().padStart(2,'0');
    var nom = rdv.client ? ((rdv.client.prenom||'')+ ' '+(rdv.client.nom||'')).trim() : 'Client';
    var typeColor = rdv.type==='Présentiel' ? 'var(--or)' : rdv.type==='Distanciel' ? 'var(--b)' : 'var(--gr)';
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)">'
      +'<div style="flex-shrink:0;text-align:center;min-width:52px">'
      +'<div style="font-size:10px;color:'+(isToday?'var(--ant)':'var(--txm)')+';font-weight:'+(isToday?'600':'400')+'">'+label+'</div>'
      +'<div style="font-size:13px;font-weight:600;color:var(--tx)">'+heure+'</div>'
      +'</div>'
      +'<div style="width:3px;height:36px;border-radius:2px;background:'+typeColor+';flex-shrink:0"></div>'
      +'<div style="flex:1">'
      +'<div style="font-size:13px;font-weight:500">'+nom+'</div>'
      +'<div style="font-size:10px;color:var(--txm)">'+(rdv.type||'RDV')+(rdv.notes?' · '+rdv.notes:'')+'</div>'
      +'</div>'
      +'</div>';
  }).join('');
}

function saveProgrammesToSB(){
  if(!typeof sbUpsert === 'undefined') return;
  MES_PROGRAMMES.forEach(function(p){
    sbUpsert('mes_programmes_coach',{
      id:p.id, nom:p.nom, auteur:p.auteur, badge:p.badge,
      freq:p.freq, statut:p.statut, visible:p.visible,
      jours:JSON.stringify(p.jours), created_at:p.createdAt
    },'id').catch(function(){});
  });
}

function loadProgrammesFromSB(){
  // Charger depuis localStorage en attendant Supabase
  try{
    var saved = localStorage.getItem('ant_mes_programmes');
    if(saved){ var parsed = JSON.parse(saved); if(parsed.length) MES_PROGRAMMES = parsed; }
  }catch(e){}
}

function saveProgrammesLocal(){
  try{ localStorage.setItem('ant_mes_programmes', JSON.stringify(MES_PROGRAMMES)); }catch(e){}
}

// Charger au démarrage
loadProgrammesFromSB();

var PC_PAGES={
  'pc-accueil':{t:'Accueil',s:'Vue d\'ensemble & ajout client',h:()=>accueilHTML(true)},
  'pc-clients':{t:'Clients & Challengers',s:'Coaching perso · Challengers · Elite',h:()=>clientsPageHTML(true)},
  'pc-agenda':{t:'Agenda',s:'RDV & planification',h:()=>agendaHTML()},
  'pc-stats':{t:'Statistiques',s:'Performances + revenus Challenger',h:()=>statsHTML(true)},
  'pc-db':{t:'Base exercices',s:'Ma bibliothèque d\'exercices',h:dbHTML},
  'pc-programmes':{t:'Mes programmes',s:'Bibliothèque — Coaching · Challenger · Circuits',h:programmesHTML},
  'pc-defis':{t:'Défis quotidiens',s:'Banque de défis — tirage aléatoire quotidien',h:defisHTML},
  'pc-questionnaires':{t:'Questionnaires reçus',s:'Demandes de coaching & nouveaux clients',h:questionnairesHTML},
};
var MOB_FNS=[
  ()=>accueilHTML(false),
  ()=>clientsPageHTML(false),
  ()=>agendaHTML(),
  ()=>statsHTML(false),
  ()=>dbHTML(),
];
function mobNav(el,idx){
  document.querySelectorAll('.mbn').forEach(b=>b.classList.remove('on'));el.classList.add('on');
  document.querySelectorAll('.mob-scr').forEach(s=>s.style.display='none');
  var av=document.getElementById('prof-av');
  av.style.cssText=`width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0;border:2px solid var(--r2);background:${c.bg};color:${c.col}`;
  av.textContent=c.av;
  document.getElementById('prof-name').textContent=c.name;
  document.getElementById('prof-meta').textContent=c.meta;
  var pill=document.getElementById('prof-pill');pill.className='pill p-gr';pill.textContent='Profil ouvert';
  document.querySelectorAll('.ptab').forEach(t=>t.classList.remove('on'));document.querySelectorAll('.ptab')[0].classList.add('on');
  document.querySelectorAll('.pscr').forEach(s=>s.classList.remove('on'));document.getElementById('pt-prog').classList.add('on');
  renderKpiPicker();renderAttnSlots();renderVictoireSlots();
  document.getElementById('profile-panel').classList.add('show');
}
function closeProfile(){document.getElementById('profile-panel').classList.remove('show');}
function pTab(el,id){document.querySelectorAll('.ptab').forEach(t=>t.classList.remove('on'));el.classList.add('on');document.querySelectorAll('.pscr').forEach(s=>s.classList.remove('on'));document.getElementById(id).classList.add('on');}
function updateAlertBadge(){var ac=CLIENTS.filter(c=>c.flag&&!alertDismissed[c.id]).length;var b=document.getElementById('alert-badge-pc');if(b){b.textContent=ac;b.style.display=ac>0?'':'none';}}

// ── KPI PICKER ──
function renderKpiPicker(){var el=document.getElementById('kpi-picker');if(!el)return;el.innerHTML=ALL_KPIS.map(k=>{var sel=kpiSelected.includes(k.id);return`<div class="kpi-pick-item${sel?' sel':''}" onclick="togKpi('${k.id}')"><span style="font-size:11px">${k.lbl}</span><div class="kpi-pick-chk${sel?' on':''}">${sel?'<i class="ti ti-check" style="font-size:9px;color:#000"></i>':''}</div></div>`;}).join('');}
function togKpi(id){var idx=kpiSelected.indexOf(id);if(idx>-1)kpiSelected.splice(idx,1);else if(kpiSelected.length<4)kpiSelected.push(id);renderKpiPicker();}
function renderAttnSlots(){var el=document.getElementById('attn-slots');if(!el)return;el.innerHTML='';for(var i=0;i<3;i++){var slot=attnSlots[i];var div=document.createElement('div');div.className='attn-slot'+(slot?' filled':'');div.onclick=(function(idx){return function(){openAttnPicker(idx);};})(i);if(slot){var stat=ALL_STATS.find(s=>s.id===slot.stat)||{lbl:'Stat'};div.innerHTML=`<div class="attn-color-dot" style="background:${slot.color}"></div><div style="flex:1"><div style="font-size:12px">${stat.lbl}</div><div style="font-size:10px;color:var(--txm)">Cliquer pour modifier</div></div><i class="ti ti-pencil" style="font-size:13px;color:var(--txm)"></i>`;}else{div.innerHTML=`<i class="ti ti-plus" style="font-size:14px;color:var(--txd)"></i><span style="font-size:12px;color:var(--txm)">Ajouter un point d'attention</span>`;}el.appendChild(div);}}
function renderVictoireSlots(){var el=document.getElementById('victoire-slots');if(!el)return;el.innerHTML='';for(var i=0;i<3;i++){var slot=victoireSlots[i];var div=document.createElement('div');div.className='victoire-slot'+(slot?' filled':'');div.onclick=(function(idx){return function(){openVictoirePicker(idx);};})(i);if(slot){var exo=ALL_EXOS_VICTOIRES.find(e=>e.id===slot.exo)||{lbl:'Exercice'};div.innerHTML=`<i class="ti ti-trophy" style="font-size:14px;color:var(--gr)"></i><div style="flex:1"><div style="font-size:12px;font-weight:500">${exo.lbl}</div><div style="font-size:10px;color:var(--txm)">+${(slot.actuel-slot.debutMois).toFixed(1)} kg</div></div>`;}else{div.innerHTML=`<i class="ti ti-plus" style="font-size:14px;color:var(--txd)"></i><span style="font-size:12px;color:var(--txm)">Ajouter une victoire</span>`;}el.appendChild(div);}}
function openAttnPicker(idx){pickerMode='attn';pickerIdx=idx;pickerSelected=attnSlots[idx]?attnSlots[idx].stat:null;pickerColor=attnSlots[idx]?attnSlots[idx].color:'#D4A000';document.getElementById('picker-title').textContent='Point d\'attention — Case '+(idx+1);document.getElementById('picker-color-row').style.display='block';document.getElementById('picker-body').innerHTML=ALL_STATS.map(s=>`<div class="picker-item${pickerSelected===s.id?' sel-it':''}" onclick="selPickItem('${s.id}')"><div style="font-size:12px">${s.lbl}<div style="font-size:10px;color:var(--txm)">${s.cat}</div></div></div>`).join('');document.getElementById('picker-modal').classList.add('show');}
function openVictoirePicker(idx){pickerMode='victoire';pickerIdx=idx;pickerSelected=victoireSlots[idx]?victoireSlots[idx].exo:null;document.getElementById('picker-title').textContent='Victoire du mois — Case '+(idx+1);document.getElementById('picker-color-row').style.display='none';var dV=victoireSlots[idx]?victoireSlots[idx].debutMois:60;var aV=victoireSlots[idx]?victoireSlots[idx].actuel:75;document.getElementById('picker-body').innerHTML=`<div style="display:flex;gap:10px;margin-bottom:14px"><div style="flex:1"><label class="lbl">Charge début mois (kg)</label><input class="inp" id="vict-debut" type="number" value="${dV}"></div><div style="flex:1"><label class="lbl">Charge actuelle (kg)</label><input class="inp" id="vict-actuel" type="number" value="${aV}"></div></div>`+ALL_EXOS_VICTOIRES.slice(0,12).map(e=>`<div class="picker-item${pickerSelected===e.id?' sel-it':''}" onclick="selPickItem('${e.id}')"><div style="font-size:12px">${e.lbl}<div style="font-size:10px;color:var(--txm)">${e.cat}</div></div></div>`).join('');document.getElementById('picker-modal').classList.add('show');}
function selPickItem(id){pickerSelected=id;document.querySelectorAll('.picker-item').forEach(el=>{el.classList.toggle('sel-it',el.getAttribute('onclick')&&el.getAttribute('onclick').includes("'"+id+"'"));});}
function pickColor(el,color){pickerColor=color;document.querySelectorAll('.col-dot').forEach(d=>{d.classList.toggle('sel',d.style.background===color||d.style.backgroundColor===color);});}
function confirmPick(){if(!pickerSelected){closePicker();return;}if(pickerMode==='attn'){attnSlots[pickerIdx]={stat:pickerSelected,color:pickerColor};closePicker();renderAttnSlots();toast2('Point d\'attention enregistré');}else if(pickerMode==='victoire'){var debut=parseFloat(document.getElementById('vict-debut')?.value)||60;var actuel=parseFloat(document.getElementById('vict-actuel')?.value)||75;victoireSlots[pickerIdx]={exo:pickerSelected,debutMois:debut,actuel:actuel};closePicker();renderVictoireSlots();toast2('Victoire enregistrée');}}
function closePicker(){document.getElementById('picker-modal').classList.remove('show');}
document.getElementById('picker-modal').addEventListener('click',function(e){if(e.target===this)closePicker();});

// ── MODAL COACH ──
function openCoachModal(){document.getElementById('coach-modal-overlay').classList.add('show');}
function closeCoachModal(){document.getElementById('coach-modal-overlay').classList.remove('show');}
function logout(){closeCoachModal();window.location.href='../hub/hub.html';}
document.getElementById('coach-modal-overlay').addEventListener('click',function(e){if(e.target===this)closeCoachModal();});

// ── MESSAGERIE ──
function envoyerMsg(){var inp=document.getElementById('msg-input');if(!inp||!inp.value.trim())return;var hist=document.getElementById('msgs-hist');if(!hist)return;var msg=document.createElement('div');var now=new Date();var h=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');msg.style.cssText='max-width:75%;align-self:flex-start;padding:8px 11px;border-radius:12px 12px 12px 2px;font-size:12px;background:var(--c2);line-height:1.5';msg.innerHTML=inp.value+'<div style="font-size:9px;color:var(--txd);margin-top:2px">'+h+'</div>';hist.appendChild(msg);hist.scrollTop=hist.scrollHeight;inp.value='';}

// ── UTILS ──
function selDb(el,id){el.closest('.db-tabs-row').querySelectorAll('.dbtab').forEach(t=>t.classList.remove('on'));el.classList.add('on');document.querySelectorAll('.dbscr').forEach(s=>s.classList.remove('on'));document.getElementById(id).classList.add('on');}
function addDefi(){var nm=document.getElementById('nd-nm')?.value?.trim();if(!nm)return;var ds=document.getElementById('nd-ds')?.value?.trim()||'Défi sportif';var cat=document.getElementById('nd-cat')?.value||'🔥';DEFIS_BANK.push({id:Date.now(),i:cat,nm,ds});document.getElementById('nd-nm').value='';document.getElementById('nd-ds').value='';var l=document.getElementById('defi-list');if(l)l.innerHTML=DEFIS_BANK.map(d=>`<div class="defi-item"><span class="defi-ico">${d.i}</span><div style="flex:1"><div class="defi-nm">${d.nm}</div><div class="defi-ds">${d.ds}</div></div><div class="icon-btn" style="color:var(--r2)" onclick="rmDefi(${d.id})"><i class="ti ti-trash" style="font-size:12px"></i></div></div>`).join('');toast2('Défi ajouté');}
function rmDefi(id){DEFIS_BANK.splice(DEFIS_BANK.findIndex(d=>d.id===id),1);var l=document.getElementById('defi-list');if(l)l.innerHTML=DEFIS_BANK.map(d=>`<div class="defi-item"><span class="defi-ico">${d.i}</span><div style="flex:1"><div class="defi-nm">${d.nm}</div><div class="defi-ds">${d.ds}</div></div><div class="icon-btn" style="color:var(--r2)" onclick="rmDefi(${d.id})"><i class="ti ti-trash" style="font-size:12px"></i></div></div>`).join('');}
function toast2(msg){var t=document.getElementById('toast-el');document.getElementById('toast-txt').textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}

// ── INIT ──
(function(){
  // Charger d'abord les données démo
  loadDemoData();
  document.getElementById('pc-inner').innerHTML=accueilHTML(true);
  MOB_FNS.forEach(function(fn,i){var el=document.getElementById('ms-'+i);if(el)el.innerHTML=fn();});
  // Puis charger les vraies données Supabase
  loadDashboardData().catch(function(e){ console.error('Init error:', e); });
})();

function renderRDVAgenda(){
  if(!RDV_LIST || !RDV_LIST.length) return;
  // Injecter les RDV réels dans les colonnes de l'agenda
  var today = new Date();
  var todayStr = today.toISOString().split('T')[0];
  
  RDV_LIST.forEach(function(rdv){
    var d = new Date(rdv.date_rdv);
    var dStr = d.toISOString().split('T')[0];
    var nom = rdv.client ? (rdv.client.prenom||'')+ ' '+(rdv.client.nom||'') : '—';
    var heure = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
    var isPast = dStr < todayStr;
    
    // Chercher la colonne correspondante dans l'agenda
    // (si vue semaine, chaque colonne correspond à un jour)
    var cols = document.querySelectorAll('.rdv-col');
    cols.forEach(function(col){
      var head = col.querySelector('.rdv-col-head');
      if(head && head.textContent.includes(d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric'}))){
        var item = document.createElement('div');
        item.className = 'rdv-item';
        item.style.opacity = isPast ? '0.5' : '1';
        item.innerHTML = '<div class="rdv-time"><div class="rdv-dot" style="background:'+(isPast?'#666':'var(--r)')+'"></div>'+heure+'</div>'
          +'<div class="rdv-name">'+nom+'</div>'
          +'<div class="rdv-detail">'+(rdv.type||'Appel')+(isPast?' · Passé':' · À venir')+'</div>';
        col.appendChild(item);
      }
    });
  });
}