(() => {
  const S = window.Season;
  const { $, esc, num, pct } = S;
  const DUEL = ['#3987e5', '#d95926'];

  S.explainers({
    curse: ['The Thursday curse', `
      <p>The Insider noticed that teams leading after Thursday night keep losing. This tracks it.</p>
      <ul>
        <li>Every starter's points are assigned to the NFL game he played in, and every game to its TV window from the kickoff time (US Eastern): Thursday, Sunday early (1 pm), Sunday late (4 pm), Sunday night, Monday night, plus any Wednesday, Friday, Saturday or London game.</li>
        <li><strong>Leader after Thursday</strong> = ahead once every game before Sunday is played.</li>
        <li><strong>Comeback</strong> = the biggest deficit, after any window, that the winner overturned.</li>
      </ul>
      <p class="method-note">NFL teams and kickoff times come from the Sleeper stats feed and the ESPN scoreboard.</p>`],
    awards: ['Awards of the week', `
      <ul>
        <li><strong>Player of the week</strong>: most points by a player in a starting lineup.</li>
        <li><strong>Bench of the week</strong>: most points left on a bench.</li>
        <li><strong>Move of the week</strong>: the waiver or free-agent pickup made that week who scored the most as a starter.</li>
        <li><strong>Best coach</strong>: highest share of the best possible lineup. <strong>Most left on bench</strong>: biggest gap to it.</li>
        <li><strong>Unluckiest</strong>: highest score that still lost. <strong>Luckiest</strong>: lowest score that still won.</li>
      </ul>`],
  });
  $('#curse-info').innerHTML = S.infoButton('curse');
  $('#awards-info').innerHTML = S.infoButton('awards');

  const temperature = (m, live) => {
    if (live) return '<span class="s-pill s-pill--live">in progress</span>';
    if (m.margin < 5) return '🔥🔥🔥 thriller';
    if (m.margin < 15) return '🔥🔥 close';
    if (m.margin < 30) return '🔥 solid';
    return '🌡️ one-sided';
  };

  function playerList(title, players, cls = '') {
    if (!players.length) return `<div><h4>${esc(title)}</h4><p class="muted" style="margin:0">—</p></div>`;
    return `<div><h4>${esc(title)}</h4><ol>${players.map(p => `<li class="${cls}"><span>${esc(p.name)}<em>${esc(p.position || '')}</em></span><b>${num(p.points)}</b></li>`).join('')}</ol></div>`;
  }

  function renderTabs(stats, current) {
    $('#week-tabs').innerHTML = stats.weeks.map(w => `<button type="button" class="s-week-tab${w.week === current ? ' is-on' : ''}${w.live ? ' is-live' : ''}" data-week="${w.week}">W${w.week}<small>${w.live ? 'LIVE' : w.playoffs ? 'PLAYOFF' : 'FINAL'}</small></button>`).join('');
    $('#week-tabs .is-on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function tile(label, value, detail, stats, rosterId) {
    return `<article class="s-tile"><div class="s-tile-label">${esc(label)}</div><div class="s-tile-value">${value}</div>${rosterId ? S.teamCell(stats, rosterId, { size: 24 }) : ''}<div class="s-tile-detail">${detail}</div></article>`;
  }

  function renderTiles(stats, week) {
    const a = week.awards || {};
    const total = week.matchups.reduce((sum, m) => sum + m.total, 0);
    const curse = week.curse;
    const leaders = curse?.leaders?.length || 0;
    $('#week-tiles').innerHTML = [
      a.topScore ? tile(week.live ? 'Leading score' : 'Top score', num(a.topScore.points), week.live ? 'so far' : 'highest of the week', stats, a.topScore.rosterId) : '',
      a.playerOfWeek ? tile('Player of the week', num(a.playerOfWeek.points), `${esc(a.playerOfWeek.name)} (${esc(a.playerOfWeek.position || '')})`, stats, a.playerOfWeek.rosterId) : '',
      curse ? tile('Thursday curse', week.live ? `${leaders} leading` : `${curse.leadersLost} of ${curse.leadersDecided}`,
        week.live ? `after ${esc(curse.window)}` : 'leaders after Thursday who lost') : tile('Thursday curse', '—', 'no NFL game data for this week'),
      tile('Points scored', num(total, 0), `${week.matchups.length} matchups · ${num(total / (week.matchups.length * 2 || 1))} per team`),
    ].join('');
  }

  function renderMatchups(stats, week) {
    $('#matchups').innerHTML = week.matchups.map((m, i) => {
      const [a, b] = m.teams;
      const side = (t, color) => {
        const info = S.team(stats, t.rosterId);
        const state = week.live ? '' : m.winner === t.rosterId ? 'is-winner' : 'is-loser';
        return `<div class="s-side ${state}">${S.logo(stats, t.rosterId, 44)}
          <div class="s-side-name"><strong><span class="s-key" style="background:${color}"></span>${esc(info.team)}</strong>
          <small>${esc(info.manager || info.sleeperUser || '')}${t.coach !== null && !week.live ? ` · Coach ${pct(t.coach)}` : ''}</small></div>
          <div class="s-side-score">${num(t.points)}</div></div>`;
      };
      return `<article class="s-matchup">
        <div class="s-matchup-head"><span>Matchup ${i + 1}</span><span>${temperature(m, week.live)}</span></div>
        ${side(a, DUEL[0])}${side(b, DUEL[1])}
        <div class="s-duel" data-index="${i}"></div>
        <div class="s-players">
          ${playerList(`Top for ${S.team(stats, a.rosterId).short}`, a.topStarters)}
          ${playerList(`Top for ${S.team(stats, b.rosterId).short}`, b.topStarters)}
        </div>
        ${(a.topBench.length || b.topBench.length) ? `<div class="s-players">
          ${playerList(`${S.team(stats, a.rosterId).short} bench`, a.topBench, 's-benchline')}
          ${playerList(`${S.team(stats, b.rosterId).short} bench`, b.topBench, 's-benchline')}</div>` : ''}
        <div class="s-matchup-foot"><span>${week.live ? 'Margin so far' : 'Margin'} ${num(m.margin)}</span>
          <span>Best possible: ${num(a.optimal)} · ${num(b.optimal)}</span></div>
      </article>`;
    }).join('') || '<p class="s-empty">No matchups for this week.</p>';
    week.matchups.forEach((m, i) => {
      const [a, b] = m.teams;
      const box = document.querySelector(`.s-duel[data-index="${i}"]`);
      if (!week.windows.length || !a.timeline.length) {
        box.innerHTML = '<p class="s-note">No NFL game data for this week, so no timeline.</p>';
        return;
      }
      S.duel(box, week.windows,
        { label: S.team(stats, a.rosterId).short, values: a.timeline },
        { label: S.team(stats, b.rosterId).short, values: b.timeline }, DUEL);
    });
  }

  function renderCurse(stats, week) {
    const curse = week.curse;
    if (!curse) {
      $('#curse').innerHTML = '<p class="s-empty">No NFL game data for this week.</p>';
    } else {
      const verdict = l => l.held === null ? '<span class="s-verdict s-verdict--open">to be decided</span>'
        : l.held ? '<span class="s-verdict s-verdict--held">✔ held on</span>' : '<span class="s-verdict s-verdict--lost">🧿 cursed, lost</span>';
      $('#curse').innerHTML = `<h3 style="margin:0 0 4px">Leaders after ${esc(curse.window)}</h3>
        <p class="muted" style="margin:0 0 10px">${week.live ? 'Will the curse strike again?' : curse.leadersDecided ? `${curse.leadersLost} of ${curse.leadersDecided} leaders lost.` : 'Nobody led after the early games.'}</p>
        ${curse.leaders.map(l => `<div class="s-curse-row">${S.teamCell(stats, l.rosterId, { short: true, size: 26 })}<span class="muted">+${num(l.lead)} vs ${esc(S.team(stats, l.opponent).short)}</span>${verdict(l)}</div>`).join('') || '<p class="muted">All matchups were level.</p>'}
        ${curse.biggestComeback ? `<p class="s-note">Biggest comeback: <strong>${esc(S.team(stats, curse.biggestComeback.rosterId).short)}</strong> trailed ${esc(curse.biggestComeback.opponentTeam)} by ${num(curse.biggestComeback.deficit)} and won.</p>` : ''}`;
    }
    const done = stats.weeks.filter(w => !w.live && w.curse);
    const lost = done.reduce((s, w) => s + w.curse.leadersLost, 0);
    const decided = done.reduce((s, w) => s + w.curse.leadersDecided, 0);
    const comebacks = done.map(w => w.curse.biggestComeback && { ...w.curse.biggestComeback, week: w.week }).filter(Boolean)
      .sort((x, y) => y.deficit - x.deficit);
    $('#curse-season').innerHTML = `<p class="eyebrow">Season so far</p>
      <div class="s-big" style="margin:10px 0 4px">${decided ? pct(lost / decided, 0) : '—'}</div>
      <p class="muted" style="margin:0 0 14px">of Thursday leaders went on to lose (${lost} of ${decided}, weeks 1–${stats.lastFinishedWeek}). A coin flip would be about 50%.</p>
      ${comebacks[0] ? `<p style="margin:0"><strong>Comeback of the season:</strong> ${esc(S.team(stats, comebacks[0].rosterId).short)} overturned ${num(comebacks[0].deficit)} against ${esc(comebacks[0].opponentTeam)} in week ${comebacks[0].week}.</p>` : ''}`;
  }

  function award(icon, title, value, stats, rosterId, detail) {
    return `<article class="s-card"><div class="s-card-top"><span class="s-card-icon">${icon}</span>${esc(title)}</div>
      <div class="s-card-value">${value}</div>${rosterId ? S.teamCell(stats, rosterId, { size: 24 }) : ''}
      <div class="s-card-detail">${detail || ''}</div></article>`;
  }

  function renderAwards(stats, week) {
    const a = week.awards || {};
    const others = stats.teams.length - 1;
    const vs = x => `${esc(S.team(stats, x.winner).short)} ${num(x.score[0])} : ${num(x.score[1])} ${esc(S.team(stats, x.loser).short)}`;
    const cards = [
      a.playerOfWeek && award('⭐', 'Player of the week', `${num(a.playerOfWeek.points)} <small>pts</small>`, stats, a.playerOfWeek.rosterId, `${esc(a.playerOfWeek.name)} · ${esc(a.playerOfWeek.position || '')}`),
      a.benchOfWeek && award('🪑', 'Bench of the week', `${num(a.benchOfWeek.points)} <small>pts</small>`, stats, a.benchOfWeek.rosterId,
        `${esc(a.benchOfWeek.name)} · ${esc(a.benchOfWeek.position || '')}${a.benchOfWeek.lostBy !== undefined ? ` · lost by ${num(a.benchOfWeek.lostBy)}` : ''}`),
      a.moveOfWeek && award('🔄', 'Move of the week', `${num(a.moveOfWeek.weekPoints)} <small>pts</small>`, stats, a.moveOfWeek.rosterId,
        `${esc(a.moveOfWeek.name)} · ${a.moveOfWeek.type === 'waiver' ? 'waiver claim' : 'free agent'} this week`),
      a.bestCoach && !week.live && award('🧠', 'Best coach', pct(a.bestCoach.coach), stats, a.bestCoach.rosterId, 'of the best possible lineup'),
      a.mostLeftOnBench && !week.live && award('🤦', 'Most left on the bench', `${num(a.mostLeftOnBench.left)} <small>pts</small>`, stats, a.mostLeftOnBench.rosterId, `Coach ${pct(a.mostLeftOnBench.coach)}`),
      a.topScore && award('🚀', week.live ? 'Leading score' : 'Top score', `${num(a.topScore.points)} <small>pts</small>`, stats, a.topScore.rosterId, ''),
      a.lowScore && !week.live && award('🧊', 'Lowest score', `${num(a.lowScore.points)} <small>pts</small>`, stats, a.lowScore.rosterId, ''),
      a.blowout && award('💥', 'Blowout', `${num(a.blowout.margin)} <small>margin</small>`, stats, a.blowout.winner, vs(a.blowout)),
      a.closest && award('😬', 'Closest game', `${num(a.closest.margin)} <small>margin</small>`, stats, a.closest.winner, vs(a.closest)),
      a.unluckiest && award('💔', 'Unluckiest', `${num(a.unluckiest.points)} <small>pts</small>`, stats, a.unluckiest.rosterId, `lost, but would have beaten ${a.unluckiest.allPlayWins} of ${others} teams`),
      a.luckiest && award('🍀', 'Luckiest', `${num(a.luckiest.points)} <small>pts</small>`, stats, a.luckiest.rosterId, `won, but would have beaten only ${a.luckiest.allPlayWins} of ${others} teams`),
    ].filter(Boolean);
    $('#awards').innerHTML = cards.join('') || '<p class="s-empty">Awards appear once the week has scores.</p>';
  }

  function renderAllPlay(stats, week) {
    const rows = week.matchups.flatMap(m => m.teams.map(t => ({ ...t, ap: week.allPlay[t.rosterId] || [0, 0, 0], won: m.winner === t.rosterId })))
      .sort((x, y) => y.points - x.points);
    $('#all-play').innerHTML = `<table class="s-table" style="min-width:560px"><thead><tr><th>#</th><th>Team</th><th class="num">Score</th><th class="num">All-play</th><th>Real result</th><th class="num">Coach %</th></tr></thead><tbody>${
      rows.map((r, i) => `<tr><td class="s-rank">${i + 1}</td><td>${S.teamCell(stats, r.rosterId, { size: 24 })}</td><td class="num s-strong">${num(r.points)}</td>
        <td class="num">${r.ap[0]}-${r.ap[1]}${r.ap[2] ? `-${r.ap[2]}` : ''}</td>
        <td>${week.live ? '<span class="muted">live</span>' : r.won ? '<span class="s-up">Win</span>' : '<span class="s-down">Loss</span>'}</td>
        <td class="num">${week.live ? '—' : pct(r.coach)}</td></tr>`).join('')}</tbody></table>`;
  }

  function show(stats, weekNo) {
    const week = stats.weeks.find(w => w.week === weekNo) || stats.weeks.at(-1);
    if (!week) return;
    history.replaceState(null, '', `#w${week.week}`);
    renderTabs(stats, week.week);
    $('#week-eyebrow').textContent = `${stats.season} season`;
    $('#week-title').textContent = `Week ${week.week}${week.live ? ' · live' : ''}`;
    $('#week-lede').textContent = week.live
      ? 'In progress. Scores refresh every couple of hours on game days; the lines show where each matchup stood after every NFL game window.'
      : `Final scores. ${week.playoffs ? 'Playoff week.' : 'Regular season.'} Lines show where each matchup stood after every NFL game window.`;
    renderTiles(stats, week);
    renderMatchups(stats, week);
    renderCurse(stats, week);
    renderAwards(stats, week);
    renderAllPlay(stats, week);
  }

  S.loadStats().then(stats => {
    const fromHash = +(location.hash.match(/^#w(\d+)$/)?.[1] || 0);
    const initial = stats.weeks.some(w => w.week === fromHash) ? fromHash : stats.weeks.at(-1)?.week;
    show(stats, initial);
    $('#week-tabs').addEventListener('click', event => {
      const button = event.target.closest('button[data-week]');
      if (button) show(stats, +button.dataset.week);
    });
  }).catch(error => S.fail($('#week-tiles'), error));
})();
