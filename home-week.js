/* Home page: this week's matchups and a few season highlights, linking to
   the Week Centre, Season and Waiver Wire pages. */
(() => {
  const S = window.Season;
  const { $, esc, num, signed, pct } = S;

  function renderStandings(stats) {
    const t = stats.table;
    if (!t.length || !t[0].scores.length) return;
    const lastOdds = stats.odds.weeks.length ? stats.odds.byWeek[stats.odds.weeks.at(-1)] : {};
    const leader = t[0];
    const behind = r => ((leader.wins - r.wins) + (r.losses - leader.losses)) / 2;
    const cut = stats.playoffTeams;
    const head = [['#', ''], ['Team', ''], ['W-L', ''], ['GB', 'num'], ['PF', 'num'], ['PA', 'num'], ['+/−', 'num'], ['Avg', 'num'],
      ['High', 'num'], ['All-play', 'num'], ['Luck', 'num'], ['Coach', 'num'], ['Form', ''], ['Streak', ''], ['Trend', ''], ['Playoffs', 'num']];
    const rows = t.map((r, i) => {
      const diff = r.pointsFor - r.pointsAgainst;
      const info = S.team(stats, r.rosterId);
      const odds = lastOdds[r.rosterId];
      const line = i === cut - 1 ? ' s-cutline' : '';
      return `<tr class="${r.rank <= cut ? 'is-playoff' : ''}${line}">
        <td class="s-rank">${r.rank}</td>
        <td data-card="team:${r.rosterId}"><span class="s-team team-with-logo">${S.logo(stats, r.rosterId, 30)}<span style="display:block"><a href="franchise.html?id=${esc(info.franchiseId || '')}" style="color:var(--ink);text-decoration:none;font-weight:750">${esc(info.team)}</a><br><small class="muted" style="font-weight:600">${esc(info.manager || info.sleeperUser || '')}</small></span></span></td>
        <td class="s-strong">${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}</td>
        <td class="num muted">${i === 0 ? '—' : num(behind(r), 1).replace(/\.0$/, '')}</td>
        <td class="num s-strong">${num(r.pointsFor)}</td>
        <td class="num">${num(r.pointsAgainst)}</td>
        <td class="num ${diff > 0 ? 's-up' : diff < 0 ? 's-down' : ''}">${signed(diff)}</td>
        <td class="num">${num(r.avgPoints)}</td>
        <td class="num">${num(r.high)}</td>
        <td class="num">${r.allPlay.wins}-${r.allPlay.losses}${r.allPlay.ties ? `-${r.allPlay.ties}` : ''}</td>
        <td class="num ${r.luck > 0 ? 's-up' : r.luck < 0 ? 's-down' : ''}">${signed(r.luck)}</td>
        <td class="num" data-card="coach:${r.rosterId}"><span class="s-hc-hint">${pct(r.coach)}</span></td>
        <td>${S.formChips(r.form)}</td>
        <td class="s-strong ${r.streak?.startsWith('W') ? 's-up' : r.streak?.startsWith('L') ? 's-down' : ''}">${esc(r.streak || '—')}</td>
        <td>${S.sparkline(r.scores)}</td>
        <td class="num s-strong" data-card="odds:${r.rosterId}"><span class="s-hc-hint">${odds ? S.oddsText(odds.playoff) : '—'}</span>${odds ? `<span class="s-meter"><i style="width:${(odds.playoff * 100).toFixed(1)}%"></i></span>` : ''}</td>
      </tr>`;
    }).join('');
    $('#live-standings').innerHTML = `<table class="s-table s-standings"><thead><tr>${head.map(([h, c]) => `<th class="${c}">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      <p class="s-note" style="padding:0 16px 14px">After week ${stats.lastFinishedWeek}. Green edge and line = playoff places (top ${cut}). GB = games behind the leader. All-play = record if you played every team every week. Luck = wins above what the scores deserve. Coach = share of the best possible lineup. Playoffs = chance from 10,000 simulations. <strong>Hover (or tap) a team, Coach or Playoffs for details.</strong> <a class="text-link" href="season.html">More on the Season page</a></p>`;
    S.hoverCards($('#live-standings'), S.teamCardBuilders(stats));
  }

  S.loadStats().then(stats => {
    renderStandings(stats);
    const week = stats.weeks.at(-1);
    if (!week) return;
    $('#home-week-eyebrow').textContent = `Week ${week.week} · ${week.live ? 'live' : 'final'}`;
    $('#home-week').innerHTML = week.matchups.map(m => {
      const side = t => {
        const state = week.live ? '' : m.winner === t.rosterId ? 'is-winner' : 'is-loser';
        return `<div class="s-side ${state}" style="grid-template-columns:auto 1fr auto;padding:6px 0">${S.logo(stats, t.rosterId, 30)}
          <div class="s-side-name"><strong>${esc(S.team(stats, t.rosterId).short)}</strong></div>
          <div class="s-side-score" style="font-size:1.2rem">${num(t.points)}</div></div>`;
      };
      return `<a class="s-matchup s-home-matchup" href="week.html#w${week.week}">${side(m.teams[0])}${side(m.teams[1])}</a>`;
    }).join('');

    const t = stats.table;
    if (!t.length || !t[0].scores.length) return;
    const trueTop = [...t].sort((a, b) => a.trueRank - b.trueRank)[0];
    const lucky = [...t].sort((a, b) => b.luck - a.luck)[0];
    const pickup = stats.transactions.bestPickups[0];
    const lastOdds = stats.odds.weeks.length ? stats.odds.byWeek[stats.odds.weeks.at(-1)] : null;
    const favourite = lastOdds ? Object.entries(lastOdds).sort((a, b) => b[1].first - a[1].first)[0] : null;
    const tile = (href, label, value, rosterId, detail) => `<a class="s-tile s-tile-link" href="${href}"><div class="s-tile-label">${esc(label)}</div>
      <div class="s-tile-value">${value}</div>${S.teamCell(stats, rosterId, { size: 24, link: false })}<div class="s-tile-detail">${detail}</div></a>`;
    $('#home-season').innerHTML = [
      tile('season.html', 'Ranking True #1', esc(trueTop.trueScore), trueTop.rosterId, `All-play ${trueTop.allPlay.wins}-${trueTop.allPlay.losses} · Coach ${pct(trueTop.coach)}`),
      tile('season.html', 'Luckiest team', signed(lucky.luck), lucky.rosterId, 'wins above what the scores deserve'),
      favourite ? tile('season.html', 'Title favourite', S.oddsText(favourite[1].first), +favourite[0], `chance of first place after week ${stats.odds.weeks.at(-1)}`) : '',
      pickup ? tile('waivers.html', 'Pickup of the season', `${num(pickup.startedPoints)}`, pickup.rosterId, `${esc(pickup.name)} · points as a starter`) : '',
    ].join('');
  }).catch(() => { $('#home-week').innerHTML = ''; });
})();
