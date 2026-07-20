// ══ CONFIG ══
var SB_URL='https://uumgpbruxsxskfrvjlzt.supabase.co';
var SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1bWdwYnJ1eHN4c2tmcnZqbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMjY3ODYsImV4cCI6MjA5NzgwMjc4Nn0.T7qiBNtmGPuKhjgd0LobYbbhRz0Yffm0iZ9A8Y4pPJw';
var SB_SESSION=null,USER_PROFILE=null,USER_NIVEAU=null,COACH_ID=null;

// ══ SUPABASE HELPERS ══
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

async function sbFetch(path){var h={'apikey':SB_KEY,'Content-Type':'application/json'};if(SB_SESSION)h['Authorization']='Bearer '+SB_SESSION.access_token;var r=await fetch(SB_URL+'/rest/v1/'+path,{headers:h});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function sbPost(table,data){var h={'apikey':SB_KEY,'Content-Type':'application/json','Prefer':'return=representation'};if(SB_SESSION)h['Authorization']='Bearer '+SB_SESSION.access_token;var r=await fetch(SB_URL+'/rest/v1/'+table,{method:'POST',headers:h,body:JSON.stringify(data)});return r.json();}
async function sbUpsert(table,data,onConflict){var h={'apikey':SB_KEY,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'};if(SB_SESSION)h['Authorization']='Bearer '+SB_SESSION.access_token;var url=SB_URL+'/rest/v1/'+table+(onConflict?'?on_conflict='+onConflict:'');var r=await fetch(url,{method:'POST',headers:h,body:JSON.stringify(data)});return r.json();}

// ══ CHARGEMENT DATA ══
async function loadAppData(){
  console.log('=== LOAD APP COACHING ===');
  try{
    SB_SESSION=getSession();
    if(!SB_SESSION){console.log('Pas de session');return;}
    var uid=SB_SESSION.user.id;
    var profiles=await sbFetch('profiles?id=eq.'+uid+'&select=*');
    if(profiles&&profiles[0])USER_PROFILE=profiles[0];
    var niveaux=await sbFetch('niveaux?client_id=eq.'+uid+'&select=*');
    if(niveaux&&niveaux[0])USER_NIVEAU=niveaux[0];
    var coaches=await sbFetch('profiles?role=eq.coach&select=id&limit=1');
    if(coaches&&coaches[0])COACH_ID=coaches[0].id;
    var dietes=await sbFetch('dietes?client_id=eq.'+uid+'&actif=eq.true&select=*&limit=1');
    if(dietes&&dietes[0])updateDietUI(dietes[0]);
    var ecran=await sbFetch('ecran_client?client_id=eq.'+uid+'&select=*&limit=1');
    if(ecran&&ecran[0])updateEcranUI(ecran[0]);
    var today=new Date().toISOString().split('T')[0];
    var suivi=await sbFetch('suivi_quotidien?client_id=eq.'+uid+'&date_suivi=eq.'+today+'&select=*');
    if(suivi&&suivi[0]){
      var s=suivi[0];
      localStorage.setItem('suivi_date',today);
      localStorage.setItem('suivi_w',s.eau_verres||0);
      localStorage.setItem('suivi_s',s.sommeil_h||0);
      localStorage.setItem('suivi_p',s.pas||0);
      initSuiviQuotidien();
    }
    updateAppUI();
    console.log('App OK');
  }catch(e){console.error('App error:',e.message);}
}

function updateAppUI(){
  if(!USER_PROFILE)return;
  var p=USER_PROFILE;
  var prenom=p.prenom||'';var nom=p.nom||'';
  var initiales=((prenom[0]||'?')+(nom[0]||'?')).toUpperCase();
  var fullName=(prenom+' '+nom).trim()||p.email;
  var role=p.role==='coaching_distanciel'?'Coaching Distanciel':p.role==='coaching_presentiel'?'Coaching Présentiel':'Coaching';
  var sem=p.created_at?Math.floor((Date.now()-new Date(p.created_at))/(7*24*3600*1000)):0;
  var tn=document.getElementById('top-name');if(tn)tn.textContent=prenom||fullName;
  var ta=document.getElementById('top-av');if(ta)ta.textContent=initiales;
  var pn=document.getElementById('profil-name');if(pn)pn.textContent=fullName;
  var pt=document.getElementById('profil-type');if(pt)pt.textContent=role+' · Sem. '+sem;
  var pa=document.getElementById('profil-av');if(pa)pa.textContent=initiales;
  var pn2=document.getElementById('profil-name2');if(pn2)pn2.textContent=fullName;
  var pt2=document.getElementById('profil-type2');if(pt2)pt2.textContent=role+' · Sem. '+sem;
  var ppn=document.getElementById('profil-prenom-disp');if(ppn)ppn.textContent=prenom||'—';
  var pln=document.getElementById('profil-nom-disp');if(pln)pln.textContent=nom||'—';
  var pem=document.getElementById('profil-email-disp');if(pem)pem.textContent=p.email||'—';
  var lhName=document.getElementById('lh-name');if(lhName)lhName.textContent=fullName;
  updateXPBar();
  updateBonusDisplay();

  // ── Mise à jour sc-home ──
  var hp = document.getElementById('home-prenom');
  if(hp) hp.textContent = prenom || 'Lucas';
  var hd = document.getElementById('home-date');
  if(hd){
    var jours=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    var mois=['jan.','fév.','mar.','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
    var now=new Date();
    hd.textContent=jours[now.getDay()]+' '+now.getDate()+' '+mois[now.getMonth()]+' '+now.getFullYear();
  }
  // Poids actuel
  var hp2=document.getElementById('home-poids');
  var lastPoids = (window.PESEES && window.PESEES.length) ? window.PESEES[window.PESEES.length-1].valeur : null;
  if(hp2) hp2.textContent = lastPoids ? lastPoids+' kg' : '—';
  var hv=document.getElementById('home-vari');
  if(hv && window.PESEES && window.PESEES.length>1){
    var diff=(window.PESEES[window.PESEES.length-1].valeur - window.PESEES[0].valeur).toFixed(1);
    hv.textContent=(diff>0?'+':'')+diff+' kg ce mois';
    hv.style.color=diff<=0?'var(--b)':'var(--ant)';
  }
  // Victoires et points d'attention depuis ecran_client
  var hv2=document.getElementById('home-victoires');
  var ha=document.getElementById('home-attn');
  if(window._ecranData){
    if(hv2 && window._ecranData.victoires) hv2.innerHTML=window._ecranData.victoires.split('\n').map(function(v){return v?'<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:5px;"><span style="color:#4CAF7A;flex-shrink:0;">✓</span><span>'+v+'</span></div>':''}).join('');
    if(ha && window._ecranData.points_attention) ha.innerHTML=window._ecranData.points_attention.split('\n').map(function(v){return v?'<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:5px;"><span style="color:var(--or);flex-shrink:0;">!</span><span>'+v+'</span></div>':''}).join('');
  }

}

function updateDietUI(d){
  var k=document.getElementById('diet-kcal');if(k)k.textContent=(d.kcal_jour||'—')+' kcal';
  var pr=document.getElementById('diet-prot');if(pr)pr.textContent=(d.proteines_g||'—')+' g';
  var gl=document.getElementById('diet-gluc');if(gl)gl.textContent=(d.glucides_g||'—')+' g';
  var li=document.getElementById('diet-lip');if(li)li.textContent=(d.lipides_g||'—')+' g';
}

function updateEcranUI(e){
  var v=typeof e.victoires==='string'?JSON.parse(e.victoires||'[]'):e.victoires||[];
  var a=typeof e.points_attention==='string'?JSON.parse(e.points_attention||'[]'):e.points_attention||[];
  var vEl=document.getElementById('home-victoires');
  if(vEl&&v.length>0)vEl.innerHTML=v.map(function(x){return'<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:0.5px solid rgba(76,175,122,0.1)"><span style="font-size:12px">'+x+'</span><span style="background:rgba(76,175,122,0.1);border:0.5px solid rgba(76,175,122,0.3);color:var(--gr);border-radius:20px;padding:3px 8px;font-size:9px">✓</span></div>';}).join('');
  var aEl=document.getElementById('home-attn');
  if(aEl&&a.length>0)aEl.innerHTML=a.map(function(x){return'<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:0.5px solid rgba(232,149,58,0.1)"><div style="width:7px;height:7px;border-radius:50%;background:var(--or);flex-shrink:0;margin-top:4px"></div><span style="font-size:12px;color:var(--txm)">'+x+'</span></div>';}).join('');
  if(e.note_visible){var ci=document.getElementById('home-citation');if(ci)ci.textContent=e.note_visible;}
}

// ══ XP ══

function calcNiveau(xpTotal){
  // Niveau 1 = 10 XP, Niveau 2 = 15 XP, Niveau 3 = 20 XP...
  // Cumul pour niveau N = somme de (n*5+5) pour n=1..N
  var lvl = 1;
  var cumul = 0;
  while(true){
    var need = lvl * 5 + 5;
    if(cumul + need > xpTotal) return {lvl: lvl, xpIn: xpTotal - cumul, xpNeed: need};
    cumul += need;
    lvl++;
  }
}


function levelUp(newLvl){
  var phone=document.querySelector('.phone');if(!phone)return;
  var pw=phone.offsetWidth||390,ph=phone.offsetHeight||720;
  var overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;z-index:300;pointer-events:none;overflow:hidden;';
  var bg=document.createElement('div');
  bg.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.88);';
  overlay.appendChild(bg);
  var canvas=document.createElement('canvas');
  canvas.width=pw;canvas.height=ph;
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;';
  overlay.appendChild(canvas);
  var txt=document.createElement('div');
  txt.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;';
  txt.innerHTML='<div style="font-size:14px;letter-spacing:4px;color:rgba(255,215,0,0.7);margin-bottom:8px;text-shadow:0 0 20px rgba(255,215,0,0.5);font-family:\'Bebas Neue\',sans-serif">NIVEAU ATTEINT</div>'
    +'<div style="font-size:90px;letter-spacing:2px;color:#FFD700;text-shadow:0 0 30px rgba(255,215,0,1),0 0 60px rgba(255,215,0,0.6);line-height:1;font-family:\'Bebas Neue\',sans-serif">'+newLvl+'</div>'
    +'<div style="font-size:16px;letter-spacing:3px;color:rgba(255,215,0,0.8);margin-top:6px;text-shadow:0 0 15px rgba(255,215,0,0.6);font-family:\'Bebas Neue\',sans-serif">FÉLICITATIONS !</div>';
  overlay.appendChild(txt);
  phone.appendChild(overlay);
  var ctx=canvas.getContext('2d');
  var particles=[];
  var colors=['#FFD700','#00BFFF','#4CAF7A','#FF4444','#FF9500','#ffffff'];
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

function updateXPBar(){
  if(!USER_NIVEAU) USER_NIVEAU = {niveau:1, xp_total:0};
  var xpTotal=USER_NIVEAU.xp_total||0;
  var result = calcNiveau(xpTotal);
  var lvl = result.lvl;
  var xpIn = result.xpIn;
  var xpNeed = result.xpNeed;
  var pct = Math.min(100, Math.round(xpIn/xpNeed*100));
  // Détecter passage de niveau
  var prevLvl = USER_NIVEAU.niveau||1;
  if(lvl > prevLvl){
    USER_NIVEAU.niveau = lvl;
    levelUp(lvl);
    // Sauvegarder le nouveau niveau
    if(SB_SESSION){
      sbUpsert('niveaux',{client_id:SB_SESSION.user.id,niveau:lvl,xp_total:xpTotal},'client_id').catch(function(){});
    }
  }
  var bar=document.getElementById('xp-bar-fill');if(bar)bar.style.width=pct+'%';
  var xpCur=document.getElementById('xp-cur');if(xpCur)xpCur.textContent=xpIn+' XP';
  var xpNeedEl=document.getElementById('xp-need');if(xpNeedEl)xpNeedEl.textContent=xpNeed+' XP';
  var lhNum=document.getElementById('lh-num');if(lhNum)lhNum.textContent=lvl;
  var topLvl=document.getElementById('top-lvl');if(topLvl)topLvl.textContent=lvl;
  var homeXp=document.getElementById('home-xp');if(homeXp)homeXp.textContent=xpTotal;
}


// ══ SUIVI QUOTIDIEN — reset minuit + historique graphe ══
var SUIVI_HISTO=[];
var suiviGraphMode='eau';

function initSuiviQuotidien(){
  var today=new Date().toISOString().split('T')[0];
  var savedDate=localStorage.getItem('suivi_date');
  if(savedDate && savedDate!==today){
    var pEau=parseInt(localStorage.getItem('suivi_w'))||0;
    var pSomm=parseFloat(localStorage.getItem('suivi_s'))||0;
    var pPas=parseInt(localStorage.getItem('suivi_p'))||0;
    if(pEau>0||pSomm>0||pPas>0){
      try{var h=JSON.parse(localStorage.getItem('suivi_histo')||'[]');h.unshift({date:savedDate,eau:pEau,sommeil:pSomm,pas:pPas});if(h.length>30)h.pop();localStorage.setItem('suivi_histo',JSON.stringify(h));SUIVI_HISTO=h;}catch(e){}
    }
    localStorage.setItem('suivi_date',today);
    localStorage.setItem('suivi_w','0');
    localStorage.setItem('suivi_s','0');
    localStorage.setItem('suivi_p','0');
  }
  if(!savedDate){localStorage.setItem('suivi_date',today);}
  try{SUIVI_HISTO=JSON.parse(localStorage.getItem('suivi_histo')||'[]');}catch(e){}
  var hw=document.getElementById('hv-w');
  var hs=document.getElementById('hv-s');
  var hp=document.getElementById('hv-p');
  if(hw)hw.textContent=localStorage.getItem('suivi_w')||'0';
  if(hs)hs.textContent=localStorage.getItem('suivi_s')||'0';
  if(hp)hp.textContent=parseInt(localStorage.getItem('suivi_p')||'0').toLocaleString('fr-FR');
  renderSuiviGraph();
}

function adjH(t,v){
  var ids={w:'hv-w',s:'hv-s',p:'hv-p'};
  var el=document.getElementById(ids[t]);if(!el)return;
  var cur=t==='s'?(parseFloat(el.textContent)||0):(parseInt(el.textContent.replace(/[^\d]/g,''))||0);
  var nv=Math.max(0,cur+v);
  el.textContent=t==='p'?nv.toLocaleString('fr-FR'):nv;
  var today=new Date().toISOString().split('T')[0];
  localStorage.setItem('suivi_date',today);
  localStorage.setItem('suivi_'+t,nv);
  setTimeout(saveSuiviToSupabase,300);
  if(typeof updateBonusDisplay==='function')updateBonusDisplay();
}

function renderSuiviGraph(){
  var cont=document.getElementById('suivi-graph-cont');if(!cont)return;
  var data=SUIVI_HISTO.slice(0,14).reverse();
  if(!data.length){
    cont.innerHTML='<div style="font-size:11px;color:var(--txd);text-align:center;padding:20px 0">Le graphe se remplira au fil des jours</div>';
    return;
  }
  var key=suiviGraphMode;
  var maxObj={eau:8,sommeil:8,pas:10000}[key]||10;
  var colorCls={eau:'',sommeil:'gr',pas:'go'}[key]||'';
  var unit={eau:'verres',sommeil:'h',pas:'pas'}[key]||'';
  var vals=data.map(function(d){return d[key]||0;});
  var maxData=Math.max.apply(null,vals.concat([maxObj]))||1;
  var bars=vals.map(function(v){
    var h=Math.max(4,Math.round(v/maxData*76));
    return'<div class="gb'+(colorCls?' '+colorCls:'')+'" style="height:'+h+'px"></div>';
  }).join('');
  var n=data.length;
  var idxs=[0,Math.floor(n/2),n-1].filter(function(x,i,a){return a.indexOf(x)===i;});
  var lbls=idxs.map(function(i){var dd=new Date(data[i].date);return'<span>'+(dd.getDate())+'/'+(dd.getMonth()+1)+'</span>';}).join('');
  cont.innerHTML='<div class="graph-bars">'+bars+'</div>'
    +'<div class="graph-labels">'+lbls+'</div>'
    +'<div style="font-size:10px;color:var(--txm);text-align:center">'+n+' jours — objectif '+maxObj+' '+unit+'/j</div>';
}

function setSuiviGraphMode(mode){
  suiviGraphMode=mode;
  ['eau','sommeil','pas'].forEach(function(m){
    var btn=document.getElementById('sgt-'+m);
    if(btn)btn.classList.toggle('on',m===mode);
  });
  renderSuiviGraph();
}

async function saveSuiviToSupabase(){
  if(!SB_SESSION)return;
  var uid=SB_SESSION.user.id;
  var today=new Date().toISOString().split('T')[0];
  var eau=parseInt(document.getElementById('hv-w')?.textContent)||0;
  var sommeil=parseFloat(document.getElementById('hv-s')?.textContent)||0;
  var pas=parseInt((document.getElementById('hv-p')?.textContent||'0').replace(/[^\d]/g,''))||0;
  try{await sbUpsert('suivi_quotidien',{client_id:uid,date_suivi:today,eau_verres:eau,sommeil_h:sommeil,pas:pas},'client_id,date_suivi');}
  catch(e){console.warn('Suivi:',e.message);}
}

// ══ BONUS DISPLAY ══
function updateBonusDisplay(){
  var done=Object.values(defisChk).filter(Boolean).length;
  var bonusEl=document.getElementById('bonus-bar');
  if(bonusEl)bonusEl.style.width=(done/5*100)+'%';
  var eau=parseInt(document.getElementById('hv-w')?.textContent)||0;
  var sommeil=parseFloat(document.getElementById('hv-s')?.textContent)||0;
  var pas=parseInt((document.getElementById('hv-p')?.textContent||'0').replace(/[^\d]/g,''))||0;
  var xpEau=Math.min(5,Math.round(eau/8*5));
  var xpSommeil=Math.min(5,Math.round(sommeil/8*5));
  var xpPas=Math.min(5,Math.round(pas/10000*5));
  var xpBonus5=done===5?10:0;
  var xpDefis=done*2;
  function setBonus(id,val,color){var el=document.getElementById(id);if(el){el.textContent='+'+val+' XP';el.style.color=color;}}
  function setDisp(id,txt){var el=document.getElementById(id);if(el)el.textContent=txt;}
  setDisp('b-water-disp',eau+'/8 verres');
  setBonus('b-water',xpEau,xpEau>=5?'var(--gr)':xpEau>0?'var(--or)':'var(--txd)');
  setDisp('b-sleep-disp',sommeil+'h');
  setBonus('b-sleep',xpSommeil,xpSommeil>=5?'var(--gr)':xpSommeil>0?'var(--or)':'var(--txd)');
  setDisp('b-steps-disp',pas.toLocaleString('fr-FR')+' pas');
  setBonus('b-steps',xpPas,xpPas>=5?'var(--gr)':xpPas>0?'var(--or)':'var(--txd)');
  setBonus('b-bonus5',xpBonus5,xpBonus5>0?'var(--gold)':'var(--txd)');
  var tot=xpDefis+xpEau+xpSommeil+xpPas+xpBonus5;
  var xpToday=document.getElementById('xp-today');if(xpToday)xpToday.textContent=tot;
  if(!USER_NIVEAU) USER_NIVEAU = {niveau:1, xp_total:0};
  var prev=USER_NIVEAU._suivi_xp||0;
  var newS=xpEau+xpSommeil+xpPas;
  var diff=newS-prev;
  if(diff!==0){USER_NIVEAU.xp_total=Math.max(0,(USER_NIVEAU.xp_total||0)+diff);USER_NIVEAU._suivi_xp=newS;}
  updateXPBar();
}

// ══ DÉFIS ══

// ══ THÈME + TAILLE TEXTE ══
var _currentTheme = localStorage.getItem('ant_theme') || 'dark';
var _currentSize = localStorage.getItem('ant_textsize') || 'md';
var _highContrast = localStorage.getItem('ant_contrast') === '1';

function applyTheme(theme){
  _currentTheme = theme;
  document.body.classList.toggle('theme-light', theme === 'light');
  localStorage.setItem('ant_theme', theme);
}
function applyTextSize(size){
  _currentSize = size;
  document.body.classList.remove('text-lg','text-xl');
  if(size !== 'md') document.body.classList.add('text-'+size);
  localStorage.setItem('ant_textsize', size);
}
function applyContrast(val){
  _highContrast = val;
  document.body.classList.toggle('high-contrast', val);
  localStorage.setItem('ant_contrast', val ? '1' : '0');
}
// Init au chargement
(function(){
  applyTheme(_currentTheme);
  applyTextSize(_currentSize);
  if(_highContrast) applyContrast(true);
})();

var DEFIS_BANK=[
  {id:1,icon:'🔥',name:'20 burpees',desc:"D'une traite"},
  {id:2,icon:'🏃',name:'1 km de course',desc:'Extérieur ou tapis'},
  {id:3,icon:'💪',name:'100 pompes',desc:'En plusieurs fois'},
  {id:4,icon:'🦵',name:'50 squats',desc:'Sans charge'},
  {id:5,icon:'🧱',name:'5 min de gainage',desc:'Planche ou variantes'},
  {id:6,icon:'🙌',name:'30 tractions',desc:'En plusieurs séries'},
  {id:7,icon:'👟',name:'2 km marche rapide',desc:'Marche active'},
  {id:8,icon:'⚡',name:'200 sauts corde',desc:'Ou jumping jacks'},
  {id:9,icon:'🔄',name:'Mobilité 10 min',desc:'Hanches, épaules'},
  {id:10,icon:'🚀',name:'Sprint 10x50m',desc:'1 min récup entre'},
  {id:11,icon:'💺',name:'3 séries dips max',desc:'2 min repos'},
  {id:12,icon:'🎯',name:'Circuit abdos 15 min',desc:'Crunch, relevé, gainage'},
];
var todayDefis=[],defisChk={},lastDate='';

function pickDefis(){
  var d=new Date();var ds=d.toDateString();
  if(ds===lastDate)return;lastDate=ds;
  var seed=d.getFullYear()*10000+d.getMonth()*100+d.getDate();
  var arr=DEFIS_BANK.slice();
  for(var i=arr.length-1;i>0;i--){seed=(seed*1664525+1013904223)&0xffffffff;var j=Math.abs(seed)%(i+1);var tmp=arr[i];arr[i]=arr[j];arr[j]=tmp;}
  todayDefis=arr.slice(0,5);defisChk={};
}

function renderDefis(){
  pickDefis();
  var cont=document.getElementById('defis-cont');if(!cont)return;
  cont.innerHTML=todayDefis.map(function(d){
    var ck=defisChk[d.id];
    return'<div class="defi-card'+(ck?' done':'')+'" onclick="togDefi('+d.id+')">'
      +'<div class="defi-icon">'+d.icon+'</div>'
      +'<div style="flex:1"><div class="defi-name">'+d.name+'</div><div class="defi-desc">'+d.desc+'</div></div>'
      +'<span class="defi-xp">+2 XP</span>'
      +'<div class="defi-chk'+(ck?' ok':'')+'"><i class="ti ti-check" style="font-size:11px;color:'+(ck?'var(--gr)':'var(--txd)')+'"></i></div>'
      +'</div>';
  }).join('');
  var jours=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  var mois=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  var n=new Date();
  var el=document.getElementById('defi-date');if(el)el.textContent=jours[n.getDay()]+' '+n.getDate()+' '+mois[n.getMonth()]+' '+n.getFullYear();
  updateBonusDisplay();
}

function togDefi(id){
  // Mise à jour KPI accueil
  setTimeout(function(){
    var done=Object.keys(defisChk).filter(function(k){return defisChk[k];}).length;
    var kpi=document.getElementById('home-defi-kpi');
    if(kpi) kpi.innerHTML=done+'<span style="font-size:16px;color:var(--txm)">/5</span>';
    var xpd=document.getElementById('home-xp-day');
    if(xpd) xpd.textContent='+'+( done*2 + (done===5?10:0) )+' XP';
  },100);
  if(!USER_NIVEAU) USER_NIVEAU = {niveau:1, xp_total:0};
  var was=defisChk[id];
  defisChk[id]=!was;
  var delta=was?-2:2;
  USER_NIVEAU.xp_total=Math.max(0,(USER_NIVEAU.xp_total||0)+delta);
  var done=Object.values(defisChk).filter(Boolean).length;
  // Bonus 5 défis — +10 XP quand tous complétés, -10 quand on en décoche un depuis 5
  if(!was && done===5){
    USER_NIVEAU.xp_total=(USER_NIVEAU.xp_total||0)+10;
    if(SB_SESSION) sbPost('xp_log',{client_id:SB_SESSION.user.id,source:'bonus_5_defis',xp:10}).catch(function(){});
    setTimeout(function(){
      var t=document.getElementById('toast-app');var txt=document.getElementById('toast-app-txt');
      if(t&&txt){txt.textContent='🔥 5 défis ! +10 XP bonus !';t.style.background='rgba(255,215,0,0.15)';t.style.borderColor='rgba(255,215,0,0.3)';t.style.color='var(--gold)';t.style.display='flex';setTimeout(function(){t.style.display='none';t.style.background='';t.style.borderColor='';t.style.color='';},2500);}
    }, 800);
  }
  if(was && done===4){
    if(USER_NIVEAU) USER_NIVEAU.xp_total=Math.max(0,(USER_NIVEAU.xp_total||0)-10);
  }
  if(SB_SESSION){
    sbPost('xp_log',{client_id:SB_SESSION.user.id,source:'defi',xp:delta}).catch(function(){});
    sbUpsert('niveaux',{client_id:SB_SESSION.user.id,xp_total:USER_NIVEAU?.xp_total||0},'client_id').catch(function(){});
  }
  renderDefis();
  updateXPBar();
  updateBonusDisplay();
}

function closeDetail(){
  var panel = document.getElementById('det-panel');
  if(panel) panel.classList.remove('show');
}
function valExo(){
  closeDetail();
}
function valExoXP(){
  if(!USER_NIVEAU) USER_NIVEAU = {niveau:1, xp_total:0};
  USER_NIVEAU.xp_total=(USER_NIVEAU.xp_total||0)+2; updateXPBar(); updateBonusDisplay();
  if(SB_SESSION){ sbPost('xp_log',{client_id:SB_SESSION.user.id,source:'seance_exo',xp:2}).catch(function(){}); }
  var bs=document.getElementById('b-seance');
  if(bs){ var cur=parseInt((bs.textContent||'0').replace(/[^\d]/g,''))||0; bs.textContent='+'+(cur+2)+' XP'; bs.style.color='var(--gr)'; }
}

// ══ NAVIGATION ══
function goNav(el,id){
  document.querySelectorAll('.bn').forEach(function(b){b.classList.remove('on');});
  if(el)el.classList.add('on');
  document.querySelectorAll('.scr').forEach(function(s){s.classList.remove('on');});
  var sc=document.getElementById(id);if(sc)sc.classList.add('on');
  if(id==='sc-prog'){loadUserProg();}
  if(id==='sc-defis'){renderDefis();updateXPBar();}
  if(id==='sc-suivi'){renderMensInputsApp();renderMensHistApp();}
  if(id==='sc-alim'){setSuiviGraphMode('eau');}
}
function goStab(el,id){
  document.querySelectorAll('.stab').forEach(function(t){t.classList.remove('on');});el.classList.add('on');
  document.querySelectorAll('.sscr').forEach(function(s){s.classList.remove('on');});
  var sc=document.getElementById(id);if(sc)sc.classList.add('on');
}
function selDay(el){document.querySelectorAll('.dtab').forEach(function(t){t.classList.remove('on');});el.classList.add('on');}

// ══ PROGRAMME ══
var chInt=null,chSec=0,chRunning=false;
function chToggle(){
  if(chRunning){clearInterval(chInt);chRunning=false;var b=document.getElementById('ch-btn');if(b){b.innerHTML='<i class="ti ti-player-play" style="font-size:12px"></i>Démarrer';b.classList.remove('go');}}
  else{chRunning=true;var b2=document.getElementById('ch-btn');if(b2){b2.innerHTML='<i class="ti ti-player-pause" style="font-size:12px"></i>Pause';b2.classList.add('go');}
    chInt=setInterval(function(){chSec++;var m=Math.floor(chSec/60);var s=chSec%60;var el=document.getElementById('ch-t');if(el)el.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;},1000);}
}
function chReset(){clearInterval(chInt);chRunning=false;chSec=0;var el=document.getElementById('ch-t');if(el)el.textContent='00:00';var b=document.getElementById('ch-btn');if(b){b.innerHTML='<i class="ti ti-player-play" style="font-size:12px"></i>Démarrer';b.classList.remove('go');}}
function toggleExo(uid){
  var det=document.getElementById('det-'+uid);
  var chev=document.getElementById('chev-'+uid);
  if(det){
    det.classList.toggle('show');
    if(chev)chev.style.transform=det.classList.contains('show')?'rotate(180deg)':'';
    // Ajouter bouton historique si pas encore là
    if(det.classList.contains('show')){
      var histoBtn=det.querySelector('.histo-btn');
      if(!histoBtn){
        var ec=document.getElementById('ec-'+uid);
        var exoName=ec?.querySelector('.exo-nm')?.textContent||'Exercice';
        var btn=document.createElement('button');
        btn.className='histo-btn';
        btn.style.cssText='margin-top:8px;width:100%;padding:8px;background:var(--bl);border:0.5px solid var(--bb);border-radius:8px;font-size:11px;color:var(--b);font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px';
        btn.innerHTML='<i class="ti ti-chart-line" style="font-size:13px"></i>Voir l\'historique des charges';
        btn.onclick=function(e){e.stopPropagation();openHistoModal(exoName);};
        det.appendChild(btn);
      }
    }
  }
};
function autoV(uid,s){};
var seriesDone={};
function togV(uid,s,i,dayId){
  var r=document.getElementById('r-'+uid+'-'+s);var k=document.getElementById('k-'+uid+'-'+s);
  var reps=r?r.value:'';var kg=k?k.value:'';
  var key=uid+'-'+s;
  if(seriesDone[key]){delete seriesDone[key];}else{seriesDone[key]={r:reps,k:kg};}
  buildSeries(i);updateDetProg(i);chReset();
}
function buildSeries(id){};
function updateDetProg(id){};


// ══ PROGRAMME — TABS ══
var currentProgTab = 'prog';
function switchProgTab(tab){
  currentProgTab = tab;
  ['prog','discov','hist'].forEach(function(t){
    var btn = document.getElementById('ptab-'+t);
    if(btn) btn.classList.toggle('on', t===tab);
  });
  var progSec = document.getElementById('prog-section');
  var discovSec = document.getElementById('discov-section');
  var histSec = document.getElementById('hist-section');
  if(progSec) progSec.style.display = tab==='prog' ? '' : 'none';
  if(discovSec) discovSec.style.display = tab==='discov' ? '' : 'none';
  if(histSec) histSec.style.display = tab==='hist' ? '' : 'none';
  if(tab==='discov') renderDiscovCal();
  if(tab==='hist') renderProgCal2();
}

// ══ TIMER DOUBLE SENS ══
var timerMode = 'up'; // 'up' = chrono, 'down' = countdown
var timerTarget = 0;  // secondes cibles pour le countdown

function setTimerMode(mode){
  timerMode = mode;
  document.getElementById('tt-up').classList.toggle('on', mode==='up');
  document.getElementById('tt-down').classList.toggle('on', mode==='down');
  var row = document.getElementById('timer-input-row');
  if(row) row.style.display = mode==='down' ? 'block' : 'none';
  chReset();
}

function setTimerFromInput(){
  var m = parseInt(document.getElementById('timer-min')?.value)||0;
  var s = parseInt(document.getElementById('timer-sec')?.value)||0;
  timerTarget = m*60 + s;
  chSec = timerTarget;
  var el = document.getElementById('ch-t');
  if(el){ var mm=Math.floor(timerTarget/60); var ss=timerTarget%60; el.textContent=(mm<10?'0':'')+mm+':'+(ss<10?'0':'')+ss; }
}

// Remplacer chToggle pour supporter les deux modes
function chToggle(){
  if(chRunning){
    clearInterval(chInt); chRunning=false;
    var b=document.getElementById('ch-btn');
    if(b){b.innerHTML='<i class="ti ti-player-play" style="font-size:12px"></i>Démarrer';b.classList.remove('go');}
  } else {
    if(timerMode==='down' && chSec===0 && timerTarget>0) chSec=timerTarget;
    chRunning=true;
    var b2=document.getElementById('ch-btn');
    if(b2){b2.innerHTML='<i class="ti ti-player-pause" style="font-size:12px"></i>Pause';b2.classList.add('go');}
    chInt=setInterval(function(){
      if(timerMode==='up'){
        chSec++;
      } else {
        chSec--;
        if(chSec<=0){
          chSec=0; clearInterval(chInt); chRunning=false;
          var b3=document.getElementById('ch-btn');
          if(b3){b3.innerHTML='<i class="ti ti-player-play" style="font-size:12px"></i>Démarrer';b3.classList.remove('go');}
          // Vibration + son fin de timer
          if(navigator.vibrate) navigator.vibrate([200,100,200,100,400]);
          showToastApp('⏰ Timer terminé !');
        }
      }
      var m=Math.floor(Math.abs(chSec)/60); var s=Math.abs(chSec)%60;
      var el=document.getElementById('ch-t');
      if(el) el.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
      if(timerMode==='down'){
        // Couleur rouge quand <10s
        if(el) el.style.color = chSec<=10 ? '#FF4444' : '';
      }
    },1000);
  }
}

// ══ HISTORIQUE CHARGES ══
// Données demo — remplacées par Supabase
var PERF_HISTORY = {
  'Squat': [
    {date:'2025-03-01',reps:8,kg:60},{date:'2025-03-08',reps:8,kg:65},{date:'2025-03-15',reps:8,kg:67.5},
    {date:'2025-03-22',reps:8,kg:70},{date:'2025-04-01',reps:8,kg:72.5},{date:'2025-04-15',reps:8,kg:75},
    {date:'2025-05-01',reps:8,kg:77.5},{date:'2025-05-15',reps:8,kg:80},{date:'2025-05-28',reps:8,kg:82.5}
  ],
  'Développé couché': [
    {date:'2025-03-01',reps:10,kg:50},{date:'2025-03-10',reps:10,kg:52.5},{date:'2025-04-01',reps:10,kg:55},
    {date:'2025-04-20',reps:10,kg:57.5},{date:'2025-05-10',reps:10,kg:60},{date:'2025-05-28',reps:10,kg:62.5}
  ],
  'Tractions': [
    {date:'2025-03-01',reps:6,kg:0},{date:'2025-03-15',reps:7,kg:0},{date:'2025-04-01',reps:8,kg:0},
    {date:'2025-04-20',reps:9,kg:0},{date:'2025-05-15',reps:10,kg:0},{date:'2025-05-28',reps:11,kg:0}
  ]
};

var histoExo = null;
var histoPeriod = 'month'; // 'week','month','3months','custom'
var histoDateStart = null;
var histoDateEnd = null;

function openHistoModal(exoName){
  histoExo = exoName;
  histoPeriod = 'month';
  setText('histo-exo-title', exoName);
  renderHistoContent();
  var m = document.getElementById('modal-histo');
  if(m) m.style.display = 'flex';
}
function closeHistoModal(){
  var m = document.getElementById('modal-histo');
  if(m) m.style.display = 'none';
}

function setHistoPeriod(p){
  histoPeriod = p;
  ['week','month','3months','custom'].forEach(function(x){
    var btn = document.getElementById('hp-'+x);
    if(btn) btn.style.background = p===x ? 'var(--r)' : 'transparent';
    if(btn) btn.style.color = p===x ? '#fff' : 'var(--txm)';
  });
  var customRow = document.getElementById('histo-custom-row');
  if(customRow) customRow.style.display = p==='custom' ? 'flex' : 'none';
  if(p!=='custom') renderHistoContent();
}

function applyCustomPeriod(){
  histoDateStart = document.getElementById('histo-start')?.value;
  histoDateEnd = document.getElementById('histo-end')?.value;
  renderHistoContent();
}

function filterHistoData(){
  var data = PERF_HISTORY[histoExo] || [];
  var now = new Date();
  var cutoff;
  if(histoPeriod==='week') cutoff = new Date(now - 7*24*3600*1000);
  else if(histoPeriod==='month') cutoff = new Date(now - 30*24*3600*1000);
  else if(histoPeriod==='3months') cutoff = new Date(now - 90*24*3600*1000);
  else if(histoPeriod==='custom' && histoDateStart && histoDateEnd){
    var start = new Date(histoDateStart);
    var end = new Date(histoDateEnd);
    return data.filter(function(d){ var dd=new Date(d.date); return dd>=start && dd<=end; });
  }
  if(cutoff) return data.filter(function(d){ return new Date(d.date)>=cutoff; });
  return data;
}

function renderHistoContent(){
  var data = filterHistoData();
  if(!data.length){
    var cont = document.getElementById('histo-content'); if(cont) cont.innerHTML='<div style="font-size:12px;color:var(--txm);text-align:center;padding:20px">Aucune donnée sur cette période</div>'; return;
  }
  var maxKg = Math.max.apply(null, data.map(function(d){return d.kg||d.reps;}));
  var mois = ['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  
  // PR
  var pr = data.reduce(function(best,d){return (d.kg||d.reps)>(best.kg||best.reps)?d:best;},data[0]);
  var first = data[0]; var last = data[data.length-1];
  var diff = ((last.kg||last.reps)-(first.kg||first.reps)).toFixed(1);
  var diffColor = diff>=0?'var(--gr)':'#FF4444';
  var firstDate = new Date(first.date); var lastDate = new Date(last.date);
  var fds = firstDate.getDate()+' '+mois[firstDate.getMonth()]+' '+firstDate.getFullYear();
  var lds = lastDate.getDate()+' '+mois[lastDate.getMonth()]+' '+lastDate.getFullYear();

  // Graph barres
  var bars = data.map(function(d){
    var val = d.kg||d.reps;
    var h = maxKg>0 ? Math.round(val/maxKg*70)+10 : 10;
    var dd = new Date(d.date); var ds=dd.getDate()+'/'+mois[dd.getMonth()];
    var tip = ds+' — '+(d.kg?d.kg+'kg':'')+' '+d.reps+' reps';
    return '<div class="histo-bar" style="height:'+h+'px" data-tip="'+tip+'"></div>';
  }).join('');

  // Tableau
  var rows = [...data].reverse().slice(0,8).map(function(d){
    var dd=new Date(d.date); var ds=dd.getDate()+' '+mois[dd.getMonth()]+' '+dd.getFullYear();
    return'<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)">'
      +'<span style="font-size:11px;color:var(--txm)">'+ds+'</span>'
      +'<div style="display:flex;gap:10px">'
      +(d.kg?'<span style="font-size:12px;font-weight:600;color:var(--b)">'+d.kg+' kg</span>':'')
      +'<span style="font-size:12px;font-weight:500;color:var(--tx)">'+d.reps+' reps</span>'
      +'</div></div>';
  }).join('');

  var html = '<div style="background:var(--bl);border:0.5px solid var(--bb);border-radius:10px;padding:10px 12px;margin-bottom:12px">'
    +'<div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:var(--b);margin-bottom:6px">Record personnel</div>'
    +"<div style=\"font-family:\"Bebas Neue\",sans-serif;font-size:28px;color:var(--gold);letter-spacing:1px;text-shadow:0 0 15px rgba(255,215,0,0.4)\">"+(pr.kg||pr.reps)+(pr.kg?" kg":" reps")+"</div>"
    +'</div>'
    +'<div style="background:var(--c2);border-radius:10px;padding:10px 12px;margin-bottom:12px">'
    +'<div style="display:flex;justify-content:space-between;margin-bottom:6px">'
    +'<div><div style="font-size:9px;color:var(--txm)">Première perf · '+fds+'</div><div style="font-size:14px;font-weight:600;margin-top:2px">'+(first.kg||first.reps)+(first.kg?' kg':' reps')+'</div></div>'
    +'<div style="font-family:\"Bebas Neue\",sans-serif;font-size:22px;color:'+diffColor+';align-self:center">'+(diff>=0?'+':'')+diff+(first.kg?' kg':' reps')+'</div>'
    +'<div style="text-align:right"><div style="font-size:9px;color:var(--txm)">Dernière perf · '+lds+'</div><div style="font-size:14px;font-weight:600;margin-top:2px">'+(last.kg||last.reps)+(last.kg?' kg':' reps')+'</div></div>'
    +'</div></div>'
    +'<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--txm);margin-bottom:6px">Évolution</div>'
    +'<div class="histo-bar-wrap">'+bars+'</div>'
    +'<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--txm);margin:10px 0 6px">Détail séances</div>'
    +rows;

  var cont = document.getElementById('histo-content');
  if(cont) cont.innerHTML = html;
}

// ══ CALENDRIER SÉANCES ══
var calYear, calMonth;
var SEANCE_DATES = ['2025-05-03','2025-05-07','2025-05-10','2025-05-14','2025-05-17','2025-05-21','2025-05-24','2025-05-28'];
var RDV_DATES = ['2025-05-06','2025-05-13','2025-05-20','2025-05-27'];

function renderProgCal(){
  var now = new Date();
  if(!calYear){ calYear = now.getFullYear(); calMonth = now.getMonth(); }
  var mois = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  var lbl = document.getElementById('cal-month-lbl');
  if(lbl) lbl.textContent = mois[calMonth]+' '+calYear;
  var grid = document.getElementById('prog-cal-grid');
  if(!grid) return;
  var firstDay = new Date(calYear, calMonth, 1).getDay();
  firstDay = firstDay===0?6:firstDay-1; // Lundi = 0
  var daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  var html = '';
  for(var i=0;i<firstDay;i++) html+='<div class="cal-day other"></div>';
  for(var d=1;d<=daysInMonth;d++){
    var ds = calYear+'-'+(String(calMonth+1).padStart(2,'0'))+'-'+(String(d).padStart(2,'0'));
    var isToday = ds===new Date().toISOString().split('T')[0];
    var hasPerf = SEANCE_DATES.indexOf(ds)>-1;
    var hasRdv = RDV_DATES.indexOf(ds)>-1;
    var cls = 'cal-day'+(isToday?' today':hasRdv?' has-rdv':hasPerf?' has-perf':'');
    html+='<div class="'+cls+'">'+d+'</div>';
  }
  grid.innerHTML = html;
}

function calPrev(){ calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderProgCal(); }
function calNext(){ calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderProgCal(); }

// ══ DÉCOUVERTE ══
var DISCOV_PROGRAMS = {
  circuit: {
    name: 'Circuit Training',
    color: 'var(--b)',
    xp: 20,
    exos: [
      {n:'Burpees',d:'3 tours · 40s/20s',sets:3},
      {n:'Pompes',d:'3 tours · 40s/20s',sets:3},
      {n:'Squat sauté',d:'3 tours · 40s/20s',sets:3},
      {n:'Gainage',d:'3 tours · 40s/20s',sets:3},
      {n:'Mountain climbers',d:'3 tours · 40s/20s',sets:3},
      {n:'Dips chaise',d:'3 tours · 40s/20s',sets:3},
      {n:'Fentes alternées',d:'3 tours · 40s/20s',sets:3},
      {n:'Jumping jacks',d:'3 tours · 40s/20s',sets:3},
    ]
  },
  abdos: {
    name: 'Circuit Abdos',
    color: 'var(--or)',
    xp: 20,
    exos: [
      {n:'Crunch',d:'3×20 reps',sets:3},
      {n:'Relevé de jambes',d:'3×15 reps',sets:3},
      {n:'Planche frontale',d:'3×45s',sets:3},
      {n:'Russian twist',d:'3×20 reps',sets:3},
      {n:'Bicycle crunch',d:'3×20 reps',sets:3},
      {n:'Superman',d:'3×15 reps',sets:3},
    ]
  }
};
var DISCOV_HIST = [];

function renderDiscovCal(){
  var grid = document.getElementById('discov-cal-grid');
  if(!grid) return;
  var now = new Date(); var m = now.getMonth(); var y = now.getFullYear();
  var daysInMonth = new Date(y, m+1, 0).getDate();
  var firstDay = new Date(y, m, 1).getDay(); firstDay = firstDay===0?6:firstDay-1;
  var discov_dates = ['2025-05-25','2025-05-28'];
  var html='';
  for(var i=0;i<firstDay;i++) html+='<div class="cal-day other"></div>';
  for(var d=1;d<=daysInMonth;d++){
    var ds=y+'-'+(String(m+1).padStart(2,'0'))+'-'+(String(d).padStart(2,'0'));
    var isToday=ds===now.toISOString().split('T')[0];
    var hasDis=discov_dates.indexOf(ds)>-1;
    html+='<div class="cal-day'+(isToday?' today':hasDis?' has-perf':'')+'">'+d+'</div>';
  }
  grid.innerHTML=html;
}

var discovSeriesDone = {};
var currentDiscovType = null;

function openDiscov(type){
  var prog = DISCOV_PROGRAMS[type];
  if(!prog) return;
  currentDiscovType = type;
  discovSeriesDone = {};

  var exoHtml = prog.exos.map(function(e,i){
    var uid = 'dc-'+type+'-'+i;
    var seriesHtml = '';
    for(var s=0;s<e.sets;s++){
      var sid = uid+'-s'+s;
      var ck = discovSeriesDone[sid];
      seriesHtml += '<div style="display:grid;grid-template-columns:22px 1fr 1fr 22px;gap:5px;align-items:center;padding:5px 0;border-top:0.5px solid rgba(255,255,255,0.04)">'
        +'<div style="width:18px;height:18px;border-radius:50%;background:'+(ck?'var(--succ)':'var(--c3)')+';border:0.5px solid '+(ck?'var(--succb)':'rgba(255,255,255,0.1)')+';display:flex;align-items:center;justify-content:center;font-size:8px;color:'+(ck?'var(--gr)':'var(--txm)')+';">'+(s+1)+'</div>'
        +'<div><input type="number" id="dr-'+sid+'" placeholder="—" style="width:100%;background:var(--c2);border:0.5px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 6px;font-size:11px;color:var(--tx);font-family:inherit;outline:none;text-align:center;" >'
        +'<div style="font-size:8px;text-align:center;color:var(--txd);margin-top:1px">reps</div></div>'
        +'<div><input type="number" id="dk-'+sid+'" placeholder="—" step="0.5" style="width:100%;background:var(--c2);border:0.5px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 6px;font-size:11px;color:var(--tx);font-family:inherit;outline:none;text-align:center;" >'
        +'<div style="font-size:8px;text-align:center;color:var(--txd);margin-top:1px">kg</div></div>'
        +'<div id="dchk-'+sid+'" onclick="togDiscovV(this)" style="width:22px;height:22px;border-radius:50%;border:0.5px solid '+(ck?'var(--succb)':'rgba(255,255,255,0.15)')+';background:'+(ck?'var(--succ)':'transparent')+';display:flex;align-items:center;justify-content:center;cursor:pointer;"><i class="ti ti-check" style="font-size:10px;color:'+(ck?'var(--gr)':'var(--txd)')+'"></i></div>'
        +'</div>';
    }
    return'<div class="exo-card" id="dc-card-'+uid+'">'
      +'<div data-uid-toggle="" class="discov-hdr" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:2px 0">'
      +'<div><div class="exo-nm">'+e.n+'</div><div class="exo-desc">'+e.d+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:6px">'
      +'<span id="dbadge-'+uid+'" class="pill" style="background:var(--c3);border:0.5px solid var(--c4);color:var(--txm);font-size:9px">0/'+e.sets+'</span>'
      +'<i class="ti ti-chevron-down" style="font-size:13px;color:var(--txm);transition:transform 0.2s" id="dchev-'+uid+'"></i>'
      +'</div></div>'
      +'<div class="exo-detail" id="ddet-'+uid+'">'
      +'<div style="display:grid;grid-template-columns:22px 1fr 1fr 22px;gap:5px;margin-bottom:3px">'
      +'<div></div>'
      +'<div style="font-size:9px;text-transform:uppercase;color:var(--txm);text-align:center">Reps</div>'
      +'<div style="font-size:9px;text-transform:uppercase;color:var(--txm);text-align:center">Kg</div>'
      +'<div></div></div>'
      +seriesHtml
      +'</div></div>';
  }).join('');

  setText('discov-modal-title', prog.name);
  setText('discov-modal-xp', '+'+prog.xp+' XP');
  document.getElementById('discov-modal-exos').innerHTML = exoHtml;
  document.getElementById('discov-modal-start').setAttribute('onclick', "startDiscov('"+type+"')");
  // Attacher les event listeners après injection
  document.querySelectorAll('.discov-hdr').forEach(function(el){
    el.addEventListener('click', function(){ toggleDiscovExo(this.getAttribute('data-uid')); });
  });
  document.querySelectorAll('[data-sid]').forEach(function(el){
    el.addEventListener('click', function(){ togDiscovV(this.getAttribute('data-uid'), parseInt(this.getAttribute('data-s'))); });
  });
  var m = document.getElementById('modal-discov');
  if(m) m.style.display = 'flex';
}

function switchProgSubTab(tab){
  var prog = document.getElementById('progcontent-prog');
  var hist = document.getElementById('progcontent-hist');
  var btnP = document.getElementById('progsubtab-prog');
  var btnH = document.getElementById('progsubtab-hist');
  if(prog) prog.style.display = tab==='prog'?'':'none';
  if(hist) hist.style.display = tab==='hist'?'':'none';
  if(btnP){ btnP.classList.toggle('on', tab==='prog'); }
  if(btnH){ btnH.classList.toggle('on', tab==='hist'); }
  if(tab==='hist') renderProgCal2();
}

function selProgDay(el, dayId){
  document.querySelectorAll('#day-tabs-prog .dtab').forEach(function(t){t.classList.remove('on');});
  el.classList.add('on');
  var content = document.getElementById('prog-day-content');
  if(!content) return;
  // Chercher dans les données chargées depuis Supabase
  var dayNum = dayId.replace('d','');
  var jour = (window.USER_PROG_JOURS||[]).find(function(j){
    return j.jour_nom && (j.jour_nom.toLowerCase().includes('jour '+dayNum) || j.jour_nom === 'Jour '+dayNum);
  });
  if(jour && jour.exercices){
    var exos = typeof jour.exercices === 'string' ? JSON.parse(jour.exercices) : jour.exercices;
    if(exos && exos.length){
      content.innerHTML = '<div style="margin-bottom:10px;font-size:11px;color:var(--txm);text-transform:uppercase;letter-spacing:0.6px">'+(jour.muscles_cibles||jour.jour_nom||'')+'</div>'
        + exos.map(function(e,i){
          return '<div style="background:var(--c2);border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">'
            +'<div style="width:28px;height:28px;border-radius:50%;background:var(--rl);color:var(--ant);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(i+1)+'</div>'
            +'<div style="flex:1"><div style="font-size:13px;font-weight:500">'+e.nom+'</div>'
            +'<div style="font-size:11px;color:var(--txm)">'+e.series+' séries × '+e.reps+' reps'+(e.repos?' · repos '+e.repos:'')+'</div></div>'
            +'</div>';
        }).join('')
        +'<button onclick="validSeanceCoach()" style="width:100%;margin-top:12px;padding:12px;background:var(--gr);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">'
        +'<i class="ti ti-check" style="font-size:14px"></i>Séance terminée +2 XP</button>';
      return;
    }
  }
  // Fallback si pas de données
  content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--txm);font-size:13px">'
    +'<i class="ti ti-lock" style="font-size:24px;display:block;margin-bottom:8px;color:var(--txd)"></i>'
    +'Programme '+dayId.toUpperCase()+' — En attente de ton coach</div>';
}

// Charger le programme depuis Supabase au démarrage
window.USER_PROG_JOURS = [];
async function loadUserProg(){
  try{
    var session = getSession ? getSession() : null;
    if(!session) return;
    var uid = session.user ? session.user.id : session.uid;
    var jours = await sbFetch('programmes_clients?client_id=eq.'+uid+'&actif=eq.true&select=*&order=jour_nom.asc');
    if(Array.isArray(jours) && jours.length){
      window.USER_PROG_JOURS = jours;
      // Mettre à jour les onglets
      var tabs = document.getElementById('day-tabs-prog');
      if(tabs){
        tabs.innerHTML = jours.map(function(j,i){
          return '<button class="dtab'+(i===0?' on':'')+'" data-day="d'+(i+1)+'" onclick="selProgDay(this,this.getAttribute(\"data-day\"))">'+j.jour_nom+'</button>';
        }).join('');
        // Afficher le premier jour
        var firstBtn = tabs.querySelector('.dtab');
        if(firstBtn) selProgDay(firstBtn,'d1');
      }
    }
  }catch(e){ console.log('loadUserProg:', e.message); }
}

window.validSeanceCoach = function(){
  if(typeof addXP === 'function') addXP(2,'séance');
  else if(typeof USER_NIVEAU !== 'undefined'){ USER_NIVEAU.xp_total=(USER_NIVEAU.xp_total||0)+2; updateXPBar(); }
  var btn = document.querySelector('#prog-day-content button');
  if(btn){ btn.textContent='✓ Séance validée !'; btn.disabled=true; btn.style.background='var(--txd)'; }
  toast('Séance validée ! +2 XP');
};

// Données historique perf
var PERF_SEANCES_HIST = [
  {date:'2025-05-28',label:'Séance Haut du corps',exos:[{n:'Développé couché',reps:10,kg:62.5},{n:'Tractions',reps:11,kg:0},{n:'Curl biceps',reps:12,kg:16}],duree:52},
  {date:'2025-05-24',label:'Séance Bas du corps',exos:[{n:'Squat',reps:8,kg:82.5},{n:'Presse',reps:12,kg:120},{n:'Leg curl',reps:12,kg:45}],duree:48},
  {date:'2025-05-21',label:'Séance Full Body',exos:[{n:'Squat',reps:8,kg:80},{n:'Développé couché',reps:10,kg:60},{n:'Tractions',reps:10,kg:0}],duree:55},
  {date:'2025-05-17',label:'Séance Haut du corps',exos:[{n:'Développé couché',reps:10,kg:60},{n:'Tractions',reps:9,kg:0}],duree:44},
  {date:'2025-05-14',label:'Séance Bas du corps',exos:[{n:'Squat',reps:8,kg:77.5},{n:'Presse',reps:12,kg:110}],duree:45},
  {date:'2025-05-10',label:'Séance Full Body',exos:[{n:'Squat',reps:8,kg:75},{n:'Développé couché',reps:10,kg:57.5}],duree:50},
  {date:'2025-05-07',label:'Séance Haut du corps',exos:[{n:'Tractions',reps:8,kg:0},{n:'Curl biceps',reps:12,kg:14}],duree:40},
  {date:'2025-05-03',label:'Séance Bas du corps',exos:[{n:'Squat',reps:8,kg:72.5}],duree:42},
];

function renderProgCal2(){
  var now = new Date();
  if(!calYear){ calYear = now.getFullYear(); calMonth = now.getMonth(); }
  var moisNoms=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  var moisCourt=['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  var lbl = document.getElementById('cal-month-lbl2');
  if(lbl) lbl.textContent = moisNoms[calMonth]+' '+calYear;
  var grid = document.getElementById('prog-cal-grid2');
  if(!grid) return;
  var firstDay = new Date(calYear, calMonth, 1).getDay();
  firstDay = firstDay===0?6:firstDay-1;
  var daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  var todayStr = now.toISOString().split('T')[0];
  var html = '';
  for(var i=0;i<firstDay;i++) html+='<div class="cal-day other"></div>';
  for(var d=1;d<=daysInMonth;d++){
    var ds = calYear+'-'+(String(calMonth+1).padStart(2,'0'))+'-'+(String(d).padStart(2,'0'));
    var isToday = ds===todayStr;
    var hasPerf = SEANCE_DATES.indexOf(ds)>-1;
    var hasRdv = RDV_DATES.indexOf(ds)>-1;
    var cls = 'cal-day'+(isToday?' today':hasRdv?' has-rdv':hasPerf?' has-perf':'');
    html+='<div class="'+cls+'" title="'+(hasRdv?'RDV Coach':hasPerf?'Séance':'')+'">'+d+'</div>';
  }
  grid.innerHTML = html;

  // ── Événements du mois ──
  var eventsEl = document.getElementById('cal-events-list');
  if(eventsEl){
    var prefix = calYear+'-'+(String(calMonth+1).padStart(2,'0'));
    var rdvsThisMonth = RDV_DATES.filter(function(d){return d.startsWith(prefix);});
    var seancesThisMonth = SEANCE_DATES.filter(function(d){return d.startsWith(prefix);});
    var evHtml = '';
    if(rdvsThisMonth.length>0){
      evHtml+='<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--r2);margin-bottom:6px">RDV coach ce mois</div>';
      rdvsThisMonth.forEach(function(ds){
        var d=new Date(ds); var day=d.getDate()+' '+moisCourt[d.getMonth()]+' '+d.getFullYear();
        var isPast=ds<todayStr;
        evHtml+='<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:rgba(139,0,0,0.08);border:0.5px solid var(--rb);border-radius:8px;margin-bottom:6px">'
          +'<div style="width:8px;height:8px;border-radius:50%;background:var(--r2);flex-shrink:0'+(isPast?';opacity:0.5':'')+'"></div>'
          +'<div style="flex:1"><div style="font-size:12px;font-weight:500'+(isPast?';color:var(--txm)':'')+'">Appel de suivi</div><div style="font-size:10px;color:var(--txm)">'+day+(isPast?' · Passé':' · À venir')+'</div></div>'
          +(isPast?'<span style="font-size:9px;background:rgba(255,255,255,0.05);border-radius:10px;padding:2px 6px;color:var(--txd)">Passé</span>':'<span style="font-size:9px;background:var(--bl);border:0.5px solid var(--bb);border-radius:10px;padding:2px 6px;color:var(--b)">À venir</span>')
          +'</div>';
      });
    }
    if(seancesThisMonth.length>0){
      evHtml+='<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--b);margin:10px 0 6px">Séances ce mois ('+seancesThisMonth.length+')</div>';
    }
    eventsEl.innerHTML = evHtml || '<div style="font-size:11px;color:var(--txd);padding:6px 0">Aucun événement ce mois</div>';
  }

  // ── Historique des performances ──
  var perfEl = document.getElementById('perf-hist-list');
  if(perfEl){
    var perfPrefix = calYear+'-'+(String(calMonth+1).padStart(2,'0'));
    var perfMonth = PERF_SEANCES_HIST.filter(function(s){return s.date.startsWith(perfPrefix);});
    if(!perfMonth.length){
      perfEl.innerHTML='<div style="font-size:11px;color:var(--txd);padding:6px 0">Aucune performance enregistrée ce mois</div>';
    } else {
      perfEl.innerHTML = perfMonth.map(function(s){
        var d=new Date(s.date); var ds2=d.getDate()+' '+moisCourt[d.getMonth()]+' '+d.getFullYear();
        var exoHtml=s.exos.slice(0,3).map(function(e){
          return'<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid rgba(255,255,255,0.04)">'
            +'<span style="font-size:11px;color:var(--txm)">'+e.n+'</span>'
            +'<div style="display:flex;gap:8px">'
            +(e.kg?'<span style="font-size:11px;font-weight:500;color:var(--b)">'+e.kg+' kg</span>':'')
            +'<span style="font-size:11px;font-weight:500">'+e.reps+' reps</span>'
            +'</div></div>';
        }).join('');
        return'<div style="background:var(--c1);border:0.5px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px;margin-bottom:8px">'
          +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
          +'<div><div style="font-size:13px;font-weight:500">'+s.label+'</div><div style="font-size:10px;color:var(--txm);margin-top:2px">'+ds2+' · '+s.duree+' min</div></div>'
          +'<span style="background:var(--bl);border:0.5px solid var(--bb);border-radius:20px;padding:3px 9px;font-size:10px;color:var(--b)">+2 XP</span>'
          +'</div>'
          +exoHtml
          +'</div>';
      }).join('');
    }
  }
}

function showFelicitations(xp){
  var phone = document.querySelector('.phone');
  if(!phone) return;
  var pw = phone.offsetWidth || 360;
  var ph = phone.offsetHeight || 640;

  // Overlay de fond
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:300;pointer-events:none;overflow:hidden;';

  // Fond flouté
  var bg = document.createElement('div');
  bg.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.82);';
  overlay.appendChild(bg);

  // Canvas pour les particules
  var canvas = document.createElement('canvas');
  canvas.width = pw; canvas.height = ph;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  overlay.appendChild(canvas);

  // Texte
  var txt = document.createElement('div');
  txt.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;';
  txt.innerHTML = '<div style="font-size:44px;margin-bottom:10px;animation:pulseLvl 0.6s ease infinite alternate">🔥</div>'
    +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:36px;letter-spacing:3px;color:#00BFFF;text-shadow:0 0 20px rgba(0,191,255,1),0 0 40px rgba(0,191,255,0.5);line-height:1.1">FÉLICITATIONS</div>'
    +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;letter-spacing:2px;color:#E8953A;text-shadow:0 0 15px rgba(232,149,58,0.8);margin-top:4px">TROP FORT !</div>'
    +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:32px;color:#FFD700;text-shadow:0 0 20px rgba(255,215,0,0.9);margin-top:14px">+'+xp+' XP</div>';
  overlay.appendChild(txt);
  phone.appendChild(overlay);

  // Animation Canvas — particules fluides avec requestAnimationFrame
  var ctx = canvas.getContext('2d');
  var particles = [];
  var colors = ['#00BFFF','#FFD700','#4CAF7A','#FF4444','#FF9500','#FF00FF','#00FFFF','#ffffff'];
  var cx = pw/2; var cy = ph/2;

  // Créer 120 particules
  for(var i=0;i<120;i++){
    var angle = Math.random()*Math.PI*2;
    var speed = 2 + Math.random()*6;
    var size = 2 + Math.random()*5;
    var color = colors[Math.floor(Math.random()*colors.length)];
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle)*speed,
      vy: Math.sin(angle)*speed - 2,
      size: size,
      color: color,
      alpha: 1,
      gravity: 0.15,
      decay: 0.012 + Math.random()*0.008
    });
  }

  var startTime = Date.now();
  var animId;
  function animate(){
    var elapsed = Date.now() - startTime;
    if(elapsed > 2800){
      cancelAnimationFrame(animId);
      if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
      return;
    }
    ctx.clearRect(0, 0, pw, ph);
    var alive = false;
    for(var j=0;j<particles.length;j++){
      var p = particles[j];
      if(p.alpha<=0) continue;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.99;
      p.alpha -= p.decay;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.shadowBlur = p.size * 3;
      ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    animId = requestAnimationFrame(animate);
  }
  animate();
}

function toggleDiscovExo(uid){
  var det = document.getElementById('ddet-'+uid);
  var chev = document.getElementById('dchev-'+uid);
  if(det){ det.classList.toggle('show'); if(chev) chev.style.transform = det.classList.contains('show')?'rotate(180deg)':''; }
}

function autoDiscovV(uid, s){}

function togDiscovVEl(el){
  var uid = el.getAttribute('data-uid');
  var s = parseInt(el.getAttribute('data-s'));
  togDiscovV(uid, s);
}
function togDiscovV(uid, s){
  var sid = uid+'-s'+s;
  discovSeriesDone[sid] = !discovSeriesDone[sid];
  var ck = discovSeriesDone[sid];
  // Mettre à jour le bouton check
  var chkEl = document.getElementById('dchk-'+sid);
  if(chkEl){
    chkEl.style.background = ck?'var(--succ)':'transparent';
    chkEl.style.borderColor = ck?'var(--succb)':'rgba(255,255,255,0.15)';
    chkEl.querySelector('i').style.color = ck?'var(--gr)':'var(--txd)';
  }
  // Badge compteur
  var parts = uid.split('-'); // dc-type-i
  var i = parseInt(parts[parts.length-1]);
  var type = parts[1];
  var prog = DISCOV_PROGRAMS[type];
  if(prog){
    var sets = prog.exos[i]?.sets||3;
    var done = 0;
    for(var s2=0;s2<sets;s2++) if(discovSeriesDone[uid+'-s'+s2]) done++;
    var badge = document.getElementById('dbadge-'+uid);
    if(badge){
      badge.textContent = done+'/'+sets;
      badge.style.background = done===sets?'var(--succ)':'var(--c3)';
      badge.style.borderColor = done===sets?'var(--succb)':'var(--c4)';
      badge.style.color = done===sets?'var(--gr)':'var(--txm)';
    }
  }
}
function closeDiscovModal(){ var m=document.getElementById('modal-discov'); if(m)m.style.display='none'; }

function startDiscov(type){
  closeDiscovModal();
  var prog = DISCOV_PROGRAMS[type];
  if(!prog) return;
  var mois=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  var now=new Date(); var ds=now.getDate()+' '+mois[now.getMonth()]+' '+now.getFullYear();
  // Enregistrer dans l'historique
  var duration = Math.floor(Math.random()*15)+20;
  var diff = Math.floor(Math.random()*4)+5;
  DISCOV_HIST.unshift({type:type,name:prog.name,date:ds,duration:duration,diff:diff,xp:prog.xp});
  // XP — même logique que défis
  if(!USER_NIVEAU) USER_NIVEAU = {niveau:1, xp_total:0};
  USER_NIVEAU.xp_total = (USER_NIVEAU.xp_total||0) + prog.xp;
  updateXPBar();
  updateBonusDisplay();
  if(SB_SESSION){
    sbPost('xp_log',{client_id:SB_SESSION.user.id,source:'circuit_'+type,xp:prog.xp}).catch(function(){});
    sbUpsert('niveaux',{client_id:SB_SESSION.user.id,xp_total:USER_NIVEAU?.xp_total||0},'client_id').catch(function(){});
  }
  // Mettre à jour l'historique
  var list = document.getElementById('circuit-hist-list');
  if(list){
    var iconColor = type==='circuit'?'var(--b)':'var(--or)';
    var iconName = type==='circuit'?'ti-rotate-clockwise':'ti-flame';
    var row = document.createElement('div');
    row.style.cssText='background:var(--c1);border:0.5px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px';
    row.innerHTML='<div style="width:36px;height:36px;border-radius:9px;background:rgba(0,191,255,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti '+iconName+'" style="font-size:16px;color:'+iconColor+'"></i></div>'
      +'<div style="flex:1"><div style="font-size:12px;font-weight:500">'+prog.name+'</div><div style="font-size:10px;color:var(--txm);margin-top:2px">'+ds+' · '+duration+' min · Difficulté '+diff+'/10</div></div>'
      +'<div style="font-family:\"Bebas Neue\",sans-serif;font-size:16px;color:var(--gold)">+'+prog.xp+' XP</div>';
    list.insertBefore(row, list.firstChild);
  }
  setTimeout(function(){ showFelicitations(prog.xp); }, 200);
}

// Init programme
(function initProg(){
  renderProgCal();
  // Initialiser les day-tabs depuis le programme (si chargé)
  var dayTabsCont = document.getElementById('day-tabs-prog');
  if(dayTabsCont && dayTabsCont.innerHTML===''){
    dayTabsCont.innerHTML='<div style="font-size:11px;color:var(--txm);padding:8px 0">Programme chargé par Antoine…</div>';
  }
})();

// ══ MESSAGERIE ══
function envoyerMsg(){
  var inp=document.getElementById('msg-input');if(!inp||!inp.value.trim())return;
  var thread=document.getElementById('msg-thread');if(!thread)return;
  var msg=document.createElement('div');
  var now=new Date();var h=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  msg.className='bubble me';msg.innerHTML=inp.value+'<div class="bubble-time">'+h+'</div>';
  thread.appendChild(msg);thread.scrollTop=thread.scrollHeight;
  if(SB_SESSION&&COACH_ID)sbPost('messages',{expediteur_id:SB_SESSION.user.id,destinataire_id:COACH_ID,contenu:inp.value}).catch(function(){});
  inp.value='';
}

// ══ CORRECTION TECHNIQUE ══
function demanderCorrection(){
  var exo=document.getElementById('correction-exo')?.value?.trim()||'';
  var note=document.getElementById('correction-note')?.value?.trim()||'';
  if(!exo){showToastApp('Indique un exercice');return;}
  if(SB_SESSION&&COACH_ID)sbPost('corrections_technique',{client_id:SB_SESSION.user.id,coach_id:COACH_ID,exercice_nom:exo,note_coach:note,statut:'en_attente'}).catch(function(){});
  var ei=document.getElementById('correction-exo');var ni=document.getElementById('correction-note');
  if(ei)ei.value='';if(ni)ni.value='';
  showToastApp('Demande envoyée à Antoine ✓');
}


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
  html+='<div class="photo-slot" onclick="openPhotoModal()" style="border:0.5px dashed rgba(255,255,255,0.15)"><i class="ti ti-plus" style="font-size:20px;color:var(--txd)"></i><div class="ph-lbl">Ajouter</div></div>';
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
    if(!sel){
      if(imgEl)imgEl.style.display='none';
      if(iconEl)iconEl.style.display='block';
      if(lblEl)lblEl.textContent=fallback;
      return;
    }
    var p=photosData.find(function(x){return x.id===sel;});
    if(!p)return;
    if(lblEl)lblEl.textContent=p.lbl+(p.date?' · '+p.date:'');
    if(p.src){
      if(imgEl){imgEl.src=p.src;imgEl.style.display='block';}
      if(iconEl)iconEl.style.display='none';
    } else {
      if(imgEl)imgEl.style.display='none';
      if(iconEl)iconEl.style.display='block';
    }
  }
  setComp(photoSel[0],'comp-img-a','comp-icon-a','ca-lbl','Avant');
  setComp(photoSel[1],'comp-img-b','comp-icon-b','cb-lbl','Après');
}

function openPhotoModal(){var m=document.getElementById('modal-photo');if(m)m.style.display='flex';}
function closePhotoModal(){var m=document.getElementById('modal-photo');if(m)m.style.display='none';}
function takePhoto(){var i=document.getElementById('photo-camera-input');if(i)i.click();closePhotoModal();}
function importPhoto(){var i=document.getElementById('photo-file-input');if(i)i.click();closePhotoModal();}

function handlePhotoFile(e){
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

// ══ MENSURATIONS ══
var MUSCLES_APP=[{id:'tour_bras',lbl:'Tour de bras'},{id:'tour_epaules',lbl:"Tour d'épaules"},{id:'tour_pecs',lbl:'Tour de poitrine'},{id:'tour_taille',lbl:'Tour de taille'},{id:'tour_hanches',lbl:'Tour de hanches'},{id:'tour_cuisse',lbl:'Tour de cuisse'},{id:'tour_mollet',lbl:'Tour de mollet'}];
var mensDataApp=[];
function renderMensInputsApp(){
  var el=document.getElementById('mens-inputs-app');if(!el)return;
  var today=new Date().toISOString().split('T')[0];
  var de=document.getElementById('mens-date-app');if(de)de.value=today;
  var pe=document.getElementById('pesee-date-app');if(pe)pe.value=today;
  el.innerHTML=MUSCLES_APP.map(function(m){
    return'<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)">'
      +'<span style="font-size:12px;flex:1">'+m.lbl+'</span>'
      +'<div style="display:flex;align-items:center;gap:5px"><input type="number" id="mi-app-'+m.id+'" style="width:62px;background:var(--c2);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:5px 7px;font-size:12px;color:var(--tx);font-family:inherit;outline:none;text-align:center;" placeholder="—"><span style="font-size:10px;color:var(--txm)">cm</span></div></div>';
  }).join('');
}
function saveMensApp(){
  var date=document.getElementById('mens-date-app')?.value||(new Date().toISOString().split('T')[0]);
  var v={};MUSCLES_APP.forEach(function(m){var inp=document.getElementById('mi-app-'+m.id);if(inp&&inp.value)v[m.id]=parseFloat(inp.value);});
  if(!Object.keys(v).length){showToastApp('Remplis au moins une mesure');return;}
  mensDataApp.push({date:date,v:v});mensDataApp.sort(function(a,b){return a.date.localeCompare(b.date);});
  MUSCLES_APP.forEach(function(m){var i=document.getElementById('mi-app-'+m.id);if(i)i.value='';});
  if(SB_SESSION)sbPost('mensurations',Object.assign({client_id:SB_SESSION.user.id,date_mesure:date},v)).catch(function(){});
  renderMensHistApp();showToastApp('Mensurations enregistrées ✓');
}
function renderMensHistApp(){
  var el=document.getElementById('mens-hist-app');if(!el)return;
  if(!mensDataApp.length){el.innerHTML='<div style="font-size:12px;color:var(--txm)">Aucune mesure</div>';return;}
  var mois=['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  el.innerHTML=[...mensDataApp].reverse().slice(0,5).map(function(e){
    var d=new Date(e.date);var ds=d.getDate()+' '+mois[d.getMonth()]+' '+d.getFullYear();
    var preview=MUSCLES_APP.filter(function(m){return e.v[m.id];}).slice(0,3).map(function(m){return'<span style="font-size:10px;color:var(--txm)">'+m.lbl.replace('Tour de ','').replace("Tour d'",'')+':<b style="color:var(--tx)"> '+e.v[m.id]+'</b></span>';}).join(' · ');
    return'<div style="padding:8px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)"><div style="font-size:11px;font-weight:500;margin-bottom:3px">'+ds+'</div><div style="line-height:1.7">'+preview+'</div></div>';
  }).join('');
}
function addPeseeApp(){
  var date=document.getElementById('pesee-date-app')?.value;var val=document.getElementById('pesee-val-app')?.value;
  if(!date||!val){showToastApp('Remplis date et poids');return;}
  var mois=['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  var d=new Date(date);var ds=d.getDate()+' '+mois[d.getMonth()]+' '+d.getFullYear();
  var list=document.getElementById('pesees-list-app');
  if(list){var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:0.5px solid rgba(255,255,255,0.05)';row.innerHTML='<span style="font-size:12px">'+ds+'</span><span style="font-size:13px;font-weight:500;color:var(--gr)">'+parseFloat(val).toFixed(1)+' kg</span>';list.insertBefore(row,list.firstChild);}
  if(SB_SESSION)sbPost('pesees',{client_id:SB_SESSION.user.id,date_pesee:date,poids_kg:parseFloat(val)}).catch(function(){});
  document.getElementById('pesee-val-app').value='';showToastApp('Pesée enregistrée ✓');
}

// ══ MODAL PROFIL ══
function openProfilModal(){var m=document.getElementById('modal-profil');if(!m)return;m.style.display='flex';m.onclick=function(e){if(e.target===m)closeProfilModal();};var bar=document.getElementById('font-bar');if(bar)bar.style.width=((fontSize-10)/10*100)+'%';var el=document.getElementById('font-size-display');if(el)el.textContent=fontSize+'px';}
function closeProfilModal(){var m=document.getElementById('modal-profil');if(m)m.style.display='none';}

// ══ TOAST ══
function showToastApp(msg){var t=document.getElementById('toast-app');var txt=document.getElementById('toast-app-txt');if(!t)return;if(txt)txt.textContent=msg;t.style.display='flex';setTimeout(function(){t.style.display='none';},2500);}

// ══ PARAMÈTRES ══
var darkTheme=true,fontSize=14;
function applyTheme(dark){
  darkTheme=dark;var r=document.documentElement.style;
  if(dark){r.setProperty('--bg','#0A0A0A');r.setProperty('--c1','#141414');r.setProperty('--c2','#1C1C1C');r.setProperty('--c3','#242424');r.setProperty('--tx','#F5F5F5');r.setProperty('--txm','#888');r.setProperty('--txd','#444');r.setProperty('--r','#8B0000');r.setProperty('--r2','#A50000');r.setProperty('--b','#00BFFF');r.setProperty('--bl','rgba(0,191,255,0.09)');r.setProperty('--bb','rgba(0,191,255,0.28)');r.setProperty('--gold','#FFD700');r.setProperty('--gr','#4CAF7A');r.setProperty('--or','#E8953A');}
  else{r.setProperty('--bg','#F2F3F5');r.setProperty('--c1','#FFFFFF');r.setProperty('--c2','#E8EAED');r.setProperty('--c3','#D8DADD');r.setProperty('--tx','#111111');r.setProperty('--txm','#444444');r.setProperty('--txd','#888888');r.setProperty('--r','#B00020');r.setProperty('--r2','#C0002A');r.setProperty('--b','#0077CC');r.setProperty('--bl','rgba(0,119,204,0.08)');r.setProperty('--bb','rgba(0,119,204,0.3)');r.setProperty('--gold','#B8860B');r.setProperty('--gr','#2E7D4F');r.setProperty('--or','#C0620A');}
  var bd=document.getElementById('theme-dark-btn');var bl=document.getElementById('theme-light-btn');
  if(bd){bd.style.background=dark?'var(--r)':'transparent';bd.style.color=dark?'#fff':'var(--txm)';}
  if(bl){bl.style.background=!dark?'var(--r)':'transparent';bl.style.color=!dark?'#fff':'var(--txm)';}
}
function applyFontSize(size){
  fontSize=Math.min(20,Math.max(10,size));
  var phone=document.querySelector('.phone');if(phone)phone.style.fontSize=fontSize+'px';
  var style=document.getElementById('dynamic-font-style');
  if(!style){style=document.createElement('style');style.id='dynamic-font-style';document.head.appendChild(style);}
  style.textContent='.scroll,.scroll *{font-size:inherit!important;}';
  var el=document.getElementById('font-size-display');if(el)el.textContent=fontSize+'px';
  var bar=document.getElementById('font-bar');if(bar)bar.style.width=((fontSize-10)/10*100)+'%';
}
function changeFontSize(delta){applyFontSize(fontSize+delta);}
function changerMdp(){
  var a=document.getElementById('pwd-actuel')?.value?.trim();var n=document.getElementById('pwd-nouveau')?.value?.trim();
  if(!a||!n){showToastApp('Remplis les deux champs');return;}
  if(n.length<6){showToastApp('Minimum 6 caractères');return;}
  showToastApp('Mot de passe mis à jour ✓');
  document.getElementById('pwd-actuel').value='';document.getElementById('pwd-nouveau').value='';
}


// ══ NAVIGATION ══
function goNav(el, screenId){
  document.querySelectorAll('.bn').forEach(function(b){ b.classList.remove('on'); });
  if(el) el.classList.add('on');
  document.querySelectorAll('.scroll .scr').forEach(function(s){ s.classList.remove('on'); });
  var target = document.getElementById(screenId);
  if(target) target.classList.add('on');
}


// ══ HELPERS SÉCURISÉS ══
function setText(id, val){ var e=document.getElementById(id); if(e) e.textContent=val; }
function setHtml(id, val){ var e=document.getElementById(id); if(e) e.innerHTML=val; }
function setStyle(id, prop, val){ var e=document.getElementById(id); if(e) e.style[prop]=val; }


// ══ LOGOUT ══
function logoutApp(){
  try{
    var sb=window._sb;
    if(sb) sb.auth.signOut().catch(function(){});
  }catch(e){}
  window.location.href='hub.html';
}

// ══ INIT ══
document.addEventListener('DOMContentLoaded', function(){
  initSuiviQuotidien();
  renderPhotoGrid();
  renderMensInputsApp();
  renderSuiviGraph();
  loadAppData().then(function(){
    setTimeout(loadUserProg, 500);
  }).catch(function(e){console.error('Init:',e);});
});

// ══ CONSIGNE SÉANCE ══
function showCons(){
  var el = document.getElementById('cons-panel');
  if(el) el.style.display = 'flex';
}
function closeCons(){
  var el = document.getElementById('cons-panel');
  if(el) el.style.display = 'none';
}

// ══ TIMER DÉTAIL CHALLENGE ══
var detChInt = null, detChSec = 0, detChRunning = false;
function detChToggle(){
  var btn = document.getElementById('det-ch-btn');
  var timeEl = document.getElementById('det-ch-time');
  if(!timeEl) return;
  if(detChRunning){
    clearInterval(detChInt);
    detChRunning = false;
    if(btn){ btn.innerHTML = '<i class="ti ti-player-play" style="font-size:13px"></i>Reprendre'; }
  } else {
    detChRunning = true;
    if(btn){ btn.innerHTML = '<i class="ti ti-player-pause" style="font-size:13px"></i>Pause'; }
    detChInt = setInterval(function(){
      detChSec++;
      var m = Math.floor(detChSec/60);
      var s = detChSec%60;
      timeEl.textContent = (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
    }, 1000);
  }
}
