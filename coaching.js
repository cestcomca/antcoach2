// ANT COACH — Coaching
var SB_URL='https://uumgpbruxsxskfrvjlzt.supabase.co';
var SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1bWdwYnJ1eHN4c2tmcnZqbHp0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjIyNjc4NiwiZXhwIjoyMDk3ODAyNzg2fQ.KzLkoCUx1hR3uylt5Lx_QH0_GHqGnUNEI4-iRXscb9U';
var SB_SESSION=null;
var USER_PROFILE=null;
var USER_NIVEAU=null;
var PROG_JOURS=[];
var SUIVI_W=0,SUIVI_S=0,SUIVI_P=0;

// ── Auth ──
function getSession(){
  try{
    var p=new URLSearchParams(window.location.search);
    var t=p.get('t'),u=p.get('u');
    if(t){
      sessionStorage.setItem('sb_t',t);
      sessionStorage.setItem('sb_u',u||'');
      if(window.history&&window.history.replaceState)window.history.replaceState({},'',window.location.pathname);
      return{access_token:t,user:{id:u}};
    }
    var st=sessionStorage.getItem('sb_t');
    if(st)return{access_token:st,user:{id:sessionStorage.getItem('sb_u')||''}};
  }catch(e){}
  return null;
}

// ── Supabase ──
async function sbFetch(path){
  var sess=SB_SESSION;
  var tok=sess&&sess.access_token?sess.access_token:SB_KEY;
  var r=await fetch(SB_URL+'/rest/v1/'+path,{headers:{'apikey':SB_KEY,'Authorization':'Bearer '+tok,'Content-Type':'application/json'}});
  if(!r.ok)throw new Error(r.status);
  return r.json();
}
async function sbUpsert(table,data,onConflict){
  var sess=SB_SESSION;
  var tok=sess&&sess.access_token?sess.access_token:SB_KEY;
  var url=SB_URL+'/rest/v1/'+table+(onConflict?'?on_conflict='+onConflict:'');
  var r=await fetch(url,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+tok,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(data)});
  return r;
}

// ── Nav ──
function goNav(el,id){
  document.querySelectorAll('.bnav .bn').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('#main-scroll .scr').forEach(function(s){s.classList.remove('on');});
  var sc=document.getElementById(id);if(sc)sc.classList.add('on');
  var m={'sc-home':'bn-home','sc-prog':'bn-prog','sc-alim':'bn-alim','sc-suivi':'bn-suivi','sc-msgs':'bn-msgs'};
  var bn=m[id];if(bn){var b=document.getElementById(bn);if(b)b.classList.add('on');}
  var scroll=document.getElementById('main-scroll');if(scroll)scroll.scrollTop=0;
  if(id==='sc-prog')loadUserProg();
  if(id==='sc-suivi')renderPoids();
}

// ── Toast ──
function toast(msg){
  var t=document.getElementById('toast-app');
  if(!t)return;
  t.textContent=msg;t.style.display='block';
  setTimeout(function(){t.style.display='none';},2500);
}

// ── Charger données ──
async function loadAppData(){
  SB_SESSION=getSession();
  if(!SB_SESSION){console.log('Pas de session coaching');return;}
  var uid=SB_SESSION.user.id;
  try{
    // Profil
    var p=await sbFetch('profiles?id=eq.'+uid+'&select=*');
    if(p&&p[0]){
      USER_PROFILE=p[0];
      var el=document.getElementById('home-prenom');
      if(el)el.textContent=p[0].prenom||'';
      var av=document.getElementById('top-av');
      if(av)av.textContent=(p[0].prenom||'?')[0].toUpperCase();
      var em=document.getElementById('profil-email');
      if(em)em.textContent=p[0].email||'';
    }
    // XP / Niveau
    var niv=await sbFetch('niveaux?client_id=eq.'+uid+'&select=*');
    if(niv&&niv[0]){
      var xp=niv[0].xp_total||0;
      var lvl=Math.floor(xp/100)+1;
      var next=lvl*100;
      var prev=(lvl-1)*100;
      var pct=Math.round((xp-prev)/(next-prev)*100);
      setText('home-lvl',lvl);
      setText('home-lvl-2',lvl);
      setText('home-lvl-next',lvl+1);
      setText('home-xp-total',xp);
      setText('home-xp-in',xp-prev);
      setText('home-xp-need',next-prev);
      setText('top-lvl','Niv. '+lvl);
      var bar=document.getElementById('home-xp-bar');if(bar)bar.style.width=pct+'%';
      var badge=document.getElementById('home-lvl-name');
      var noms=['Débutant','Rookie','Confirmé','Avancé','Expert','Elite','Légende'];
      if(badge)badge.textContent=noms[Math.min(lvl-1,noms.length-1)];
    }
    // Ecran client (victoires/vigilance/motivation)
    var ec=await sbFetch('ecran_client?client_id=eq.'+uid+'&select=*&limit=1');
    if(ec&&ec[0]){
      var vic=ec[0].victoires?JSON.parse(ec[0].victoires):[];
      var vig=ec[0].points_attention?JSON.parse(ec[0].points_attention):[];
      var motiv=ec[0].note_motivation||ec[0].note_visible||'';
      var vEl=document.getElementById('home-victoires');
      if(vEl)vEl.innerHTML=vic.length?vic.map(function(v){return'<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:6px"><span style="color:#4CAF7A">✓</span><span style="font-size:12px;color:var(--tx)">'+v+'</span></div>';}).join(''):'<div style="font-size:12px;color:var(--txm)">Aucune victoire ce mois</div>';
      var viEl=document.getElementById('home-vigilance');
      if(viEl)viEl.innerHTML=vig.length?vig.map(function(v){return'<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:6px"><span style="color:var(--or)">⚠</span><span style="font-size:12px;color:var(--tx)">'+v+'</span></div>';}).join(''):'<div style="font-size:12px;color:var(--txm)">Aucun point ce mois</div>';
      var mEl=document.getElementById('home-motivation');
      if(mEl&&motiv)mEl.textContent=motiv;
    }
    // Diet
    var d=await sbFetch('dietes?client_id=eq.'+uid+'&actif=eq.true&select=*&limit=1');
    if(d&&d[0]){
      setText('diet-kcal',(d[0].kcal||d[0].kcal_jour||'—')+' kcal');
      setText('diet-prot',(d[0].proteines||d[0].proteines_g||'—')+' g');
      setText('diet-gluc',(d[0].glucides||d[0].glucides_g||'—')+' g');
      setText('diet-lip',(d[0].lipides||d[0].lipides_g||'—')+' g');
      var kcal=d[0].kcal||d[0].kcal_jour||2000;
      var prot=(d[0].proteines||d[0].proteines_g||0)*4/kcal*100;
      var gluc=(d[0].glucides||d[0].glucides_g||0)*4/kcal*100;
      var lip=(d[0].lipides||d[0].lipides_g||0)*9/kcal*100;
      setStyle('bar-prot','width',Math.min(100,prot)+'%');
      setStyle('bar-gluc','width',Math.min(100,gluc)+'%');
      setStyle('bar-lip','width',Math.min(100,lip)+'%');
    }
    // Suivi du jour
    var today=new Date().toISOString().split('T')[0];
    var sv=await sbFetch('suivi_quotidien?client_id=eq.'+uid+'&date_suivi=eq.'+today+'&select=*');
    if(sv&&sv[0]){
      SUIVI_W=sv[0].eau_verres||0;
      SUIVI_S=sv[0].sommeil_h||0;
      SUIVI_P=sv[0].pas||0;
    }
    updateSuiviUI();
    // Poids récent
    var pe=await sbFetch('pesees?client_id=eq.'+uid+'&order=date_pesee.desc&select=poids_kg&limit=2');
    if(pe&&pe[0]){
      setText('home-poids',pe[0].poids_kg+' kg');
      if(pe[1]){
        var diff=(pe[0].poids_kg-pe[1].poids_kg).toFixed(1);
        setText('home-vari',(diff>0?'+':'')+diff+' kg');
      }
    }
    // Séances du mois
    var mois=new Date();mois.setDate(1);
    var xplog=await sbFetch('xp_log?client_id=eq.'+uid+'&created_at=gte.'+mois.toISOString().split('T')[0]+'&source=eq.seance_exo&select=id');
    setText('home-seances',(xplog||[]).length);
    // Programme
    loadUserProg();
    // Date
    var jours=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    var moisFr=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    var now=new Date();
    setText('home-date',jours[now.getDay()]+' '+now.getDate()+' '+moisFr[now.getMonth()]+' '+now.getFullYear());
  }catch(e){console.error('loadAppData:',e);}
}

function setText(id,val){var el=document.getElementById(id);if(el)el.textContent=val;}
function setStyle(id,prop,val){var el=document.getElementById(id);if(el)el.style[prop]=val;}

// ── Programme ──
async function loadUserProg(){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  try{
    var jours=await sbFetch('programmes_clients?client_id=eq.'+uid+'&select=*&order=ordre.asc,id.asc');
    if(!jours||!jours.length){
      var cont=document.getElementById('prog-seance-cont');
      if(cont)cont.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--txm);font-size:13px"><i class="ti ti-barbell" style="font-size:32px;display:block;margin-bottom:10px;opacity:0.3"></i>Ton coach n\'a pas encore assigne de programme.</div>';
      return;
    }
    PROG_JOURS=jours.map(function(row){
      var exos=[];try{exos=JSON.parse(row.exercices||'[]');}catch(e){}
      return{nom:row.jour_nom,muscles:row.muscles_cibles||'',exos:exos};
    });
    renderProgTabs();
    renderProgJour(0);
  }catch(e){console.error('loadUserProg:',e);}
}

var PROG_JOUR_ACTIF=0;
function renderProgTabs(){
  var tabs=document.getElementById('day-tabs-prog');
  if(!tabs)return;
  tabs.innerHTML=PROG_JOURS.map(function(j,i){
    return'<button class="jour-btn'+(i===0?' on':'')+'" onclick="renderProgJour('+i+')">'+j.nom+'</button>';
  }).join('');
}

function renderProgJour(i){
  PROG_JOUR_ACTIF=i;
  var tabs=document.querySelectorAll('.jour-btn');
  tabs.forEach(function(t,idx){t.classList.toggle('on',idx===i);});
  var j=PROG_JOURS[i];
  if(!j)return;
  var cont=document.getElementById('prog-seance-cont');
  if(!cont)return;
  var exosHtml=j.exos.map(function(e,ei){
    return'<div class="exo-card" data-idx="'+ei+'" style="margin-bottom:8px;background:var(--c2);border-radius:12px;padding:12px 14px;">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'
      +'<div><div style="font-size:13px;font-weight:500;color:var(--tx)">'+e.nom+'</div>'
      +'<div style="font-size:10px;color:var(--txm)">'+e.series+' × '+e.reps+' · repos '+e.repos+(e.charge?' · '+e.charge+'kg':'')+'</div>'
      +(e.note_client?'<div style="font-size:11px;color:var(--or);margin-top:3px;font-style:italic">'+e.note_client+'</div>':'')
      +'</div>'
      +'<div style="width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;" id="chk-'+ei+'" onclick="valExo('+ei+')">'
      +'<i class="ti ti-check" style="font-size:12px;display:none" id="chk-ico-'+ei+'"></i>'
      +'</div></div>'
      +'<div style="display:flex;align-items:center;gap:8px;">'
      +'<input type="number" placeholder="Charge (kg)" step="0.5" id="charge-'+ei+'" style="flex:1;background:var(--c3);border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;padding:7px 10px;color:var(--tx);font-size:13px;font-family:inherit;">'
      +'<button onclick="saveCharge('+ei+')" style="padding:7px 12px;background:var(--bl);border:0.5px solid var(--bb);border-radius:8px;color:var(--b);font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;">Sauver</button>'
      +'</div></div>';
  }).join('');
  cont.innerHTML='<div style="font-size:13px;font-weight:600;color:var(--tx);margin-bottom:4px">'+j.nom+'</div>'
    +(j.muscles?'<div style="font-size:10px;color:var(--txm);margin-bottom:14px">'+j.muscles+'</div>':'')
    +exosHtml
    +'<button onclick="validerSeance()" style="width:100%;margin-top:14px;padding:13px;background:var(--r);border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;letter-spacing:0.5px"><i class="ti ti-check" style="font-size:14px"></i> Valider la séance</button>';
}

function valExo(idx){
  var chk=document.getElementById('chk-'+idx);
  var ico=document.getElementById('chk-ico-'+idx);
  if(!chk)return;
  var done=chk.style.background==='var(--gr)'||chk.style.background==='rgb(76, 175, 122)';
  if(!done){chk.style.background='var(--gr)';chk.style.borderColor='var(--gr)';if(ico)ico.style.display='block';}
  else{chk.style.background='';chk.style.borderColor='rgba(255,255,255,0.15)';if(ico)ico.style.display='none';}
}

async function saveCharge(idx){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  var inp=document.getElementById('charge-'+idx);
  if(!inp||!inp.value)return;
  var j=PROG_JOURS[PROG_JOUR_ACTIF];
  if(!j||!j.exos[idx])return;
  var exo=j.exos[idx];
  try{
    await sbUpsert('historique_charges',{
      client_id:uid,
      exercice_nom:exo.nom,
      charge_kg:parseFloat(inp.value),
      date_seance:new Date().toISOString().split('T')[0]
    },'');
    toast('Charge sauvegardée ✓');
  }catch(e){toast('Erreur: '+e.message);}
}

async function validerSeance(){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  try{
    await sbUpsert('xp_log',{client_id:uid,source:'seance_exo',xp:10,created_at:new Date().toISOString()},'');
    toast('+10 XP — Séance validée ! 🔥');
    var total=parseInt(document.getElementById('home-xp-total').textContent||0)+10;
    setText('home-xp-total',total);
  }catch(e){toast('Séance validée ! 🔥');}
}

// ── Suivi eau/sommeil/pas ──
function updateSuiviUI(){
  setText('hv-w',SUIVI_W);
  setText('hv-s',SUIVI_S);
  setText('hv-p',SUIVI_P>=1000?(SUIVI_P/1000).toFixed(1)+'k':SUIVI_P);
}
function adjH(type,val){
  if(type==='w')SUIVI_W=Math.max(0,SUIVI_W+val);
  if(type==='s')SUIVI_S=Math.max(0,Math.round((SUIVI_S+val)*10)/10);
  if(type==='p')SUIVI_P=Math.max(0,SUIVI_P+val);
  updateSuiviUI();
}
async function saveSuiviToSupabase(){
  if(!SB_SESSION){toast('Non connect\u00e9');return;}
  var uid=SB_SESSION.user.id;
  var today=new Date().toISOString().split('T')[0];
  try{
    await sbUpsert('suivi_quotidien',{client_id:uid,date_suivi:today,eau_verres:SUIVI_W,sommeil_h:SUIVI_S,pas:SUIVI_P},'client_id,date_suivi');
    toast('Suivi sauvegardé ✓');
    if(SUIVI_W>=8||SUIVI_S>=8||SUIVI_P>=10000){
      await sbUpsert('xp_log',{client_id:uid,source:'suivi',xp:5,created_at:new Date().toISOString()},'');
    }
  }catch(e){toast('Erreur: '+e.message);}
}

// ── Poids ──
async function addPeseeApp(){
  if(!SB_SESSION){toast('Non connect\u00e9');return;}
  var uid=SB_SESSION.user.id;
  var inp=document.getElementById('poids-input');
  if(!inp||!inp.value){toast('Entre ton poids');return;}
  try{
    await sbUpsert('pesees',{client_id:uid,poids_kg:parseFloat(inp.value),date_pesee:new Date().toISOString().split('T')[0]},'client_id,date_pesee');
    toast('Poids enregistré ✓');
    inp.value='';
    renderPoids();
  }catch(e){toast('Erreur: '+e.message);}
}
async function renderPoids(){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  try{
    var pe=await sbFetch('pesees?client_id=eq.'+uid+'&order=date_pesee.desc&select=poids_kg,date_pesee&limit=10');
    if(!pe||!pe.length)return;
    var reversed=pe.slice().reverse();
    var max=Math.max.apply(null,reversed.map(function(p){return p.poids_kg;}));
    var min=Math.min.apply(null,reversed.map(function(p){return p.poids_kg;}));
    var range=max-min||1;
    var cont=document.getElementById('graph-poids');
    if(!cont)return;
    cont.innerHTML=reversed.map(function(p,i){
      var h=Math.round((p.poids_kg-min)/range*60)+10;
      var isLast=i===reversed.length-1;
      return'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">'
        +'<div style="font-size:8px;color:var(--txm)">'+(isLast?p.poids_kg:'')+'</div>'
        +'<div style="height:'+h+'px;background:"+(isLast?"var(--ant)":"var(--r)")+";border-radius:3px 3px 0 0;width:100%;opacity:'+(isLast?1:0.6)+'"></div>'
        +'</div>';
    }).join('');
    // Mettre à jour home-poids
    setText('home-poids',pe[0].poids_kg+' kg');
    if(pe[1]){
      var diff=(pe[0].poids_kg-pe[1].poids_kg).toFixed(1);
      setText('home-vari',(diff>0?'+':'')+diff+' kg');
    }
  }catch(e){}
}

// ── Mensurations ──
function renderMensInputsApp(){
  var cont=document.getElementById('mens-inputs-cont');
  if(!cont)return;
  var fields=[['tour_bras','Bras (cm)'],['tour_taille','Taille (cm)'],['tour_hanches','Hanches (cm)'],['tour_cuisse','Cuisse (cm)']];
  cont.innerHTML=fields.map(function(f){
    return'<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid rgba(255,255,255,0.05);">'
      +'<label style="font-size:13px;color:var(--tx)">'+f[1]+'</label>'
      +'<input type="number" id="mens-'+f[0]+'" placeholder="—" step="0.1" style="width:80px;background:var(--c3);border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;padding:7px 10px;color:var(--tx);font-size:13px;font-family:inherit;text-align:center;">'
      +'</div>';
  }).join('');
}
async function saveMensApp(){
  if(!SB_SESSION){toast('Non connect\u00e9');return;}
  var uid=SB_SESSION.user.id;
  var data={client_id:uid,date_mesure:new Date().toISOString().split('T')[0]};
  ['tour_bras','tour_taille','tour_hanches','tour_cuisse'].forEach(function(f){
    var el=document.getElementById('mens-'+f);
    if(el&&el.value)data[f]=parseFloat(el.value);
  });
  try{
    await sbUpsert('mensurations',data,'client_id,date_mesure');
    toast('Mensurations sauvegardées ✓');
  }catch(e){toast('Erreur: '+e.message);}
}

// ── Photos ──
var photosData=[];
function importPhoto(){document.getElementById('photo-input').click();}
function handlePhotoFile(input){
  if(!input.files||!input.files[0])return;
  var reader=new FileReader();
  reader.onload=function(e){
    photosData.unshift({src:e.target.result,date:new Date().toLocaleDateString('fr')});
    renderPhotoGrid();
  };
  reader.readAsDataURL(input.files[0]);
}
function renderPhotoGrid(){
  var cont=document.getElementById('photo-grid-cont');
  if(!cont)return;
  if(!photosData.length){cont.innerHTML='<div style="font-size:12px;color:var(--txm);text-align:center;padding:20px;grid-column:1/-1">Aucune photo</div>';return;}
  cont.innerHTML=photosData.map(function(p,i){
    return'<div style="aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;" onclick="viewPhoto('+i+')">'
      +'<img src="'+p.src+'" style="width:100%;height:100%;object-fit:cover;">'
      +'<div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.7));padding:4px 6px;font-size:9px;color:#fff">'+p.date+'</div>'
      +'</div>';
  }).join('');
}
function viewPhoto(i){
  var p=photosData[i];
  if(!p)return;
  var modal=document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.onclick=function(){modal.remove();};
  modal.innerHTML='<img src="'+p.src+'" style="max-width:90%;max-height:90%;border-radius:12px;object-fit:contain;">';
  document.body.appendChild(modal);
}

// ── Messages ──
var msgs=[];
async function envoyerMsg(){
  var inp=document.getElementById('msg-input');
  if(!inp||!inp.value.trim())return;
  var txt=inp.value.trim();
  inp.value='';
  msgs.push({text:txt,from:'client',time:new Date().toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'})});
  renderMsgs();
}
function renderMsgs(){
  var cont=document.getElementById('msgs-list');
  if(!cont)return;
  if(!msgs.length){cont.innerHTML='<div style="text-align:center;color:var(--txm);font-size:12px;padding:20px">Aucun message</div>';return;}
  cont.innerHTML=msgs.map(function(m){
    var isClient=m.from==='client';
    return'<div style="display:flex;justify-content:'+(isClient?'flex-end':'flex-start')+';margin-bottom:4px;">'
      +'<div style="max-width:75%;background:'+(isClient?'var(--r)':'var(--c2)')+';border-radius:12px;padding:8px 12px;">'
      +'<div style="font-size:13px;color:#fff">'+m.text+'</div>'
      +'<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-top:2px;text-align:right">'+m.time+'</div>'
      +'</div></div>';
  }).join('');
  cont.scrollTop=cont.scrollHeight;
}

// ── Profil ──
function openProfilModal(){
  var m=document.getElementById('modal-profil');
  if(m)m.style.display='flex';
}
function closeProfilModal(){
  var m=document.getElementById('modal-profil');
  if(m)m.style.display='none';
}
function logoutApp(){
  sessionStorage.clear();
  window.location.href='hub.html';
}

// ── Init ──
renderMensInputsApp();
renderPhotoGrid();
loadAppData();

// ── Timer repos ──
var timerInt=null,timerSec=90,timerRunning=false;
function timerSet(s){
  timerSec=s;timerRunning=false;
  if(timerInt)clearInterval(timerInt);
  updateTimerDisplay();
  var btn=document.getElementById('timer-btn');
  if(btn)btn.textContent='\u25B6 Start';
}
function timerToggle(){
  var btn=document.getElementById('timer-btn');
  if(timerRunning){
    clearInterval(timerInt);timerRunning=false;
    if(btn)btn.textContent='\u25B6 Start';
  } else {
    timerRunning=true;
    if(btn)btn.textContent='\u23F8 Pause';
    timerInt=setInterval(function(){
      if(timerSec<=0){
        clearInterval(timerInt);timerRunning=false;
        if(btn)btn.textContent='\u25B6 Start';
        timerSec=90;
        toast('Repos terminé ! \uD83D\uDCAA');
      } else {
        timerSec--;
      }
      updateTimerDisplay();
    },1000);
  }
}
function updateTimerDisplay(){
  var el=document.getElementById('timer-display');
  if(!el)return;
  var m=Math.floor(timerSec/60);
  var s=timerSec%60;
  el.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}

// ── Graphe suivi 7 jours ──
var suiviMode='eau';
var suiviHisto=[];
async function setSuiviMode(mode){
  suiviMode=mode;
  ['eau','sommeil','pas'].forEach(function(m){
    var btn=document.getElementById('sg-'+({'eau':'eau','sommeil':'som','pas':'pas'}[m]));
    if(!btn)return;
    var isActive=m===mode;
    var colors={'eau':'rgba(0,191,255,0.3)','sommeil':'rgba(200,50,50,0.3)','pas':'rgba(76,175,122,0.3)'};
    var bgs={'eau':'rgba(0,191,255,0.1)','sommeil':'rgba(200,50,50,0.1)','pas':'rgba(76,175,122,0.1)'};
    var txts={'eau':'var(--b)','sommeil':'var(--r2)','pas':'var(--gr)'};
    btn.style.borderColor=isActive?colors[m]:'rgba(255,255,255,0.1)';
    btn.style.background=isActive?bgs[m]:'transparent';
    btn.style.color=isActive?txts[m]:'var(--txm)';
  });
  if(SB_SESSION)await loadSuivi7j();
}
async function loadSuivi7j(){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  var jours=[];
  var labels=[];
  var joursNoms=['D','L','M','M','J','V','S'];
  for(var i=6;i>=0;i--){
    var d=new Date();d.setDate(d.getDate()-i);
    jours.push(d.toISOString().split('T')[0]);
    labels.push(joursNoms[d.getDay()]);
  }
  try{
    var data=await sbFetch('suivi_quotidien?client_id=eq.'+uid+'&date_suivi=gte.'+jours[0]+'&select=date_suivi,eau_verres,sommeil_h,pas');
    var byDate={};
    (data||[]).forEach(function(r){byDate[r.date_suivi]=r;});
    var vals=jours.map(function(d){
      var r=byDate[d];
      if(!r)return 0;
      if(suiviMode==='eau')return r.eau_verres||0;
      if(suiviMode==='sommeil')return parseFloat(r.sommeil_h)||0;
      if(suiviMode==='pas')return Math.round((r.pas||0)/1000*10)/10;
      return 0;
    });
    var max=Math.max.apply(null,vals)||1;
    var colors={'eau':'var(--b)','sommeil':'var(--r2)','pas':'var(--gr)'};
    var color=colors[suiviMode]||'var(--r)';
    var targets={'eau':8,'sommeil':8,'pas':10};
    var target=targets[suiviMode]||8;
    var gc=document.getElementById('suivi-graph-7j');
    var lc=document.getElementById('suivi-graph-labels');
    if(gc)gc.innerHTML=vals.map(function(v,i){
      var h=Math.max(4,Math.round(v/max*52));
      var ok=v>=target;
      return'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">'
        +'<div style="font-size:8px;color:'+(ok?color:'var(--txm)')+'">'+v+'</div>'
        +'<div style="height:'+h+'px;background:'+(ok?color:'var(--c3)')+';border-radius:3px 3px 0 0;width:100%"></div>'
        +'</div>';
    }).join('');
    if(lc)lc.innerHTML=labels.map(function(l){return'<div style="flex:1;text-align:center;font-size:9px;color:var(--txm)">'+l+'</div>';}).join('');
  }catch(e){console.log('suivi7j:',e);}
}

// ── Prochain RDV ──
async function loadProchainRDV(){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  var today=new Date().toISOString().split('T')[0];
  try{
    var rdvs=await sbFetch('rdv_coach?client_id=eq.'+uid+'&date_rdv=gte.'+today+'&order=date_rdv.asc&limit=1&select=date_rdv,type,notes');
    if(rdvs&&rdvs[0]){
      var r=rdvs[0];
      var dateStr=r.date_rdv?r.date_rdv.substr(0,10):'';
      var heureStr=r.date_rdv?r.date_rdv.substr(11,5):'';
      var mois=['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
      var parts=dateStr.split('-');
      var label=parts[2]+' '+mois[parseInt(parts[1])-1]+' à '+heureStr;
      setText('home-rdv-date',label);
      setText('home-rdv-type',r.type||'RDV coaching');
      var block=document.getElementById('home-rdv-block');
      if(block)block.style.display='block';
    }
  }catch(e){}
}

// ── Chargement messages ──
async function loadMsgs(){
  if(!SB_SESSION)return;
  // Simple affichage statique pour l'instant
  // Les vrais messages nécessitent une table messages en Supabase
}
