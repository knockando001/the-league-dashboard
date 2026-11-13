/* Home page: this week's matchups and a few season highlights, linking to
   the Week Centre, Season and Waiver Wire pages. */
(() => {
  const S = window.Season;
  const { $, esc, num, signed, pct } = S;

  S.loadStats().then(stats => {
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
