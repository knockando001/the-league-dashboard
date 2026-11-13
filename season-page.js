(() => {
  const S = window.Season;
  const { $, esc, num, pct, signed, oddsText } = S;

  S.explainers({
    true: ['Ranking True', `
      <p>Ranking True, as defined in The League Insider, adds up three ranks. <strong>Lowest total wins.</strong></p>
      <div class="formula">rank on all-play record + rank on Coach % + rank on points for</div>
      <ul>
        <li><strong>All-play record</strong>: every week each team is compared with all the others. Beat 5 of 7 scores and you go 5-2 that week. It strips out schedule luck.</li>
        <li><strong>Coach %</strong>: points scored divided by the best lineup you could have started from your own roster that week.</li>
        <li><strong>Points for</strong>: total points scored.</li>
      </ul>
      <p class="method-note">Tied values share the average of their ranks, for example 6.5.</p>`],
    luck: ['Luck counter', `
      <p>How many more (or fewer) wins a team has than its scores deserve.</p>
      <div class="formula">luck = real wins − expected wins<br>expected wins = all-play win % × games played</div>
      <p>Score the 2nd-highest total of the week and lose, and your luck drops. Win with the 7th-highest score, and it rises.</p>
      <p class="method-note">An all-play tie counts as half a win. The newsletter counts it as a loss, so a team with an all-play tie can differ by a few hundredths.</p>`],
    odds: ['Playoff odds', `
      <p>The rest of the regular season is played out 10,000 times using the real remaining schedule from Sleeper.</p>
      <ul>
        <li>Each team's weekly score is drawn at random around its season average, pulled slightly towards the league average (as if it had also scored 3 average weeks), with the league-wide spread of scores.</li>
        <li>Seeding: wins first, then points for, the Sleeper default.</li>
        <li>The week-by-week chart reruns the same simulation using only the results known after each round.</li>
      </ul>
      <p class="method-note">The simulation uses a fixed random seed, so the odds only change when results do.</p>`],
  });
  $('#true-info').innerHTML = S.infoButton('true');
  $('#luck-info').innerHTML = S.infoButton('luck');
  $('#odds-info').innerHTML = S.infoButton('odds');

  function tile(label, value, detail, stats, rosterId, gold = false) {
    return `<article class="s-tile${gold ? ' s-tile--gold' : ''}"><div class="s-tile-label">${esc(label)}</div>
      <div class="s-tile-value">${value}</div>${rosterId ? S.teamCell(stats, rosterId) : ''}
      <div class="s-tile-detail">${detail}</div></article>`;
  }

  function renderTiles(stats) {
    const t = stats.table;
    if (!t.length || !t[0].scores.length) {
      $('#season-tiles').innerHTML = '<div class="s-tile"><p class="muted">No finished weeks yet.</p></div>';
      return;
    }
    const maxBy = key => [...t].sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity))[0];
    const minBy = key => [...t].sort((a, b) => (a[key] ?? Infinity) - (b[key] ?? Infinity))[0];
    const leader = t[0];
    const trueTop = [...t].sort((a, b) => a.trueRank - b.trueRank)[0];
    const lucky = maxBy('luck');
    const unlucky = minBy('luck');
    const coach = maxBy('coach');
    const hot = maxBy('last3');
    const pf = maxBy('pointsFor');
    const high = stats.records.find(r => r.key === 'highScore');
    $('#season-tiles').innerHTML = [
      tile('Table leader', `${leader.wins}-${leader.losses}${leader.ties ? `-${leader.ties}` : ''}`, `${num(leader.pointsFor)} points for`, stats, leader.rosterId, true),
      tile('Ranking True #1', esc(trueTop.trueScore), `All-play ${trueTop.allPlay.wins}-${trueTop.allPlay.losses}`, stats, trueTop.rosterId),
      tile('Luckiest', signed(lucky.luck), `${lucky.wins} wins, scores deserve ${num(lucky.expectedWins)}`, stats, lucky.rosterId),
      tile('Unluckiest', signed(unlucky.luck), `${unlucky.wins} wins, scores deserve ${num(unlucky.expectedWins)}`, stats, unlucky.rosterId),
      tile('Most points', num(pf.pointsFor), `${num(pf.avgPoints)} per week`, stats, pf.rosterId),
      tile('Best coach', pct(coach.coach), 'of the best possible lineups', stats, coach.rosterId),
      tile('Hottest', num(hot.last3), 'average over the last 3 weeks', stats, hot.rosterId),
      high ? tile('Highest score', num(high.value), `Week ${high.week}, ${esc(high.detail)}`, stats, high.rosterId) : '',
    ].join('');
  }

  function renderTrueTable(stats) {
    const rows = stats.table.map(r => ({ ...r }));
    const cols = [
      ['trueRank', 'True', 'asc'], [null, 'Team'], ['rank', 'Table', 'asc'], ['wins', 'W-L'], ['pointsFor', 'PF'],
      ['pointsAgainst', 'PA'], ['allPlay.pct', 'All-play'], ['coach', 'Coach %'], ['luck', 'Luck'], ['last3', 'Last 3'],
      [null, 'Form'], [null, 'Scores'], ['trueScore', 'Score', 'asc'],
    ];
    const render = (list, key, dir) => {
      $('#true-table').innerHTML = `<table class="s-table"><thead><tr>${cols.map(([k, label, d]) =>
        `<th${k ? ` data-sort="${k}"${d ? ` data-dir="${d}"` : ''}` : ''} class="${['pointsFor', 'pointsAgainst', 'coach', 'luck', 'last3', 'trueScore', 'allPlay.pct'].includes(k) ? 'num' : ''}${key === k ? ' is-sorted' : ''}">${label}${key === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${
        list.map(r => `<tr class="${r.rank <= stats.playoffTeams ? 'is-playoff' : ''}">
          <td class="s-rank">${r.trueRank}</td>
          <td>${S.teamCell(stats, r.rosterId)}</td>
          <td class="s-rank">${r.rank}</td>
          <td class="s-strong">${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}</td>
          <td class="num">${num(r.pointsFor)}</td>
          <td class="num">${num(r.pointsAgainst)}</td>
          <td class="num">${r.allPlay.wins}-${r.allPlay.losses}${r.allPlay.ties ? `-${r.allPlay.ties}` : ''} <span class="muted">(${pct(r.allPlay.pct, 0)})</span></td>
          <td class="num">${pct(r.coach)}</td>
          <td class="num ${r.luck > 0 ? 's-up' : r.luck < 0 ? 's-down' : ''}">${signed(r.luck)}</td>
          <td class="num">${num(r.last3)}</td>
          <td>${S.formChips(r.form)}</td>
          <td>${S.sparkline(r.scores)}</td>
          <td class="num s-strong">${esc(r.trueScore)}</td></tr>`).join('')}</tbody></table>`;
    };
    rows.sort((a, b) => a.trueRank - b.trueRank);
    render(rows);
    S.sortable($('#true-table'), rows, render);
  }

  function renderOdds(stats) {
    const weeks = stats.odds.weeks || [];
    if (!weeks.length) {
      $('#odds-table').innerHTML = '<p class="s-empty">Odds appear after the first finished week.</p>';
      return;
    }
    const last = weeks.at(-1);
    const prev = weeks.length > 1 ? weeks.at(-2) : null;
    const now = stats.odds.byWeek[last];
    const before = prev ? stats.odds.byWeek[prev] : null;
    $('#odds-sims').textContent = `${S.int(stats.odds.simulations)} simulations after week ${last}`;
    const rows = stats.table.map(r => ({ ...r, odds: now[r.rosterId], before: before?.[r.rosterId] }))
      .sort((a, b) => b.odds.playoff - a.odds.playoff || b.odds.first - a.odds.first);
    const change = (a, b) => {
      if (b === undefined) return '';
      const d = (a - b) * 100;
      if (Math.abs(d) < 0.05) return '<span class="muted">±0.0</span>';
      return `<span class="${d > 0 ? 's-up' : 's-down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}</span>`;
    };
    $('#odds-table').innerHTML = `<table class="s-table" style="min-width:520px"><thead><tr><th>Team</th><th>Record</th><th class="num">Playoffs</th><th class="num">vs week ${prev ?? '—'}</th><th class="num">1st place</th><th class="num">Last place</th></tr></thead><tbody>${
      rows.map(r => `<tr><td>${S.teamCell(stats, r.rosterId, { short: true })}</td><td>${r.wins}-${r.losses}</td>
        <td class="num s-strong">${oddsText(r.odds.playoff)}<span class="s-meter"><i style="width:${(r.odds.playoff * 100).toFixed(1)}%"></i></span></td>
        <td class="num">${change(r.odds.playoff, r.before?.playoff)}</td>
        <td class="num">${oddsText(r.odds.first)}</td><td class="num">${oddsText(r.odds.last)}</td></tr>`).join('')}</tbody></table>`;

    const firsts = rows.filter(r => r.odds.first >= 0.001).sort((a, b) => b.odds.first - a.odds.first);
    $('#first-note').textContent = `after week ${last}`;
    S.bars($('#first-bars'), firsts.map(r => ({
      label: S.team(stats, r.rosterId).short, value: r.odds.first, color: '#f6c453',
      tip: [['#f6c453', 'first place', oddsText(r.odds.first)], ['', 'playoffs', oddsText(r.odds.playoff)]],
    })), { format: v => oddsText(v), label: 'Odds of finishing first' });

    const ids = stats.table.map(r => r.rosterId);
    const chart = S.lineChart($('#odds-chart'), {
      focus: ids[0],
      xs: weeks.map(w => `W${w}`),
      series: ids.map(id => ({ id, label: S.team(stats, id).short, color: S.team(stats, id).color,
        values: weeks.map(w => stats.odds.byWeek[w][id]?.playoff ?? null) })),
      yMin: 0, yMax: 1, yTicks: [0, 0.25, 0.5, 0.75, 1], yFormat: v => `${Math.round(v * 100)}%`,
      height: 300, ariaLabel: 'Playoff odds by week for every team',
    });
    S.teamPicker($('#odds-picker'), stats, ids, id => chart.setFocus(id), ids[0]);
  }

  function renderLuck(stats) {
    const rows = [...stats.table].sort((a, b) => b.luck - a.luck).map(r => ({
      label: S.team(stats, r.rosterId).short, value: r.luck,
      tip: [['', 'luck', signed(r.luck)], ['', 'real wins', String(r.wins)], ['', 'expected wins', num(r.expectedWins)],
        ['', 'all-play', `${r.allPlay.wins}-${r.allPlay.losses}`]],
    }));
    S.divergingBars($('#luck-chart'), rows, { label: 'Luck: real wins minus expected wins' });
  }

  function renderBump(stats) {
    const rb = stats.rankByWeek;
    if (!rb.weeks.length) return;
    const ids = stats.table.map(r => r.rosterId);
    const chart = S.lineChart($('#bump-chart'), {
      xs: rb.weeks.map(w => `W${w}`),
      series: ids.map(id => ({ id, label: S.team(stats, id).short, color: S.team(stats, id).color, values: rb.byTeam[id] || [] })),
      yMin: 1, yMax: ids.length, invert: true, yTicks: ids.map((_, i) => i + 1), yFormat: v => `#${v}`,
      endLabels: 'all', colorAll: true, height: 340, ariaLabel: 'Standings position after each week',
    });
    S.teamPicker($('#bump-picker'), stats, ids, id => chart.setFocus(id));
  }

  function renderHeatmap(stats) {
    const weeks = stats.weeks.filter(w => !w.playoffs);
    if (!weeks.length) return;
    const ids = stats.table.map(r => r.rosterId);
    const scores = {};
    const tops = {};
    weeks.forEach(w => {
      let top = null;
      w.matchups.forEach(m => m.teams.forEach(t => {
        scores[`${w.week}:${t.rosterId}`] = { points: t.points, live: w.live };
        if (!w.live && (top === null || t.points > scores[`${w.week}:${top}`].points)) top = t.rosterId;
      }));
      tops[w.week] = top;
    });
    const all = Object.values(scores).filter(s => !s.live).map(s => s.points);
    if (!all.length) return;
    const min = Math.min(...all);
    const max = Math.max(...all);
    const grid = $('#heatmap');
    grid.innerHTML = `<div class="s-heat" style="grid-template-columns:minmax(170px,1.6fr) repeat(${weeks.length},minmax(46px,1fr))">
      <div></div>${weeks.map(w => `<div class="s-heat-head">W${w.week}${w.live ? ' <span class="s-pill s-pill--live" style="margin-left:4px;padding:0 5px">live</span>' : ''}</div>`).join('')}
      ${ids.map(id => `<div class="s-heat-team">${S.teamCell(stats, id, { short: true, size: 24 })}</div>${weeks.map(w => {
        const s = scores[`${w.week}:${id}`];
        if (!s) return '<div class="s-heat-cell" style="background:#0c1828"></div>';
        const color = s.live ? '#14243a' : S.rampColor(s.points, min, max);
        return `<div class="s-heat-cell${tops[w.week] === id ? ' is-top' : ''}" style="background:${color};color:${s.live ? 'var(--muted)' : S.inkOn(color)}" data-week="${w.week}" data-id="${id}" tabindex="0">${Math.round(s.points)}</div>`;
      }).join('')}`).join('')}</div>
      <div class="s-heat-scale">${num(min, 0)} <span></span> ${num(max, 0)} points · live week in gray</div>`;
    grid.addEventListener('pointermove', event => {
      const cell = event.target.closest('.s-heat-cell[data-week]');
      if (!cell) return S.hideTip();
      const week = stats.weeks.find(w => w.week === +cell.dataset.week);
      const id = +cell.dataset.id;
      const m = week.matchups.find(x => x.teams.some(t => t.rosterId === id));
      const me = m.teams.find(t => t.rosterId === id);
      const opp = m.teams.find(t => t.rosterId !== id);
      const result = week.live ? 'live' : m.winner === id ? 'win' : m.winner === null ? 'tie' : 'loss';
      S.showTip(event, () => S.tipContent(`Week ${week.week} · ${result}`, [
        [S.team(stats, id).color, S.team(stats, id).short, num(me.points)],
        [S.team(stats, opp.rosterId).color, S.team(stats, opp.rosterId).short, num(opp.points)],
      ]));
    });
    grid.addEventListener('pointerleave', S.hideTip);
  }

  const RECORD_ICONS = { highScore: '🚀', lowScore: '🧊', bestLoss: '💔', worstWin: '🍀', blowout: '💥', closest: '😬', bench: '🪑',
    coach: '🧠', badCoach: '🤦', playerGame: '⭐', benchPlayer: '🛋️', winStreak: '🔥', lossStreak: '🥶' };

  function renderRecords(stats) {
    $('#records-scope').textContent = `${stats.season}, weeks 1–${stats.lastFinishedWeek}`;
    $('#season-records').innerHTML = stats.records.map(r => {
      const value = r.key.includes('Streak') ? `${r.value} <small>in a row</small>`
        : r.key.toLowerCase().includes('coach') ? `${num(r.value, 1)}%` : `${num(r.value)} <small>pts</small>`;
      return `<article class="s-card"><div class="s-card-top"><span class="s-card-icon">${RECORD_ICONS[r.key] || '📌'}</span>${esc(r.title)}</div>
        <div class="s-card-value">${value}</div>${S.teamCell(stats, r.rosterId, { size: 24 })}
        <div class="s-card-detail">${r.week ? `Week ${r.week}${r.detail ? ' · ' : ''}` : ''}${esc(r.detail === 'games' ? '' : r.detail)}</div></article>`;
    }).join('');
  }

  S.loadStats().then(stats => {
    $('#season-eyebrow').textContent = `${stats.season} season · after week ${stats.lastFinishedWeek}`;
    renderTiles(stats);
    renderTrueTable(stats);
    renderOdds(stats);
    renderLuck(stats);
    renderBump(stats);
    renderHeatmap(stats);
    renderRecords(stats);
  }).catch(error => S.fail($('#season-tiles'), error));
})();
