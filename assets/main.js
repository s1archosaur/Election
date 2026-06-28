/* Shared election logic for admin + spectator + rounds breakdown + audit log */
(function(){
  const STORAGE_CANDS = 'rcv_parallel_cands';
  const STORAGE_BALLOTS = 'rcv_parallel_ballots';
  const STORAGE_VOTING_CLOSED = 'rcv_parallel_voting_closed';
  const STORAGE_LAST_UPDATE = 'rcv_parallel_last_update';
  const SYNC_CHANNEL = 'rcv_parallel_sync_channel';
  const MAX_VOTES = 58;
  const bc = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel(SYNC_CHANNEL) : null;

  const PALETTE_B1 = ['#3b82f6', '#ec4899', '#f97316', '#14b8a6', '#8b5cf6'];
  const PALETTE_B2 = ['#ef4444', '#06b6d4', '#eab308', '#6366f1', '#10b981'];

  function driveToDirect(url){
    const raw = String(url || '');
    const m = raw.match(/(?:https:\/\/)?(?:drive\.google\.com\/)(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/)
      || raw.match(/(?:https:\/\/)?drive\.usercontent\.google\.com\/download\?id=([a-zA-Z0-9_-]+)/)
      || raw.match(/(?:https:\/\/)?drive\.google\.com\/uc\?[^\s]*id=([a-zA-Z0-9_-]+)/);
    return (m && m[1]) ? `https://drive.usercontent.google.com/download?id=${m[1]}&export=view` : raw;
  }

  function imageFallback(name){ return `https://placehold.co/150x150/1e293b/e2e8f0?text=${encodeURIComponent(String(name || 'CR').substring(0,2).toUpperCase())}`; }
  function imgAttrs(name, backupUrl){ return `loading="lazy" referrerpolicy="no-referrer" data-backup="${backupUrl||''}" onerror="if(this.dataset.backup && !this.dataset.triedBackup){this.dataset.triedBackup='1';this.src=this.dataset.backup;return;}this.onerror=null;this.src='${imageFallback(name)}'"`; }
  
  function localImageForName(name){
    const n = String(name || '').toLowerCase();
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
          const fallbackKnown = knownImageForName(c.name);
          const preferredLocal = localImageForName(c.name);
          const normalizedImage = driveToDirect(c.image || '');
          if (preferredLocal) return { ...c, image: preferredLocal };
          if (String(c.image || '').includes('placehold.co') && fallbackKnown) return { ...c, image: fallbackKnown };
          return { ...c, image: normalizedImage || c.image };
        });
      }
      return JSON.parse(JSON.stringify(defaultCandidates));
    } catch(e){ return JSON.parse(JSON.stringify(defaultCandidates)); }
  }

  function notifyDataUpdated(){ localStorage.setItem(STORAGE_LAST_UPDATE, String(Date.now())); if (bc) bc.postMessage({ type: 'data-updated' }); }
  function saveCandidates(c){ localStorage.setItem(STORAGE_CANDS, JSON.stringify(c)); notifyDataUpdated(); }
  function loadBallots(){ try{ return JSON.parse(localStorage.getItem(STORAGE_BALLOTS)) || []; }catch(e){return []} }
  function saveBallots(b){ localStorage.setItem(STORAGE_BALLOTS, JSON.stringify(b)); notifyDataUpdated(); }
  function isVotingClosed(){ return localStorage.getItem(STORAGE_VOTING_CLOSED) === '1'; }
  function setVotingClosed(closed){ localStorage.setItem(STORAGE_VOTING_CLOSED, closed ? '1' : '0'); notifyDataUpdated(); }

  function getCandidateColorMap(candidatesList, group) {
    const groupCands = candidatesList.filter(c => c.group === group).map(c => c.id).sort();
    const map = {}; const pool = group === 'B1' ? PALETTE_B1 : PALETTE_B2;
    groupCands.forEach((id, index) => { map[id] = pool[index % pool.length]; });
    return map;
  }

  // Adjusted to track deeper preference layers dynamically
  function calculatePreferenceBreakdown(group, candidates, ballots) {
    const allIds = candidates.filter(c => c.group === group).map(c => c.id);
    const breakdown = {}; 
    allIds.forEach(id => { breakdown[id] = { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 }; });
    
    ballots.forEach(b => {
      const groupBallot = group === 'B1' ? b.b1 : b.b2;
      if (groupBallot && groupBallot.length > 0) {
        groupBallot.forEach((id, idx) => {
          if (breakdown[id] && idx < 5) breakdown[id]['p' + (idx + 1)]++;
        });
      }
    });
    return breakdown;
  }

  function runRCVForGroup(group, candidates, ballots){
    const allIds = candidates.filter(c=>c.group===group).map(c=>c.id);
    if(!allIds.length) return { rounds: [], winner: null, eliminationLog: [] };
    
    const currentBallots = ballots.map(b => [...(group==='B1'? b.b1 : b.b2)]).filter(b=>b && b.length);
    let active = [...allIds];
    const rounds = [];
    const eliminationLog = [];

    // Pre-calculate full breakdown for advanced intuitive tie-breaking
    const fullBreakdown = calculatePreferenceBreakdown(group, candidates, ballots);

    while(true){
      const counts = {};
      allIds.forEach(id => { counts[id] = active.includes(id) ? 0 : null; });
      let activeBallotCount = 0;
      
      currentBallots.forEach(ballot=>{
        const top = ballot.find(id=>active.includes(id));
        if(top){ counts[top]++; activeBallotCount++; }
      });
      
      rounds.push({ counts: {...counts}, activeVoters: activeBallotCount });
      const majority = active.find(id => activeBallotCount > 0 && counts[id] > activeBallotCount / 2);
      if (majority) return { rounds, winner: majority, eliminationLog };
      
      if(active.length<=1) break;
      
      const sorted = active.map(id=>({id, votes: counts[id]})).sort((a,b) => {
        if (a.votes !== b.votes) return a.votes - b.votes;
        return a.id.localeCompare(b.id);
      });
      
      const lowestVotes = sorted[0].votes;
      const tiedLowestIds = sorted.filter(x => x.votes === lowestVotes).map(x => x.id);
      
      let elim = tiedLowestIds[0];
      let tieBreakReason = '';
      
      if (tiedLowestIds.length > 1) {
        let contenders = [...tiedLowestIds];
        let resolved = false;

        // 1. Strict IRV Tie-Breaker: Previous Round Totals
        for (let r = rounds.length - 2; r >= 0 && contenders.length > 1; r--) {
          const pastCounts = rounds[r].counts;
          const minVotes = Math.min(...contenders.map(id => pastCounts[id] || 0));
          const narrowed = contenders.filter(id => (pastCounts[id] || 0) === minVotes);
          if (narrowed.length < contenders.length) contenders = narrowed;
          
          if (contenders.length === 1) {
            elim = contenders[0];
            tieBreakReason = `(Tie broken by Round ${r + 1} standing)`;
            resolved = true;
            break;
          }
        }

        // 2. NEW: Intuitive Fallback (Round 1 Ties): Overall Secondary Preferences
        if (!resolved) {
          for (let depth = 1; depth < allIds.length && contenders.length > 1; depth++) {
            const prop = 'p' + (depth + 1);
            const minVotes = Math.min(...contenders.map(id => fullBreakdown[id][prop] || 0));
            const narrowed = contenders.filter(id => (fullBreakdown[id][prop] || 0) === minVotes);
            
            if (narrowed.length < contenders.length) contenders = narrowed;
            
            if (contenders.length === 1) {
              elim = contenders[0];
              const suffix = (depth+1) === 2 ? 'nd' : (depth+1) === 3 ? 'rd' : 'th';
              tieBreakReason = `(Tie broken by ${depth+1}${suffix} preference tally)`;
              resolved = true;
              break;
            }
          }
        }

        // 3. Absolute Deadlock: Deterministic System Lot
        if (!resolved) {
          const seed = ballots.length + rounds.length;
          elim = contenders[seed % contenders.length];
          tieBreakReason = `(Absolute tie broken by deterministic system lot)`;
        }
      }

      eliminationLog.push({ eliminatedId: elim, voteCount: lowestVotes, tied: tiedLowestIds.length > 1, tieBreakReason });
      active = active.filter(x=>x!==elim);
    }
    return { rounds, winner: active[0], eliminationLog };
  }

  const chartStore = {};

  function renderBarChart(group, rcvData, candidates, canvasId) {
    const rounds = rcvData.rounds || []; if(!rounds.length) return;
    const r1 = rounds[0].counts;
    const sortedIds = Object.keys(r1).sort((a,b)=>r1[b]-r1[a]);
    const colorMap = getCandidateColorMap(candidates, group);
    const cleanLabel = (id) => (candidates.find(c=>c.id===id)||{name:id}).name.replace(/\s*\([^)]*\)\s*$/, '').split(/\s+/).slice(0, 2).join(' ');

    if(chartStore[canvasId]) chartStore[canvasId].destroy();
    Chart.defaults.color = '#94a3b8'; Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)'; Chart.defaults.font.family = "'Inter', sans-serif";
    chartStore[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: { labels: sortedIds.map(id => cleanLabel(id)), datasets: [{ data: sortedIds.map(id => r1[id]), backgroundColor: sortedIds.map(id => colorMap[id]), borderRadius: 6 }] },
      options: { plugins: { legend: { display: false } }, maintainAspectRatio: false, scales: { x: { grid: { display: false }, ticks: { font: { size: 11, weight: '700' }, color: '#cbd5e1' } }, y: { beginAtZero: true, ticks: { font: { size: 10 }, stepSize: 1 } } } }
    });
  }

  function renderPreferenceTable(group, candidates, ballots, containerId) {
    const container = document.getElementById(containerId); if (!container) return;
    const breakdown = calculatePreferenceBreakdown(group, candidates, ballots);
    const cands = candidates.filter(c => c.group === group);
    const colorMap = getCandidateColorMap(candidates, group);
    cands.sort((a,b) => { if (breakdown[b.id].p1 !== breakdown[a.id].p1) return breakdown[b.id].p1 - breakdown[a.id].p1; if (breakdown[b.id].p2 !== breakdown[a.id].p2) return breakdown[b.id].p2 - breakdown[a.id].p2; return breakdown[b.id].p3 - breakdown[a.id].p3; });
    const maxCols = group === 'B1' ? 2 : 3;
    let html = `<table class="w-full text-left text-[11px] lg:text-xs text-slate-300 border-collapse"><thead><tr class="border-b border-slate-700 text-slate-400"><th class="pb-1.5 font-semibold">Candidate</th><th class="pb-1.5 text-center font-bold text-white">1st</th><th class="pb-1.5 text-center font-semibold">2nd</th>${maxCols === 3 ? `<th class="pb-1.5 text-center font-semibold">3rd</th>` : ''}</tr></thead><tbody class="divide-y divide-slate-700/50">`;
    cands.forEach(c => {
      const cleanName = c.name.replace(/\s*\([^)]*\)\s*$/, '').split(/\s+/).slice(0, 2).join(' ');
      const b = breakdown[c.id];
      html += `<tr class="hover:bg-slate-800/30 transition-colors"><td class="py-2.5 font-medium text-slate-200 pr-2 flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background-color: ${colorMap[c.id]}"></span>${cleanName}</td><td class="py-2.5 text-center font-bold text-white">${b.p1}</td><td class="py-2.5 text-center">${b.p2}</td>${maxCols === 3 ? `<td class="py-2.5 text-center">${b.p3}</td>` : ''}</tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
  }

  function renderMarginTracker(group, rcvData, candidates, trackerId){
    const rounds = rcvData.rounds || []; if(!rounds.length) return;
    const colorMap = getCandidateColorMap(candidates, group);
    const cleanLabel = (id) => (candidates.find(c=>c.id===id)||{name:id}).name.replace(/\s*\([^)]*\)\s*$/, '').split(/\s+/).slice(0, 2).join(' ');
    const trackerContainer = document.getElementById(trackerId); if(!trackerContainer) return;
    trackerContainer.innerHTML = '';
    
    const firstRound = rounds[0];
    const secondRound = rounds.length > 1 ? rounds[1] : null;
    const eliminatedId = rcvData.eliminationLog.length > 0 ? rcvData.eliminationLog[0].eliminatedId : null;

    const firstPrefCounts = firstRound.counts;
    const totalValidVotes = firstRound.activeVoters;
    const threshold = totalValidVotes > 0 ? Math.floor(totalValidVotes / 2) + 1 : 0;
    
    const activeSorted = Object.keys(firstPrefCounts).filter(id => firstPrefCounts[id] !== null).sort((a,b) => firstPrefCounts[b] - firstPrefCounts[a]);
    
    activeSorted.forEach(id => {
      const votes = firstPrefCounts[id];
      const pct = threshold > 0 ? Math.min(100, Math.round((votes / threshold) * 100)) : 0;
      
      let projectedGainText = '';
      if (secondRound && id !== eliminatedId && secondRound.counts[id] !== null) {
          const gain = secondRound.counts[id] - votes;
          if (gain > 0) projectedGainText = `<span class="text-emerald-400 text-[10px] ml-1.5 font-black">(+${gain})</span>`;
      } else if (id === eliminatedId) {
          projectedGainText = `<span class="text-rose-500 text-[10px] ml-1.5 font-black opacity-80" title="Projected Elimination">(-${votes})</span>`;
      }

      trackerContainer.innerHTML += `
        <div class="space-y-1">
          <div class="flex justify-between text-[11px]">
            <span class="font-medium text-slate-200">${cleanLabel(id)}</span>
            <span class="font-bold text-slate-400"><b class="text-white">${votes}</b>${projectedGainText} <span class="mx-1">/</span> ${threshold}</span>
          </div>
          <div class="w-full bg-slate-950 rounded-full h-3.5 p-[2px] border border-slate-800">
            <div class="h-full rounded-full transition-all duration-500 relative" style="width: ${pct}%; background-color: ${colorMap[id]}"></div>
          </div>
        </div>`;
    });
  }

  // --- SPECTATOR (DASHBOARD) LOGIC ---
  function spectatorInit(){
    renderSpectator();
    window.addEventListener('storage', (ev) => {
      if ([STORAGE_CANDS, STORAGE_BALLOTS, STORAGE_VOTING_CLOSED].includes(ev.key)) renderSpectator();
    });
    if (bc) bc.onmessage = () => renderSpectator();
    setInterval(renderSpectator, 4000);
  }

  function renderSpectator(){
    const candidates = loadCandidates();
    const ballots = loadBallots();
    const votingClosed = isVotingClosed();
    const total = ballots.length;
    
    document.getElementById('totalVoters').innerText = `${total} / ${MAX_VOTES}`;
    const statusEl = document.getElementById('voteStatusSpectator');
    if (statusEl) {
      statusEl.textContent = votingClosed ? 'Voting Closed' : 'Voting Open';
      statusEl.className = votingClosed ? 'text-[11px] px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold uppercase' : 'text-[11px] px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold uppercase';
    }
    
    document.getElementById('insightTurnout').textContent = `${Math.round((total / MAX_VOTES) * 100)}%`;
    document.getElementById('insightStatus').textContent = votingClosed ? 'Voting ended. Results locked.' : 'Voting in progress';

    const b1 = runRCVForGroup('B1', candidates, ballots);
    const b2 = runRCVForGroup('B2', candidates, ballots);

    const proceedOverlay = document.getElementById('proceedOverlay');
    if (proceedOverlay) {
      if (votingClosed) proceedOverlay.classList.replace('hidden', 'flex');
      else proceedOverlay.classList.replace('flex', 'hidden');
    }

    renderBarChart('B1', b1, candidates, 'chartB1R1');
    renderBarChart('B2', b2, candidates, 'chartB2R1');
    renderPreferenceTable('B1', candidates, ballots, 'b1PrefTable');
    renderPreferenceTable('B2', candidates, ballots, 'b2PrefTable');
    renderMarginTracker('B1', b1, candidates, 'b1MarginTracker');
    renderMarginTracker('B2', b2, candidates, 'b2MarginTracker');
  }

  // --- AUTOMATED ROUNDS EXAMINER VIEW ---
  function roundsInit(){ renderRoundsBreakdown(); }

  function renderRoundsBreakdown(){
    const candidates = loadCandidates();
    const ballots = loadBallots();
    const b1 = runRCVForGroup('B1', candidates, ballots);
    const b2 = runRCVForGroup('B2', candidates, ballots);
    const votingClosed = isVotingClosed();
    
    const maxRounds = Math.max(b1.rounds.length, b2.rounds.length);
    const delayPerRound = 1.8; 
    
    const renderChain = (group, rcv, containerId) => {
      const container = document.getElementById(containerId);
      if(!container) return;
      container.innerHTML = '';

      if(!rcv.rounds.length){ container.innerHTML = '<p class="text-xs text-slate-500 italic mt-4 text-center">No ballots processed yet.</p>'; return; }

      const colorMap = getCandidateColorMap(candidates, group);
      const cleanLabel = (id) => (candidates.find(c=>c.id===id)||{name:id}).name.replace(/\s*\([^)]*\)\s*$/, '');

      rcv.rounds.forEach((round, index) => {
        const isLastRound = (index === rcv.rounds.length - 1);
        const roundHeaderAddition = `Round ${index + 1}`;
        const roundElim = rcv.eliminationLog[index];
        const prevElim = index > 0 ? rcv.eliminationLog[index - 1] : null;

        let summaryText = "";
        if (index === 0) {
          summaryText = isLastRound ? "Initial Tally: Majority secured immediately." : "Initial Tally: No candidate reached 50%.";
        } else {
          summaryText = `${cleanLabel(prevElim.eliminatedId)}'s votes transferred.`;
        }

        let barsHTML = '';
        Object.keys(round.counts).forEach(id => {
          const v = round.counts[id];
          if(v === null) return; 
          const sharePct = round.activeVoters > 0 ? Math.round((v / round.activeVoters) * 100) : 0;
          const isTargetEliminated = roundElim && roundElim.eliminatedId === id;

          barsHTML += `
            <div class="space-y-0.5">
              <div class="flex justify-between text-[11px] text-slate-300">
                <span class="${isTargetEliminated ? 'line-through text-rose-400 font-semibold' : ''}">${cleanLabel(id)}</span>
                <span>${v} votes (${sharePct}%)</span>
              </div>
              <div class="w-full bg-slate-950 h-2 rounded flex">
                <div class="h-full rounded transition-all duration-1000" style="width: ${sharePct}%; background-color: ${isTargetEliminated ? '#ef4444' : colorMap[id]}"></div>
              </div>
            </div>`;
        });

        let resolutionCard = '';
        if(isLastRound && rcv.winner){
           if(votingClosed) {
             resolutionCard = `<div class="mt-3 pt-2 border-t border-emerald-500/20 flex items-center gap-2 text-emerald-400 text-xs font-bold"><span>🏆 Official Winner Elected: ${cleanLabel(rcv.winner)}</span></div>`;
           } else {
             resolutionCard = `<div class="mt-3 pt-2 border-t border-cyan-500/20 flex items-center gap-2 text-cyan-400 text-[11px] font-bold"><span>⏱️ Projected Winner (If polls closed now): ${cleanLabel(rcv.winner)}</span></div>`;
           }
        } else if (roundElim) {
          const tieText = roundElim.tied ? `<span class="block text-rose-500/80 text-[9px] mt-0.5">${roundElim.tieBreakReason}</span>` : '';
          resolutionCard = `
            <div class="mt-3 pt-2 border-t border-rose-500/20 text-rose-400 text-[11px] font-medium flex items-center justify-between">
              <div>
                <span>✕ Action: Lowest eliminated</span>
                ${tieText}
              </div>
              <span class="bg-rose-950/50 border border-rose-500/30 px-1.5 py-0.5 rounded font-bold">${cleanLabel(roundElim.eliminatedId)}</span>
            </div>`;
        }

        const animDelay = index * delayPerRound;
        container.innerHTML += `
          <div class="animate-round bg-slate-800/40 border border-slate-800 p-3 rounded-xl space-y-3 shadow-lg" style="animation-delay: ${animDelay}s;">
            <div class="border-b border-slate-700/50 pb-2 mb-2">
              <h3 class="text-xs font-bold tracking-wider text-white bg-slate-700 inline-block px-2 py-0.5 rounded mr-2">${roundHeaderAddition}</h3>
              <span class="text-[11px] text-slate-400">${summaryText}</span>
            </div>
            <div class="space-y-2">${barsHTML}</div>
            ${resolutionCard}
          </div>`;
      });
    };

    renderChain('B1', b1, 'roundsContainerB1');
    renderChain('B2', b2, 'roundsContainerB2');

    const namesPopup = document.getElementById('winnerNamesPopup');
    if(namesPopup){
      namesPopup.innerHTML='';
      [b1.winner, b2.winner].forEach(id=>{
        if(!id) return;
        const c = candidates.find(x=>x.id===id);
        if(!c) return;
        const backup = knownImageForName(c.name);
        
        namesPopup.innerHTML += `
          <div class="flex flex-col items-center transform transition duration-700 hover:scale-105">
            <div class="relative w-48 h-48 lg:w-64 lg:h-64 mb-8">
              <img src="${driveToDirect(c.image)}" ${imgAttrs(c.name, backup)} class="relative w-full h-full rounded-full object-cover border-[6px] border-slate-800 shadow-2xl"/>
              <div class="absolute -bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-800 border border-cyan-500/50 text-cyan-300 px-6 py-1.5 rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                ${c.group} Representative
              </div>
            </div>
            <div class="font-black text-3xl lg:text-5xl leading-tight text-white text-center drop-shadow-lg">${c.name.split(' ')[0]}</div>
            <div class="text-lg lg:text-xl font-medium text-slate-300 mt-2 text-center tracking-wide">${c.name.split(' ').slice(1).join(' ')}</div>
          </div>`;
      });
    }

    const totalAnimationTime = (maxRounds * delayPerRound) + 0.5;
    const btn = document.getElementById('revealWinnersContainer');
    if(btn) {
      btn.style.animationDelay = `${totalAnimationTime}s`;
      btn.classList.remove('hidden');
      btn.classList.add('animate-reveal-btn', 'flex');
    }
  }

  window.showSleekWinners = function() {
    const popup = document.getElementById('winnersPopup');
    if(popup) { popup.classList.remove('hidden'); popup.classList.add('flex'); setTimeout(() => popup.classList.remove('opacity-0'), 50); }
  };
  window.dismissWinnersPopup = function(){
    const popup = document.getElementById('winnersPopup'); if (!popup) return;
    popup.classList.add('opacity-0'); setTimeout(() => { popup.classList.remove('flex'); popup.classList.add('hidden'); }, 700);
  };

  // --- AUDIT LOG LOGIC ---
  function auditInit() {
    renderAudit();
    window.addEventListener('storage', (ev) => {
      if ([STORAGE_BALLOTS, STORAGE_CANDS].includes(ev.key)) renderAudit();
    });
    if (bc) bc.onmessage = () => renderAudit();
  }

  function renderAudit() {
    const ballots = loadBallots();
    const candidates = loadCandidates();
    
    document.getElementById('auditTotal').innerText = ballots.length;
    
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const getNames = (ids) => {
      if (!ids || ids.length === 0) return '<span class="text-slate-600 italic">No Selection</span>';
      return ids.map((id, index) => {
        const c = candidates.find(cand => cand.id === id);
        const name = c ? c.name.replace(/\s*\([^)]*\)\s*$/, '').split(/\s+/).slice(0, 2).join(' ') : 'Unknown';
        return `<span class="text-slate-300 text-[10px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded whitespace-nowrap"><span class="text-slate-500">${index + 1}.</span> ${name}</span>`;
      }).join('<span class="text-slate-600 mx-1 text-[10px]">➔</span>');
    };

    if (ballots.length === 0) {
      tbody.innerHTML = '<div class="text-center text-slate-500 text-sm py-10 italic">No ballots have been cast yet.</div>';
      return;
    }

    ballots.forEach((b, i) => {
      const b1Html = getNames(b.b1);
      const b2Html = getNames(b.b2);
      
      tbody.innerHTML += `
        <div class="grid grid-cols-12 gap-4 px-6 py-3 border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors items-center">
          <div class="col-span-1 text-slate-400 font-mono text-xs">#${String(i + 1).padStart(3, '0')}</div>
          <div class="col-span-5 flex flex-wrap gap-1">${b1Html}</div>
          <div class="col-span-6 flex flex-wrap gap-1">${b2Html}</div>
        </div>`;
    });
  }

  // --- ADMIN PANEL CONTROLS ---
  function adminInit(){
    window.candidates = loadCandidates(); window.ballots = loadBallots(); renderAdminUI();
    window.addEventListener('storage', (ev) => { if ([STORAGE_CANDS, STORAGE_BALLOTS, STORAGE_VOTING_CLOSED].includes(ev.key)) { window.candidates = loadCandidates(); window.ballots = loadBallots(); renderAdminUI(); } });
    if (bc) bc.onmessage = () => { window.candidates = loadCandidates(); window.ballots = loadBallots(); renderAdminUI(); };
  }

  function renderAdminUI(){
    const votingClosed = isVotingClosed();
    document.getElementById('voteCountHeader').innerText = `${ballots.length} / ${MAX_VOTES}`;
    const status = document.getElementById('voteStatusAdmin');
    const toggleBtn = document.getElementById('toggleVotingBtn');
    const submitBtn = document.getElementById('submitVoteBtn');
    
    if (status) { status.textContent = votingClosed ? 'Voting Closed' : 'Voting Open'; status.className = votingClosed ? 'text-[11px] px-2 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-[11px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'; }
    if (toggleBtn) { toggleBtn.textContent = votingClosed ? 'Reopen Voting' : 'End Votes Early'; toggleBtn.className = votingClosed ? 'px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-lg' : 'px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-orange-600 text-white hover:bg-orange-500 transition-colors shadow-lg'; }
    if (submitBtn) { submitBtn.disabled = votingClosed; submitBtn.className = votingClosed ? 'mt-8 w-full bg-slate-700 text-slate-400 px-4 py-4 rounded-xl cursor-not-allowed border border-slate-600/50' : 'mt-8 w-full bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white font-bold tracking-wider uppercase px-4 py-4 rounded-xl shadow-lg transition-transform transform hover:scale-[1.02]'; submitBtn.textContent = votingClosed ? 'Voting Closed' : 'Review & Submit Ballot'; }
    
    renderBallotForms(); renderCandidateList();
  }

  function renderBallotForms(){
    const render = (list, formId)=>{
      const form = document.getElementById(formId); if(!form) return; form.innerHTML = '';
      if(!list.length){ form.innerHTML = '<div class="text-xs text-slate-400">No candidates</div>'; return; }
      const opts = '<option value="">-- Null --</option>' + list.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
      list.forEach((_,i)=>{ form.innerHTML += `<div class="flex items-center gap-3"><div class="w-8 h-8 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-xs text-slate-400">${i+1}</div><select class="${formId}-select flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white">${opts}</select></div>` });
    };
    render(candidatesFor('B1'), 'ballotFormB1'); render(candidatesFor('B2'), 'ballotFormB2');
  }
  function candidatesFor(group){ return loadCandidates().filter(c=>c.group===group); }

  function renderCandidateList(){
    const list = document.getElementById('candidateList'); if(!list) return; list.innerHTML = '';
    loadCandidates().forEach(c=>{ const backup = knownImageForName(c.name); list.innerHTML += `<div class="flex items-center gap-3 p-2 border-b border-slate-800"><img src="${driveToDirect(c.image)}" ${imgAttrs(c.name, backup)} class="w-10 h-10 rounded-lg object-cover border border-slate-700"/><div class="flex-1 min-w-0"><div class="font-medium truncate text-sm">${c.name}</div><div class="text-[10px] uppercase text-slate-400">${c.group} Candidate</div></div><div class="flex gap-1.5"><button onclick="editCandidate('${c.id}')" class="px-2 py-1 text-xs bg-slate-800 text-slate-200 rounded border border-slate-700">Edit</button><button onclick="deleteCandidate('${c.id}')" class="px-2 py-1 text-xs bg-red-950/40 text-red-400 rounded border border-red-900/50">Del</button></div></div>` });
  }

  window.openAddCandidateModal = function(){ const name = prompt('Full name & ID:'); if(!name) return; const group = prompt('Subsection (B1 or B2):','B1'); if(!group) return; window.candidates.push({ id: 'c'+Date.now(), name, group: group.toUpperCase(), image: driveToDirect(prompt('Image URL:','')) || localImageForName(name) || knownImageForName(name) || `https://placehold.co/150x150/1e293b/38bdf8?text=${encodeURIComponent(name.substring(0,2))}` }); saveCandidates(window.candidates); renderAdminUI(); };
  window.editCandidate = function(id){ const c = window.candidates.find(x=>x.id===id); if(!c) return; const name = prompt('Name:', c.name); if(!name) return; c.name = name; c.group = prompt('Group:', c.group).toUpperCase(); saveCandidates(window.candidates); renderAdminUI(); };
  window.deleteCandidate = function(id){ if(!confirm('Remove?')) return; window.candidates = window.candidates.filter(c=>c.id!==id); window.ballots = window.ballots.map(b=>({ b1: b.b1.filter(x=>x!==id), b2: b.b2.filter(x=>x!==id) })).filter(b=> b.b1.length || b.b2.length); saveCandidates(window.candidates); saveBallots(window.ballots); renderAdminUI(); };
  
  window.resetElection = function(){
    if(!confirm("⚠️ DANGER: Are you sure you want to completely reset the election? This will delete all cast ballots and restore the default candidate lists. This action CANNOT be undone.")) return;
    window.candidates = JSON.parse(JSON.stringify(defaultCandidates));
    window.ballots = [];
    saveCandidates(window.candidates);
    saveBallots(window.ballots);
    setVotingClosed(false);
    renderAdminUI();
    alert("Election has been successfully reset.");
  };

  window.requestVoteConfirmation = function(){
    if(isVotingClosed()) return alert('Voting closed.');
    if(window.ballots.length >= MAX_VOTES) return alert('Capacity reached.');
    const pick = (f)=>{ const p=[]; document.querySelectorAll(`.${f}-select`).forEach(s=>{ if(s.value) p.push(s.value); }); return p; };
    const b1 = pick('ballotFormB1'), b2 = pick('ballotFormB2');
    if(new Set(b1).size !== b1.length || new Set(b2).size !== b2.length) return alert('Duplicate ranks detected.');
    if(!b1.length && !b2.length) return alert('Select candidates.');
    if(!confirm('Cast ballot?')) return;
    window.ballots.push({ b1, b2 }); saveBallots(window.ballots);
    if(window.ballots.length >= MAX_VOTES) setVotingClosed(true);
    renderAdminUI();
  };
  
  window.toggleVotingClosed = function(){
    const closed = isVotingClosed();
    if (!closed) { if(confirm('End votes early?')) setVotingClosed(true); } 
    else { if(window.ballots.length >= MAX_VOTES) return alert('Cap reached.'); if(confirm('Reopen voting?')) setVotingClosed(false); }
    renderAdminUI();
  };

  window.spectatorInit = spectatorInit; window.adminInit = adminInit; window.roundsInit = roundsInit; window.auditInit = auditInit;
})();