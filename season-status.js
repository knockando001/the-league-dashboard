(() => {
  const statusLabels = {
    pre_draft: 'Pre-Draft',
    drafting: 'Drafting',
    in_season: 'In Season',
    post_season: 'Season Complete',
    complete: 'Season Complete'
  };

  const text = value => value === null || value === undefined || value === '' ? 'Not available' : String(value);

  function normaliseStatus(value) {
    return statusLabels[value] || text(value).replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function card(label, value, detail = '') {
    return `<article class="status-card"><div class="status-label">${label}</div><div class="status-value">${value}</div>${detail ? `<div class="status-detail">${detail}</div>` : ''}</article>`;
  }

  async function render() {
    const response = await fetch('data/live.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('live.json is unavailable');
    const live = await response.json();

    const league = live.league || {};
    const settings = league.settings || {};
    const drafts = Array.isArray(live.drafts) ? live.drafts : [];
    const primaryDraft = drafts[0] || {};
    const standings = Array.isArray(live.standings) ? live.standings : [];
    const joinedTeams = standings.filter(team => team.ownerId).length;
    const totalTeams = Number(settings.num_teams || league.total_rosters || standings.length || 0);
    const season = text(live.season || league.season);
    const rawStatus = live.status || league.status || 'unknown';
    const status = normaliseStatus(rawStatus);
    const draftStatus = normaliseStatus(primaryDraft.status || 'not_scheduled');
    const draftType = primaryDraft.type ? normaliseStatus(primaryDraft.type) : 'Not available';

    document.querySelector('#season-status-title').textContent = `Season ${season}`;
    document.querySelector('#season-status-summary').textContent = league.name
      ? `${league.name} is currently in the ${status.toLowerCase()} stage.`
      : `The league is currently in the ${status.toLowerCase()} stage.`;

    const badge = document.querySelector('#season-status-badge');
    badge.textContent = status;
    badge.dataset.status = rawStatus;

    document.querySelector('#season-status-grid').innerHTML =
      card('League status', status, `Sleeper season ${season}`) +
      card('Teams joined', `${joinedTeams} / ${totalTeams || '—'}`, 'Rosters with an assigned owner') +
      card('Draft status', draftStatus, draftType === 'Not available' ? '' : `${draftType} draft`) +
      card('Playoff teams', text(settings.playoff_teams), settings.playoff_week_start ? `Starts in week ${settings.playoff_week_start}` : '');
  }

  render().catch(error => {
    document.querySelector('#season-status-summary').textContent = 'Current league status could not be loaded.';
    document.querySelector('#season-status-badge').textContent = 'Unavailable';
    document.querySelector('#season-status-grid').innerHTML = card('Data source', 'Unavailable', error.message);
  });
})();
