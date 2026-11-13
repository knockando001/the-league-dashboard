(() => {
  const S = window.Season;
  const { $, esc, num, pct } = S;
  const franchiseLogo = (id, size = 42) => id
    ? `<img class="s-logo" src="logos/${esc(id)}.png" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.style.visibility='hidden'">`
    : '';
  const franchiseLink = (id, name) => id ? `<a href="franchise.html?id=${esc(id)}">${esc(name)}</a>` : `<span>${esc(name)}</span>`;
  const teamLine = r => `<span class="s-team">${franchiseLogo(r.franchiseId, 26)}${franchiseLink(r.franchiseId, r.team)}</span>`;
  const place = n => n === 1 ? '🏆 Champion' : n === 2 ? '🥈 2nd' : n === 3 ? '🥉 3rd' : n ? `#${n}` : '—';

  function render(stats) {
    const h = stats.history || {};
    if (!h.sacko?.length) {
      $('#sacko').innerHTML = '<p class="s-empty">No league history available.</p>';
      return;
    }
    $('#shame-range').textContent = `${h.seasons[0]}–${h.seasons[1]}`;
    $('#sacko').innerHTML = h.sacko.map(s => `<article class="s-sacko-card" title="${esc(s.team)} · ${esc(s.record)}">
      <b>${s.season}</b>${s.uncertain ? '<span class="s-logo s-logo--blank" style="display:block;width:42px;height:42px;margin:6px auto;line-height:42px">❔</span>' : franchiseLogo(s.franchiseId)}<span>${esc(s.uncertain ? '?' : s.team)}</span>
      <small>${s.uncertain ? 'not in the archive' : `${esc(s.manager || '')} · ${esc(s.record)}`}</small></article>`).join('');
    const unsure = h.sacko.filter(s => s.uncertain);
    $('#sacko-note').textContent = unsure.length
      ? `${unsure.map(s => s.season).join(', ')}: the archive holds only today's franchises and the last-placed team that season isn't among them, so it isn't counted for anyone. Lowest team in the archive: ${unsure.map(s => `${s.team} (${s.record})`).join(', ')}.`
      : '';

    $('#anti-table').innerHTML = `<table class="s-table" style="min-width:560px"><thead><tr><th>Manager</th><th class="num">Last places</th><th class="num">Losing seasons</th><th class="num">Record</th><th class="num">Win %</th><th class="num">Titles</th></tr></thead><tbody>${
      h.antiGallery.map(m => `<tr><td class="s-strong" title="${esc(m.teams.join(', '))}">${esc(m.manager)}<br><small class="muted" style="font-weight:600">${esc(m.teams.join(' · '))}</small></td>
        <td class="num s-strong">${m.lastPlaces ? '🚽'.repeat(Math.min(m.lastPlaces, 5)) : '—'} ${m.lastPlaces}</td>
        <td class="num">${m.losingSeasons} of ${m.seasons}</td><td class="num">${esc(m.record)}</td><td class="num">${pct(m.winPct)}</td>
        <td class="num">${m.titles}</td></tr>`).join('')}</tbody></table>`;

    S.bars($('#sacko-bars'), h.antiGallery.filter(m => m.lastPlaces).map(m => ({
      label: m.manager, value: m.lastPlaces, color: '#e66767',
      tip: [['#e66767', 'last places', String(m.lastPlaces)], ['', 'losing seasons', `${m.losingSeasons} of ${m.seasons}`]],
    })), { format: v => String(v), label: 'Last places by manager' });

    $('#no-title').innerHTML = `<table class="s-table" style="min-width:460px"><thead><tr><th>Season</th><th>Team</th><th class="num">Record</th><th>Finished</th></tr></thead><tbody>${
      h.bestWithoutTitle.map(r => `<tr><td class="s-rank">${r.season}</td><td>${teamLine(r)}</td><td class="num s-strong">${esc(r.record)}</td><td>${place(r.finalRank)}</td></tr>`).join('')}</tbody></table>`;
    $('#weak-champs').innerHTML = `<table class="s-table" style="min-width:460px"><thead><tr><th>Season</th><th>Champion</th><th class="num">Record</th><th class="num">Seed</th></tr></thead><tbody>${
      h.weakestChampions.map(r => `<tr><td class="s-rank">${r.season}</td><td>${teamLine(r)}</td><td class="num s-strong">${esc(r.record)}</td><td class="num">${r.seed ? `#${r.seed}` : '—'}</td></tr>`).join('')}</tbody></table>`;
    $('#low-ppg').innerHTML = h.fewestPointsPerGame.map(r => `<article class="s-card"><div class="s-card-top"><span class="s-card-icon">🧊</span>${r.season}</div>
      <div class="s-card-value">${num(r.ppg)} <small>per game</small></div>${teamLine(r)}
      <div class="s-card-detail">${esc(r.manager || '')} · ${esc(r.record)} · ${place(r.finalRank)}</div></article>`).join('');
  }

  S.loadStats().then(render).catch(error => S.fail($('#sacko'), error));
})();
