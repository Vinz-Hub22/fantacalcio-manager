import { loadStateFromCloud, saveStateToCloud } from './firebase-config.js';

const ROLES = ['P','D','C','A'];
const ROLE_NAMES = {P:'Portiere', D:'Difensore', C:'Centrocampista', A:'Attaccante'};
const MODULI = {
  '3-4-3': {D:3,C:4,A:3}, '3-5-2': {D:3,C:5,A:2}, '4-3-3': {D:4,C:3,A:3},
  '4-4-2': {D:4,C:4,A:2}, '4-5-1': {D:4,C:5,A:1}, '5-3-2': {D:5,C:3,A:2}, '5-4-1': {D:5,C:4,A:1}
};

let state = {
  players: [],
  squadre: [],
  rose: {},      // squadraId -> [{playerId, prezzo}]
  giornate: {}   // numero -> { formazioni: {squadraId:{modulo, titolari:[], panchina:[]}}, voti: {playerId:{...}} }
};
let activeTab = 'listone';
let uiState = { giornataSel: 1, formSquadra: null, votiGiornataSel: 1, confrontoRole: 'ALL' };

function uid(){ return Math.random().toString(36).slice(2,10); }

async function loadState(){
  try{
    const cloud = await loadStateFromCloud();
    if(cloud) state = cloud;
  }catch(e){
    console.error('Errore caricamento da Firebase', e);
    document.getElementById('app').innerHTML =
      '<div class="empty" style="padding:40px 4px">Errore di connessione al database. Controlla la console (F12) per i dettagli.</div>';
    return;
  }
  render();
}

let saveTimer = null;
function saveState(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async ()=>{
    try{
      await saveStateToCloud(state);
      const n = document.getElementById('saveNote');
      n.classList.add('show'); setTimeout(()=>n.classList.remove('show'), 900);
    }catch(e){ console.error('Errore salvataggio', e); }
  }, 400);
}

function playerById(id){ return state.players.find(p=>p.id===id); }
function squadraById(id){ return state.squadre.find(s=>s.id===id); }
function rosaOf(squadraId){ return state.rose[squadraId] || []; }
function isAssigned(playerId){
  for(const sid in state.rose){ if(state.rose[sid].some(r=>r.playerId===playerId)) return sid; }
  return null;
}

// ---------- RENDER ROOT ----------
function render(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="top">
      <h1>Fanta<span>calcio</span> Manager</h1>
      <div class="sub">Lega Classic · gestione listone, asta, formazioni e voti</div>
    </header>
    <nav class="tabs" id="tabs"></nav>
    <div id="tabContent"></div>
  `;
  const tabs = [
    ['listone','Listone'], ['asta','Asta & Rose'], ['formazioni','Formazioni'],
    ['voti','Voti giornata'], ['confronto','Confronto & Classifica']
  ];
  const nav = document.getElementById('tabs');
  nav.innerHTML = tabs.map(([id,label])=>
    `<button class="${activeTab===id?'active':''}" data-tab="${id}">${label}</button>`
  ).join('');
  nav.querySelectorAll('button').forEach(b=>b.onclick=()=>{ activeTab=b.dataset.tab; render(); });

  const content = document.getElementById('tabContent');
  if(activeTab==='listone') content.innerHTML = renderListone();
  if(activeTab==='asta') content.innerHTML = renderAsta();
  if(activeTab==='formazioni') content.innerHTML = renderFormazioni();
  if(activeTab==='voti') content.innerHTML = renderVoti();
  if(activeTab==='confronto') content.innerHTML = renderConfronto();
  bindHandlers();
}

// ---------- LISTONE ----------
function renderListone(){
  const rows = state.players.slice().sort((a,b)=>a.name.localeCompare(b.name));
  return `
  <div class="card">
    <h2>Aggiungi giocatore</h2>
    <p class="hint">Costruisci il listone prima dell'asta: nome, ruolo, squadra reale e quotazione.</p>
    <div class="row">
      <div class="field"><label>Nome</label><input id="np-name" placeholder="Es. Lautaro"></div>
      <div class="field" style="max-width:120px"><label>Ruolo</label>
        <select id="np-role">${ROLES.map(r=>`<option value="${r}">${r} - ${ROLE_NAMES[r]}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Squadra reale</label><input id="np-team" placeholder="Es. Inter"></div>
      <div class="field" style="max-width:110px"><label>Quotazione</label><input id="np-quot" type="number" min="0" placeholder="20"></div>
      <button class="action" id="btn-add-player">Aggiungi</button>
    </div>
  </div>
  <div class="card">
    <h2>Listone (${state.players.length})</h2>
    ${rows.length===0 ? '<div class="empty">Nessun giocatore ancora. Aggiungine uno sopra.</div>' : `
    <table><thead><tr><th>Ruolo</th><th>Nome</th><th>Squadra</th><th>Quot.</th><th>Stato</th><th></th></tr></thead>
    <tbody>
      ${rows.map(p=>{
        const assignedTo = isAssigned(p.id);
        return `<tr>
          <td><span class="role-badge role-${p.role}">${p.role}</span></td>
          <td>${p.name}</td>
          <td>${p.team||'-'}</td>
          <td class="num">${p.quot ?? '-'}</td>
          <td>${assignedTo ? `<span class="tag">${squadraById(assignedTo)?.name||'assegnato'}</span>` : `<span class="tag">svincolato</span>`}</td>
          <td><button class="icon-btn" data-del-player="${p.id}" title="Elimina">✕</button></td>
        </tr>`;
      }).join('')}
    </tbody></table>`}
  </div>`;
}

// ---------- ASTA & ROSE ----------
function renderAsta(){
  const freeAgents = state.players.filter(p=>!isAssigned(p.id)).sort((a,b)=>a.name.localeCompare(b.name));
  return `
  <div class="card">
    <h2>Nuova fantasquadra</h2>
    <div class="row">
      <div class="field"><label>Nome squadra</label><input id="ns-name" placeholder="Es. I Leoni FC"></div>
      <div class="field" style="max-width:120px"><label>Budget</label><input id="ns-budget" type="number" min="1" value="500"></div>
      <button class="action" id="btn-add-squadra">Crea</button>
    </div>
  </div>

  ${state.squadre.length===0 ? '<div class="card"><div class="empty">Crea almeno una fantasquadra per iniziare l\\'asta.</div></div>' :
  state.squadre.map(sq=>{
    const rosa = rosaOf(sq.id);
    const speso = rosa.reduce((s,r)=>s+r.prezzo,0);
    const pct = sq.budget>0 ? Math.min(100, Math.round(speso/sq.budget*100)) : 0;
    const perRole = {P:0,D:0,C:0,A:0};
    rosa.forEach(r=>{ const p=playerById(r.playerId); if(p) perRole[p.role]++; });
    return `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">${sq.name}</h2>
        <button class="icon-btn" data-del-squadra="${sq.id}">✕ elimina squadra</button>
      </div>
      <div class="hint">Budget ${sq.budget} · speso ${speso} · rimanente ${sq.budget-speso}
        &nbsp;·&nbsp; P ${perRole.P} D ${perRole.D} C ${perRole.C} A ${perRole.A}</div>
      <div class="budget-bar"><div style="width:${pct}%"></div></div>
      <div class="row" style="margin-top:12px">
        <div class="field" style="flex:2">
          <label>Assegna giocatore svincolato</label>
          <select id="pick-player-${sq.id}">
            <option value="">-- scegli --</option>
            ${freeAgents.map(p=>`<option value="${p.id}">${p.role} · ${p.name} (${p.team||'-'})</option>`).join('')}
          </select>
        </div>
        <div class="field" style="max-width:100px"><label>Prezzo</label><input type="number" min="1" id="pick-price-${sq.id}" placeholder="1"></div>
        <button class="action" data-assign-squadra="${sq.id}">Assegna</button>
      </div>
      ${rosa.length===0 ? '<div class="empty">Rosa vuota.</div>' : `
      <table style="margin-top:10px"><thead><tr><th>Ruolo</th><th>Nome</th><th>Prezzo</th><th></th></tr></thead>
      <tbody>${rosa.map(r=>{
        const p = playerById(r.playerId); if(!p) return '';
        return `<tr><td><span class="role-badge role-${p.role}">${p.role}</span></td><td>${p.name}</td>
          <td class="num">${r.prezzo}</td>
          <td><button class="icon-btn" data-remove-from-rosa="${sq.id}|${p.id}">✕</button></td></tr>`;
      }).join('')}</tbody></table>`}
    </div>`;
  }).join('')}
  `;
}

// ---------- FORMAZIONI ----------
function renderFormazioni(){
  if(state.squadre.length===0) return '<div class="card"><div class="empty">Crea prima le fantasquadre nella scheda Asta & Rose.</div></div>';
  const g = uiState.giornataSel;
  if(!state.giornate[g]) state.giornate[g] = { formazioni:{}, voti:{} };
  const sqId = uiState.formSquadra || state.squadre[0].id;
  uiState.formSquadra = sqId;
  const sq = squadraById(sqId);
  const rosa = rosaOf(sqId);
  const gior = state.giornate[g];
  const conf = gior.formazioni[sqId] || { modulo:'4-4-2', titolari:[], panchina:[] };
  gior.formazioni[sqId] = conf;
  const need = MODULI[conf.modulo];
  const countByRole = {P:0,D:0,C:0,A:0};
  conf.titolari.forEach(id=>{ const p=playerById(id); if(p) countByRole[p.role]++; });
  const complete = countByRole.P===1 && countByRole.D===need.D && countByRole.C===need.C && countByRole.A===need.A;

  const rosaByRole = {}; ROLES.forEach(r=>rosaByRole[r]=rosa.map(x=>playerById(x.playerId)).filter(p=>p&&p.role===r));

  return `
  <div class="card">
    <div class="row" style="align-items:flex-end">
      <div class="field" style="max-width:100px"><label>Giornata</label><input type="number" min="1" id="gior-sel" value="${g}"></div>
      <div class="field" style="max-width:220px"><label>Fantasquadra</label>
        <select id="form-squadra-sel">${state.squadre.map(s=>`<option value="${s.id}" ${s.id===sqId?'selected':''}>${s.name}</option>`).join('')}</select>
      </div>
      <div class="field" style="max-width:140px"><label>Modulo</label>
        <select id="form-modulo-sel">${Object.keys(MODULI).map(m=>`<option value="${m}" ${m===conf.modulo?'selected':''}>${m}</option>`).join('')}</select>
      </div>
      <span class="tag" style="margin-bottom:9px">${complete? '✓ formazione completa (1-'+need.D+'-'+need.C+'-'+need.A+')' : 'mancano giocatori: serve 1-'+need.D+'-'+need.C+'-'+need.A}</span>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <h2>Titolari — ${sq.name}</h2>
      ${ROLES.map(r=>`
        <p class="hint" style="margin:10px 0 6px;color:var(--chalk)"><b>${ROLE_NAMES[r]}</b> (${countByRole[r]}/${r==='P'?1:need[r]})</p>
        ${rosaByRole[r].length===0 ? '<div class="empty">Nessuno in rosa</div>' : rosaByRole[r].map(p=>{
          const checked = conf.titolari.includes(p.id);
          return `<label style="display:flex;gap:8px;align-items:center;padding:3px 0;font-size:0.88rem">
            <input type="checkbox" data-titolare="${p.id}" ${checked?'checked':''}> ${p.name} <span class="tag">${p.team||'-'}</span>
          </label>`;
        }).join('')}
      `).join('')}
    </div>
    <div class="card">
      <h2>Panchina</h2>
      <p class="hint">I giocatori in rosa non selezionati come titolari restano automaticamente in panchina.</p>
      ${rosa.length===0 ? '<div class="empty">Rosa vuota.</div>' : rosa.map(r=>{
        const p = playerById(r.playerId); if(!p) return '';
        if(conf.titolari.includes(p.id)) return '';
        return `<div style="padding:4px 0;font-size:0.88rem"><span class="role-badge role-${p.role}">${p.role}</span> ${p.name}</div>`;
      }).join('')}
    </div>
  </div>`;
}

// ---------- VOTI ----------
function renderVoti(){
  const g = uiState.votiGiornataSel;
  if(!state.giornate[g]) state.giornate[g] = { formazioni:{}, voti:{} };
  const gior = state.giornate[g];
  const titolariIds = new Set();
  Object.values(gior.formazioni).forEach(f=>f.titolari.forEach(id=>titolariIds.add(id)));
  const list = [...titolariIds].map(playerById).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));

  return `
  <div class="card">
    <div class="row" style="align-items:flex-end">
      <div class="field" style="max-width:100px"><label>Giornata</label><input type="number" min="1" id="voti-gior-sel" value="${g}"></div>
      <p class="hint" style="margin:0 0 8px">Inserisci i voti dei titolari schierati in questa giornata (scheda Formazioni). Gol, assist e ammonizioni generano automaticamente bonus/malus classic.</p>
    </div>
  </div>
  <div class="card">
    <h2>Voti — giornata ${g}</h2>
    ${list.length===0 ? '<div class="empty">Nessun titolare schierato per questa giornata. Vai su Formazioni prima.</div>' : `
    <table>
      <thead><tr><th>Nome</th><th>Voto</th><th>Gol</th><th>Assist</th><th>Amm.</th><th>Esp.</th><th>Autogol</th><th>Rig. sbagl.</th>
      <th>Rig. parato</th><th>Gol subiti</th><th>Punt.</th></tr></thead>
      <tbody>
      ${list.map(p=>{
        const v = gior.voti[p.id] || {voto:'', gol:0, assist:0, amm:0, esp:0, autogol:0, rigSbagliato:0, rigParato:0, golSubiti:0};
        const pts = calcPunteggio(v);
        return `<tr>
          <td><span class="role-badge role-${p.role}">${p.role}</span> ${p.name}</td>
          <td><input type="number" step="0.5" style="width:60px" data-voto="${p.id}" data-field="voto" value="${v.voto}"></td>
          <td><input type="number" min="0" style="width:48px" data-voto="${p.id}" data-field="gol" value="${v.gol}"></td>
          <td><input type="number" min="0" style="width:48px" data-voto="${p.id}" data-field="assist" value="${v.assist}"></td>
          <td><input type="number" min="0" style="width:44px" data-voto="${p.id}" data-field="amm" value="${v.amm}"></td>
          <td><input type="number" min="0" style="width:44px" data-voto="${p.id}" data-field="esp" value="${v.esp}"></td>
          <td><input type="number" min="0" style="width:44px" data-voto="${p.id}" data-field="autogol" value="${v.autogol}"></td>
          <td><input type="number" min="0" style="width:44px" data-voto="${p.id}" data-field="rigSbagliato" value="${v.rigSbagliato}"></td>
          <td><input type="number" min="0" style="width:44px" data-voto="${p.id}" data-field="rigParato" value="${v.rigParato}" ${p.role!=='P'?'disabled':''}></td>
          <td><input type="number" min="0" style="width:44px" data-voto="${p.id}" data-field="golSubiti" value="${v.golSubiti}" ${p.role!=='P'?'disabled':''}></td>
          <td class="num"><b>${pts.toFixed(1)}</b></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`}
  </div>`;
}

function calcPunteggio(v){
  const voto = parseFloat(v.voto);
  if(isNaN(voto) || voto===0) return 0;
  let pts = voto;
  pts += 3*(v.gol||0);
  pts += 1*(v.assist||0);
  pts -= 0.5*(v.amm||0);
  pts -= 1*(v.esp||0);
  pts -= 2*(v.autogol||0);
  pts -= 3*(v.rigSbagliato||0);
  pts += 3*(v.rigParato||0);
  pts -= 1*(v.golSubiti||0);
  return pts;
}

// ---------- CONFRONTO & CLASSIFICA ----------
function renderConfronto(){
  const giornateNums = Object.keys(state.giornate).map(Number).sort((a,b)=>a-b);
  const rowsClassifica = state.squadre.map(sq=>{
    let totale = 0, giocate = 0;
    giornateNums.forEach(g=>{
      const gior = state.giornate[g];
      const f = gior.formazioni[sq.id];
      if(!f || f.titolari.length===0) return;
      let sumG = 0, any=false;
      f.titolari.forEach(id=>{
        const v = gior.voti[id];
        if(v && v.voto!=='' && v.voto!=null){ sumG += calcPunteggio(v); any=true; }
      });
      if(any){ totale += sumG; giocate++; }
    });
    return {sq, totale, giocate};
  }).sort((a,b)=>b.totale-a.totale);

  const stats = {};
  giornateNums.forEach(g=>{
    const gior = state.giornate[g];
    Object.entries(gior.voti).forEach(([pid,v])=>{
      if(v.voto==='' || v.voto==null) return;
      if(!stats[pid]) stats[pid] = {sumVoto:0, sumPunti:0, n:0};
      stats[pid].sumVoto += parseFloat(v.voto);
      stats[pid].sumPunti += calcPunteggio(v);
      stats[pid].n++;
    });
  });
  let statRows = Object.entries(stats).map(([pid,s])=>{
    const p = playerById(pid); if(!p) return null;
    return {p, media: s.sumVoto/s.n, fantamedia: s.sumPunti/s.n, presenze: s.n};
  }).filter(Boolean);
  if(uiState.confrontoRole!=='ALL') statRows = statRows.filter(r=>r.p.role===uiState.confrontoRole);
  statRows.sort((a,b)=>b.fantamedia-a.fantamedia);

  return `
  <div class="card">
    <h2>Classifica fantalega</h2>
    ${state.squadre.length===0 ? '<div class="empty">Crea le fantasquadre per vedere la classifica.</div>' : `
    <table><thead><tr><th>#</th><th>Squadra</th><th>Giornate</th><th>Punti totali</th></tr></thead>
    <tbody>${rowsClassifica.map((r,i)=>`<tr><td class="pos-rank">${i+1}</td><td>${r.sq.name}</td><td class="num">${r.giocate}</td><td class="num total-score">${r.totale.toFixed(1)}</td></tr>`).join('')}</tbody></table>`}
  </div>
  <div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <h2 style="margin:0">Confronto giocatori</h2>
      <select id="confronto-role-sel" style="max-width:160px">
        <option value="ALL" ${uiState.confrontoRole==='ALL'?'selected':''}>Tutti i ruoli</option>
        ${ROLES.map(r=>`<option value="${r}" ${uiState.confrontoRole===r?'selected':''}>${ROLE_NAMES[r]}</option>`).join('')}
      </select>
    </div>
    ${statRows.length===0 ? '<div class="empty">Inserisci voti nella scheda Voti giornata per vedere il confronto.</div>' : `
    <table><thead><tr><th>Ruolo</th><th>Nome</th><th>Presenze</th><th>Media voto</th><th>Fantamedia</th></tr></thead>
    <tbody>${statRows.map(r=>`<tr>
      <td><span class="role-badge role-${r.p.role}">${r.p.role}</span></td>
      <td>${r.p.name}</td>
      <td class="num">${r.presenze}</td>
      <td class="num">${r.media.toFixed(2)}</td>
      <td class="num"><b>${r.fantamedia.toFixed(2)}</b></td>
    </tr>`).join('')}</tbody></table>`}
  </div>`;
}

// ---------- HANDLERS ----------
function bindHandlers(){
  const $ = sel => document.querySelector(sel);

  if(activeTab==='listone'){
    $('#btn-add-player')?.addEventListener('click', ()=>{
      const name = $('#np-name').value.trim();
      if(!name) return;
      state.players.push({
        id: uid(), name,
        role: $('#np-role').value,
        team: $('#np-team').value.trim(),
        quot: $('#np-quot').value ? parseFloat($('#np-quot').value) : null
      });
      saveState(); render();
    });
    document.querySelectorAll('[data-del-player]').forEach(b=>b.addEventListener('click', ()=>{
      const id = b.dataset.delPlayer;
      state.players = state.players.filter(p=>p.id!==id);
      Object.keys(state.rose).forEach(sid=>{ state.rose[sid] = state.rose[sid].filter(r=>r.playerId!==id); });
      saveState(); render();
    }));
  }

  if(activeTab==='asta'){
    $('#btn-add-squadra')?.addEventListener('click', ()=>{
      const name = $('#ns-name').value.trim();
      if(!name) return;
      const id = uid();
      state.squadre.push({ id, name, budget: parseFloat($('#ns-budget').value)||500 });
      state.rose[id] = [];
      saveState(); render();
    });
    document.querySelectorAll('[data-del-squadra]').forEach(b=>b.addEventListener('click', ()=>{
      const id = b.dataset.delSquadra;
      state.squadre = state.squadre.filter(s=>s.id!==id);
      delete state.rose[id];
      Object.values(state.giornate).forEach(g=>delete g.formazioni[id]);
      saveState(); render();
    }));
    document.querySelectorAll('[data-assign-squadra]').forEach(b=>b.addEventListener('click', ()=>{
      const sid = b.dataset.assignSquadra;
      const playerSel = $(`#pick-player-${sid}`);
      const priceInp = $(`#pick-price-${sid}`);
      const pid = playerSel.value;
      const prezzo = parseFloat(priceInp.value);
      if(!pid || !prezzo || prezzo<=0) return;
      state.rose[sid].push({ playerId: pid, prezzo });
      saveState(); render();
    }));
    document.querySelectorAll('[data-remove-from-rosa]').forEach(b=>b.addEventListener('click', ()=>{
      const [sid,pid] = b.dataset.removeFromRosa.split('|');
      state.rose[sid] = state.rose[sid].filter(r=>r.playerId!==pid);
      saveState(); render();
    }));
  }

  if(activeTab==='formazioni'){
    $('#gior-sel')?.addEventListener('change', e=>{ uiState.giornataSel = parseInt(e.target.value)||1; render(); });
    $('#form-squadra-sel')?.addEventListener('change', e=>{ uiState.formSquadra = e.target.value; render(); });
    $('#form-modulo-sel')?.addEventListener('change', e=>{
      const g = uiState.giornataSel, sid = uiState.formSquadra;
      state.giornate[g].formazioni[sid].modulo = e.target.value;
      saveState(); render();
    });
    document.querySelectorAll('[data-titolare]').forEach(cb=>cb.addEventListener('change', e=>{
      const g = uiState.giornataSel, sid = uiState.formSquadra;
      const conf = state.giornate[g].formazioni[sid];
      const pid = e.target.dataset.titolare;
      if(e.target.checked){
        if(!conf.titolari.includes(pid)) conf.titolari.push(pid);
      } else {
        conf.titolari = conf.titolari.filter(id=>id!==pid);
      }
      saveState(); render();
    }));
  }

  if(activeTab==='voti'){
    $('#voti-gior-sel')?.addEventListener('change', e=>{ uiState.votiGiornataSel = parseInt(e.target.value)||1; render(); });
    document.querySelectorAll('[data-voto]').forEach(inp=>inp.addEventListener('input', e=>{
      const g = uiState.votiGiornataSel;
      const pid = e.target.dataset.voto;
      const field = e.target.dataset.field;
      if(!state.giornate[g].voti[pid]) state.giornate[g].voti[pid] = {voto:'', gol:0, assist:0, amm:0, esp:0, autogol:0, rigSbagliato:0, rigParato:0, golSubiti:0};
      const val = field==='voto' ? e.target.value : (parseInt(e.target.value)||0);
      state.giornate[g].voti[pid][field] = val;
      saveState();
      const row = e.target.closest('tr');
      const ptsCell = row.querySelector('td:last-child b');
      if(ptsCell) ptsCell.textContent = calcPunteggio(state.giornate[g].voti[pid]).toFixed(1);
    }));
  }

  if(activeTab==='confronto'){
    $('#confronto-role-sel')?.addEventListener('change', e=>{ uiState.confrontoRole = e.target.value; render(); });
  }
}

loadState();
