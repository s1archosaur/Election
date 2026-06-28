/* Shared election logic for admin + spectator
   - Data stored in localStorage keys: rcv_parallel_cands, rcv_parallel_ballots
   - spectatorInit() renders read-only dashboard and polls periodically
   - adminInit() renders management and voting UI
*/
(function(){
  const STORAGE_CANDS = 'rcv_parallel_cands';
  const STORAGE_BALLOTS = 'rcv_parallel_ballots';
  const STORAGE_VOTING_CLOSED = 'rcv_parallel_voting_closed';
  const STORAGE_LAST_UPDATE = 'rcv_parallel_last_update';
  const SYNC_CHANNEL = 'rcv_parallel_sync_channel';
  const MAX_VOTES = 58;
  const bc = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel(SYNC_CHANNEL) : null;

  function driveToDirect(url){
    const raw = String(url || '');
    const m = raw.match(/(?:https:\/\/)?(?:drive\.google\.com\/)(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/)
      || raw.match(/(?:https:\/\/)?drive\.usercontent\.google\.com\/download\?id=([a-zA-Z0-9_-]+)/)
      || raw.match(/(?:https:\/\/)?drive\.google\.com\/uc\?[^\s]*id=([a-zA-Z0-9_-]+)/);
    return (m && m[1]) ? `https://drive.usercontent.google.com/download?id=${m[1]}&export=view` : raw;
  }

  function imageFallback(name){
    return `https://placehold.co/150x150/1e293b/e2e8f0?text=${encodeURIComponent(String(name || 'CR').substring(0,2).toUpperCase())}`;
  }

  function imgAttrs(name, backupUrl){
    const backup = backupUrl || '';
    return `loading="lazy" referrerpolicy="no-referrer" data-backup="${backup}" onerror="if(this.dataset.backup && !this.dataset.triedBackup){this.dataset.triedBackup='1';this.src=this.dataset.backup;return;}this.onerror=null;this.src='${imageFallback(name)}'"`;
  }

  function localImageForName(name){
    const n = String(name || '').toLowerCase();
    // Primary local folder (as currently present in this project): /images
    if(n.includes('ashfaque')) return 'images/Ashfaque.jpg';
    if(n.includes('bijoy')) return 'images/Bijoy.jpg';
    if(n.includes('rahi')) return 'images/Rahi.jpg';
    if(n.includes('lokesh')) return 'images/Lokesh.jpg';
    if(n.includes('ahnaf')) return 'images/Ahnaf.jpg';
    return '';
  }

  function knownImageForName(name){
    const n = String(name || '').toLowerCase();
    if(n.includes('ashfaque')) return driveToDirect('https://drive.google.com/file/d/1IN2SkDxnprUnppo4MBoIHunpoQdhIRCP/view?usp=sharing');
    if(n.includes('bijoy')) return driveToDirect('https://drive.google.com/file/d/1iPfHnJyRHOWehREvoN470KoqfClSYaOz/view?usp=sharing');
    if(n.includes('lokesh')) return driveToDirect('https://drive.google.com/file/d/13uB07XjIbu6XHdgJRta0_dp8jcydsdms/view?usp=sharing');
    if(n.includes('rahi')) return driveToDirect('https://drive.google.com/file/d/1SiMeRZLFkK6tc1ppvJe3B8Ykl3DO82th/view?usp=sharing');
    if(n.includes('ahnaf')) return driveToDirect('https://drive.google.com/file/d/1Ceuv99URHE2DkKE42IjprZjCKo33KiGH/view?usp=sharing');
    return '';
  }

  const defaultCandidates = [
    { id: 'c1', name: 'Kazi Ashfaque Hossain (2108066)', group: 'B1', image: localImageForName('ashfaque') || knownImageForName('ashfaque') || 'https://placehold.co/150x150/1e293b/38bdf8?text=KAH' },
    { id: 'c2', name: 'Bijoy Aich (2108078)', group: 'B1', image: localImageForName('bijoy') || knownImageForName('bijoy') || 'https://placehold.co/150x150/1e293b/38bdf8?text=BA' },
    { id: 'c3', name: 'Shihab Shadman Rahi (2108091)', group: 'B2', image: localImageForName('rahi') || knownImageForName('rahi') || 'https://placehold.co/150x150/0f172a/2dd4bf?text=SSR' },
    { id: 'c4', name: 'Lokesh Paul (2108096)', group: 'B2', image: localImageForName('lokesh') || knownImageForName('lokesh') || 'https://placehold.co/150x150/0f172a/2dd4bf?text=LP' },
    { id: 'c5', name: 'Md Omar Saad Ahnaf (2108113)', group: 'B2', image: localImageForName('ahnaf') || knownImageForName('ahnaf') || 'https://placehold.co/150x150/0f172a/2dd4bf?text=OSA' }
  ];

  function loadCandidates(){
    try{
      const d = JSON.parse(localStorage.getItem(STORAGE_CANDS));
      if(d && d.length){
        return d.map(c => {
          const normalizedName =
            c.id === 'c1' && c.name === 'Kazi Ashfaque (2108066)' ? 'Kazi Ashfaque Hossain (2108066)' :
            c.id === 'c3' && c.name === 'Shihab Shadman (2108091)' ? 'Shihab Shadman Rahi (2108091)' :
            c.id === 'c5' && c.name === 'Md Omar Saad (2108113)' ? 'Md Omar Saad Ahnaf (2108113)' :
            c.name;
          const fallbackKnown = knownImageForName(c.name);
          const hasPlaceholder = String(c.image || '').includes('placehold.co');
          const withName = normalizedName !== c.name ? { ...c, name: normalizedName } : c;
          const preferredLocal = localImageForName(withName.name);
          const normalizedImage = driveToDirect(withName.image || '');
          if (preferredLocal) return { ...withName, image: preferredLocal };
          if (hasPlaceholder && fallbackKnown) return { ...withName, image: fallbackKnown };
          return { ...withName, image: normalizedImage || withName.image };
        });
      }
      return [...defaultCandidates];
    }
    catch(e){ return [...defaultCandidates]; }
  }
  function notifyDataUpdated(){
    localStorage.setItem(STORAGE_LAST_UPDATE, String(Date.now()));
    if (bc) bc.postMessage({ type: 'data-updated', ts: Date.now() });
  }
  function saveCandidates(c){ localStorage.setItem(STORAGE_CANDS, JSON.stringify(c)); notifyDataUpdated(); }
  function loadBallots(){ try{ return JSON.parse(localStorage.getItem(STORAGE_BALLOTS)) || []; }catch(e){return []} }
  function saveBallots(b){ localStorage.setItem(STORAGE_BALLOTS, JSON.stringify(b)); notifyDataUpdated(); }
  function isVotingClosed(){ return localStorage.getItem(STORAGE_VOTING_CLOSED) === '1'; }
  function setVotingClosed(closed){ localStorage.setItem(STORAGE_VOTING_CLOSED, closed ? '1' : '0'); notifyDataUpdated(); }

  // RCV algorithm (isolated per group)
  function runRCVForGroup(group, candidates, ballots){
    const allIds = candidates.filter(c=>c.group===group).map(c=>c.id);
    if(!allIds.length) return { rounds: [], winner: null };
    let currentBallots = ballots.map(b => [...(group==='B1'? b.b1 : b.b2)]).filter(b=>b && b.length);
    let active = [...allIds];
    const rounds = [];

    while(true){
      // Keep every candidate in each round snapshot so the trend chart remains stable.
      const counts = Object.fromEntries(allIds.map(id=>[id,0]));
      let activeBallotCount = 0;
      currentBallots.forEach(ballot=>{
        const top = ballot.find(id=>active.includes(id));
        if(top){
          counts[top]++;
          activeBallotCount++;
        }
      });
      rounds.push({...counts});

      // Standard RCV stop: winner reaches >50% of currently active ballots.
      const majority = active.find(id => activeBallotCount > 0 && counts[id] > activeBallotCount / 2);
      if (majority) {
        return { rounds, winner: majority };
      }

      if(active.length<=1) break;

      // Eliminate lowest active candidate (ties break by candidate id for deterministic output).
      const sorted = active.map(id=>({id, votes: counts[id]})).sort((a,b)=>a.votes-b.votes);
      const lowestVotes = sorted[0].votes;
      const tiedLowest = sorted.filter(x => x.votes === lowestVotes).map(x => x.id).sort();
      const elim = tiedLowest[0];
      active = active.filter(x=>x!==elim);
    }
    return { rounds, winner: active[0] };
  }

  // --- SPECTATOR ---
  function spectatorInit(){
    // Initial render plus realtime sync across admin/spectator tabs.
    renderSpectator();
    window.addEventListener('storage', (ev) => {
      if ([STORAGE_CANDS, STORAGE_BALLOTS, STORAGE_VOTING_CLOSED, STORAGE_LAST_UPDATE].includes(ev.key)) renderSpectator();
    });
    if (bc) bc.onmessage = () => renderSpectator();
    setInterval(renderSpectator, 5000);
  }
  function renderSpectator(){
    const candidates = loadCandidates();
    const ballots = loadBallots();
    const votingClosed = isVotingClosed();
    const total = ballots.length;
    const totalEl = document.getElementById('totalVoters'); if(totalEl) totalEl.innerText = `${total} / ${MAX_VOTES}`;
    const statusEl = document.getElementById('voteStatusSpectator');
    if (statusEl) {
      statusEl.textContent = votingClosed ? 'Voting Closed' : 'Voting Open';
      statusEl.className = votingClosed
        ? 'mt-1 text-[11px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-block'
        : 'mt-1 text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-block';
    }

    const turnoutEl = document.getElementById('insightTurnout');
    if (turnoutEl) turnoutEl.textContent = `${Math.round((total / MAX_VOTES) * 100)}%`;
    const insightStatusEl = document.getElementById('insightStatus');
    if (insightStatusEl) insightStatusEl.textContent = votingClosed ? 'Voting ended. Final results ready.' : 'Voting in progress';

    const b1 = runRCVForGroup('B1', candidates, ballots);
    const b2 = runRCVForGroup('B2', candidates, ballots);

    // winners
    const namesPopup = document.getElementById('winnerNamesPopup');
    if(namesPopup){
      namesPopup.innerHTML='';
      [b1.winner,b2.winner].forEach(id=>{
        if(!id) return;
        const c = candidates.find(x=>x.id===id);
        if(!c) return;
        const backup = knownImageForName(c.name);
        namesPopup.innerHTML += `<div class="bg-black/40 p-4 rounded-xl border border-slate-700 flex items-center gap-4"><img src="${driveToDirect(c.image)}" ${imgAttrs(c.name, backup)} class="w-24 h-24 rounded-lg object-cover"/><div><div class="font-bold text-2xl leading-tight">${c.name}</div><div class="text-sm text-slate-300 mt-2">${c.group} Representative</div></div></div>`;
      });
    }

    const popup = document.getElementById('winnersPopup');
    if (popup) {
      if (votingClosed) {
        popup.classList.remove('hidden');
        popup.classList.add('flex');
      } else {
        popup.classList.add('hidden');
        popup.classList.remove('flex');
      }
    }

    // charts: create simple bar for round1 and line for trend
    renderChartsFor('B1', b1, candidates, 'chartB1R1', 'chartB1Trend');
    renderChartsFor('B2', b2, candidates, 'chartB2R1', 'chartB2Trend');
  }

  const chartStore = {};
  function renderChartsFor(group, rcvData, candidates, canvasR1, canvasTrend){
    const rounds = rcvData.rounds || [];
    if(!rounds.length) return;
    const r1 = rounds[0];
    const ids = Object.keys(r1).sort((a,b)=>r1[b]-r1[a]);
    const palette = group === 'B1'
      ? ['#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#2563eb']
      : ['#14b8a6', '#2dd4bf', '#5eead4', '#0f766e', '#0d9488'];
    const labels = ids.map(id => {
      const full = (candidates.find(c=>c.id===id)||{name:id}).name.replace(/\s*\([^)]*\)\s*$/, '');
      const parts = full.trim().split(/\s+/);
      return parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : full;
    });
    const dataR1 = ids.map(id=> r1[id]);
    // destroy old
    if(chartStore[canvasR1]) chartStore[canvasR1].destroy();
    if(chartStore[canvasTrend]) chartStore[canvasTrend].destroy();

    chartStore[canvasR1] = new Chart(document.getElementById(canvasR1), {
      type:'bar',
      data:{labels, datasets:[{data:dataR1, backgroundColor: ids.map((_,i)=>palette[i % palette.length])}]},
      options:{
        plugins:{legend:{display:false}},
        maintainAspectRatio:false,
        scales:{
          x:{ticks:{font:{size:10}, maxRotation:0, minRotation:0}},
          y:{beginAtZero:true, ticks:{font:{size:10}}}
        }
      }
    });

    const trendDatasets = ids.map((id,i)=>({
      label: labels[i],
      data: rounds.map(r => r[id] || 0),
      borderColor: palette[i % palette.length],
      backgroundColor: 'transparent',
      tension:0.3
    }));
    chartStore[canvasTrend] = new Chart(document.getElementById(canvasTrend), {
      type:'line',
      data:{ labels: rounds.map((_,i)=>`R${i+1}`), datasets: trendDatasets },
      options:{
        maintainAspectRatio:false,
        plugins:{
          legend:{
            display:true,
            position:'bottom',
            labels:{boxWidth:10, boxHeight:10, font:{size:10}, color:'#cbd5e1'}
          }
        },
        elements:{point:{radius:2}},
        scales:{
          x:{ticks:{font:{size:10}}},
          y:{beginAtZero:true, ticks:{font:{size:10}}}
        }
      }
    });
  }

  // --- ADMIN ---
  function adminInit(){
    // create basic admin UI re-using original behaviours
    window.candidates = loadCandidates();
    window.ballots = loadBallots();
    renderAdminUI();
    window.addEventListener('storage', (ev) => {
      if ([STORAGE_CANDS, STORAGE_BALLOTS, STORAGE_VOTING_CLOSED, STORAGE_LAST_UPDATE].includes(ev.key)) {
        window.candidates = loadCandidates();
        window.ballots = loadBallots();
        renderAdminUI();
      }
    });
    if (bc) {
      bc.onmessage = () => {
        window.candidates = loadCandidates();
        window.ballots = loadBallots();
        renderAdminUI();
      };
    }
  }

  function renderAdminUI(){
    const votingClosed = isVotingClosed();
    document.getElementById('voteCountHeader').innerText = `${ballots.length} / ${MAX_VOTES}`;
    const status = document.getElementById('voteStatusAdmin');
    const toggleBtn = document.getElementById('toggleVotingBtn');
    const submitBtn = document.getElementById('submitVoteBtn');
    if (status) {
      status.textContent = votingClosed ? 'Voting Closed' : 'Voting Open';
      status.className = votingClosed
        ? 'text-[11px] px-2 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30'
        : 'text-[11px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    }
    if (toggleBtn) {
      toggleBtn.textContent = votingClosed ? 'Reopen Voting' : 'End Votes Early';
      toggleBtn.className = votingClosed
        ? 'px-3 py-1.5 rounded text-xs font-semibold bg-emerald-500 text-slate-900 hover:bg-emerald-400 transition-colors'
        : 'px-3 py-1.5 rounded text-xs font-semibold bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors';
    }
    if (submitBtn) {
      submitBtn.disabled = votingClosed;
      submitBtn.className = votingClosed
        ? 'mt-6 w-full bg-slate-600 text-slate-300 px-4 py-3 rounded-xl cursor-not-allowed'
        : 'mt-6 w-full bg-teal-500 text-white px-4 py-3 rounded-xl';
      if (votingClosed) submitBtn.textContent = 'Voting Closed';
      else submitBtn.textContent = 'Review & Submit Ballot';
    }
    renderBallotForms(); renderCandidateList();
  }

  function renderBallotForms(){
    const b1 = candidatesFor('B1'); const b2 = candidatesFor('B2');
    const render = (list, formId)=>{
      const form = document.getElementById(formId); if(!form) return;
      form.innerHTML = '';
      if(list.length===0){ form.innerHTML = '<div class="text-xs text-slate-400">No candidates</div>'; return; }
      const opts = '<option value="">-- Null --</option>' + list.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
      list.forEach((_,i)=>{ form.innerHTML += `<div class="flex items-center gap-3"><div class="w-8 h-8 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-xs">${i+1}</div><select class="${formId}-select flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white">${opts}</select></div>` });
    };
    window.candidates = loadCandidates();
    render(b1, 'ballotFormB1'); render(b2, 'ballotFormB2');
  }

  function candidatesFor(group){ return (window.candidates||loadCandidates()).filter(c=>c.group===group); }

  // Minimal candidate list rendering
  function renderCandidateList(){
    const list = document.getElementById('candidateList'); if(!list) return;
    list.innerHTML = '';
    (window.candidates||loadCandidates()).forEach(c=>{ const backup = knownImageForName(c.name); list.innerHTML += `<div class="flex items-center gap-3 p-2 border-b border-slate-700"><img src="${driveToDirect(c.image)}" ${imgAttrs(c.name, backup)} class="w-10 h-10 rounded"/><div class="flex-1"><div class="font-medium">${c.name}</div><div class="text-xs text-slate-400">${c.group}</div></div><div class="flex gap-2"><button onclick="editCandidate('${c.id}')" class="px-2 py-1 bg-slate-700 rounded">Edit</button><button onclick="deleteCandidate('${c.id}')" class="px-2 py-1 bg-red-600 rounded">Del</button></div></div>` });
  }

  // Expose minimal admin functions to window for onclick handlers
  window.openAddCandidateModal = function(){
    const name = prompt('Full name & ID'); if(!name) return;
    const group = prompt('Subsection (B1 or B2)','B1'); if(!group) return;
    const image = prompt('Image URL (optional)','');
    const known = knownImageForName(name);
    const c = {
      id: 'c'+Date.now(),
      name,
      group: group.toUpperCase(),
      image: driveToDirect(image) || localImageForName(name) || known || (`https://placehold.co/150x150/1e293b/38bdf8?text=${encodeURIComponent(name.substring(0,2))}`)
    };
    window.candidates.push(c); saveCandidates(window.candidates); renderAdminUI();
  };

  window.editCandidate = function(id){ const c = (window.candidates||[]).find(x=>x.id===id); if(!c) return alert('Not found'); const name = prompt('Full name & ID', c.name); if(!name) return; const group = prompt('Subsection', c.group); c.name = name; c.group = group; saveCandidates(window.candidates); renderAdminUI(); };
  window.deleteCandidate = function(id){ if(!confirm('Remove candidate?')) return; window.candidates = (window.candidates||[]).filter(c=>c.id!==id); // remove from ballots
    window.ballots = (window.ballots||[]).map(b=>({ b1: b.b1.filter(x=>x!==id), b2: b.b2.filter(x=>x!==id) })).filter(b=> (b.b1 && b.b1.length) || (b.b2 && b.b2.length)); saveCandidates(window.candidates); saveBallots(window.ballots); renderAdminUI(); };

  // voting flow (quick modalless version)
  window.requestVoteConfirmation = function(){
    if(isVotingClosed()) return alert('Voting is closed by admin.');
    if((window.ballots||[]).length >= MAX_VOTES) return alert(`Capacity of ${MAX_VOTES} votes reached.`);
    const pick = (formId)=>{ const picks=[]; document.querySelectorAll(`.${formId}-select`).forEach(s=>{ if(s.value) picks.push(s.value); }); return picks; };
    const b1 = pick('ballotFormB1'); const b2 = pick('ballotFormB2');
    if(new Set(b1).size !== b1.length) return alert('B1: duplicate ranks');
    if(new Set(b2).size !== b2.length) return alert('B2: duplicate ranks');
    if(!b1.length && !b2.length) return alert('Make at least one selection');
    if(!confirm('Confirm and cast ballot?')) return;
    window.ballots = window.ballots||[]; window.ballots.push({ b1, b2 }); saveBallots(window.ballots); renderAdminUI(); alert('Ballot cast');
  };

  window.toggleVotingClosed = function(){
    const closed = isVotingClosed();
    if (!closed) {
      if (!confirm('End votes early now? Voters will not be able to submit new ballots.')) return;
      setVotingClosed(true);
    } else {
      if (!confirm('Reopen voting? Ballot submission will be enabled again.')) return;
      setVotingClosed(false);
    }
    renderAdminUI();
  };

  window.dismissWinnersPopup = function(){
    const popup = document.getElementById('winnersPopup');
    if (!popup) return;
    popup.classList.add('hidden');
    popup.classList.remove('flex');
  };

  // expose public init functions
  window.spectatorInit = spectatorInit;
  window.adminInit = adminInit;

})();
