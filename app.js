const $=s=>document.querySelector(s);const fmt=n=>Number(n||0).toFixed(2);
for(const b of document.querySelectorAll('button[data-tab]'))b.onclick=()=>{document.querySelectorAll('main section').forEach(x=>x.hidden=true);$('#'+b.dataset.tab).hidden=false};
fetch('data/dashboard.json').then(r=>r.json()).then(d=>{
 $('#updated').textContent='Updated: '+new Date(d.generatedAt).toLocaleString();
 $('#standings').innerHTML='<div class="card"><table><thead><tr><th>#</th><th>Team</th><th>W-L-T</th><th>PF</th></tr></thead><tbody>'+d.standings.map((x,i)=>`<tr><td>${i+1}</td><td>${x.team}</td><td>${x.wins}-${x.losses}-${x.ties}</td><td>${fmt(x.pointsFor)}</td></tr>`).join('')+'</tbody></table></div>';
 $('#records').innerHTML='<div class="card"><h2>League records</h2>'+d.records.map(x=>`<p><b>${x.label}</b>: ${x.value} <span class="muted">${x.detail||''}</span></p>`).join('')+'</div>';
 $('#h2h').innerHTML='<div class="card"><h2>Historical H2H</h2><table><thead><tr><th>Team A</th><th>Team B</th><th>Record</th><th>Points</th></tr></thead><tbody>'+d.h2h.map(x=>`<tr><td>${x.teamA}</td><td>${x.teamB}</td><td>${x.winsA}-${x.winsB}-${x.ties}</td><td>${fmt(x.pointsA)}-${fmt(x.pointsB)}</td></tr>`).join('')+'</tbody></table></div>';
}).catch(e=>document.querySelector('main').innerHTML='<p>Data not available yet. Run the fetch script first.</p>');