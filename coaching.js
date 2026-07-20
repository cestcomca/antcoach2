// ANT COACH — Coaching Client
var SB_URL='https://uumgpbruxsxskfrvjlzt.supabase.co';
var SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1bWdwYnJ1eHN4c2tmcnZqbHp0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjIyNjc4NiwiZXhwIjoyMDk3ODAyNzg2fQ.KzLkoCUx1hR3uylt5Lx_QH0_GHqGnUNEI4-iRXscb9U';
var SB_SESSION=null,USER_PROFILE=null;
var PROG_JOURS=[],PROG_JOUR_ACTIF=0;
var SUIVI_W=0,SUIVI_S=0,SUIVI_P=0;
var SUIVI_MODE='eau';
var PHOTOS=[];
var MSGS=[];
var DEFIS_DATA=[];

// ── Session ──
function getSession(){
  try{
    var p=new URLSearchParams(window.location.search);
    var t=p.get('t'),u=p.get('u');
    if(t){
      sessionStorage.setItem('sb_t',t);
      sessionStorage.setItem('sb_u',u||'');
      window.history.replaceState({},'',window.location.pathname);
      return{access_token:t,user:{id:u}};
    }
    var st=sessionStorage.getItem('sb_t');
    if(st)return{access_token:st,user:{id:sessionStorage.getItem('sb_u')||''}};
  }catch(e){}
  return null;
}

// ── Supabase ──
async function sbFetch(path){
  var tok=SB_SESSION&&SB_SESSION.access_token?SB_SESSION.access_token:SB_KEY;
  var r=await fetch(SB_URL+'/rest/v1/'+path,{headers:{'apikey':SB_KEY,'Authorization':'Bearer '+tok,'Content-Type':'application/json'}});
  if(!r.ok)throw new Error(r.status);
  return r.json();
}
async function sbPost(table,data,prefer){
  var tok=SB_SESSION&&SB_SESSION.access_token?SB_SESSION.access_token:SB_KEY;
  var r=await fetch(SB_URL+'/rest/v1/'+table,{
    method:'POST',
    headers:{'apikey':SB_KEY,'Authorization':'Bearer '+tok,'Content-Type':'application/json','Prefer':prefer||'return=minimal'},
    body:JSON.stringify(data)
  });
  return r;
}
async function sbUpsert(table,data,conflict){
  var tok=SB_SESSION&&SB_SESSION.access_token?SB_SESSION.access_token:SB_KEY;
  var url=SB_URL+'/rest/v1/'+table+(conflict?'?on_conflict='+conflict:'');
  var r=await fetch(url,{
    method:'POST',
    headers:{'apikey':SB_KEY,'Authorization':'Bearer '+tok,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(data)
  });
  return r;
}

// ── Helpers ──
function setText(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
function setHtml(id,v){var e=document.getElementById(id);if(e)e.innerHTML=v;}
function setStyle(id,p,v){var e=document.getElementById(id);if(e)e.style[p]=v;}
function toast(msg){
  var t=document.getElementById('toast-app');
  if(!t)return;
  t.textContent=msg;t.style.display='block';
  clearTimeout(t._to);t._to=setTimeout(function(){t.style.display='none';},2500);
}

// ── Navigation ──
function goNav(el,id){
  document.querySelectorAll('.bnav .bn').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('#main-scroll .scr').forEach(function(s){s.classList.remove('on');});
  var sc=document.getElementById(id);if(sc)sc.classList.add('on');
  if(el)el.classList.add('on');
  var scroll=document.getElementById('main-scroll');if(scroll)scroll.scrollTop=0;
  if(id==='sc-prog')loadUserProg();
  if(id==='sc-defis')renderDefis();
  if(id==='sc-suivi'){renderMensInputs();renderPoids();}
  if(id==='sc-alim'){loadSuivi7j();}
}

// ── Tabs programme ──
function switchProgTab(tab){
  document.getElementById('prog-tab-prog').style.display=tab==='prog'?'block':'none';
  document.getElementById('prog-tab-circuit').style.display=tab==='circuit'?'block':'none';
  var tp=document.getElementById('ptab-prog');
  var tc=document.getElementById('ptab-circuit');
  if(tp){tp.style.background=tab==='prog'?'var(--r)':'transparent';tp.style.color=tab==='prog'?'#fff':'var(--txm)';tp.style.border=tab==='prog'?'none':'0.5px solid rgba(255,255,255,0.1)';}
  if(tc){tc.style.background=tab==='circuit'?'var(--r)':'transparent';tc.style.color=tab==='circuit'?'#fff':'var(--txm)';tc.style.border=tab==='circuit'?'none':'0.5px solid rgba(255,255,255,0.1)';}
}

// ── Tabs suivi ──
function switchSuiviTab(tab){
  ['mens','poids','photos','msgs','tech'].forEach(function(t){
    var s=document.getElementById('sscr-'+t);if(s)s.style.display='none';
    var b=document.getElementById('stab-'+t);
    if(b){b.style.background='transparent';b.style.color='var(--txm)';b.style.border='0.5px solid rgba(255,255,255,0.1)';}
  });
  var sc=document.getElementById('sscr-'+tab);if(sc)sc.style.display='block';
  var bc=document.getElementById('stab-'+tab);
  if(bc){bc.style.background='var(--r)';bc.style.color='#fff';bc.style.border='none';}
  if(tab==='poids')renderPoids();
  if(tab==='photos')renderPhotoGrid();
}

// ── Charger données ──
async function loadAppData(){
  SB_SESSION=getSession();
  if(!SB_SESSION){console.log('Pas de session');return;}
  var uid=SB_SESSION.user.id;
  try{
    // Profil
    var prof=await sbFetch('profiles?id=eq.'+uid+'&select=*');
    if(prof&&prof[0]){
      USER_PROFILE=prof[0];
      setText('home-prenom',prof[0].prenom||'');
      var av=document.getElementById('top-av');
      if(av)av.textContent=(prof[0].prenom||'?')[0].toUpperCase();
      setText('profil-email',prof[0].email||'');
    }
    // XP / Niveau
    var niv=await sbFetch('niveaux?client_id=eq.'+uid+'&select=*');
    if(niv&&niv[0]){
      var xp=niv[0].xp_total||0;
      var lvl=Math.max(1,Math.floor(xp/100)+1);
      var noms=['Débutant','Rookie','Confirmé','Avancé','Expert','Elite','Légende'];
      var prev=(lvl-1)*100,next=lvl*100,pct=Math.round((xp-prev)/(next-prev)*100);
      setText('home-lvl',lvl);setText('home-lvl-2',lvl);setText('home-lvl-next',lvl+1);
      setText('home-xp-total',xp);setText('home-xp-in',xp-prev);setText('home-xp-need',next-prev);
      setText('top-lvl','Niv. '+lvl);
      setText('home-lvl-name',noms[Math.min(lvl-1,noms.length-1)]);
      setStyle('home-xp-bar','width',Math.min(100,pct)+'%');
    }
    // Ecran client
    var ec=await sbFetch('ecran_client?client_id=eq.'+uid+'&select=*&limit=1');
    if(ec&&ec[0]){
      var vic=[];try{vic=JSON.parse(ec[0].victoires||'[]');}catch(e){}
      var vig=[];try{vig=JSON.parse(ec[0].points_attention||'[]');}catch(e){}
      var motiv=ec[0].note_motivation||ec[0].note_visible||'';
      setHtml('home-victoires',vic.length
        ?vic.map(function(v){return'<div style="display:flex;gap:6px;margin-bottom:6px"><span style="color:#4CAF7A;flex-shrink:0">✓</span><span style="font-size:12px;color:var(--tx)">'+v+'</span></div>';}).join('')
        :'<div style="font-size:12px;color:var(--txm)">Aucune victoire ce mois</div>');
      setHtml('home-vigilance',vig.length
        ?vig.map(function(v){return'<div style="display:flex;gap:6px;margin-bottom:6px"><span style="color:var(--or);flex-shrink:0">⚠</span><span style="font-size:12px;color:var(--tx)">'+v+'</span></div>';}).join('')
        :'<div style="font-size:12px;color:var(--txm)">Aucun point ce mois</div>');
      if(motiv)setText('home-motivation',motiv);
    }
    // Diet
    var diet=await sbFetch('dietes?client_id=eq.'+uid+'&actif=eq.true&select=*&limit=1');
    if(diet&&diet[0]){
      var d=diet[0];
      var kcal=d.kcal||d.kcal_jour||0;
      var prot=d.proteines||d.proteines_g||0;
      var gluc=d.glucides||d.glucides_g||0;
      var lip=d.lipides||d.lipides_g||0;
      setText('diet-kcal',kcal+' kcal');
      setText('diet-prot',prot+' g');
      setText('diet-gluc',gluc+' g');
      setText('diet-lip',lip+' g');
      if(kcal>0){
        setStyle('bar-prot','width',Math.min(100,prot*4/kcal*100)+'%');
        setStyle('bar-gluc','width',Math.min(100,gluc*4/kcal*100)+'%');
        setStyle('bar-lip','width',Math.min(100,lip*9/kcal*100)+'%');
      }
      setStyle('nutri-plan-block','display','block');
      setStyle('nutri-cta-block','display','none');
    }
    // Suivi du jour
    var today=new Date().toISOString().split('T')[0];
    var sv=await sbFetch('suivi_quotidien?client_id=eq.'+uid+'&date_suivi=eq.'+today+'&select=*');
    if(sv&&sv[0]){SUIVI_W=sv[0].eau_verres||0;SUIVI_S=sv[0].sommeil_h||0;SUIVI_P=sv[0].pas||0;}
    updateSuiviUI();
    // Poids accueil
    var pe=await sbFetch('pesees?client_id=eq.'+uid+'&order=date_pesee.desc&select=poids_kg,date_pesee&limit=2');
    if(pe&&pe[0]){
      setText('home-poids',pe[0].poids_kg+' kg');
      if(pe[1]){var diff=(pe[0].poids_kg-pe[1].poids_kg).toFixed(1);setText('home-vari',(diff>0?'+':'')+diff+' kg');}
    }
    // Séances du mois
    var mois=new Date();mois.setDate(1);
    var xpl=await sbFetch('xp_log?client_id=eq.'+uid+'&created_at=gte.'+mois.toISOString().split('T')[0]+'&source=eq.seance_exo&select=id');
    setText('home-seances',(xpl||[]).length);
    // Prochain RDV
    var rdvs=await sbFetch('rdv_coach?client_id=eq.'+uid+'&date_rdv=gte.'+today+'&order=date_rdv.asc&limit=1&select=date_rdv,type');
    if(rdvs&&rdvs[0]){
      var moisFr=['jan','fev','mar','avr','mai','juin','juil','aout','sept','oct','nov','dec'];
      var ds=rdvs[0].date_rdv.substr(0,10).split('-');
      setText('home-rdv-date',ds[2]+' '+moisFr[parseInt(ds[1])-1]+' a '+rdvs[0].date_rdv.substr(11,5));
      setText('home-rdv-type',rdvs[0].type||'RDV coaching');
      setStyle('home-rdv-block','display','block');
    }
    // Circuit du mois
    loadCircuit();
    // Date
    var jrs=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    var mFr=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
    var n=new Date();
    setText('home-date',jrs[n.getDay()]+' '+n.getDate()+' '+mFr[n.getMonth()]+' '+n.getFullYear());
    // Programme
    loadUserProg();
    // Défis
    loadDefis();
  }catch(e){console.error('loadAppData:',e);}
}

// ── Programme ──
async function loadUserProg(){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  var cont=document.getElementById('prog-seance-cont');
  try{
    var rows=await sbFetch('programmes_clients?client_id=eq.'+uid+'&select=*&order=ordre.asc,id.asc');
    if(!rows||!rows.length){
      if(cont)cont.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--txm);font-size:13px"><i class="ti ti-barbell" style="font-size:32px;display:block;margin-bottom:10px;opacity:0.3"></i>Ton coach na pas encore assigne de programme.</div>';
      return;
    }
    PROG_JOURS=rows.map(function(r){
      var exos=[];try{exos=JSON.parse(r.exercices||'[]');}catch(e){}
      return{nom:r.jour_nom,muscles:r.muscles_cibles||'',exos:exos};
    });
    renderProgTabs();
    renderProgJour(0);
  }catch(e){console.error('loadUserProg:',e);}
}

function renderProgTabs(){
  var tabs=document.getElementById('day-tabs-prog');
  if(!tabs)return;
  tabs.innerHTML=PROG_JOURS.map(function(j,i){
    return'<button onclick="renderProgJour('+i+')" id="jtab-'+i+'" style="padding:7px 14px;border-radius:20px;border:'+(i===0?'none':'0.5px solid rgba(255,255,255,0.1)')+';background:'+(i===0?'var(--r)':'transparent')+';color:'+(i===0?'#fff':'var(--txm)')+';font-size:12px;font-weight:'+(i===0?'600':'400')+';cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;">'+j.nom+'</button>';
  }).join('');
}

function renderProgJour(i){
  PROG_JOUR_ACTIF=i;
  PROG_JOURS.forEach(function(_,idx){
    var btn=document.getElementById('jtab-'+idx);
    if(!btn)return;
    btn.style.background=idx===i?'var(--r)':'transparent';
    btn.style.color=idx===i?'#fff':'var(--txm)';
    btn.style.border=idx===i?'none':'0.5px solid rgba(255,255,255,0.1)';
    btn.style.fontWeight=idx===i?'600':'400';
  });
  var j=PROG_JOURS[i];
  var cont=document.getElementById('prog-seance-cont');
  if(!j||!cont)return;
  var html='<div style="font-size:14px;font-weight:600;color:var(--tx);margin-bottom:4px">'+j.nom+'</div>';
  if(j.muscles)html+='<div style="font-size:10px;color:var(--txm);margin-bottom:14px">'+j.muscles+'</div>';
  if(j.exos.length){
    html+=j.exos.map(function(e,ei){
      return'<div style="background:var(--c2);border-radius:12px;padding:12px 14px;margin-bottom:8px;">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
        +'<div style="flex:1;">'
        +'<div style="font-size:13px;font-weight:500;color:var(--tx)">'+e.nom+'</div>'
        +'<div style="font-size:10px;color:var(--txm);margin-top:2px">'+e.series+' x '+e.reps+' · repos '+e.repos+(e.charge?' · '+e.charge+'kg':'')+'</div>'
        +(e.note_client?'<div style="font-size:11px;color:var(--or);margin-top:3px;font-style:italic">'+e.note_client+'</div>':'')
        +'</div>'
        +'<div id="chk-'+ei+'" onclick="valExo('+ei+')" style="width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all 0.2s;">'
        +'<i class="ti ti-check" style="font-size:12px;display:none;color:#fff" id="chk-ico-'+ei+'"></i>'
        +'</div></div>'
        +'<div style="display:flex;align-items:center;gap:8px;">'
        +'<input type="number" placeholder="Charge (kg)" step="0.5" id="charge-'+ei+'" style="flex:1;background:var(--c3);border:0.5px solid rgba(255,255,255,0.08);border-radius:8px;padding:7px 10px;color:var(--tx);font-size:13px;font-family:inherit;">'
        +'<button onclick="saveCharge('+ei+')" style="padding:7px 12px;background:rgba(0,191,255,0.1);border:0.5px solid rgba(0,191,255,0.25);border-radius:8px;color:var(--b);font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;">Sauver</button>'
        +'</div></div>';
    }).join('');
  } else {
    html+='<div style="text-align:center;padding:20px;color:var(--txm);font-size:12px">Aucun exercice dans ce jour</div>';
  }
  html+='<button onclick="validerSeance()" style="width:100%;margin-top:14px;padding:13px;background:var(--r);border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;letter-spacing:0.5px"><i class="ti ti-check" style="font-size:14px"></i> Valider la seance</button>';
  cont.innerHTML=html;
}

function valExo(idx){
  var chk=document.getElementById('chk-'+idx);
  var ico=document.getElementById('chk-ico-'+idx);
  if(!chk)return;
  var done=chk.getAttribute('data-done')==='1';
  if(!done){
    chk.style.background='var(--gr)';chk.style.borderColor='var(--gr)';
    if(ico)ico.style.display='flex';chk.setAttribute('data-done','1');
  } else {
    chk.style.background='';chk.style.borderColor='rgba(255,255,255,0.2)';
    if(ico)ico.style.display='none';chk.setAttribute('data-done','0');
  }
}

async function saveCharge(idx){
  if(!SB_SESSION)return;
  var inp=document.getElementById('charge-'+idx);
  if(!inp||!inp.value){toast('Entre une charge');return;}
  var j=PROG_JOURS[PROG_JOUR_ACTIF];
  if(!j||!j.exos[idx])return;
  try{
    await sbPost('historique_charges',{
      client_id:SB_SESSION.user.id,
      exercice_nom:j.exos[idx].nom,
      charge_kg:parseFloat(inp.value),
      date_seance:new Date().toISOString().split('T')[0]
    });
    toast('Charge sauvegardee !');
  }catch(e){toast('Erreur save charge');}
}

async function validerSeance(){
  if(!SB_SESSION){toast('Non connecte');return;}
  try{
    await sbPost('xp_log',{client_id:SB_SESSION.user.id,source:'seance_exo',xp:10,created_at:new Date().toISOString()});
    toast('+10 XP — Seance validee ');
    var cur=parseInt(document.getElementById('home-xp-total').textContent||'0')+10;
    setText('home-xp-total',cur);
    showXpPop(10);
  }catch(e){toast('Seance validee !');}
}

function showXpPop(xp){
  var el=document.getElementById('xp-pop');
  var val=document.getElementById('xp-pop-val');
  if(!el)return;
  if(val)val.textContent='+'+xp;
  el.style.display='block';
  setTimeout(function(){el.style.display='none';},2000);
}

// ── Circuit du mois ──
async function loadCircuit(){
  var cont=document.getElementById('home-circuit');
  if(!cont||!SB_SESSION)return;
  try{
    var uid=SB_SESSION.user.id;
    var rows=await sbFetch('programmes_clients?client_id=eq.'+uid+'&select=*&order=ordre.asc&limit=1');
    if(rows&&rows.length){
      cont.innerHTML='<div style="font-size:12px;color:var(--tx);font-weight:500;margin-bottom:4px">'+rows[0].jour_nom+'</div>'
        +'<div style="font-size:11px;color:var(--txm)">'+rows[0].muscles_cibles+'</div>';
    }
  }catch(e){}
}

// ── Timer ──
var timerInt=null,timerSec=90,timerRunning=false;
function timerSet(s){
  if(timerInt)clearInterval(timerInt);
  timerSec=s;timerRunning=false;
  updateTimerDisplay();
  var btn=document.getElementById('timer-btn');
  if(btn){btn.textContent='Start';btn.style.background='var(--r)';}
}
function timerSetCustom(){
  var inp=document.getElementById('timer-custom');
  if(!inp||!inp.value)return;
  timerSet(Math.max(5,Math.min(600,parseInt(inp.value))));
}
function timerToggle(){
  var btn=document.getElementById('timer-btn');
  if(timerRunning){
    clearInterval(timerInt);timerRunning=false;
    if(btn){btn.textContent='Start';btn.style.background='var(--r)';}
  } else {
    timerRunning=true;
    if(btn){btn.textContent='Pause';btn.style.background='var(--or)';}
    timerInt=setInterval(function(){
      timerSec--;
      updateTimerDisplay();
      if(timerSec<=0){
        clearInterval(timerInt);timerRunning=false;
        timerSec=90;
        if(btn){btn.textContent='Start';btn.style.background='var(--r)';}
        toast('Repos termine !');
        updateTimerDisplay();
      }
    },1000);
  }
}
function updateTimerDisplay(){
  var el=document.getElementById('timer-display');
  if(!el)return;
  var m=Math.floor(Math.abs(timerSec)/60);
  var s=Math.abs(timerSec)%60;
  el.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}

// ── Suivi eau/sommeil/pas ──
function updateSuiviUI(){
  setText('hv-w',SUIVI_W);
  setText('hv-s',SUIVI_S);
  setText('hv-p',SUIVI_P>=1000?Math.round(SUIVI_P/100)/10+'k':SUIVI_P);
}
function adjH(type,val){
  if(type==='w')SUIVI_W=Math.max(0,SUIVI_W+val);
  else if(type==='s')SUIVI_S=Math.max(0,Math.round((SUIVI_S+val)*10)/10);
  else if(type==='p')SUIVI_P=Math.max(0,SUIVI_P+val);
  updateSuiviUI();
}
async function saveSuiviToSupabase(){
  if(!SB_SESSION){toast('Non connecte');return;}
  var uid=SB_SESSION.user.id;
  var today=new Date().toISOString().split('T')[0];
  try{
    await sbUpsert('suivi_quotidien',{client_id:uid,date_suivi:today,eau_verres:SUIVI_W,sommeil_h:SUIVI_S,pas:SUIVI_P},'client_id,date_suivi');
    toast('Suivi sauvegarde !');
    if(SUIVI_W>=8||SUIVI_S>=8||SUIVI_P>=10000){
      await sbPost('xp_log',{client_id:uid,source:'suivi',xp:5,created_at:new Date().toISOString()});
      showXpPop(5);
    }
    loadSuivi7j();
  }catch(e){toast('Erreur suivi');}
}

// ── Graphe 7 jours ──
async function setSuiviMode(mode){
  SUIVI_MODE=mode;
  var cfg={
    eau:{id:'sg-eau',color:'var(--b)',bc:'rgba(0,191,255,0.3)',bg:'rgba(0,191,255,0.1)',target:8},
    sommeil:{id:'sg-som',color:'var(--r2)',bc:'rgba(200,50,50,0.3)',bg:'rgba(200,50,50,0.1)',target:8},
    pas:{id:'sg-pas',color:'var(--gr)',bc:'rgba(76,175,122,0.3)',bg:'rgba(76,175,122,0.1)',target:10}
  };
  Object.keys(cfg).forEach(function(m){
    var btn=document.getElementById(cfg[m].id);
    if(!btn)return;
    var active=m===mode;
    btn.style.borderColor=active?cfg[m].bc:'rgba(255,255,255,0.1)';
    btn.style.background=active?cfg[m].bg:'transparent';
    btn.style.color=active?cfg[m].color:'var(--txm)';
  });
  await loadSuivi7j();
}
async function loadSuivi7j(){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  var days=[],labels=[],jourNoms=['D','L','M','M','J','V','S'];
  for(var i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().split('T')[0]);labels.push(jourNoms[d.getDay()]);}
  try{
    var data=await sbFetch('suivi_quotidien?client_id=eq.'+uid+'&date_suivi=gte.'+days[0]+'&select=date_suivi,eau_verres,sommeil_h,pas');
    var byDate={};(data||[]).forEach(function(r){byDate[r.date_suivi]=r;});
    var cfg={eau:{field:'eau_verres',color:'var(--b)',target:8},sommeil:{field:'sommeil_h',color:'var(--r2)',target:8},pas:{field:'pas',color:'var(--gr)',target:10000}};
    var c=cfg[SUIVI_MODE]||cfg.eau;
    var vals=days.map(function(d){var r=byDate[d];if(!r)return 0;return parseFloat(r[c.field])||0;});
    var max=Math.max.apply(null,vals)||c.target;
    var gc=document.getElementById('suivi-graph-7j');
    var lc=document.getElementById('suivi-graph-labels');
    if(gc)gc.innerHTML=vals.map(function(v){
      var h=Math.max(4,Math.round(v/max*52));
      var ok=v>=c.target;
      var label=SUIVI_MODE==='pas'?(v>=1000?Math.round(v/100)/10+'k':v):v;
      return'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">'
        +'<div style="font-size:8px;color:'+(ok?c.color:'var(--txm)')+'">'+label+'</div>'
        +'<div style="height:'+h+'px;background:'+(ok?c.color:'var(--c3)')+';border-radius:3px 3px 0 0;width:100%;transition:height 0.3s;"></div>'
        +'</div>';
    }).join('');
    if(lc)lc.innerHTML=labels.map(function(l){return'<div style="flex:1;text-align:center;font-size:9px;color:var(--txm)">'+l+'</div>';}).join('');
  }catch(e){console.log('suivi7j:',e);}
}

// ── Poids ──
async function addPeseeApp(){
  if(!SB_SESSION){toast('Non connecte');return;}
  var inp=document.getElementById('poids-input');
  if(!inp||!inp.value){toast('Entre ton poids');return;}
  try{
    await sbUpsert('pesees',{client_id:SB_SESSION.user.id,poids_kg:parseFloat(inp.value),date_pesee:new Date().toISOString().split('T')[0]},'client_id,date_pesee');
    toast('Poids enregistre !');inp.value='';
    renderPoids();
  }catch(e){toast('Erreur poids');}
}
async function renderPoids(){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  try{
    var pe=await sbFetch('pesees?client_id=eq.'+uid+'&order=date_pesee.asc&select=poids_kg,date_pesee&limit=10');
    if(!pe||!pe.length)return;
    var max=Math.max.apply(null,pe.map(function(p){return p.poids_kg;}));
    var min=Math.min.apply(null,pe.map(function(p){return p.poids_kg;}));
    var range=max-min||1;
    var gc=document.getElementById('graph-poids');
    var lc=document.getElementById('graph-poids-labels');
    if(gc)gc.innerHTML=pe.map(function(p,i){
      var h=Math.round((p.poids_kg-min)/range*60)+10;
      var isLast=i===pe.length-1;
      return'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">'
        +'<div style="font-size:8px;color:'+(isLast?'var(--ant)':'var(--txm)')+'">'+p.poids_kg+'</div>'
        +'<div style="height:'+h+'px;background:'+(isLast?'var(--ant)':'var(--r)')+';opacity:'+(isLast?1:0.6)+';border-radius:3px 3px 0 0;width:100%;"></div>'
        +'</div>';
    }).join('');
    if(lc)lc.innerHTML=pe.map(function(p){
      var d=p.date_pesee.substr(5);
      return'<div style="flex:1;text-align:center;font-size:8px;color:var(--txm)">'+d+'</div>';
    }).join('');
    // Accueil
    var last=pe[pe.length-1];
    setText('home-poids',last.poids_kg+' kg');
    if(pe.length>=2){var diff=(last.poids_kg-pe[pe.length-2].poids_kg).toFixed(1);setText('home-vari',(diff>0?'+':'')+diff+' kg');}
  }catch(e){}
}

// ── Mensurations ──
function renderMensInputs(){
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
  if(!SB_SESSION){toast('Non connecte');return;}
  var uid=SB_SESSION.user.id;
  var data={client_id:uid,date_mesure:new Date().toISOString().split('T')[0]};
  ['tour_bras','tour_taille','tour_hanches','tour_cuisse'].forEach(function(f){
    var el=document.getElementById('mens-'+f);if(el&&el.value)data[f]=parseFloat(el.value);
  });
  try{
    await sbUpsert('mensurations',data,'client_id,date_mesure');
    toast('Mensurations sauvegardees !');
  }catch(e){toast('Erreur mensurations');}
}

// ── Photos ──
var photosData=[];
var compA=null,compB=null;
function importPhoto(){document.getElementById('photo-input').click();}
function handlePhotoFile(input){
  if(!input.files||!input.files[0])return;
  var reader=new FileReader();
  reader.onload=function(e){
    photosData.unshift({src:e.target.result,date:new Date().toLocaleDateString('fr-FR')});
    try{localStorage.setItem('co_photos',JSON.stringify(photosData.slice(0,20)));}catch(er){}
    renderPhotoGrid();
  };
  reader.readAsDataURL(input.files[0]);
}
function renderPhotoGrid(){
  var cont=document.getElementById('photo-grid-cont');
  if(!cont)return;
  try{var s=localStorage.getItem('co_photos');if(s)photosData=JSON.parse(s);}catch(e){}
  if(!photosData.length){cont.innerHTML='<div style="font-size:12px;color:var(--txm);text-align:center;padding:20px;grid-column:1/-1">Aucune photo</div>';return;}
  cont.innerHTML=photosData.map(function(p,i){
    return'<div onclick="viewPhoto('+i+')" style="aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;">'
      +'<img src="'+p.src+'" style="width:100%;height:100%;object-fit:cover;">'
      +'<div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.7));padding:3px 5px;font-size:8px;color:#fff">'+p.date+'</div>'
      +'</div>';
  }).join('');
}
function viewPhoto(i){
  var p=photosData[i];if(!p)return;
  var m=document.createElement('div');
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:9999;display:flex;align-items:center;justify-content:center;';
  m.onclick=function(){m.remove();};
  m.innerHTML='<div style="text-align:center;">'
    +'<img src="'+p.src+'" style="max-width:90vw;max-height:80vh;border-radius:12px;object-fit:contain;display:block;margin:auto;">'
    +'<div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:8px">'+p.date+' · Tap pour fermer</div>'
    +'</div>';
  document.body.appendChild(m);
}
function pickComp(side){
  if(!photosData.length){toast('Ajoute des photos dabord');return;}
  var idx=prompt('Numero de la photo (1 = plus recente) :');
  if(!idx)return;
  var p=photosData[parseInt(idx)-1];if(!p){toast('Photo introuvable');return;}
  var el=document.getElementById('comp-'+side);
  if(el){
    el.innerHTML='<img src="'+p.src+'" style="width:100%;height:100%;object-fit:cover;">';
    if(side==='a')compA=p;else compB=p;
  }
}

// ── Messages ──
var msgs=[];
function envoyerMsg(){
  var inp=document.getElementById('msg-input');
  if(!inp||!inp.value.trim())return;
  msgs.push({text:inp.value.trim(),from:'client',time:new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})});
  inp.value='';
  renderMsgs();
}
function renderMsgs(){
  var cont=document.getElementById('msgs-list');
  if(!cont)return;
  if(!msgs.length){cont.innerHTML='<div style="text-align:center;color:var(--txm);font-size:12px;padding:20px">Aucun message</div>';return;}
  cont.innerHTML=msgs.map(function(m){
    var isMe=m.from==='client';
    return'<div style="display:flex;justify-content:'+(isMe?'flex-end':'flex-start')+';margin-bottom:4px;">'
      +'<div style="max-width:75%;background:'+(isMe?'var(--r)':'var(--c2)')+';border-radius:12px;padding:8px 12px;">'
      +'<div style="font-size:13px;color:#fff">'+m.text+'</div>'
      +'<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-top:2px;text-align:right">'+m.time+'</div>'
      +'</div></div>';
  }).join('');
  cont.scrollTop=cont.scrollHeight;
}

// ── Technique ──
var techFile=null;
function techFileSelected(input){
  if(!input.files||!input.files[0])return;
  techFile=input.files[0];
  var prev=document.getElementById('tech-preview');
  if(prev){prev.textContent=techFile.name+' selectionne';prev.style.display='block';}
}
function envoyerTech(){
  var q=document.getElementById('tech-question');
  if(!q||!q.value.trim()){toast('Decris ton probleme');return;}
  toast('Question envoyee a Antoine !');
  q.value='';techFile=null;
  var prev=document.getElementById('tech-preview');if(prev)prev.style.display='none';
}

// ── Défis ──
var DEFIS_DONE={};
async function loadDefis(){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  // Défis statiques + chargement XP
  DEFIS_DATA=[
    {id:'eau',label:'Boire 8 verres d\'eau',xp:5,icon:'ti-droplet'},
    {id:'sommeil',label:'Dormir 8 heures',xp:5,icon:'ti-moon'},
    {id:'pas',label:'10 000 pas dans la journee',xp:10,icon:'ti-shoe'},
    {id:'seance',label:'Completer une seance',xp:10,icon:'ti-barbell'},
    {id:'mesure',label:'Peser et noter ton poids',xp:5,icon:'ti-scale'},
    {id:'repas',label:'Suivre ton plan nutritionnel',xp:5,icon:'ti-apple'},
  ];
  // Charger les defis valides aujourd'hui
  var today=new Date().toISOString().split('T')[0];
  try{
    var done=await sbFetch('xp_log?client_id=eq.'+uid+'&created_at=gte.'+today+'&select=source');
    (done||[]).forEach(function(d){DEFIS_DONE[d.source]=true;});
  }catch(e){}
  renderDefis();
}
function renderDefis(){
  var cont=document.getElementById('defis-list');
  if(!cont)return;
  if(!DEFIS_DATA.length){cont.innerHTML='<div style="text-align:center;padding:20px;color:var(--txm)">Chargement...</div>';return;}
  var total=DEFIS_DATA.length;
  var done=DEFIS_DATA.filter(function(d){return DEFIS_DONE[d.id];}).length;
  setText('defis-count',done);setText('defis-total',total);
  setStyle('defis-bar','width',Math.round(done/total*100)+'%');
  cont.innerHTML=DEFIS_DATA.map(function(d){
    var isDone=!!DEFIS_DONE[d.id];
    return'<div style="background:var(--c1);border:0.5px solid rgba(255,255,255,'+(isDone?'0.1':'0.05')+');border-radius:14px;padding:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;">'
      +'<div style="width:42px;height:42px;border-radius:12px;background:'+(isDone?'rgba(76,175,122,0.15)':'var(--c2)')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
      +'<i class="ti '+d.icon+'" style="font-size:18px;color:'+(isDone?'var(--gr)':'var(--txm)')+'"></i>'
      +'</div>'
      +'<div style="flex:1;">'
      +'<div style="font-size:13px;font-weight:500;color:'+(isDone?'var(--txm)':'var(--tx)')+';'+(isDone?'text-decoration:line-through;':'')+'">'+d.label+'</div>'
      +'<div style="font-size:10px;color:'+(isDone?'var(--gr)':'var(--txm)')+'">+'+(isDone?d.xp+' XP gagne':d.xp+' XP')+'</div>'
      +'</div>'
      +(isDone?'<i class="ti ti-check" style="font-size:18px;color:var(--gr)"></i>'
        :'<button onclick="validerDefi(\''+d.id+'\','+d.xp+')" style="padding:7px 14px;background:var(--r);border:none;border-radius:10px;color:#fff;font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;">Valider</button>')
      +'</div>';
  }).join('');
}
async function validerDefi(id,xp){
  if(!SB_SESSION){toast('Non connecte');return;}
  if(DEFIS_DONE[id]){toast('Deja valide !');return;}
  try{
    await sbPost('xp_log',{client_id:SB_SESSION.user.id,source:id,xp:xp,created_at:new Date().toISOString()});
    DEFIS_DONE[id]=true;
    toast('+'+xp+' XP !');
    showXpPop(xp);
    renderDefis();
  }catch(e){toast('Erreur defi');}
}

// ── Profil ──
function openProfilModal(){var m=document.getElementById('modal-profil');if(m)m.style.display='flex';}
function closeProfilModal(){var m=document.getElementById('modal-profil');if(m)m.style.display='none';}
function logoutApp(){sessionStorage.clear();window.location.href='hub.html';}

// ── Init ──
renderMensInputs();
loadAppData();
