(() => {
  const S = window.Season;
  const { $, esc, num, pct } = S;

  S.explainers({
    pickup: ['Best pickups', `
      <p>For every waiver claim and free-agent pickup: the points the player scored <strong>while in the new team's starting lineup</strong>, from the week he was added until that team dropped him again.</p>
      <p>Points on the bench don't count. A pickup only pays off if you actually start him.</p>
      <p class="method-note">Transactions come from Sleeper and are archived together with each finished week.</p>`],
  });
  $('#pickup-info').innerHTML = S.infoButton('pickup');

  const typeLabel = t => t.status !== 'complete' ? 'failed claim' : t.type === 'free_agent' ? 'free agent' : t.type;
  const when = ms => ms ? new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  function renderTiles(stats) {
    const tx = stats.transactions;
    const done = tx.feed.filter(t => t.status === 'complete');
    const claims = tx.feed.filter(t => t.type === 'waiver');
    const won = claims.filter(t => t.status === 'complete');
    const trades = done.filter(t => t.type === 'trade');
    const fa = done.filter(t => t.type === 'free_agent');
    const busiest = Object.entries(tx.perTeam).map(([id, v]) => ({ id: +id, moves: v.waiverWins + v.freeAgents + v.trades }))
      .sort((a, b) => b.moves - a.moves)[0];
    const deadline = stats.tradeDeadline;
    $('#wire-tiles').innerHTML = `
      <article class="s-tile"><div class="s-tile-label">Completed moves</div><div class="s-tile-value">${done.length}</div><div class="s-tile-detail">${won.length} waiver claims won · ${fa.length} free agents</div></article>
      <article class="s-tile"><div class="s-tile-label">Waiver success</div><div class="s-tile-value">${pct(claims.length ? won.length / claims.length : null, 0)}</div><div class="s-tile-detail">${claims.length - won.length} claims lost to a higher priority</div></article>
      <article class="s-tile"><div class="s-tile-label">Trades</div><div class="s-tile-value">${trades.length}</div><div class="s-tile-detail">${deadline ? `Trade deadline: week ${esc(deadline)}` : 'No trade deadline set'}${trades.length ? '' : ' · nobody has pulled the trigger'}</div></article>
      <article class="s-tile"><div class="s-tile-label">Busiest manager</div><div class="s-tile-value">${busiest ? busiest.moves : '—'}</div>${busiest ? S.teamCell(stats, busiest.id, { size: 24 }) : ''}<div class="s-tile-detail">completed moves</div></article>`;
  }

  function renderPickups(stats) {
    const list = stats.transactions.bestPickups;
    if (!list.length) {
      $('#best-pickups').innerHTML = '<p class="s-empty">No pickup has scored in a starting lineup yet.</p>';
      return;
    }
    S.bars($('#best-pickups'), list.map(p => ({
      label: `${p.name} (${p.position || '?'})`,
      sub: `${S.team(stats, p.rosterId).short} · week ${p.week} · ${p.starts} start${p.starts === 1 ? '' : 's'}`,
      value: p.startedPoints,
      color: S.team(stats, p.rosterId).color,
      tip: [[S.team(stats, p.rosterId).color, S.team(stats, p.rosterId).short, `${num(p.startedPoints)} pts`],
        ['', `${p.starts} starts, added week ${p.week}`, p.type === 'waiver' ? 'waiver' : 'free agent']],
    })), { format: v => `${num(v)} pts`, label: 'Points started by each pickup for its new team' });
  }

  function renderBattles(stats) {
    const list = stats.transactions.waiverBattles;
    $('#battles').innerHTML = list.length ? `<table class="s-table" style="min-width:460px"><thead><tr><th>Wk</th><th>Player</th><th>Won by</th><th>Also wanted</th></tr></thead><tbody>${
      list.map(b => `<tr><td class="s-rank">${b.week}</td><td class="s-strong">${esc(b.name)} <span class="muted">${esc(b.position || '')}</span></td>
        <td>${b.winner ? S.teamCell(stats, b.winner, { short: true, size: 22 }) : '<span class="muted">nobody</span>'}</td>
        <td class="muted" style="white-space:normal;min-width:140px">${(b.loserIds || []).map(id => esc(S.team(stats, id).short)).join(', ')}</td></tr>`).join('')}</tbody></table>`
      : '<p class="s-empty">No player has been claimed by two teams in the same week yet.</p>';
  }

  function renderPerTeam(stats) {
    const rows = Object.entries(stats.transactions.perTeam).map(([id, v]) => ({ id: +id, ...v }))
      .sort((a, b) => (b.waiverWins + b.freeAgents + b.trades) - (a.waiverWins + a.freeAgents + a.trades));
    $('#per-team').innerHTML = `<table class="s-table" style="min-width:460px"><thead><tr><th>Team</th><th class="num">Claims won</th><th class="num">Free agents</th><th class="num">Trades</th><th class="num">Pickup pts</th></tr></thead><tbody>${
      rows.map(r => `<tr><td>${S.teamCell(stats, r.id, { short: true, size: 22 })}</td>
        <td class="num">${r.waiverWins}<span class="muted"> / ${r.waiverClaims}</span></td><td class="num">${r.freeAgents}</td>
        <td class="num">${r.trades}</td><td class="num s-strong">${num(r.pickupPoints)}</td></tr>`).join('')}</tbody></table>`;
  }

  function moveLine(stats, t) {
    const parts = [];
    const byRoster = {};
    t.adds.forEach(a => (byRoster[a.rosterId] ??= { adds: [], drops: [] }).adds.push(a));
    t.drops.forEach(d => (byRoster[d.rosterId] ??= { adds: [], drops: [] }).drops.push(d));
    for (const [rid, moves] of Object.entries(byRoster)) {
      const pts = a => a.startedPoints ? ` <span class="muted">${num(a.startedPoints)} pts started</span>` : '';
      parts.push(`<span>${t.type === 'trade' ? `<strong>${esc(S.team(stats, +rid).short)}:</strong> ` : ''}${moves.adds.map(a => `<span class="s-add">+ ${esc(a.name)}</span> <span class="muted">${esc(a.position || '')}</span>${t.status === 'complete' ? pts(a) : ''}`).join(', ')}${moves.adds.length && moves.drops.length ? ' · ' : ''}${moves.drops.map(d => `<span class="s-drop">− ${esc(d.name)}</span> <span class="muted">${esc(d.position || '')}</span>`).join(', ')}</span>`);
    }
    (t.draftPicks || []).forEach(p => parts.push(`<span class="muted">pick: ${esc(p.season)} round ${esc(p.round)}</span>`));
    return parts.join('');
  }

  function renderFeed(stats) {
    const team = $('#f-team').value;
    const type = $('#f-type').value;
    const week = $('#f-week').value;
    const list = stats.transactions.feed.filter(t =>
      (!team || t.rosterIds.includes(+team)) &&
      (!week || t.week === +week) &&
      (!type || (type === 'failed' ? t.status !== 'complete' : t.type === type && t.status === 'complete')));
    $('#feed-count').textContent = `${list.length} of ${stats.transactions.feed.length}`;
    $('#feed').innerHTML = list.slice(0, 400).map(t => {
      const owner = t.type === 'trade' ? t.rosterIds.map(id => S.team(stats, id).short).join(' ⇄ ') : null;
      return `<li class="${t.status !== 'complete' ? 'is-failed' : ''}">
        <div class="s-feed-week">Week<b>${t.week}</b></div>
        <div class="s-feed-main">${owner ? `<strong>${esc(owner)}</strong>` : S.teamCell(stats, t.rosterIds[0], { size: 24 })}
          <div class="s-feed-moves">${moveLine(stats, t)}</div></div>
        <div class="s-feed-meta"><span class="s-type s-type--${t.status !== 'complete' ? 'failed' : esc(t.type)}">${esc(typeLabel(t))}</span><br>${esc(when(t.time))}</div>
      </li>`;
    }).join('') || '<li><span></span><span class="muted">Nothing matches these filters.</span></li>';
  }

  S.loadStats().then(stats => {
    $('#wire-eyebrow').textContent = `${stats.season} season · weeks 1–${stats.currentWeek}`;
    renderTiles(stats);
    renderPickups(stats);
    renderBattles(stats);
    renderPerTeam(stats);
    const teamSelect = $('#f-team');
    stats.table.forEach(r => teamSelect.append(new Option(S.team(stats, r.rosterId).team, r.rosterId)));
    const weekSelect = $('#f-week');
    [...new Set(stats.transactions.feed.map(t => t.week))].sort((a, b) => b - a).forEach(w => weekSelect.append(new Option(`Week ${w}`, w)));
    ['#f-team', '#f-type', '#f-week'].forEach(sel => $(sel).addEventListener('change', () => renderFeed(stats)));
    renderFeed(stats);
  }).catch(error => S.fail($('#wire-tiles'), error));
})();
