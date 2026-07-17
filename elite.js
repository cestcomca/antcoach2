function getSession(){
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
  var s=getSession();
  return s&&s.access_token ? s.access_token : SB_KEY;
}

// ══ SUPABASE CONFIG ══
var SB_URL='https://uumgpbruxsxskfrvjlzt.supabase.co';
var SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1bWdwYnJ1eHN4c2tmcnZqbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMjY3ODYsImV4cCI6MjA5NzgwMjc4Nn0.T7qiBNtmGPuKhjgd0LobYbbhRz0Yffm0iZ9A8Y4pPJw';
var SB_SESSION=null, SB_PROFILE=null;

function getSession(){
  try{
    // 1. sessionStorage (mis par le hub)
    var t=sessionStorage.getItem('sb_access_token');
    if(t)return {access_token:t, user:{id:sessionStorage.getItem('sb_user_id')}};
    // 2. localStorage SDK v2
    var keys=Object.keys(localStorage);
    for(var i=0;i<keys.length;i++){
      if(keys[i].startsWith('sb-')&&keys[i].endsWith('-auth-token')){
        var s=JSON.parse(localStorage.getItem(keys[i]));
        if(s&&s.access_token)return s;
      }
    }
  }catch(e){}
  return null;
}

async function sbFetch(path){
  var h={'apikey':SB_KEY,'Content-Type':'application/json'};
  if(SB_SESSION)h['Authorization']='Bearer '+SB_SESSION.access_token;
  var r=await fetch(SB_URL+'/rest/v1/'+path,{headers:h});
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
}
async function sbPost(table,data){
  var h={'apikey':SB_KEY,'Content-Type':'application/json','Prefer':'return=representation'};
  if(SB_SESSION)h['Authorization']='Bearer '+SB_SESSION.access_token;
  var r=await fetch(SB_URL+'/rest/v1/'+table,{method:'POST',headers:h,body:JSON.stringify(data)});
  return r.json();
}
async function sbUpsert(table,data,onConflict){
  var h={'apikey':SB_KEY,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'};
  if(SB_SESSION)h['Authorization']='Bearer '+SB_SESSION.access_token;
  var url=SB_URL+'/rest/v1/'+table+(onConflict?'?on_conflict='+onConflict:'');
  var r=await fetch(url,{method:'POST',headers:h,body:JSON.stringify(data)});
  return r.json();
}

async function loadChallengerData(){
  try{
    SB_SESSION=getSession();
    if(!SB_SESSION){console.log('Challenger: pas de session');return;}
    var uid=SB_SESSION.user.id;

    // Profil
    var profiles=await sbFetch('profiles?id=eq.'+uid+'&select=*');
    if(profiles&&profiles[0]){
      SB_PROFILE=profiles[0];
      var p=SB_PROFILE;
      var prenom=p.prenom||'Lucas';
      var nom=p.nom||'';
      var initiales=((prenom[0]||'?')+(nom[0]||'?')).toUpperCase();
      // Mettre à jour le nom dans le profil modal
      var fullName=(prenom+' '+nom).trim();
      var el=document.querySelector('#modal-profil .profil-name');
      if(!el){
        // Mettre à jour les inputs profil directement
        var inps=document.querySelectorAll('#modal-profil input');
        if(inps[0])inps[0].value=prenom;
        if(inps[1])inps[1].value=nom;
        if(inps[2]&&p.email)inps[2].value=p.email;
      }
    }

    // XP et niveau
    var niveaux=await sbFetch('niveaux?client_id=eq.'+uid+'&select=*');
    if(niveaux&&niveaux[0]){
      totalXP=niveaux[0].xp_total||totalXP;
      updateAll();
    }

    // Mensurations
    var mens=await sbFetch('mensurations?client_id=eq.'+uid+'&select=*&order=date_mesure.desc&limit=10');
    if(mens&&mens.length>0){
      var hist=document.getElementById('mens-hist-chall');
      if(hist){
        hist.innerHTML='';
        var mois=['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
        mens.forEach(function(m){
          var d=new Date(m.date_mesure);
          var ds=d.getDate()+' '+mois[d.getMonth()]+' '+d.getFullYear();
          var vals={};
          if(m.tour_bras)vals['Tour de bras']=m.tour_bras;
          if(m.tour_taille)vals['Tour de taille']=m.tour_taille;
          if(m.tour_hanches)vals['Tour de hanches']=m.tour_hanches;
          if(m.tour_cuisse)vals['Tour de cuisse']=m.tour_cuisse;
          if(Object.keys(vals).length){
            var preview=Object.keys(vals).map(function(k){
              return '<div style="display:flex;justify-content:space-between;padding:3px 0">'
                +'<span style="font-size:11px;color:var(--txm)">'+k+'</span>'
                +'<span style="font-size:11px;font-weight:500;color:var(--tx)">'+vals[k]+' cm</span>'
                +'</div>';
            }).join('');
            hist.innerHTML+='<div style="background:var(--c2);border-radius:10px;padding:10px;margin-bottom:8px">'
              +'<div style="font-size:11px;font-weight:500;color:var(--txm);margin-bottom:6px">'+ds+'</div>'
              +preview+'</div>';
          }
        });
      }
    }

    // Pesées
    var pesees=await sbFetch('pesees?client_id=eq.'+uid+'&select=*&order=date_pesee.desc&limit=10');
    if(pesees&&pesees.length>0){
      var list=document.getElementById('pesees-list-c');
      if(list){
        list.innerHTML='';
        var mois2=['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
        pesees.forEach(function(p){
          var d=new Date(p.date_pesee);
          var ds=d.getDate()+' '+mois2[d.getMonth()]+' '+d.getFullYear();
          var row=document.createElement('div');
          row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)';
          row.innerHTML='<span style="font-size:12px">'+ds+'</span><span style="font-size:13px;font-weight:600;color:var(--gr)">'+p.poids_kg+' kg</span>';
          list.appendChild(row);
        });
      }
    }

    // Suivi quotidien du jour
    var today=new Date().toISOString().split('T')[0];
    var suivi=await sbFetch('suivi_quotidien?client_id=eq.'+uid+'&date_suivi=eq.'+today+'&select=*');
    if(suivi&&suivi[0]){
      var s=suivi[0];
      if(s.eau_verres){water=s.eau_verres;document.getElementById('hv-w').textContent=water;}
      if(s.sommeil_h){sleep=s.sommeil_h;document.getElementById('hv-s').textContent=sleep;}
      if(s.pas){steps=s.pas;document.getElementById('hv-p').textContent=steps.toLocaleString('fr');}
      _suiviXpPrev=xpS(sleep)+xpP(steps)+xpE(water);
      updateAll();
    }

    console.log('Challenger Supabase OK');
  }catch(e){console.error('Challenger SB error:',e.message);}
}

// ══ SAUVEGARDE SUPABASE ══
async function saveSuiviToSB(){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  var today=new Date().toISOString().split('T')[0];
  try{await sbUpsert('suivi_quotidien',{client_id:uid,date_suivi:today,eau_verres:water,sommeil_h:sleep,pas:steps},'client_id,date_suivi');}catch(e){}
}

async function savePeseeToSB(date,poids){
  if(!SB_SESSION)return;
  try{await sbPost('pesees',{client_id:SB_SESSION.user.id,date_pesee:date,poids_kg:parseFloat(poids)});}catch(e){}
}

async function saveMensToSB(date,vals){
  if(!SB_SESSION)return;
  var row={client_id:SB_SESSION.user.id,date_mesure:date};
  var map={
    'Tour de bras':'tour_bras','Tour d\'épaules':'tour_epaules',
    'Tour de poitrine':'tour_pecs','Tour de taille':'tour_taille',
    'Tour de hanches':'tour_hanches','Tour de cuisse':'tour_cuisse','Tour de mollet':'tour_mollet'
  };
  Object.keys(vals).forEach(function(k){if(map[k])row[map[k]]=vals[k];});
  try{await sbUpsert('mensurations',row,'client_id,date_mesure');}catch(e){}
}

async function saveXPToSB(){
  if(!SB_SESSION)return;
  try{await sbUpsert('niveaux',{client_id:SB_SESSION.user.id,xp_total:totalXP},'client_id');}catch(e){}
}

// ══ NAVIGATION ══
function goTab(el,id){
  document.querySelectorAll('.bnav .bn').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.scroll .scr').forEach(s=>s.classList.remove('on'));
  var sc=document.getElementById(id);if(sc)sc.classList.add('on');
  var m={'sc-home':'bn-home','sc-prog':'bn-prog','sc-alim':'bn-alim','sc-suivi':'bn-suivi','sc-defis':'bn-defis','sc-prog-seances':'bn-prog'};
  var bn=m[id];if(bn)document.getElementById(bn).classList.add('on');
  updateAll();
}
function goBn(el,id){
  document.querySelectorAll('.bnav .bn').forEach(b=>b.classList.remove('on'));
  if(el)el.classList.add('on');
  document.querySelectorAll('.scroll .scr').forEach(s=>s.classList.remove('on'));
  var sc=document.getElementById(id);if(sc)sc.classList.add('on');
  updateAll();
}
function goStab(el,id){
  document.querySelectorAll('.stabs .stab').forEach(function(t){t.classList.remove('on');});
  el.classList.add('on');
  document.querySelectorAll('.sscr').forEach(function(s){s.classList.remove('on');});
  document.getElementById(id).classList.add('on');
  if(id==='st-mens') renderMensInputsChall();
  if(id==='st-photos') renderPhotoGrid();
}

// ══ MODALS ══
function openModal(id){document.getElementById(id).classList.add('show');}
function closeModal(id){document.getElementById(id).classList.remove('show');}
['modal-profil','modal-resil','modal-upgrade','modal-comp-mens'].forEach(id=>{
  var el=document.getElementById(id);
  if(el)el.addEventListener('click',function(e){if(e.target===this)closeModal(id);});
});

// ══ TOAST ══
function toast(msg){var t=document.getElementById('toast-el');document.getElementById('toast-txt').textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}

// ══ PROGRAMME ══
var currentPlan='ul';
var PLAN_DAYS={
  ul:[
    {id:'ua',lbl:'Jour A · Upper',diag:'upper',muscles:'Pecs · Épaules · Dos · Bras',col:'var(--b)',
     exos:[{n:'Développé couché',d:'4 séries · 8–10 reps · Tempo 3-1-1',sets:4,pr:[9,8,8,7],pk:[72,72,70,68]},{n:'Tirage vertical prise large',d:'4 séries · 8–10 reps',sets:4,pr:[10,9,9,8],pk:[60,60,58,55]},{n:'Développé épaules haltères',d:'3 séries · 10–12 reps',sets:3,pr:[12,11,10],pk:[22,22,20]},{n:'Curl biceps barre',d:'3 séries · 12 reps',sets:3,pr:[12,12,10],pk:[30,30,28]},{n:'Extension triceps câble',d:'3 séries · 12 reps',sets:3,pr:[12,12,10],pk:[25,25,22]}]},
    {id:'la',lbl:'Jour B · Lower',diag:'lower',muscles:'Quadriceps · Ischio · Fessiers · Mollets',col:'var(--r2)',
     exos:[{n:'Squat barre',d:'4 séries · 8 reps · Tempo 3-1-1',sets:4,pr:[8,8,7,6],pk:[80,80,78,75]},{n:'Leg press',d:'3 séries · 12 reps',sets:3,pr:[12,12,10],pk:[120,120,110]},{n:'Leg curl couché',d:'3 séries · 12 reps',sets:3,pr:[12,11,10],pk:[40,40,38]},{n:'Hip thrust haltère',d:'3 séries · 15 reps',sets:3,pr:[15,14,12],pk:[30,30,28]},{n:'Mollets debout',d:'4 séries · 20 reps',sets:4,pr:[20,18,18,15],pk:[50,50,48,45]}]},
    {id:'ub',lbl:'Jour C · Upper',diag:'upper',muscles:'Dos · Biceps · Épaules',col:'var(--b)',
     exos:[{n:'Développé incliné haltères',d:'4 séries · 10 reps',sets:4,pr:[10,10,9,8],pk:[28,28,26,24]},{n:'Rowing haltère',d:'4 séries · 10 reps',sets:4,pr:[10,10,9,8],pk:[36,36,34,32]},{n:'Élévations latérales',d:'3 séries · 15 reps',sets:3,pr:[15,14,12],pk:[10,10,8]},{n:'Curl marteau',d:'3 séries · 12 reps',sets:3,pr:[12,11,10],pk:[18,18,16]},{n:'Dips corps',d:'3 séries · max reps',sets:3,pr:[12,10,8],pk:[0,0,0]}]},
    {id:'lb',lbl:'Jour D · Lower',diag:'lower',muscles:'Ischio · Fessiers · Mollets · Abdos',col:'var(--r2)',
     exos:[{n:'Soulevé de terre roumain',d:'4 séries · 10 reps',sets:4,pr:[10,10,9,8],pk:[75,75,72,70]},{n:'Fentes bulgares',d:'3 séries · 12 reps/jambe',sets:3,pr:[12,11,10],pk:[20,20,18]},{n:'Abducteurs',d:'3 séries · 20 reps',sets:3,pr:[20,18,15],pk:[35,35,30]},{n:'Crunch câble',d:'3 séries · 15 reps',sets:3,pr:[15,14,12],pk:[20,20,18]},{n:'Planche',d:'3 × 1 min',sets:3,pr:[60,55,50],pk:[0,0,0]}]}
  ],
  ppl:[
    {id:'push',lbl:'Push',diag:'push',muscles:'Pectoraux · Épaules · Triceps',col:'var(--b)',
     exos:[{n:'Développé couché',d:'4 séries · 8–10 reps',sets:4,pr:[9,8,8,7],pk:[72,72,70,68]},{n:'Développé incliné haltères',d:'3 séries · 12 reps',sets:3,pr:[11,10,9],pk:[26,26,24]},{n:'Développé militaire',d:'3 séries · 10 reps',sets:3,pr:[10,10,8],pk:[40,40,38]},{n:'Extension triceps câble',d:'3 séries · 15 reps',sets:3,pr:[15,14,12],pk:[25,25,22]}]},
    {id:'pull',lbl:'Pull',diag:'pull',muscles:'Dos · Biceps',col:'rgba(255,140,0,0.9)',
     exos:[{n:'Tractions',d:'4 séries · max reps',sets:4,pr:[10,8,8,6],pk:[0,0,0,0]},{n:'Rowing barre',d:'4 séries · 8 reps',sets:4,pr:[8,8,7,6],pk:[60,60,58,55]},{n:'Tirage serré',d:'3 séries · 12 reps',sets:3,pr:[12,11,10],pk:[55,55,52]},{n:'Curl haltères',d:'3 séries · 12 reps',sets:3,pr:[12,11,10],pk:[14,14,12]}]},
    {id:'leg',lbl:'Leg',diag:'leg',muscles:'Quadriceps · Ischio · Fessiers',col:'var(--gr)',
     exos:[{n:'Squat barre',d:'4 séries · 8 reps',sets:4,pr:[8,8,7,6],pk:[80,80,78,75]},{n:'Leg press',d:'3 séries · 12 reps',sets:3,pr:[12,12,10],pk:[120,120,110]},{n:'Leg curl',d:'3 séries · 12 reps',sets:3,pr:[12,11,10],pk:[40,40,38]},{n:'Hip thrust',d:'3 séries · 15 reps',sets:3,pr:[15,14,12],pk:[30,30,28]}]}
  ],
  fb:[
    {id:'fba',lbl:'Full Body A',diag:'fb',muscles:'Corps entier',col:'var(--gold)',
     exos:[{n:'Squat barre',d:'3 séries · 12 reps',sets:3,pr:[12,11,10],pk:[60,60,58]},{n:'Développé couché',d:'3 séries · 12 reps',sets:3,pr:[12,10,9],pk:[60,60,58]},{n:'Tirage vertical',d:'3 séries · 12 reps',sets:3,pr:[12,11,10],pk:[55,55,52]},{n:'Fentes haltères',d:'3 séries · 12 reps',sets:3,pr:[12,10,10],pk:[18,18,16]},{n:'Planche',d:'3 × 45 sec',sets:3,pr:[45,40,35],pk:[0,0,0]}]},
    {id:'fbb',lbl:'Full Body B',diag:'fb',muscles:'Corps entier',col:'var(--gold)',
     exos:[{n:'Soulevé de terre roumain',d:'3 séries · 10 reps',sets:3,pr:[10,9,8],pk:[60,60,58]},{n:'Développé haltères',d:'3 séries · 12 reps',sets:3,pr:[12,11,10],pk:[22,22,20]},{n:'Rowing haltère',d:'3 séries · 12 reps',sets:3,pr:[12,11,10],pk:[24,24,22]},{n:'Squat gobelet',d:'3 séries · 15 reps',sets:3,pr:[15,14,12],pk:[20,20,18]},{n:'Gainage latéral',d:'3 × 30 sec',sets:3,pr:[30,25,20],pk:[0,0,0]}]}
  ]
};
var SVG_DIAG={
  upper:`<svg viewBox="0 0 100 100" style="width:160px;height:120px"><ellipse cx="50" cy="12" rx="11" ry="11" fill="rgba(255,255,255,0.12)"/><rect x="32" y="25" width="36" height="32" rx="7" fill="rgba(0,191,255,0.55)" stroke="rgba(0,191,255,0.8)" stroke-width="0.7"/><rect x="13" y="27" width="17" height="28" rx="6" fill="rgba(0,191,255,0.5)"/><rect x="70" y="27" width="17" height="28" rx="6" fill="rgba(0,191,255,0.5)"/><rect x="15" y="56" width="13" height="18" rx="4" fill="rgba(0,191,255,0.3)"/><rect x="72" y="56" width="13" height="18" rx="4" fill="rgba(0,191,255,0.3)"/><rect x="34" y="59" width="13" height="32" rx="5" fill="rgba(255,255,255,0.06)"/><rect x="53" y="59" width="13" height="32" rx="5" fill="rgba(255,255,255,0.06)"/></svg>`,
  lower:`<svg viewBox="0 0 100 100" style="width:160px;height:120px"><ellipse cx="50" cy="12" rx="11" ry="11" fill="rgba(255,255,255,0.07)"/><rect x="32" y="25" width="36" height="32" rx="7" fill="rgba(255,255,255,0.06)"/><rect x="13" y="27" width="17" height="28" rx="6" fill="rgba(255,255,255,0.06)"/><rect x="70" y="27" width="17" height="28" rx="6" fill="rgba(255,255,255,0.06)"/><rect x="34" y="57" width="30" height="9" rx="4" fill="rgba(139,0,0,0.4)"/><rect x="34" y="64" width="13" height="30" rx="5" fill="rgba(139,0,0,0.65)" stroke="rgba(200,0,0,0.8)" stroke-width="0.7"/><rect x="53" y="64" width="13" height="30" rx="5" fill="rgba(139,0,0,0.65)" stroke="rgba(200,0,0,0.8)" stroke-width="0.7"/></svg>`,
  push:`<svg viewBox="0 0 100 100" style="width:160px;height:120px"><ellipse cx="50" cy="12" rx="11" ry="11" fill="rgba(255,255,255,0.1)"/><rect x="32" y="25" width="36" height="32" rx="7" fill="rgba(0,191,255,0.55)" stroke="rgba(0,191,255,0.8)" stroke-width="0.7"/><rect x="13" y="27" width="17" height="28" rx="6" fill="rgba(0,191,255,0.45)"/><rect x="70" y="27" width="17" height="28" rx="6" fill="rgba(0,191,255,0.45)"/><rect x="34" y="59" width="13" height="32" rx="5" fill="rgba(255,255,255,0.06)"/><rect x="53" y="59" width="13" height="32" rx="5" fill="rgba(255,255,255,0.06)"/></svg>`,
  pull:`<svg viewBox="0 0 100 100" style="width:160px;height:120px"><ellipse cx="50" cy="12" rx="11" ry="11" fill="rgba(255,255,255,0.1)"/><rect x="32" y="25" width="36" height="32" rx="7" fill="rgba(255,140,0,0.55)" stroke="rgba(255,140,0,0.8)" stroke-width="0.7"/><rect x="13" y="27" width="17" height="28" rx="6" fill="rgba(255,140,0,0.5)"/><rect x="70" y="27" width="17" height="28" rx="6" fill="rgba(255,140,0,0.5)"/><rect x="34" y="59" width="13" height="32" rx="5" fill="rgba(255,255,255,0.06)"/><rect x="53" y="59" width="13" height="32" rx="5" fill="rgba(255,255,255,0.06)"/></svg>`,
  leg:`<svg viewBox="0 0 100 100" style="width:160px;height:120px"><ellipse cx="50" cy="12" rx="11" ry="11" fill="rgba(255,255,255,0.06)"/><rect x="32" y="25" width="36" height="32" rx="7" fill="rgba(255,255,255,0.06)"/><rect x="13" y="27" width="17" height="28" rx="6" fill="rgba(255,255,255,0.06)"/><rect x="70" y="27" width="17" height="28" rx="6" fill="rgba(255,255,255,0.06)"/><rect x="34" y="59" width="13" height="32" rx="5" fill="rgba(76,175,122,0.6)" stroke="rgba(76,175,122,0.8)" stroke-width="0.7"/><rect x="53" y="59" width="13" height="32" rx="5" fill="rgba(76,175,122,0.6)" stroke="rgba(76,175,122,0.8)" stroke-width="0.7"/></svg>`,
  fb:`<svg viewBox="0 0 100 100" style="width:160px;height:120px"><ellipse cx="50" cy="12" rx="11" ry="11" fill="rgba(255,215,0,0.5)"/><rect x="32" y="25" width="36" height="32" rx="7" fill="rgba(255,215,0,0.5)" stroke="rgba(255,215,0,0.8)" stroke-width="0.7"/><rect x="13" y="27" width="17" height="28" rx="6" fill="rgba(255,215,0,0.45)"/><rect x="70" y="27" width="17" height="28" rx="6" fill="rgba(255,215,0,0.45)"/><rect x="34" y="59" width="13" height="32" rx="5" fill="rgba(255,215,0,0.45)"/><rect x="53" y="59" width="13" height="32" rx="5" fill="rgba(255,215,0,0.45)"/></svg>`
};

var seriesDone={};
function selectPlan(p){
  currentPlan=p;
  var all=['fb','ppl','ul'];
  all.forEach(function(k){
    var pc=document.getElementById('pcard-'+k);
    if(pc)pc.classList.toggle('sel',k===p);
    var badge=document.getElementById('pbadge-'+k);
    if(badge)badge.className='pill '+(k===p?'p-on':'p-off');
  });
  buildDayTabs();
  renderSeanceScreen(p, PLAN_DAYS[p][0].id);
  goTab(null,'sc-prog-seances');
  toast('Programme '+(p==='fb'?'Full Body':p==='ppl'?'Push Pull Leg':'Upper/Lower')+' sélectionné');
}

function buildDayTabs(){
  var days=PLAN_DAYS[currentPlan]||[];
  var tc=document.getElementById('day-tabs-seance');
  if(!tc)return;
  tc.innerHTML=days.map(function(d,i){
    return '<button class="dtab'+(i===0?' on':'')+'" id="daytab-'+d.id+'" style="font-size:11px;padding:7px 12px">'+d.lbl+'</button>';
  }).join('');
  days.forEach(function(d,i){
    var btn=document.getElementById('daytab-'+d.id);
    if(btn)(function(dk){btn.addEventListener('click',function(){
      tc.querySelectorAll('.dtab').forEach(function(b){b.classList.remove('on');});
      btn.classList.add('on');
      renderSeanceScreen(currentPlan,dk);
    });})(d.id);
  });
  if(days.length>0) renderSeanceScreen(currentPlan, days[0].id);
}

function selDay(el,dayId){
  el.closest('.day-tabs').querySelectorAll('.dtab').forEach(b=>{b.classList.remove('on');b.style.background='transparent';b.style.borderColor='rgba(255,255,255,0.1)';b.style.color='var(--txm)';});
  el.classList.add('on');el.style.background='var(--r)';el.style.borderColor='var(--r)';el.style.color='#fff';
  document.querySelectorAll('.day-scr').forEach(s=>s.classList.remove('on'));
  document.getElementById(dayId).classList.add('on');
}

function buildExoCard(dayId,i,e){
  var uid=dayId+'-'+i;
  var done=0;for(var s=0;s<e.sets;s++)if(seriesDone[uid+'-'+s])done++;
  var done_all=done===e.sets;
  return`<div class="exo-card${done_all?' open':''}" id="ec-${uid}">
    <div onclick="toggleExo('${uid}')" style="display:flex;align-items:center;justify-content:space-between">
      <div><div class="exo-nm">${e.n}</div><div class="exo-desc">${e.d}</div></div>
      <div style="display:flex;align-items:center;gap:6px">
        <span id="badge-${uid}" class="pill" style="background:${done_all?'var(--succ)':'var(--c3)'};border:0.5px solid ${done_all?'var(--succb)':'var(--c4)'};color:${done_all?'var(--gr)':'var(--txm)'}">${done}/${e.sets}</span>
        <i class="ti ti-chevron-down" style="font-size:13px;color:var(--txm);transition:transform 0.2s" id="chev-${uid}"></i>
      </div>
    </div>
    <div class="exo-detail${done_all?' show':''}" id="det-${uid}">
      <div style="display:grid;grid-template-columns:22px 1fr 1fr 22px;gap:5px;margin-bottom:3px">
        <div></div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:var(--txm);text-align:center">Reps</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:var(--txm);text-align:center">Kg</div><div></div>
      </div>
      ${Array.from({length:e.sets},(_,s)=>{
        var ck=seriesDone[uid+'-'+s];
        return`<div style="display:grid;grid-template-columns:22px 1fr 1fr 22px;gap:5px;align-items:start;padding:6px 0;border-top:0.5px solid rgba(255,255,255,0.05)">
          <div style="width:20px;height:20px;border-radius:50%;background:${ck?'var(--succ)':'var(--c2)'};border:0.5px solid ${ck?'var(--succb)':'var(--c3)'};display:flex;align-items:center;justify-content:center;font-size:9px;color:${ck?'var(--gr)':'var(--txm)'};margin-top:3px">${s+1}</div>
          <div><input class="sinp" type="number" placeholder="—" id="r-${uid}-${s}" value="${ck?ck.r:''}" oninput="autoV('${uid}',${s})" style="${ck?'border-color:var(--succb)':''}"><div class="sprev">préc. ${e.pr[s]}</div></div>
          <div><input class="sinp" type="number" placeholder="—" id="k-${uid}-${s}" value="${ck?ck.k:''}" oninput="autoV('${uid}',${s})" style="${ck?'border-color:var(--succb)':''}"><div class="sprev">préc. ${e.pk[s]} kg</div></div>
          <div onclick="togV('${uid}',${s},${i},'${dayId}')" style="width:22px;height:22px;border-radius:50%;border:0.5px solid ${ck?'var(--succb)':'rgba(255,255,255,0.15)'};background:${ck?'var(--succ)':'transparent'};display:flex;align-items:center;justify-content:center;cursor:pointer;margin-top:3px"><i class="ti ti-check" style="font-size:10px;color:${ck?'var(--gr)':'var(--txd)'}"></i></div>
        </div>`;
      }).join('')}
      <textarea style="width:100%;background:var(--c2);border:0.5px solid rgba(255,255,255,0.07);border-radius:7px;padding:7px 9px;font-size:11px;color:var(--tx);font-family:inherit;outline:none;resize:none;margin-top:8px;" rows="2" placeholder="Note : sensation, douleur..."></textarea>
    </div>
  </div>`;
}

function toggleExo(uid){
  var det=document.getElementById('det-'+uid);var chev=document.getElementById('chev-'+uid);
  if(!det)return;det.classList.toggle('show');
  if(chev)chev.style.transform=det.classList.contains('show')?'rotate(180deg)':'';
}
function autoV(uid,s){
  var r=document.getElementById('r-'+uid+'-'+s);var k=document.getElementById('k-'+uid+'-'+s);
  if(r&&k&&r.value&&k.value)setV(uid,s,true);
}
function togV(uid,s,ei,dayId){setV(uid,s,!seriesDone[uid+'-'+s],ei,dayId);}
function setV(uid,s,v,ei,dayId){
  var key=uid+'-'+s;
  var r=document.getElementById('r-'+uid+'-'+s);var k=document.getElementById('k-'+uid+'-'+s);
  if(v)seriesDone[key]={r:r?r.value:'',k:k?k.value:''};else delete seriesDone[key];
  if(r)r.style.borderColor=v?'var(--succb)':'';
  if(k)k.style.borderColor=v?'var(--succb)':'';
  // update badge
  if(dayId===undefined){var p=uid.split('-');dayId=p.slice(0,-2).join('-');ei=parseInt(p[p.length-2]);}
  var days=PLAN_DAYS[currentPlan];var day=days.find(d=>d.id===dayId);if(!day)return;
  var e=day.exos[ei];if(!e)return;
  var done=0;for(var i=0;i<e.sets;i++)if(seriesDone[uid+'-'+i])done++;
  var b=document.getElementById('badge-'+uid);
  if(b){b.textContent=done+'/'+e.sets;b.style.background=done===e.sets?'var(--succ)':'var(--c3)';b.style.borderColor=done===e.sets?'var(--succb)':'var(--c4)';b.style.color=done===e.sets?'var(--gr)':'var(--txm)';}
}
function validSeance(){totalXP+=2;updateAll();saveXPToSB().catch(function(){});toast('Séance enregistrée ! +2 XP');}

// ══ CHRONO ══
var chSec=0,chRun=false,chInt=null;
function pad(n){return n<10?'0'+n:''+n;}

var timerMode='up',timerTarget=0;

function setTimerMode(mode){
  timerMode=mode;
  var bu=document.getElementById('tt-up');
  var bd=document.getElementById('tt-down');
  if(bu)bu.classList.toggle('on',mode==='up');
  if(bd)bd.classList.toggle('on',mode==='down');
  var row=document.getElementById('timer-input-row');
  if(row)row.style.display=mode==='down'?'block':'none';
  chReset();
}

function setTimerFromInput(){
  var m=parseInt(document.getElementById('timer-min')?.value)||0;
  var s=parseInt(document.getElementById('timer-sec')?.value)||0;
  timerTarget=m*60+s;chSec=timerTarget;
  var el=document.getElementById('ch-t');
  if(el)el.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}

function chToggle(){if(chRun)chPause();else chStart();}
function chStart(){
  if(timerMode==='down'&&chSec===0&&timerTarget>0)chSec=timerTarget;
  chRun=true;
  var btn=document.getElementById('ch-btn');
  var ic=document.getElementById('ch-icon');
  var lb=document.getElementById('ch-label');
  if(ic)ic.className='ti ti-player-pause';
  if(lb)lb.textContent='Pause';
  if(btn)btn.style.background='var(--r2)';
  document.getElementById('ch-t').style.color=timerMode==='down'?'#FFD700':'var(--gold)';
  chInt=setInterval(function(){
    if(timerMode==='up'){chSec++;}
    else{chSec--;if(chSec<=0){chSec=0;chPause();if(navigator.vibrate)navigator.vibrate([300,100,300]);toast('⏰ Timer terminé !');}}
    var el=document.getElementById('ch-t');
    if(el){
      el.textContent=pad(Math.floor(Math.abs(chSec)/60))+':'+pad(Math.abs(chSec)%60);
      if(timerMode==='down')el.style.color=chSec<=10?'#FF4444':'var(--gold)';
    }
  },1000);
}
function chPause(){
  chRun=false;clearInterval(chInt);
  var btn=document.getElementById('ch-btn');
  var ic=document.getElementById('ch-icon');
  var lb=document.getElementById('ch-label');
  if(ic)ic.className='ti ti-player-play';
  if(lb)lb.textContent='Démarrer';
  if(btn)btn.style.background='var(--r)';
}
function chReset(){
  chPause();
  if(timerMode==='down'&&timerTarget>0){chSec=timerTarget;var m=Math.floor(timerTarget/60);var s=timerTarget%60;document.getElementById('ch-t').textContent=pad(m)+':'+pad(s);}
  else{chSec=0;document.getElementById('ch-t').textContent='00:00';}
  document.getElementById('ch-t').style.color='var(--gold)';
}

// ══ HYDRO / XP ══
var water=6,sleep=7,steps=8500,totalXP=80;
var defisChk={};var seanceDone=false;
function adjH(t,n){
  if(t==='w'){water=Math.max(0,Math.min(20,water+n));document.getElementById('hv-w').textContent=water;}
  else if(t==='s'){sleep=Math.max(0,Math.min(12,sleep+n));document.getElementById('hv-s').textContent=sleep;}
  else if(t==='p'){steps=Math.max(0,steps+n);document.getElementById('hv-p').textContent=steps.toLocaleString('fr');}
  applySuiviXP();
  updateAll();
  setTimeout(saveSuiviToSB,500);
}
var _suiviXpPrev=0;
function applySuiviXP(){
  var newSuivi=xpS(sleep)+xpP(steps)+xpE(water);
  var diff=newSuivi-_suiviXpPrev;
  if(diff!==0){totalXP=Math.max(0,totalXP+diff);_suiviXpPrev=newSuivi;}
}
function xpS(h){return Math.min(4,Math.max(0,Math.round(h/8*4)));}
function xpP(s){return Math.min(5,Math.max(0,Math.round(s/10000*5)));}
function xpE(v){return Math.min(5,Math.max(0,Math.round(v/8*5)));}
function getLvl(xp){var l=1,c=0;while(true){var n=l*5+5;if(c+n>xp)return{lvl:l,xpIn:xp-c,need:n};c+=n;l++;}}
function showPop(txt){var p=document.getElementById('xp-pop');document.getElementById('xp-pop-val').textContent=txt;p.classList.add('show');setTimeout(()=>p.classList.remove('show'),1200);}
function setXpV(id,v){var el=document.getElementById(id);if(!el)return;el.textContent=(v>0?'+':'')+v+' XP';el.style.color=v>0?'var(--gold)':'var(--txd)';}
function showLevelUpChallenger(newLvl){
  var phone=document.querySelector('.phone');
  if(!phone) return;
  var pw=phone.offsetWidth||390, ph=phone.offsetHeight||720;
  var overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;z-index:300;pointer-events:none;overflow:hidden;';
  var bg=document.createElement('div');
  bg.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.82);';
  overlay.appendChild(bg);
  var canvas=document.createElement('canvas');
  canvas.width=pw;canvas.height=ph;
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;';
  overlay.appendChild(canvas);
  var txt=document.createElement('div');
  txt.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;';
  txt.innerHTML='<div style="font-size:18px;letter-spacing:4px;color:rgba(255,215,0,0.7);margin-bottom:8px;text-shadow:0 0 20px rgba(255,215,0,0.5);font-family:\'Bebas Neue\',sans-serif">NIVEAU ATTEINT</div>'
    +'<div style="font-size:80px;letter-spacing:2px;color:#FFD700;text-shadow:0 0 30px rgba(255,215,0,1),0 0 60px rgba(255,215,0,0.6);line-height:1;font-family:\'Bebas Neue\',sans-serif">'+newLvl+'</div>'
    +'<div style="font-size:16px;letter-spacing:3px;color:rgba(255,215,0,0.8);margin-top:6px;text-shadow:0 0 15px rgba(255,215,0,0.6);font-family:\'Bebas Neue\',sans-serif">FÉLICITATIONS !</div>';
  overlay.appendChild(txt);
  phone.appendChild(overlay);

  var ctx=canvas.getContext('2d');
  var particles=[];
  var colors=['#FFD700','#00BFFF','#4CAF7A','#FF4444','#FF9500','#FF00FF','#00FFFF','#ffffff'];
  var cx=pw/2, cy=ph/2;
  for(var i=0;i<120;i++){
    var angle=Math.random()*Math.PI*2;
    var speed=2+Math.random()*6;
    particles.push({
      x:cx,y:cy,
      vx:Math.cos(angle)*speed,
      vy:Math.sin(angle)*speed-2,
      size:2+Math.random()*5,
      color:colors[Math.floor(Math.random()*colors.length)],
      alpha:1, gravity:0.15, decay:0.012+Math.random()*0.008
    });
  }
  var startTime=Date.now();
  var animId;
  function animate(){
    var elapsed=Date.now()-startTime;
    if(elapsed>2800){
      cancelAnimationFrame(animId);
      if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
      return;
    }
    ctx.clearRect(0,0,pw,ph);
    for(var j=0;j<particles.length;j++){
      var p=particles[j];
      if(p.alpha<=0) continue;
      p.x+=p.vx; p.y+=p.vy; p.vy+=p.gravity; p.vx*=0.99; p.alpha-=p.decay;
      ctx.save();
      ctx.globalAlpha=Math.max(0,p.alpha);
      ctx.shadowBlur=p.size*3; ctx.shadowColor=p.color; ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    animId=requestAnimationFrame(animate);
  }
  animate();
}

var lastLvl=null;
function updateAll(){
  var bs=xpS(sleep),bp=xpP(steps),bw=xpE(water);
  var done=Object.keys(defisChk).filter(k=>defisChk[k]).length;
  var todayXP=done*2+(done===5?10:0)+bs+bp+bw;
  var info=getLvl(totalXP);var pct=Math.round(info.xpIn/info.need*100);
  if(lastLvl!==null && info.lvl>lastLvl){ showLevelUpChallenger(info.lvl); }
  lastLvl=info.lvl;
  document.getElementById('lh-num').textContent=info.lvl;
  document.getElementById('xp-fill').style.width=pct+'%';
  document.getElementById('xp-cur').textContent=info.xpIn+' XP';
  document.getElementById('xp-need').textContent='niv.'+(info.lvl+1)+' : '+info.need+' XP';
  document.getElementById('xp-today').textContent=todayXP;
  document.getElementById('home-xp').textContent=totalXP;
  document.getElementById('mini-lvl').textContent=info.lvl;
  document.getElementById('mini-xp-cur').textContent=info.xpIn+' XP';
  document.getElementById('mini-xp-need').textContent='niv.'+(info.lvl+1)+' : '+info.need+' XP';
  document.getElementById('mini-bar').style.width=pct+'%';
  document.getElementById('xp-count').textContent=todayXP;
  document.getElementById('home-defis').innerHTML=done+'<span style="font-size:12px;color:var(--txm)">/5</span>';
  document.getElementById('defis-done-count').textContent=done;
  document.getElementById('b-sleep-d').textContent=sleep+'h';
  document.getElementById('b-steps-d').textContent=steps.toLocaleString('fr');
  document.getElementById('b-water-d').textContent=water+' verres';
  setXpV('b-seance',seanceDone?2:0);setXpV('b-sleep',bs);setXpV('b-steps',bp);setXpV('b-water',bw);
}

// ══ DÉFIS ══
var DEFIS=[{id:1,i:'🔥',nm:'20 burpees',ds:"D'une traite"},{id:2,i:'🏃',nm:'1 km de course',ds:'Extérieur ou tapis'},{id:3,i:'💪',nm:'100 pompes',ds:'En plusieurs fois'},{id:4,i:'🦵',nm:'50 squats',ds:'Sans charge'},{id:5,i:'🧱',nm:'5 min de gainage',ds:'Planche ou variantes'},{id:6,i:'🙌',nm:'30 tractions',ds:'En plusieurs séries'},{id:7,i:'👟',nm:'2 km marche rapide',ds:'Marche active'},{id:8,i:'⚡',nm:'200 sauts corde',ds:'Jumping jacks'},{id:9,i:'🔄',nm:'Mobilité 10 min',ds:'Hanches, épaules'},{id:10,i:'🚀',nm:'Sprint 10×50m',ds:'1 min récup'},{id:11,i:'💺',nm:'3 séries dips max',ds:'2 min repos'},{id:12,i:'🎯',nm:'Circuit abdos 15 min',ds:'Crunch, relevé, gainage'}];
var todayDefis=[];var lastDate='';
function pickDefis(){var d=new Date();var ds=d.toDateString();if(ds===lastDate)return;lastDate=ds;var seed=d.getFullYear()*10000+d.getMonth()*100+d.getDate();var arr=DEFIS.slice();for(var i=arr.length-1;i>0;i--){seed=(seed*1664525+1013904223)&0xffffffff;var j=Math.abs(seed)%(i+1);var tmp=arr[i];arr[i]=arr[j];arr[j]=tmp;}todayDefis=arr.slice(0,5);defisChk={};}
function renderDefis(){
  pickDefis();
  var cont=document.getElementById('defis-cont');if(!cont)return;
  cont.innerHTML=todayDefis.map(function(d){
    var ck=defisChk[d.id];
    return'<div class="defi-card'+(ck?' done':'')+'" onclick="togDefi('+d.id+')">'
      +'<span class="defi-ico">'+d.i+'</span>'
      +'<div style="flex:1"><div class="defi-nm">'+d.nm+'</div><div class="defi-ds">'+d.ds+'</div></div>'
      +'<span class="defi-xp">+2 XP</span>'
      +'<div class="defi-chk'+(ck?' ok':'')+'"><i class="ti ti-check" style="font-size:10px;color:'+(ck?'var(--gr)':'var(--txd)')+'"></i></div>'
      +'</div>';
  }).join('');
  var n=new Date();var jrs=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];var mois=['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];var el=document.getElementById('defi-date');if(el)el.textContent=jrs[n.getDay()]+' '+n.getDate()+' '+mois[n.getMonth()]+' '+n.getFullYear();
}
function togDefi(id){var was=defisChk[id];defisChk[id]=!was;totalXP=Math.max(0,totalXP+(was?-2:2));if(!was)showPop('+2');var done=Object.keys(defisChk).filter(k=>defisChk[k]).length;if(!was&&done===5){totalXP+=10;showPop('+10 BONUS');}else if(was&&done===4)totalXP=Math.max(0,totalXP-10);renderDefis();updateAll();saveXPToSB().catch(function(){});}

// ══ PHOTOS ══

// ══ PESÉES ══
(function(){var d=new Date();var el=document.getElementById('pesee-date');if(el)el.value=d.toISOString().split('T')[0];})();
function addPesee(){
  var date=document.getElementById('pesee-date').value;var val=document.getElementById('pesee-val').value;
  if(!date||!val){toast('Remplis la date et le poids');return;}
  var d=new Date(date);var mois=['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  var ds=d.getDate()+' '+mois[d.getMonth()]+' '+d.getFullYear();
  var list=document.getElementById('pesees-list');
  var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)';
  row.innerHTML='<span style="font-size:12px">'+ds+'</span><span style="font-size:13px;font-weight:500">'+parseFloat(val).toFixed(1)+' kg</span>';
  list.insertBefore(row,list.firstChild);
  document.getElementById('pesee-val-c').value='';
  toast('Pesée enregistrée');
}

// ══ DÉCONNEXION ══
function logout(){closeModal('modal-profil');window.location.href='ant_coach_hub.html';}


// ── ÉCRAN SÉANCE CHALLENGER ──
window.renderSeanceScreen = function(plan, dayId){
  var days = PLAN_DAYS[plan];
  var day = days.find(function(d){return d.id===dayId;}) || days[0];

  // Titre
  var titleEl = document.getElementById('seance-title');
  if(titleEl) titleEl.textContent = day.lbl + ' — ' + day.muscles;

  // Diagramme
  var diagEl = document.getElementById('seance-diag');
  if(diagEl){
    diagEl.innerHTML = (SVG_DIAG[day.diag]||'') + '<div style="font-size:9px;text-transform:uppercase;letter-spacing:0.7px;color:'+day.col+';margin-top:4px">'+day.muscles+'</div>';
  }

  // Tabs jours
  var tc = document.getElementById('day-tabs-seance');
  if(tc){
    tc.innerHTML = days.map(function(d){
      var act = d.id===dayId;
      return '<button class="dtab'+(act?' on':'')+'" data-plan="'+plan+'" data-day="'+d.id+'" style="'+(act?'background:var(--r);border-color:var(--r);color:#fff':'')+'">'+d.lbl+'</button>';
    }).join('');
    Array.from(tc.querySelectorAll('.dtab')).forEach(function(btn){
      btn.addEventListener('click', function(){
        renderSeanceScreen(this.getAttribute('data-plan'), this.getAttribute('data-day'));
      });
    });
  }

  // Exercices
  var ec = document.getElementById('seance-exos');
  if(ec){
    ec.innerHTML = buildSeanceDayHTML(plan, dayId);
    bindSeanceEvents();
  }
};

function buildSeanceDayHTML(plan, dayId){
  var days=PLAN_DAYS[plan];
  var day=days.find(function(d){return d.id===dayId;});
  if(!day)return '';
  var html='';
  day.exos.forEach(function(e,i){
    var uid=dayId+'-'+i;
    var done=0;for(var s2=0;s2<e.sets;s2++)if(seriesDone[uid+'-'+s2])done++;
    var allDone=done===e.sets;
    html+='<div class="exo-card'+(allDone?' open':'')+'" id="ec-'+uid+'">';
    html+='<div class="exo-toggle" data-uid="'+uid+'" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">';
    html+='<div><div class="exo-nm">'+e.n+'</div><div class="exo-desc">'+e.d+'</div></div>';
    html+='<div style="display:flex;align-items:center;gap:6px">';
    html+='<span id="badge-'+uid+'" class="pill" style="background:'+(allDone?'var(--succ)':'var(--c3)')+';border:0.5px solid '+(allDone?'var(--succb)':'var(--c4)')+';color:'+(allDone?'var(--gr)':'var(--txm)')+'">'+done+'/'+e.sets+'</span>';
    html+='<i class="ti ti-chevron-down" style="font-size:13px;color:var(--txm)" id="chev-'+uid+'"></i>';
    html+='</div></div>';
    html+='<div class="exo-detail'+(allDone?' show':'')+'" id="det-'+uid+'">';
    html+='<div style="display:grid;grid-template-columns:22px 1fr 1fr 22px;gap:5px;margin-bottom:3px">';
    html+='<div></div><div style="font-size:9px;text-transform:uppercase;color:var(--txm);text-align:center">Reps</div>';
    html+='<div style="font-size:9px;text-transform:uppercase;color:var(--txm);text-align:center">Kg</div><div></div></div>';
    for(var s=0;s<e.sets;s++){
      var ck=seriesDone[uid+'-'+s];
      html+='<div style="display:grid;grid-template-columns:22px 1fr 1fr 22px;gap:5px;align-items:start;padding:6px 0;border-top:0.5px solid rgba(255,255,255,0.05)">';
      html+='<div style="width:20px;height:20px;border-radius:50%;background:'+(ck?'var(--succ)':'var(--c2)')+';border:0.5px solid '+(ck?'var(--succb)':'var(--c3)')+';display:flex;align-items:center;justify-content:center;font-size:9px;color:'+(ck?'var(--gr)':'var(--txm)')+';margin-top:3px">'+(s+1)+'</div>';
      html+='<div><input class="sinp" type="number" placeholder="\u2014" id="r-'+uid+'-'+s+'" value="'+(ck?ck.r:'')+'" data-uid="'+uid+'" data-s="'+s+'"><div class="sprev">pr\u00e9c. '+e.pr[s]+'</div></div>';
      html+='<div><input class="sinp" type="number" placeholder="\u2014" id="k-'+uid+'-'+s+'" value="'+(ck?ck.k:'')+'" data-uid="'+uid+'" data-s="'+s+'"><div class="sprev">pr\u00e9c. '+e.pk[s]+' kg</div></div>';
      html+='<div class="scheck-btn" data-uid="'+uid+'" data-s="'+s+'" data-i="'+i+'" data-day="'+dayId+'" style="width:22px;height:22px;border-radius:50%;border:0.5px solid '+(ck?'var(--succb)':'rgba(255,255,255,0.15)')+';background:'+(ck?'var(--succ)':'transparent')+';display:flex;align-items:center;justify-content:center;cursor:pointer;margin-top:3px"><i class="ti ti-check" style="font-size:10px;color:'+(ck?'var(--gr)':'var(--txd)')+'"></i></div>';
      html+='</div>';
    }
    html+='</div></div>';
  });
  return html;
}

function bindSeanceEvents(){
  var ec = document.getElementById('seance-exos');
  if(!ec) return;
  ec.querySelectorAll('.exo-toggle').forEach(function(el){
    el.addEventListener('click', function(){ toggleExo(this.getAttribute('data-uid')); });
  });
  ec.querySelectorAll('.sinp').forEach(function(inp){
    inp.addEventListener('input', function(){ autoV(this.getAttribute('data-uid'), parseInt(this.getAttribute('data-s'))); });
  });
  ec.querySelectorAll('.scheck-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      togV(this.getAttribute('data-uid'), parseInt(this.getAttribute('data-s')), parseInt(this.getAttribute('data-i')), this.getAttribute('data-day'));
    });
  });
}

window.validSeanceCh = function(){
  totalXP+=2; updateAll(); toast('Séance enregistrée ! +2 XP');
};




// ══ THÈME + TAILLE POLICE ══
var darkTheme = true;
var fontSize = 14;

function applyTheme(dark){
  darkTheme = dark;
  var r = document.documentElement.style;
  if(dark){
    r.setProperty('--bg','#0A0A0A');
    r.setProperty('--c1','#141414');
    r.setProperty('--c2','#1C1C1C');
    r.setProperty('--c3','#242424');
    r.setProperty('--tx','#F5F5F5');
    r.setProperty('--txm','#888');
    r.setProperty('--txd','#444');
    r.setProperty('--r','#8B0000');
    r.setProperty('--r2','#A50000');
    r.setProperty('--rl','rgba(139,0,0,0.12)');
    r.setProperty('--rb','rgba(139,0,0,0.28)');
    r.setProperty('--b','#00BFFF');
    r.setProperty('--bl','rgba(0,191,255,0.09)');
    r.setProperty('--bb','rgba(0,191,255,0.28)');
    r.setProperty('--gold','#FFD700');
    r.setProperty('--gr','#4CAF7A');
    r.setProperty('--or','#E8953A');
    document.body.style.background = '#0A0A0A';
  } else {
    // MODE CLAIR — contrastes forts, accessible
    r.setProperty('--bg','#F2F3F5');
    r.setProperty('--c1','#FFFFFF');
    r.setProperty('--c2','#E8EAED');
    r.setProperty('--c3','#D8DADD');
    r.setProperty('--tx','#111111');
    r.setProperty('--txm','#444444');
    r.setProperty('--txd','#888888');
    r.setProperty('--r','#B00020');
    r.setProperty('--r2','#C0002A');
    r.setProperty('--rl','rgba(176,0,32,0.08)');
    r.setProperty('--rb','rgba(176,0,32,0.25)');
    r.setProperty('--b','#0077CC');
    r.setProperty('--bl','rgba(0,119,204,0.08)');
    r.setProperty('--bb','rgba(0,119,204,0.3)');
    r.setProperty('--gold','#B8860B');
    r.setProperty('--gr','#2E7D4F');
    r.setProperty('--or','#C0620A');
    document.body.style.background = '#F2F3F5';
  }
  // Update boutons thème
  var btnD = document.getElementById('theme-dark-btn');
  var btnL = document.getElementById('theme-light-btn');
  if(btnD){ btnD.style.background=dark?'var(--r)':'transparent'; btnD.style.color=dark?'#fff':'var(--txm)'; btnD.style.border=dark?'none':'0.5px solid rgba(0,0,0,0.1)'; }
  if(btnL){ btnL.style.background=!dark?'var(--r)':'transparent'; btnL.style.color=!dark?'#fff':'var(--txm)'; btnL.style.border=!dark?'none':'0.5px solid rgba(0,0,0,0.1)'; }
}

function applyFontSize(size){
  fontSize = Math.min(20, Math.max(10, size));
  // Appliquer font-size sur le phone entier via CSS custom property
  var phone = document.querySelector('.phone') || document.body;
  phone.style.setProperty('font-size', fontSize+'px', 'important');
  // Forcer tous les éléments à hériter
  var style = document.getElementById('dynamic-font-style');
  if(!style){ style = document.createElement('style'); style.id='dynamic-font-style'; document.head.appendChild(style); }
  style.textContent = '.scroll, .scroll * { font-size: inherit !important; }';
  phone.style.fontSize = fontSize+'px';
  // Update UI
  var el = document.getElementById('font-size-display');
  if(el) el.textContent = fontSize+'px';
  var bar = document.getElementById('font-bar');
  if(bar) bar.style.width = ((fontSize-10)/10*100)+'%';
}

function changeFontSize(delta){
  var newSize = Math.min(20, Math.max(10, fontSize + delta));
  applyFontSize(newSize);
}

function changerMdp(){
  var actuel = document.getElementById('pwd-actuel')?.value?.trim();
  var nouveau = document.getElementById('pwd-nouveau')?.value?.trim();
  if(!actuel || !nouveau){
    toast('Remplis les deux champs');
    return;
  }
  if(nouveau.length < 6){
    toast('Mot de passe trop court (min. 6 caractères)');
    return;
  }
  // Appel Supabase updateUser
  if(typeof supabase !== 'undefined'){
    supabase.auth.updateUser({password: nouveau}).then(function(res){
      if(res.error){ toast('Erreur : ' + res.error.message); }
      else {
        document.getElementById('pwd-actuel').value = '';
        document.getElementById('pwd-nouveau').value = '';
        toast('Mot de passe mis à jour ✓');
      }
    });
  } else {
    document.getElementById('pwd-actuel').value = '';
    document.getElementById('pwd-nouveau').value = '';
    toast('Mot de passe mis à jour ✓');
  }
}

// Init params visuels
(function(){
  var bar = document.getElementById('font-bar');
  if(bar) bar.style.width = ((fontSize-10)/10*100)+'%';
  var el = document.getElementById('font-size-display');
  if(el) el.textContent = fontSize+'px';
})();


// ══ PHOTOS ══
var photosData=[
  {id:1,lbl:'Face',src:null,date:null},
  {id:2,lbl:'Profil',src:null,date:null},
  {id:3,lbl:'Dos',src:null,date:null}
];
var photoSel=[];
var photoCounter=3;

function renderPhotoGrid(){
  var grid=document.getElementById('photo-grid-cont');if(!grid)return;
  var html='';
  photosData.forEach(function(p){
    var sel=photoSel.indexOf(p.id)>-1;
    var selIdx=photoSel.indexOf(p.id);
    html+='<div class="photo-slot'+(sel?' sel':'')+'" id="ph-'+p.id+'" onclick="selPhoto('+p.id+')">';
    if(p.src){
      html+='<img src="'+p.src+'">';
      if(sel) html+='<div class="ph-sel-badge">'+(selIdx+1)+'</div>';
      html+='<button class="ph-del" onclick="event.stopPropagation();deletePhoto('+p.id+')"><i class="ti ti-x" style="font-size:9px;color:#fff"></i></button>';
    } else {
      html+='<i class="ti ti-camera" style="font-size:18px;color:var(--txd)"></i>';
    }
    html+='<div class="ph-lbl">'+p.lbl+(p.date?' · '+p.date:'')+'</div></div>';
  });
  html+='<div class="photo-slot" onclick="openPhotoModalC()" style="border:0.5px dashed rgba(255,255,255,0.15)"><i class="ti ti-plus" style="font-size:20px;color:var(--txd)"></i><div class="ph-lbl">Ajouter</div></div>';
  grid.innerHTML=html;
  updateComparatif();
}

function selPhoto(id){
  var idx=photoSel.indexOf(id);
  if(idx>-1){photoSel.splice(idx,1);}
  else{if(photoSel.length>=2)photoSel.shift();photoSel.push(id);}
  renderPhotoGrid();
  updateComparatif();
}

function deletePhoto(id){
  var p=photosData.find(function(x){return x.id===id;});
  if(p){p.src=null;p.date=null;}
  photoSel=photoSel.filter(function(x){return x!==id;});
  renderPhotoGrid();
  updateComparatif();
}

function updateComparatif(){
  function setComp(sel,imgId,iconId,lblId,fallback){
    var imgEl=document.getElementById(imgId);
    var iconEl=document.getElementById(iconId);
    var lblEl=document.getElementById(lblId);
    if(!sel){if(imgEl)imgEl.style.display='none';if(iconEl)iconEl.style.display='block';if(lblEl)lblEl.textContent=fallback;return;}
    var p=photosData.find(function(x){return x.id===sel;});
    if(!p)return;
    if(lblEl)lblEl.textContent=p.lbl+(p.date?' · '+p.date:'');
    if(p.src){if(imgEl){imgEl.src=p.src;imgEl.style.display='block';}if(iconEl)iconEl.style.display='none';}
    else{if(imgEl)imgEl.style.display='none';if(iconEl)iconEl.style.display='block';}
  }
  setComp(photoSel[0],'comp-img-a','comp-icon-a','ca-lbl','Avant');
  setComp(photoSel[1],'comp-img-b','comp-icon-b','cb-lbl','Après');
}

function openPhotoModalC(){var m=document.getElementById('modal-photo');if(m){m.style.display='flex';}else{document.getElementById('photo-file-input-c').click();}}
function handlePhotoFileC(e){
  var file=e.target.files&&e.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(ev){
    var mois=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
    var now=new Date();
    var dateStr=now.getDate()+' '+mois[now.getMonth()]+' '+now.getFullYear();
    var empty=photosData.find(function(p){return !p.src;});
    if(empty){empty.src=ev.target.result;empty.date=dateStr;}
    else{photoCounter++;photosData.push({id:photoCounter,lbl:'Photo '+photoCounter,src:ev.target.result,date:dateStr});}
    renderPhotoGrid();
  };
  reader.readAsDataURL(file);e.target.value='';
}


// ══ SUIVI QUOTIDIEN CHALLENGER — reset minuit + historique ══
var SUIVI_HISTO=[];
var suiviGraphMode='eau';

function initSuiviChallenger(){
  var today=new Date().toISOString().split('T')[0];
  var savedDate=localStorage.getItem('chall_suivi_date');
  if(savedDate && savedDate!==today){
    var pEau=water||0;
    var pSomm=sleep||0;
    var pPas=steps||0;
    if(pEau>0||pSomm>0||pPas>0){
      try{var h=JSON.parse(localStorage.getItem('chall_suivi_histo')||'[]');h.unshift({date:savedDate,eau:pEau,sommeil:pSomm,pas:pPas});if(h.length>30)h.pop();localStorage.setItem('chall_suivi_histo',JSON.stringify(h));SUIVI_HISTO=h;}catch(e){}
    }
    water=0;sleep=0;steps=0;
    document.getElementById('hv-w').textContent='0';
    document.getElementById('hv-s').textContent='0';
    document.getElementById('hv-p').textContent='0';
    _suiviXpPrev=0;
  }
  localStorage.setItem('chall_suivi_date',today);
  try{SUIVI_HISTO=JSON.parse(localStorage.getItem('chall_suivi_histo')||'[]');}catch(e){}
  renderSuiviGraph();
}

function renderSuiviGraph(){
  var cont=document.getElementById('suivi-graph-cont');if(!cont)return;
  var data=SUIVI_HISTO.slice(0,14).reverse();
  if(!data.length){
    cont.innerHTML='<div class="graph-empty">Le graphe se remplira jour après jour 📈</div>';
    return;
  }
  var key=suiviGraphMode;
  var maxObj={eau:8,sommeil:8,pas:10000}[key]||10;
  var colorCls={eau:'',sommeil:'gr',pas:'go'}[key]||'';
  var unit={eau:'verres',sommeil:'h',pas:'pas'}[key]||'';
  var icon={eau:'💧',sommeil:'😴',pas:'👟'}[key]||'';
  var vals=data.map(function(d){return d[key]||0;});
  var maxData=Math.max.apply(null,vals.concat([maxObj]))||1;
  var avg=Math.round(vals.reduce(function(s,v){return s+v;},0)/vals.length*10)/10;
  var pctAvg=Math.min(100,Math.round(avg/maxObj*100));
  var bars=vals.map(function(v,i){
    var h=Math.max(3,Math.round(v/maxData*68));
    var atGoal=v>=maxObj;
    var dd=new Date(data[i].date);
    var tip=(dd.getDate())+'/'+(dd.getMonth()+1)+' : '+v+' '+unit;
    return'<div class="gb'+(colorCls?' '+colorCls:'')+'" style="height:'+h+'px'+(atGoal?';opacity:1':';opacity:0.6')+'" title="'+tip+'"><div class="gb-line"></div></div>';
  }).join('');
  var n=data.length;
  var idxs=[0,Math.floor(n/2),n-1].filter(function(x,i,a){return a.indexOf(x)===i;});
  var lbls=idxs.map(function(i){var dd=new Date(data[i].date);return'<span>'+(dd.getDate())+'/'+(dd.getMonth()+1)+'</span>';}).join('');
  cont.innerHTML=
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    +'<div style="font-size:11px;color:var(--txm)">Moy. <b style="color:var(--tx)">'+avg+' '+unit+'</b> / jour</div>'
    +'<div style="font-size:11px;color:var(--txm)">Objectif <b style="color:var(--tx)">'+maxObj+' '+unit+'</b></div>'
    +'</div>'
    +'<div style="background:rgba(255,255,255,0.05);border-radius:4px;height:3px;margin-bottom:10px;overflow:hidden">'
    +'<div style="height:100%;width:'+pctAvg+'%;background:var(--gr);border-radius:4px;transition:width 0.5s"></div>'
    +'</div>'
    +'<div class="graph-bars">'+bars+'</div>'
    +'<div class="graph-axis">'+lbls+'</div>'
    +'<div style="font-size:9px;color:var(--txd);text-align:center;margin-top:6px">'+icon+' '+n+' derniers jours enregistrés</div>';
}

function setSuiviGraphMode(mode){
  suiviGraphMode=mode;
  ['eau','sommeil','pas'].forEach(function(m){
    var btn=document.getElementById('sgt-'+m);
    if(btn)btn.classList.toggle('on',m===mode);
  });
  renderSuiviGraph();
}


function addPeseeChall(){
  var date=document.getElementById('pesee-date-c')?.value;
  var val=document.getElementById('pesee-val-c')?.value;
  if(!date||!val){toast('Remplis date et poids');return;}
  var mois=['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  var d=new Date(date);var ds=d.getDate()+' '+mois[d.getMonth()]+' '+d.getFullYear();
  var list=document.getElementById('pesees-list');
  if(list){var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)';row.innerHTML='<span style="font-size:12px">'+ds+'</span><span style="font-size:13px;font-weight:600;color:var(--gr)">'+parseFloat(val).toFixed(1)+' kg</span>';list.insertBefore(row,list.firstChild);}
  document.getElementById('pesee-val-c').value='';
  savePeseeToSB(date, val).catch(function(){});
  toast('Pesée enregistrée ✓');
}

var MUSCLES_CHALL=[{id:'bras',lbl:'Tour de bras'},{id:'epaules',lbl:"Tour d'épaules"},{id:'pecs',lbl:'Tour de poitrine'},{id:'taille',lbl:'Tour de taille'},{id:'hanches',lbl:'Tour de hanches'},{id:'cuisse',lbl:'Tour de cuisse'},{id:'mollet',lbl:'Tour de mollet'}];
function renderMensInputsChall(){
  var el=document.getElementById('mens-inputs-chall');if(!el)return;
  el.innerHTML=MUSCLES_CHALL.map(function(m){
    return'<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)">'
      +'<span style="font-size:12px;color:var(--tx)">'+m.lbl+'</span>'
      +'<div style="display:flex;align-items:center;gap:6px">'
      +'<input type="number" id="mc-'+m.id+'" placeholder="—" style="width:68px;background:var(--c2);border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 8px;font-size:13px;font-weight:500;color:var(--tx);font-family:inherit;outline:none;text-align:center;">'
      +'<span style="font-size:10px;color:var(--txm);width:18px">cm</span>'
      +'</div></div>';
  }).join('');
}

function saveMensChall(){
  var date=document.getElementById('mens-date-c')?.value||(new Date().toISOString().split('T')[0]);
  var vals={};MUSCLES_CHALL.forEach(function(m){var inp=document.getElementById('mc-'+m.id);if(inp&&inp.value)vals[m.lbl]=parseFloat(inp.value);});
  if(!Object.keys(vals).length){toast('Remplis au moins une mesure');return;}
  MUSCLES_CHALL.forEach(function(m){var inp=document.getElementById('mc-'+m.id);if(inp)inp.value='';});
  var hist=document.getElementById('mens-hist-chall');
  if(hist){
    var mois=['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
    var dd=new Date(date);var ds=dd.getDate()+' '+mois[dd.getMonth()]+' '+dd.getFullYear();
    var preview=Object.keys(vals).slice(0,4).map(function(k){
      return'<div style="display:flex;justify-content:space-between;padding:3px 0">'
        +'<span style="font-size:11px;color:var(--txm)">'+k+'</span>'
        +'<span style="font-size:11px;font-weight:500;color:var(--tx)">'+vals[k]+' cm</span>'
        +'</div>';
    }).join('');
    var entry='<div style="background:var(--c2);border-radius:10px;padding:10px;margin-bottom:8px">'
      +'<div style="font-size:11px;font-weight:500;color:var(--txm);margin-bottom:6px">'+ds+'</div>'
      +preview+'</div>';
    if(hist.querySelector('[style*="Aucune"]')) hist.innerHTML='';
    hist.innerHTML=entry+hist.innerHTML;
  }
  saveMensToSB(date, vals).catch(function(){});
  toast('Mensurations enregistrées ✓');
}

function demanderCorrectionC(){
  var exo=document.getElementById('correction-exo-c')?.value?.trim()||'';
  if(!exo){toast('Indique un exercice');return;}
  var ei=document.getElementById('correction-exo-c');var ni=document.getElementById('correction-note-c');
  if(ei)ei.value='';if(ni)ni.value='';
  toast('Demande envoyée ✓');
}

function envoyerMsgC(){
  var inp=document.getElementById('msg-input-c');if(!inp||!inp.value.trim())return;
  var thread=document.getElementById('msg-thread-c');if(!thread)return;
  var msg=document.createElement('div');
  var now=new Date();var h=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  msg.className='bubble me';msg.innerHTML=inp.value+'<div class="bubble-time">'+h+'</div>';
  thread.appendChild(msg);thread.scrollTop=thread.scrollHeight;
  inp.value='';
}


function showFelicitations(xp){
  var phone=document.querySelector('.phone');if(!phone)return;
  var pw=phone.offsetWidth||390,ph=phone.offsetHeight||720;
  var overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;z-index:300;pointer-events:none;overflow:hidden;';
  var bg=document.createElement('div');
  bg.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.85);';
  overlay.appendChild(bg);
  var canvas=document.createElement('canvas');
  canvas.width=pw;canvas.height=ph;
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;';
  overlay.appendChild(canvas);
  var txt=document.createElement('div');
  txt.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;';
  txt.innerHTML='<div style="font-size:44px;margin-bottom:10px">🔥</div>'
    +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:36px;letter-spacing:3px;color:#FFD700;text-shadow:0 0 20px rgba(255,215,0,1),0 0 40px rgba(255,215,0,0.5);line-height:1.1">FÉLICITATIONS</div>'
    +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;letter-spacing:2px;color:#E8953A;text-shadow:0 0 15px rgba(232,149,58,0.8);margin-top:4px">TROP FORT !</div>'
    +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:32px;color:#FFD700;text-shadow:0 0 20px rgba(255,215,0,0.9);margin-top:14px">+'+xp+' XP</div>';
  overlay.appendChild(txt);
  phone.appendChild(overlay);
  var ctx=canvas.getContext('2d');
  var particles=[];
  var colors=['#FFD700','#FF9500','#4CAF7A','#FF4444','#00BFFF','#FF00FF','#ffffff'];
  var cx=pw/2,cy=ph/2;
  for(var i=0;i<120;i++){
    var angle=Math.random()*Math.PI*2;var speed=2+Math.random()*6;
    particles.push({x:cx,y:cy,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-2,
      size:2+Math.random()*5,color:colors[Math.floor(Math.random()*colors.length)],
      alpha:1,gravity:0.15,decay:0.012+Math.random()*0.008});
  }
  var startTime=Date.now();var animId;
  function animate(){
    var elapsed=Date.now()-startTime;
    if(elapsed>2800){cancelAnimationFrame(animId);if(overlay.parentNode)overlay.parentNode.removeChild(overlay);return;}
    ctx.clearRect(0,0,pw,ph);
    for(var j=0;j<particles.length;j++){
      var p=particles[j];if(p.alpha<=0)continue;
      p.x+=p.vx;p.y+=p.vy;p.vy+=p.gravity;p.vx*=0.99;p.alpha-=p.decay;
      ctx.save();ctx.globalAlpha=Math.max(0,p.alpha);
      ctx.shadowBlur=p.size*3;ctx.shadowColor=p.color;ctx.fillStyle=p.color;
      ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    animId=requestAnimationFrame(animate);
  }
  animate();
}


function renderSeanceScreen(planKey, dayId){
  var plan = PLAN_DAYS[planKey];
  if(!plan) return;
  var day = plan.find(function(d){return d.id===dayId;}) || plan[0];
  if(!day) return;

  // Titre
  var titleEl = document.getElementById('seance-title');
  if(titleEl) titleEl.textContent = day.lbl;

  // Diag (muscles ciblés)
  var diagEl = document.getElementById('seance-diag');
  if(diagEl) diagEl.textContent = day.muscles || '';

  // Onglets jours
  var tabsCont = document.getElementById('day-tabs-seance');
  if(tabsCont){
    tabsCont.innerHTML = plan.map(function(d){
      return '<button class="dtab'+(d.id===dayId?' on':'')+'" style="font-size:11px;padding:7px 12px" id="daytab-'+d.id+'">'+d.lbl+'</button>';
    }).join('');
  }

  // Exercices
  var exosCont = document.getElementById('seance-exos');
  if(exosCont){
    exosCont.innerHTML = (day.exos||[]).map(function(e,i){
      var uid = 'ce-'+planKey+'-'+dayId+'-'+i;
      return '<div class="exo-card" style="margin-bottom:8px">'
        +'<div class="exo-hdr" data-uid="'+uid+'" onclick="togExoChall(this.getAttribute(\"data-uid\"))" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:2px 0">'
        +'<div><div class="exo-nm">'+e.n+'</div><div class="exo-desc">'+e.d+'</div></div>'
        +'<i class="ti ti-chevron-down" style="font-size:13px;color:var(--txm);transition:transform 0.2s" id="chev-'+uid+'"></i>'
        +'</div>'
        +'<div class="exo-detail" id="det-'+uid+'">'
        +buildSeriesRows(e, uid)
        +'</div>'
        +'</div>';
    }).join('');
  }

  // Attacher les event listeners sur les en-têtes d'exercices
  var hdrs = exosCont ? exosCont.querySelectorAll('.exo-hdr') : [];
  if(hdrs.forEach) hdrs.forEach(function(h){
    h.addEventListener('click', function(){ togExoChall(h.getAttribute('data-uid')); });
  });
  // Reset chrono
  chReset();
}

function buildSeriesRows(e, uid){
  var sets = e.sets || 3;
  var header = '<div style="display:grid;grid-template-columns:22px 1fr 1fr 22px;gap:5px;margin-bottom:3px">'
    +'<div></div>'
    +'<div style="font-size:9px;text-transform:uppercase;color:var(--txm);text-align:center">Reps</div>'
    +'<div style="font-size:9px;text-transform:uppercase;color:var(--txm);text-align:center">Kg</div>'
    +'<div></div></div>';
  var rows = '';
  for(var s=0;s<sets;s++){
    var sid = uid+'-s'+s;
    rows += '<div style="display:grid;grid-template-columns:22px 1fr 1fr 22px;gap:5px;align-items:center;padding:5px 0;border-top:0.5px solid rgba(255,255,255,0.04)">'
      +'<div style="width:18px;height:18px;border-radius:50%;background:var(--c3);border:0.5px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:8px;color:var(--txm);">'+(s+1)+'</div>'
      +'<input type="number" id="cr-'+sid+'" placeholder="—" style="width:100%;background:var(--c2);border:0.5px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 6px;font-size:11px;color:var(--tx);font-family:inherit;outline:none;text-align:center;">'
      +'<input type="number" id="ck-'+sid+'" placeholder="—" step="0.5" style="width:100%;background:var(--c2);border:0.5px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 6px;font-size:11px;color:var(--tx);font-family:inherit;outline:none;text-align:center;">'
      +'<div data-sid="'+sid+'" data-uid="'+uid+'" data-s="'+s+'" onclick="togSerieChall(this)" style="width:22px;height:22px;border-radius:50%;border:0.5px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;cursor:pointer;"><i class="ti ti-check" style="font-size:10px;color:var(--txd)"></i></div>'
      +'</div>';
  }
  return header + rows;
}

function togExoChall(uid){
  if(!uid)return;
  var det=document.getElementById('det-'+uid);
  var chev=document.getElementById('chev-'+uid);
  if(det){det.classList.toggle('show');if(chev)chev.style.transform=det.classList.contains('show')?'rotate(180deg)':'';}
}

function togSerieChall(el){
  var done = el.getAttribute('data-done')==='1';
  done = !done;
  el.setAttribute('data-done', done?'1':'0');
  el.style.background = done?'var(--succ)':'transparent';
  el.style.borderColor = done?'var(--succb)':'rgba(255,255,255,0.15)';
  var ic = el.querySelector('i');
  if(ic) ic.style.color = done?'var(--gr)':'var(--txd)';
  if(done){
    totalXP+=2;
    updateAll();
    toast('+2 XP série validée 💪');
  }
}

// ══ RÉSILIATION ══
function selResil(el){document.querySelectorAll('.resil-opt').forEach(o=>{o.style.borderColor='rgba(255,255,255,0.08)';o.style.background='var(--c2)';});el.style.borderColor='var(--rb)';el.style.background='var(--rl)';}
function confirmResil(){closeModal('modal-resil');toast('Résiliation confirmée — accès maintenu jusqu\'au 26 juin 2025');}

// ══ INIT ══
_suiviXpPrev=xpS(sleep)+xpP(steps)+xpE(water);
initSuiviChallenger();
renderPhotoGrid();
lastDate='';renderDefis();renderMensInputsChall();buildDayTabs();updateAll();
loadChallengerData();


// ══ NOUVELLES FONCTIONS (Elite + Nutrition + UI) ══

// Détecter si Elite
var IS_ELITE = false;
var CUSTOM_JOURS = [];
var REPAS_LIST = [];
var editJourIdx = -1;

function detectElite(){
  if(!SB_PROFILE) return;
  var role = SB_PROFILE.role || '';
  IS_ELITE = role === 'challenger_elite';
  if(IS_ELITE){
    // Afficher l'onglet "Mon programme"
    var btn = document.getElementById('ptab-custom-btn');
    if(btn) btn.style.display = 'block';
    // Afficher nutrition Elite
    var ne = document.getElementById('nutri-elite-section');
    var nc = document.getElementById('nutri-classic-section');
    if(ne) ne.style.display = 'block';
    if(nc) nc.style.display = 'none';
    // Badge Elite
    var roleEl = document.getElementById('profil-role');
    if(roleEl){ roleEl.textContent = 'Challenger Elite'; roleEl.classList.add('p-gold'); roleEl.classList.remove('p-on'); }
  }
}

// ══ HOME DATE ══
function setHomeDate(){
  var el = document.getElementById('home-date');
  if(!el) return;
  var jours = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  var mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  var now = new Date();
  el.textContent = jours[now.getDay()] + ' ' + now.getDate() + ' ' + mois[now.getMonth()];
}
setHomeDate();

// ══ HOME STATS ══
function updateHomeStats(){
  var el = document.getElementById('home-water'); if(el) el.textContent = water;
  var el2 = document.getElementById('home-steps');
  if(el2) el2.textContent = steps >= 1000 ? (steps/1000).toFixed(1)+'k' : steps;
  var el3 = document.getElementById('home-xp-week');
  if(el3) el3.textContent = totalXP;
}

// ══ NUTRITION WEEK ══
function renderNutriWeek(){
  var el = document.getElementById('nutri-week-row');
  if(!el) return;
  var jours = ['lun.','mar.','mer.','jeu.','ven.','sam.','dim.'];
  var now = new Date();
  var today = now.getDay(); // 0=dim
  // Lundi = 0 dans notre affichage
  var html = '';
  for(var i=0;i<7;i++){
    var dayNum = new Date(now);
    var diff = i - (today===0?6:today-1);
    dayNum.setDate(now.getDate()+diff);
    var isToday = dayNum.toDateString() === now.toDateString();
    html += '<div class="nutri-day">'
      +'<div class="nutri-day-name">'+jours[i]+'</div>'
      +'<div class="nutri-day-num'+(isToday?' today':'')+'">'+dayNum.getDate()+'</div>'
      +'</div>';
  }
  el.innerHTML = html;
}
renderNutriWeek();

// ══ NUTRITION TARGETS ══
function updateNutriTargets(){
  var diet = window.CURRENT_DIET || null;
  if(!diet) return;
  var kEl = document.getElementById('nutri-cible-kcal');
  var pEl = document.getElementById('nutri-cible-prot');
  var gEl = document.getElementById('nutri-cible-gluc');
  var lEl = document.getElementById('nutri-cible-lip');
  var rEl = document.getElementById('nutri-kcal-rest');
  var tEl = document.getElementById('nutri-prot-total');
  var tgEl = document.getElementById('nutri-gluc-total');
  var tlEl = document.getElementById('nutri-lip-total');
  if(kEl) kEl.textContent = diet.kcal_jour||'—';
  if(pEl) pEl.textContent = (diet.proteines_g||'—')+'g';
  if(gEl) gEl.textContent = (diet.glucides_g||'—')+'g';
  if(lEl) lEl.textContent = (diet.lipides_g||'—')+'g';
  if(rEl) rEl.textContent = diet.kcal_jour||'—';
  if(tEl) tEl.textContent = '/ '+(diet.proteines_g||'—')+' g';
  if(tgEl) tgEl.textContent = '/ '+(diet.glucides_g||'—')+' g';
  if(tlEl) tlEl.textContent = '/ '+(diet.lipides_g||'—')+' g';
  // Ring
  var circle = document.getElementById('nutri-ring-circle');
  if(circle) circle.style.strokeDashoffset = '352';
}

// ══ PROG TABS ══
function switchProgTab(tab){
  var antBtn = document.getElementById('ptab-ant');
  var custBtn = document.getElementById('ptab-custom');
  var antSec = document.getElementById('prog-ant-section');
  var custSec = document.getElementById('prog-custom-section');
  if(tab==='ant'){
    antBtn.classList.add('on'); if(custBtn) custBtn.classList.remove('on');
    antSec.style.display='block'; custSec.style.display='none';
  } else {
    antBtn.classList.remove('on'); if(custBtn) custBtn.classList.add('on');
    antSec.style.display='none'; custSec.style.display='block';
    renderCustomJours();
  }
}

// ══ RENDER PROGRAMMES ANT ══
function renderProgCards(){var cont=document.getElementById('prog-cards-list');if(!cont)return;cont.innerHTML='';[{id:'ul',t:'UPPER/LOWER',c:'#3d0000',i:'ti-barbell'},{id:'ppl',t:'PUSH PULL',c:'#1a002d',i:'ti-activity'},{id:'fb',t:'FULL BODY',c:'#001a2d',i:'ti-flame'}].forEach(function(p){var d=document.createElement('div');var sel=currentPlan===p.id;d.className='prog-card'+(sel?' sel':'');d.innerHTML='<div class="prog-card-img-placeholder" style="background:linear-gradient(135deg,'+p.c+',#0d0d0d)"><i class="ti '+p.i+'" style="font-size:52px;color:rgba(255,255,255,0.07)"></i></div><div class="prog-card-overlay"></div><div class="prog-card-info"><div class="prog-card-badge">PROGRAMME'+(sel?' ACTIF':'')+'</div><div class="prog-card-title">'+p.t+'</div><div class="prog-card-line"></div><div class="prog-card-meta"><div class="prog-card-avatar">A</div></div></div>';d.addEventListener('click',function(){selectPlan(p.id);});cont.appendChild(d);});}

// ══ CUSTOM JOURS (Elite) ══
function renderCustomJours(){
  var cont = document.getElementById('custom-jours-list');
  var countEl = document.getElementById('custom-prog-days-count');
  if(countEl) countEl.textContent = CUSTOM_JOURS.length;
  if(!cont) return;
  if(!CUSTOM_JOURS.length){
    cont.innerHTML = '<div style="text-align:center;padding:30px 18px;color:var(--txm);font-size:13px"><i class="ti ti-plus-circle" style="font-size:32px;color:var(--txd);display:block;margin-bottom:8px"></i>Ajoute ton premier jour d&#39;entraînement</div>';
    return;
  }
  cont.innerHTML = CUSTOM_JOURS.map(function(j,i){
    return '<div class="jour-card">'
      +'<div class="jour-card-header">'
      +'<div><div class="jour-card-name">'+j.nom+'</div><div class="jour-card-meta">'+j.muscles+' · '+(j.exos||[]).length+' exercices</div></div>'
      +'<div class="jour-card-actions">'
      +'<button class="jour-btn" onclick="editJour('+i+')" title="Modifier"><i class="ti ti-edit" style="font-size:14px"></i></button>'
      +'<button class="jour-btn" onclick="toggleJourVisible('+i+')" title="Masquer/Afficher"><i class="ti ti-eye'+(j.hidden?'-off':'')+'" style="font-size:14px"></i></button>'
      +'<button class="jour-btn del" onclick="deleteJour('+i+')" title="Supprimer"><i class="ti ti-trash" style="font-size:14px"></i></button>'
      +'<button class="jour-btn" onclick="startCustomJour('+i+')" title="Démarrer" style="background:var(--ant);color:#fff"><i class="ti ti-player-play" style="font-size:14px"></i></button>'
      +'</div></div>'
      +(j.exos&&j.exos.length ? '<div class="jour-exos">'+j.exos.slice(0,3).map(function(e){
        return '<div style="font-size:12px;color:var(--txm);padding:3px 0;border-bottom:0.5px solid rgba(255,255,255,0.04)">'+e.nom+' · '+e.series+'×'+e.reps+'</div>';
      }).join('')+(j.exos.length>3?'<div style="font-size:11px;color:var(--txd);padding:4px 0">+' +(j.exos.length-3)+' exercices</div>':'')+'</div>' : '')
      +'</div>';
  }).join('');
}

function addJourCustom(){
  editJourIdx = -1;
  document.getElementById('jour-nom-input').value = '';
  document.getElementById('jour-muscles-input').value = '';
  document.getElementById('builder-exos-list').innerHTML = '';
  document.getElementById('jour-builder-title').textContent = 'Nouveau jour';
  populateBuilderSelect();
  openModal('modal-jour-builder');
}

function editJour(i){
  editJourIdx = i;
  var j = CUSTOM_JOURS[i];
  document.getElementById('jour-nom-input').value = j.nom;
  document.getElementById('jour-muscles-input').value = j.muscles||'';
  document.getElementById('jour-builder-title').textContent = 'Modifier '+j.nom;
  populateBuilderSelect();
  // Rendre les exos existants
  var list = document.getElementById('builder-exos-list');
  list.innerHTML = (j.exos||[]).map(function(e,idx){
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)">'
      +'<span style="font-size:12px">'+e.nom+' · '+e.series+'×'+e.reps+' · '+e.repos+'</span>'
      +'<button onclick="removeBuilderExo('+idx+')" style="background:none;border:none;cursor:pointer;color:var(--txm)"><i class="ti ti-x" style="font-size:13px"></i></button>'
      +'</div>';
  }).join('');
  openModal('modal-jour-builder');
}

function deleteJour(i){
  CUSTOM_JOURS.splice(i, 1);
  saveCustomProgs();
  renderCustomJours();
  toast('Jour supprimé');
}

function toggleJourVisible(i){
  CUSTOM_JOURS[i].hidden = !CUSTOM_JOURS[i].hidden;
  saveCustomProgs();
  renderCustomJours();
}

// Builder exos
var _builderExos = [];
function populateBuilderSelect(){
  var sel = document.getElementById('builder-exo-select');
  if(!sel) return;
  _builderExos = [];
  var html = '<option value="">Choisir un exercice...</option>';
  if(typeof MUSCU !== 'undefined'){
    MUSCU.forEach(function(g){
      html += '<optgroup label="'+g.g+'">';
      g.e.forEach(function(e){html += '<option value="'+e+'">'+e+'</option>';_builderExos.push(e);});
      html += '</optgroup>';
    });
  }
  sel.innerHTML = html;
}

function addExoToJour(){
  var sel = document.getElementById('builder-exo-select');
  var series = document.getElementById('builder-series').value || '3';
  var reps = document.getElementById('builder-reps').value || '10';
  var repos = document.getElementById('builder-repos').value || '90s';
  if(!sel||!sel.value){ toast('Choisis un exercice'); return; }
  var list = document.getElementById('builder-exos-list');
  var idx = list.children.length;
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)';
  row.dataset.nom = sel.value;
  row.dataset.series = series;
  row.dataset.reps = reps;
  row.dataset.repos = repos;
  var _sp=document.createElement('span');_sp.style.fontSize='12px';_sp.textContent=sel.value+' - '+series+'x'+reps+' - '+repos;var _btn=document.createElement('button');_btn.style.cssText='background:none;border:none;cursor:pointer;color:var(--txm)';_btn.innerHTML='<i class="ti ti-x" style="font-size:13px"></i>';(function(r){_btn.addEventListener('click',function(){r.remove();});})(row);row.appendChild(_sp);row.appendChild(_btn)
  list.appendChild(row);
  sel.value='';
  document.getElementById('builder-series').value='';
  document.getElementById('builder-reps').value='';
  document.getElementById('builder-repos').value='';
}

function removeBuilderExo(idx){
  var list = document.getElementById('builder-exos-list');
  if(list.children[idx]) list.children[idx].remove();
}

function saveJourCustom(){
  var nom = document.getElementById('jour-nom-input').value.trim();
  if(!nom){ toast('Donne un nom à la séance'); return; }
  var muscles = document.getElementById('jour-muscles-input').value.trim();
  var exoRows = document.getElementById('builder-exos-list').querySelectorAll('[data-nom]');
  var exos = [];
  exoRows.forEach(function(r){ exos.push({nom:r.dataset.nom,series:r.dataset.series,reps:r.dataset.reps,repos:r.dataset.repos}); });
  var jour = {nom:nom,muscles:muscles,exos:exos,hidden:false};
  if(editJourIdx>=0){ CUSTOM_JOURS[editJourIdx]=jour; } else { CUSTOM_JOURS.push(jour); }
  saveCustomProgs();
  renderCustomJours();
  closeModal('modal-jour-builder');
  toast(editJourIdx>=0?'Jour modifié ✓':'Jour ajouté ✓');
  // Envoyer au dashboard coach
  sendCustomProgToCoach();
}

function saveCustomProgs(){
  try{ localStorage.setItem('ant_custom_progs_'+((SB_PROFILE&&SB_PROFILE.id)||'u'), JSON.stringify(CUSTOM_JOURS)); }catch(e){}
  // Supabase
  if(SB_SESSION){
    sbUpsert('programmes_clients',{
      client_id:SB_SESSION.user.id,
      jour_nom:'__custom__',
      exercices:JSON.stringify(CUSTOM_JOURS),
      actif:true
    },'client_id,jour_nom').catch(function(){});
  }
}

function loadCustomProgs(){
  try{
    var saved = localStorage.getItem('ant_custom_progs_'+((SB_PROFILE&&SB_PROFILE.id)||'u'));
    if(saved) CUSTOM_JOURS = JSON.parse(saved);
  }catch(e){}
}

function sendCustomProgToCoach(){
  // Le programme est déjà dans Supabase programmes_clients — le coach peut le voir
}

function startCustomJour(i){
  var j = CUSTOM_JOURS[i];
  if(!j) return;
  // Adapter la séance au format renderSeanceScreen
  var fakeSeance = {
    id:'custom-'+i,
    lbl:j.nom,
    muscles:j.muscles,
    exos:(j.exos||[]).map(function(e){
      return {n:e.nom,d:e.series+' séries × '+e.reps+' reps · repos '+e.repos,sets:parseInt(e.series)||3};
    })
  };
  document.getElementById('seance-title').textContent = j.nom;
  document.getElementById('seance-diag').textContent = j.muscles||'';
  document.getElementById('day-tabs-seance').innerHTML = '';
  renderSeanceContent(fakeSeance);
  goTab(null,'sc-prog-seances');
}

function renderSeanceContent(day){
  var exosCont = document.getElementById('seance-exos');
  if(!exosCont) return;
  exosCont.innerHTML = (day.exos||[]).map(function(e,i){
    var uid = 'ce-'+i;
    var imgUrl = getExoImg(e.n);
    return '<div class="exo-row" id="exorow-'+uid+'">'
      +'<div class="exo-thumb">'
      +(imgUrl?'<img src="'+imgUrl+'" alt="'+e.n+'" loading="lazy">':'<div style="width:100%;height:100%;background:var(--c3);display:flex;align-items:center;justify-content:center"><i class="ti ti-barbell" style="font-size:20px;color:var(--txd)"></i></div>')
      +'</div>'
      +'<div class="exo-info">'
      +'<div class="exo-num">EXERCICE '+(i+1)+'</div>'
      +'<div class="exo-name">'+e.n+'</div>'
      +'<div class="exo-sets">'+e.d+'</div>'
      +'</div>'
      +'</div>'
      // Séries détaillées
      +(function(){
        var sets = e.sets||3;
        var html='<div class="serie-block" style="padding:8px 18px 14px">';
        for(var s=0;s<sets;s++){
          var sid=uid+'-s'+s;
          html+='<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:0.5px solid rgba(255,255,255,0.04)">'
            +'<div style="width:28px;height:28px;border-radius:8px;background:var(--c3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:var(--txm);flex-shrink:0">'+(s+1)+'</div>'
            +'<input type="number" id="cr-'+sid+'" placeholder="Reps" style="flex:1;text-align:center;padding:7px;font-size:13px">'
            +'<input type="number" id="ck-'+sid+'" placeholder="Kg" step="0.5" style="flex:1;text-align:center;padding:7px;font-size:13px">'
            +'<div data-sid="'+sid+'" onclick="togSerieChall(this)" style="width:30px;height:30px;border-radius:50%;border:1.5px solid var(--txd);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all 0.2s"><i class="ti ti-check" style="font-size:12px;color:var(--txd)"></i></div>'
            +'</div>';
        }
        html+='</div>';
        return html;
      })();
  }).join('');
}

// Images exercices (Unsplash fitness)
var EXO_IMGS = {
  'Développé couché':'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200&q=60',
  'Squat':'https://images.unsplash.com/photo-1574680178050-55c6a6a96e0a?w=200&q=60',
  'Soulevé de terre':'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=60',
  'Traction':'https://images.unsplash.com/photo-1598971861713-54ad16a7e72e?w=200&q=60',
  'Rowing barre':'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=200&q=60',
  'Développé militaire':'https://images.unsplash.com/photo-1597452485669-2c7bb5fef90d?w=200&q=60',
  'Curl biceps':'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=200&q=60',
  'Burpees':'https://images.unsplash.com/photo-1571731956672-f2b94d7dd0cb?w=200&q=60',
};
function getExoImg(nom){
  return EXO_IMGS[nom]||null;
}

// Override renderSeanceScreen pour utiliser renderSeanceContent
var _origRSS = window.renderSeanceScreen;
window.renderSeanceScreen = function(planKey, dayId){
  var plan = PLAN_DAYS[planKey];
  if(!plan) return;
  var day = plan.find(function(d){return d.id===dayId;})||plan[0];
  if(!day) return;
  document.getElementById('seance-title').textContent = day.lbl;
  document.getElementById('seance-diag').textContent = day.muscles||'';
  // Onglets
  var tc = document.getElementById('day-tabs-seance');
  if(tc){
    tc.innerHTML = plan.map(function(d,i){
      return '<button class="dtab'+(d.id===dayId?' on':'')+'" id="daytab-'+d.id+'">'+d.lbl+'</button>';
    }).join('');
    plan.forEach(function(d){
      var btn=document.getElementById('daytab-'+d.id);
      if(btn)(function(pk,dk){btn.addEventListener('click',function(){renderSeanceScreen(pk,dk);})})(planKey,d.id);
    });
  }
  renderSeanceContent(day);
  chReset();
};

// ══ NUTRITION ELITE ══
function openAddRepas(){
  ['repas-nom','repas-kcal','repas-prot','repas-gluc','repas-lip'].forEach(function(id){
    var el=document.getElementById(id); if(el)el.value='';
  });
  openModal('modal-repas');
}

function saveRepas(){
  var nom=document.getElementById('repas-nom').value.trim()||'Repas';
  var kcal=parseInt(document.getElementById('repas-kcal').value)||0;
  var prot=parseInt(document.getElementById('repas-prot').value)||0;
  var gluc=parseInt(document.getElementById('repas-gluc').value)||0;
  var lip=parseInt(document.getElementById('repas-lip').value)||0;
  REPAS_LIST.push({nom:nom,kcal:kcal,prot:prot,gluc:gluc,lip:lip,date:new Date().toISOString().split('T')[0]});
  closeModal('modal-repas');
  renderRepas();
  toast('Repas ajouté ✓');
  // Supabase
  if(SB_SESSION){
    sbPost('repas_elite',{client_id:SB_SESSION.user.id,nom:nom,kcal_total:kcal,proteines_g:prot,glucides_g:gluc,lipides_g:lip,date_repas:new Date().toISOString().split('T')[0]}).catch(function(){});
  }
}

function renderRepas(){
  var cont=document.getElementById('nutri-repas-list');
  if(!cont) return;
  if(!REPAS_LIST.length){
    cont.innerHTML='<div style="text-align:center;padding:20px;color:var(--txm);font-size:13px">Aucun repas enregistré</div>';
    return;
  }
  var totKcal=REPAS_LIST.reduce(function(a,r){return a+r.kcal;},0);
  var totProt=REPAS_LIST.reduce(function(a,r){return a+r.prot;},0);
  cont.innerHTML = REPAS_LIST.map(function(r,i){
    return '<div style="background:var(--c1);border:0.5px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px 16px;margin-bottom:10px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
      +'<div style="font-size:15px;font-weight:700">'+r.nom+'</div>'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'<span style="font-family:Bebas Neue,sans-serif;font-size:18px">'+r.kcal+' kcal</span>'
      +'<button onclick="REPAS_LIST.splice('+i+',1);renderRepas()" style="background:none;border:none;cursor:pointer;color:var(--txm)"><i class="ti ti-x" style="font-size:14px"></i></button>'
      +'</div></div>'
      +'<div style="display:flex;gap:12px">'
      +'<span style="font-size:11px;color:var(--ant)">P: '+r.prot+'g</span>'
      +'<span style="font-size:11px;color:var(--b)">G: '+r.gluc+'g</span>'
      +'<span style="font-size:11px;color:var(--gold)">L: '+r.lip+'g</span>'
      +'</div></div>';
  }).join('');
  // Update ring
  var kcalEl = document.getElementById('nutri-kcal-consom');
  if(kcalEl) kcalEl.textContent = totKcal;
  var diet=window.CURRENT_DIET;
  if(diet&&diet.kcal_jour){
    var rest=Math.max(0,diet.kcal_jour-totKcal);
    var rEl=document.getElementById('nutri-kcal-rest'); if(rEl) rEl.textContent=rest;
    var pct=Math.min(1,totKcal/diet.kcal_jour);
    var circle=document.getElementById('nutri-ring-circle');
    if(circle) circle.style.strokeDashoffset=(352*(1-pct)).toFixed(1);
  }
}

// ══ ALERTE COACH ══
var COACH_ALERT_ACTIVE = false;
function showCoachAlert(){
  COACH_ALERT_ACTIVE = true;
  var banner = document.getElementById('alert-coach-banner');
  if(banner) banner.style.display='block';
}
function contactCoach(){
  toast('Redirection vers les messages...');
}

// ══ GRAPHE ══
var currentGraph = 'eau';
function switchGraph(type,el){
  currentGraph=type;
  document.querySelectorAll('[id^="sgt-"]').forEach(function(b){b.classList.remove('on');});
  if(el)el.classList.add('on');
  renderSuiviGraph();
}
function renderSuiviGraph(){
  var bars=document.getElementById('graph-bars-el');
  var axis=document.getElementById('graph-axis-el');
  if(!bars) return;
  var data=[];
  var mois=['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
  var now=new Date();
  var colorClass = currentGraph==='eau'?'b':currentGraph==='sommeil'?'o':currentGraph==='pas'?'g':'r';
  for(var i=6;i>=0;i--){
    var d=new Date(now); d.setDate(now.getDate()-i);
    data.push({lbl:d.getDate(),val:Math.random()*100});
  }
  var max=Math.max.apply(null,data.map(function(d){return d.val;}));
  bars.innerHTML=data.map(function(d){
    var h=max>0?Math.round(d.val/max*100):0;
    return '<div class="gb '+colorClass+'" style="height:'+h+'%"></div>';
  }).join('');
  if(axis) axis.innerHTML='<span>-7j</span><span>Aujourd&#39;hui</span>';
}

// ══ MODAL HELPERS ══
function openModal(id){var m=document.getElementById(id);if(m)m.classList.add('show');}
function closeModal(id){var m=document.getElementById(id);if(m)m.classList.remove('show');}
function openProfileModal(){openModal('modal-profil');}

function changerMdp(){
  var nouveau=prompt('Nouveau mot de passe (8 car. min.)');
  if(!nouveau||nouveau.length<8){toast('Mot de passe trop court');return;}
  if(typeof supabase!=='undefined'){
    supabase.auth.updateUser({password:nouveau}).then(function(res){
      if(res.error)toast('Erreur : '+res.error.message);
      else toast('Mot de passe modifié ✓');
    });
  }
}

// ══ TOAST ══
function toast(txt){
  var el=document.getElementById('toast-el');
  if(!el)return;
  el.innerHTML='<i class="ti ti-check-circle" style="font-size:15px;flex-shrink:0"></i>'+txt;
  el.classList.add('show');
  setTimeout(function(){el.classList.remove('show');},2000);
}

// ══ STABS ══
function goStab(el,id){
  document.querySelectorAll('.stab').forEach(function(s){s.classList.remove('on');});
  el.classList.add('on');
  document.querySelectorAll('.sscr').forEach(function(s){s.classList.remove('on');});
  var target=document.getElementById(id);
  if(target)target.classList.add('on');
  if(id==='st-mens')renderMensInputsChall();
  if(id==='st-photos')renderPhotoGrid();
  if(id==='st-graph')renderSuiviGraph();
}

// ══ GONAVIGATION ══
var _scr_map = {'sc-home':'bn-home','sc-prog':'bn-prog','sc-alim':'bn-alim','sc-suivi':'bn-suivi','sc-defis':'bn-defis','sc-prog-seances':'bn-prog'};
function goTab(el,id){
  document.querySelectorAll('.bnav .bn').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('.scroll .scr').forEach(function(s){s.classList.remove('on');});
  var target=document.getElementById(id);
  if(target)target.classList.add('on');
  var bnId=_scr_map[id];
  if(bnId){var bn=document.getElementById(bnId);if(bn)bn.classList.add('on');}
  if(el)el.classList.add('on');
  document.getElementById('main-scroll').scrollTop=0;
  if(id==='sc-defis'){lastDate='';renderDefis();}
  if(id==='sc-prog'){renderProgCards();}
  if(id==='sc-alim'){updateNutriTargets();}
}

// ══ UPDATEALL OVERRIDE ══
var _origUpdateAll = window.updateAll;
window.updateAll = function(){
  if(typeof _origUpdateAll==='function') _origUpdateAll();
  // Mise à jour accueil
  var info = getLvl(totalXP);
  var lvl=info.lvl, xpIn=info.xpIn, need=info.need;
  var pct=Math.round(xpIn/need*100);
  var lvlEl=document.getElementById('home-lvl'); if(lvlEl)lvlEl.textContent=lvl;
  var lvlEl2=document.getElementById('home-lvl-2'); if(lvlEl2)lvlEl2.textContent=lvl;
  var lvlNext=document.getElementById('home-lvl-next'); if(lvlNext)lvlNext.textContent=lvl+1;
  var xpIn_el=document.getElementById('home-xp-in'); if(xpIn_el)xpIn_el.textContent=xpIn;
  var xpNeed=document.getElementById('home-xp-need'); if(xpNeed)xpNeed.textContent=need;
  var xpTot=document.getElementById('home-xp-total'); if(xpTot)xpTot.textContent=totalXP;
  var bar=document.getElementById('home-xp-bar'); if(bar)bar.style.width=pct+'%';
  var lvlName=document.getElementById('home-lvl-name');
  if(lvlName)lvlName.textContent=lvl<3?'Débutant':lvl<6?'Intermédiaire':lvl<10?'Confirmé':'Expert';
  // Défis
  var done=Object.keys(defisChk).filter(function(k){return defisChk[k];}).length;
  var dhc=document.getElementById('home-defi-count'); if(dhc)dhc.textContent=done+' / 5';
  var dhb=document.getElementById('home-defi-bar'); if(dhb)dhb.style.width=(done/5*100)+'%';
  var dct=document.getElementById('defi-count-txt'); if(dct)dct.textContent=done+' / 5';
  var bb=document.getElementById('bonus-bar'); if(bb)bb.style.width=(done/5*100)+'%';
  updateHomeStats();
};

// ══ PROFIL ══
function updateProfile(){
  if(!SB_PROFILE) return;
  var prenom=SB_PROFILE.prenom||'Challenger';
  var initiale=(prenom[0]||'C').toUpperCase();
  var hpEl=document.getElementById('home-prenom'); if(hpEl)hpEl.textContent=prenom;
  var avEl=document.getElementById('tb-avatar'); if(avEl)avEl.textContent=initiale;
  var pnEl=document.getElementById('profil-name'); if(pnEl)pnEl.textContent=prenom+' '+(SB_PROFILE.nom||'');
  var paEl=document.getElementById('profil-av'); if(paEl)paEl.textContent=initiale;
}

// ══ LOAD SUPABASE OVERRIDE ══
var _origLoadChall = window.loadChallengerData;
window.loadChallengerData = async function(){
  await _origLoadChall();
  detectElite();
  updateProfile();
  loadCustomProgs();
  renderCustomJours();
  renderProgCards();
  // Charger diète
  if(SB_SESSION){
    try{
      var dietes=await sbFetch('dietes?client_id=eq.'+SB_SESSION.user.id+'&actif=eq.true&select=*&limit=1');
      if(dietes&&dietes[0]){
        window.CURRENT_DIET=dietes[0];
        updateNutriTargets();
      }
    }catch(e){}
    // Charger repas Elite
    if(IS_ELITE){
      try{
        var repas=await sbFetch('repas_elite?client_id=eq.'+SB_SESSION.user.id+'&date_repas=eq.'+new Date().toISOString().split('T')[0]+'&select=*');
        if(repas&&repas.length){
          REPAS_LIST=repas.map(function(r){return{nom:r.nom,kcal:r.kcal_total,prot:r.proteines_g,gluc:r.glucides_g,lip:r.lipides_g}});
          renderRepas();
        }
      }catch(e){}
    }
  }
  updateAll();
};

// ══ INIT ══
renderProgCards();
renderNutriWeek();
updateAll();