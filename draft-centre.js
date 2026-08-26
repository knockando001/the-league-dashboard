(() => {
  const $ = selector => document.querySelector(selector);
  const fmt = value => new Intl.NumberFormat('en-GB').format(Number(value || 0));
  const title = value => String(value || 'Not available').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

  document.querySelector('.nav-toggle')?.addEventListener('click', () => document.querySelector('.nav')?.classList.toggle('open'));

  function summaryCard(label, value, detail = '') {
    return `<article class="draft-summary-card"><div class="status-label">${label}</div><div class="draft-summary-value">${value}</div>${detail ? `<div class="status-detail">${detail}</div>` : ''}</article>`;
  }

  function table(headers, rows) {
    return `<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  async function loadJson(url, optional = false) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      if (optional) return null;
      throw new Error(`${url} is unavailable`);
    }
    return response.json();
  }

  function makeCurrentSnapshot(live) {
    const draft = Array.isArray(live.drafts) ? live.drafts[0] : null;
    const draftId = draft?.draft_id ? String(draft.draft_id) : null;
    return {
      season: String(live.season || live.league?.season || 'Unknown'),
      generatedAt: live.generatedAt,
      leagueId: live.leagueId,
      status: draft?.status || live.status || 'unknown',
      draft,
      picks: draftId ? (live.draftPicks?.[draftId] || []) : [],
      standings: live.standings || [],
      source: 'live'
    };
  }

  function normaliseHistory(history) {
    if (!history) return {};
    if (history.seasons && typeof history.seasons === 'object') return history.seasons;
    return history;
  }

  function playerName(pick) {
    const metadata = pick.metadata || {};
    return metadata.first_name || metadata.last_name
      ? `${metadata.first_name || ''} ${metadata.last_name || ''}`.trim()
      : metadata.player_name || pick.player_id || 'Unknown player';
  }

  function teamName(snapshot, rosterId) {
    const row = (snapshot.standings || []).find(team => Number(team.rosterId) === Number(rosterId));
    return row?.team || `Roster ${rosterId || '—'}`;
  }

  function render(snapshot) {
    const draft = snapshot.draft || {};
    const settings = draft.settings || {};
    const picks = Array.isArray(snapshot.picks) ? snapshot.picks : [];
    const season = snapshot.season;
    const status = title(draft.status || snapshot.status);
    const totalTeams = settings.teams || snapshot.standings?.length || '—';
    const rounds = settings.rounds || '—';
    const draftType = title(draft.type || 'Unknown');

    $('#draft-source').textContent = snapshot.source === 'live' ? 'Live Sleeper data' : 'Saved draft history';
    $('#draft-summary').innerHTML =
      summaryCard('Season', season, 'Sleeper draft archive') +
      summaryCard('Draft status', status, draft.start_time ? new Date(draft.start_time).toLocaleString() : 'Start time not set') +
      summaryCard('Draft format', draftType, `${totalTeams} teams`) +
      summaryCard('Rounds', rounds, `${fmt(picks.length)} picks recorded`);

    if (!picks.length) {
      $('#draft-board-note').textContent = status === 'Pre Draft' || status === 'Pre-Draft'
        ? 'Draft picks will appear automatically when the Sleeper draft begins.'
        : 'No draft picks are stored for this year.';
      $('#draft-board').innerHTML = `<div class="draft-empty"><div class="draft-empty-icon">🏈</div><h3>${season} draft has not produced picks yet</h3><p class="muted">The page is ready and will populate from Sleeper automatically.</p></div>`;
      $('#team-draft-summary').innerHTML = '';
      return;
    }

    const sorted = [...picks].sort((a, b) => Number(a.pick_no || 0) - Number(b.pick_no || 0));
    $('#draft-board-note').textContent = `${picks.length} selections recorded for ${season}.`;
    $('#draft-board').innerHTML = table(['Pick', 'Round', 'Team', 'Player', 'Position', 'NFL team'], sorted.map(pick => {
      const metadata = pick.metadata || {};
      return `<tr><td class="rank">${pick.pick_no || '—'}</td><td>${pick.round || '—'}</td><td>${teamName(snapshot, pick.roster_id)}</td><td><strong>${playerName(pick)}</strong></td><td>${metadata.position || '—'}</td><td>${metadata.team || '—'}</td></tr>`;
    }));

    const groups = {};
    sorted.forEach(pick => {
      const id = String(pick.roster_id || 'unknown');
      (groups[id] ||= []).push(pick);
    });
    $('#team-draft-summary').innerHTML = Object.entries(groups).map(([rosterId, teamPicks]) => `<article class="team-draft-card"><h3>${teamName(snapshot, rosterId)}</h3><div class="team-pick-count">${teamPicks.length} picks</div><ol>${teamPicks.map(pick => `<li><span>${pick.pick_no}.</span> ${playerName(pick)} <small>${pick.metadata?.position || ''}</small></li>`).join('')}</ol></article>`).join('');
  }

  async function run() {
    const [live, saved] = await Promise.all([
      loadJson('data/live.json'),
      loadJson('data/draft-history.json', true)
    ]);
    const seasons = normaliseHistory(saved);
    const current = makeCurrentSnapshot(live);
    seasons[current.season] = current;

    const years = Object.keys(seasons).sort((a, b) => Number(b) - Number(a));
    const select = $('#draft-year');
    select.innerHTML = years.map(year => `<option value="${year}">${year}</option>`).join('');
    select.addEventListener('change', event => render(seasons[event.target.value]));
    render(seasons[years[0]]);
  }

  run().catch(error => {
    $('#draft-summary').innerHTML = `<div class="error"><strong>Draft data could not be loaded.</strong><br>${error.message}</div>`;
    $('#draft-board').innerHTML = '';
  });
})();
