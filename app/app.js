/* The League · appka dla menedżerów. Dane: data/stats.json (workflow Seby) i posts/index.json (prasa). */
(() => {
const view = document.getElementById('view');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('subtitle');
const backEl = document.querySelector('.back');
const PAGE = 20;
const state = { stats: null, posts: null, filter: 'all', shown: PAGE, feedScroll: 0, open: {}, openMatch: {} };

/* ---------- pomocnicze ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = x => nf2.format(x);
const n1 = x => nf1.format(x);
const pct = p => {
  if (p == null) return '–';
  if (p >= 1) return '100%';
  if (p <= 0) return '0%';
  if (p < 0.001) return '<0,1%';
  if (p > 0.999) return '>99,9%';
  return n1(p * 100) + '%';
};
const signed = x => (x > 0 ? '+' : x < 0 ? '−' : '') + n2(Math.abs(x));
const meczy = n => n === 1 ? 'mecz' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'mecze' : 'meczów';
const dayFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long' });
const dateLong = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const day = d => dayFmt.format(new Date(d + 'T12:00:00'));
const team = id => state.stats.teams.find(t => String(t.rosterId) === String(id)) || { short: '?', team: '?', manager: '' };
const logo = t => `<img class="logo" src="logos/${esc(t.franchiseId)}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
const record = r => `${r.wins}-${r.losses}${r.ties ? '-' + r.ties : ''}`;
const surname = (n, pos) => { const p = String(n).split(' '); if (pos === 'DEF') return p[p.length - 1]; return p.length > 1 ? p.slice(1).join(' ') : n; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(url);
  return r.json();
}

function setHead(title, sub, back) {
  titleEl.textContent = title;
  subEl.textContent = sub;
  backEl.hidden = !back;
  document.querySelector('.brand').hidden = !!back;
}
function setTab(tab) {
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
}

/* ---------- instalacja na telefonie ---------- */
let installEvent = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; if (location.hash.startsWith('#prasa') || !location.hash) render(); });
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function installBanner() {
  if (standalone() || store.get('tl-install-hidden')) return '';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  let how;
  if (installEvent) how = `<p>Appka otworzy się z ekranu telefonu, bez paska przeglądarki.</p><a class="go" href="#" id="install-go">Zainstaluj</a>`;
  else if (ios) how = `<p>W Safari stuknij <b style="display:inline">Udostępnij</b> (kwadrat ze strzałką), potem „Do ekranu początkowego”.</p>`;
  else if (android) how = `<p>W Chrome otwórz menu ⋮ i wybierz „Dodaj do ekranu głównego” albo „Zainstaluj aplikację”.</p>`;
  else return '';
  return `<div class="install" id="install"><div><b>Dodaj The League do ekranu telefonu</b>${how}</div><button aria-label="Ukryj" id="install-x">×</button></div>`;
}
function bindInstall() {
  const x = document.getElementById('install-x');
  if (x) x.onclick = () => { store.set('tl-install-hidden', '1'); document.getElementById('install').remove(); };
  const go = document.getElementById('install-go');
  if (go) go.onclick = async e => { e.preventDefault(); installEvent.prompt(); await installEvent.userChoice; installEvent = null; render(); };
}

/* ---------- PRASA ---------- */
const edLabel = id => (state.posts.editions.find(e => e.id === id) || {}).label || '';

function card(p) {
  return `<a class="fb" href="#p/${p.id}">
    <div class="fb-head">
      ${p.author ? `<img class="fb-av" src="${esc(p.author.photo)}" alt="">` : ''}
      <div class="fb-who"><b>${esc(p.outlet)} <i class="dot ${esc(p.outletStyle)}"></i></b><span>${esc(day(p.date))} · ${esc(edLabel(p.edition))}</span></div>
    </div>
    <div class="fb-txt">
      <p class="fb-k">${esc(p.kicker)}</p>
      <h3>${esc(p.title)}</h3>
      ${p.lead ? `<p class="fb-lead">${esc(p.lead)}</p>` : ''}
    </div>
    ${p.cover ? `<img class="fb-img" src="${esc(p.cover)}" alt="" loading="lazy">` : ''}
    <div class="fb-foot">Czytaj całość ›</div>
  </a>`;
}

function prasa() {
  setTab('prasa'); setHead('Prasa', 'The League Insider');
  if (!state.posts) { view.innerHTML = '<p class="empty">Nie udało się wczytać postów.</p>'; return; }
  const types = Object.fromEntries(state.posts.editions.map(e => [e.id, e.type]));
  const list = state.posts.posts
    .filter(p => state.filter === 'all' || types[p.edition] === state.filter)
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const chips = [['all', 'Wszystko'], ['zapowiedz', 'Zapowiedzi'], ['podsumowanie', 'Podsumowania'], ['draft', 'Draft']]
    .map(([k, l]) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
  const more = list.length > state.shown ? `<button class="more" id="more">Starsze posty (${list.length - state.shown})</button>` : '';
  view.innerHTML = `${installBanner()}<div class="chips">${chips}</div><div class="feed">${list.slice(0, state.shown).map(card).join('')}</div>${more}`;
  bindInstall();
  view.querySelectorAll('.chip').forEach(b => b.onclick = () => { state.filter = b.dataset.f; state.shown = PAGE; state.anchor = null; prasa(); scrollTo(0, 0); });
  const m = document.getElementById('more'); if (m) m.onclick = () => { state.shown += PAGE; const y = scrollY; prasa(); scrollTo(0, y); };
  view.querySelectorAll('.fb').forEach(a => a.addEventListener('click', () => {
    state.anchor = { href: a.getAttribute('href'), top: a.getBoundingClientRect().top };
  }));
}
function restoreFeed() {
  const a = state.anchor && view.querySelector(`.fb[href="${state.anchor.href}"]`);
  if (!a) return;
  const go = () => scrollTo(0, a.getBoundingClientRect().top + scrollY - state.anchor.top);
  go(); requestAnimationFrame(go); setTimeout(go, 150);
}

async function post(id) {
  setTab('prasa'); setHead('Prasa', 'The League Insider', true);
  view.innerHTML = '<p class="empty">Wczytuję…</p>';
  let p;
  try { p = await getJSON(`posts/${encodeURIComponent(id)}/post.json`); }
  catch { view.innerHTML = '<p class="empty">Nie ma takiego posta.</p>'; return; }
  const ed = state.posts && state.posts.editions.find(e => e.id === p.edition);
  const same = state.posts ? state.posts.posts.filter(x => x.edition === p.edition).sort((a, b) => a.id.localeCompare(b.id)) : [];
  const i = same.findIndex(x => x.id === p.id), prev = same[i - 1], next = same[i + 1];
  view.innerHTML = `<article class="post ${esc(p.variant || '')}">
    <div class="author-row">${p.author ? `<img src="${esc(p.author.photo)}" alt="">` : ''}<span class="outlet ${esc(p.outletStyle)}">${esc(p.outlet)}</span></div>
    <p class="kicker">${esc(p.kicker)}</p>
    <h2>${esc(p.title)}</h2>
    <p class="byline">${esc(p.byline)}</p>
    <span class="ed-link">${ed ? esc(ed.label) + ' · ' : ''}${esc(dateLong.format(new Date(p.date + 'T12:00:00')))}</span>
    <div class="post-body">${p.body}</div>
    <nav class="nav-posts">${prev ? `<a href="#p/${prev.id}">‹ Poprzedni<b>${esc(prev.title)}</b></a>` : '<span style="flex:1"></span>'}${next ? `<a href="#p/${next.id}">Następny ›<b>${esc(next.title)}</b></a>` : ''}</nav>
  </article>`;
  scrollTo(0, 0);
}

/* ---------- LIGA ---------- */
function liga() {
  const s = state.stats; setTab('liga');
  if (!s) { setHead('Liga', ''); view.innerHTML = '<p class="empty">Nie udało się wczytać danych ligi.</p>'; return; }
  const lw = s.lastFinishedWeek;
  setHead('Liga', `Tabela po week ${lw}`);
  const odds = (s.odds.byWeek[lw] || {});
  const prevOdds = s.odds.byWeek[lw - 1] || {};
  const rows = [...s.table].sort((a, b) => a.rank - b.rank);

  const table = rows.map((r, i) => {
    const t = team(r.rosterId), o = odds[r.rosterId] || {}, card = (s.teamCards || {})[r.rosterId] || {};
    const nx = card.next, opp = nx ? team(nx.opponent) : null;
    const form = (r.form || []).map(f => `<i class="${f}"></i>`).join('');
    const isOpen = state.open[r.rosterId];
    return `<div class="row ${i === s.playoffTeams - 1 ? 'cut' : ''}" data-r="${r.rosterId}">
      <span class="pos">${r.rank}</span>${logo(t)}
      <span class="nm"><b>${esc(t.short)}</b><span>${esc(t.manager)}<span class="form">${form}</span></span></span>
      <span class="rec num">${record(r)}</span>
      <span class="po num">${pct(o.playoff)}</span>
    </div>
    <div class="detail ${isOpen ? 'open' : ''}" id="d${r.rosterId}">
      <div class="stats">
        <div class="stat"><b class="num">${n2(r.pointsFor)}</b><span>punkty zdobyte</span></div>
        <div class="stat"><b class="num">${n2(r.avgPoints)}</b><span>średnio na mecz</span></div>
        <div class="stat"><b class="num">${n2(r.pointsAgainst)}</b><span>punkty stracone</span></div>
        <div class="stat"><b class="num">${record(r.allPlay)}</b><span>każdy z każdym</span></div>
        <div class="stat"><b class="num ${r.luck > 0 ? 'up' : r.luck < 0 ? 'down' : ''}">${signed(r.luck)}</b><span>szczęście</span></div>
        <div class="stat"><b class="num">${n1(r.coach * 100)}%</b><span>coach</span></div>
        <div class="stat"><b class="num">${r.trueRank}.</b><span>ranking True</span></div>
        <div class="stat"><b class="num">${pct(o.first)}</b><span>1. miejsce</span></div>
        <div class="stat"><b class="num">${pct(o.last)}</b><span>ostatnie miejsce</span></div>
      </div>
      ${nx && opp ? `<p class="next">Week ${nx.week}: <b>${esc(opp.short)}</b> (${esc(nx.opponentRecord)}). Szansa na wygraną ${pct(o.nextWinChance)}. Po wygranej playoffy ${pct(o.ifWin)}, po porażce ${pct(o.ifLoss)}.</p>` : ''}
    </div>`;
  }).join('');

  const bars = [...rows].sort((a, b) => (odds[b.rosterId]?.playoff ?? 0) - (odds[a.rosterId]?.playoff ?? 0)).map(r => {
    const t = team(r.rosterId), p = odds[r.rosterId]?.playoff ?? 0, pp = prevOdds[r.rosterId]?.playoff;
    let d = '';
    if (pp != null) {
      const diff = (p - pp) * 100;
      d = Math.abs(diff) < 0.05 ? '<small class="flat">bez zmian</small>' : `<small class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${n1(Math.abs(diff))}</small>`;
    }
    return `<div class="b2"><span>${esc(t.short)}</span><span class="t"><i style="width:${Math.max(p * 100, 0.6)}%"></i></span><span class="v num">${pct(p)}${d}</span></div>`;
  }).join('');

  view.innerHTML = `
    <div class="sec"><h2>Tabela</h2><p>Stuknij drużynę, żeby zobaczyć szczegóły. Do playoffów awansuje ${s.playoffTeams} najlepszych po ${s.regularSeasonEnd} kolejkach.</p></div>
    <div class="box standings"><div class="head-row"><span>#</span><span></span><span>Drużyna</span><span>Bilans</span><span>Playoffy</span></div>${table}</div>
    <p class="legend">Każdy z każdym: bilans, gdyby co tydzień grać z całą ligą. Szczęście: ile wygranych więcej (albo mniej), niż wynikałoby z tego bilansu. Coach: jaki procent punktów najlepszego możliwego składu udało się zdobyć. Ranking True łączy miejsca z bilansu każdy z każdym, Coach i punktów.</p>
    <div class="sec"><h2>Szanse na playoffy</h2><p>${Number(s.odds.simulations || 0).toLocaleString('pl-PL')} symulacji reszty sezonu, stan po week ${lw}. Strzałka pokazuje zmianę od poprzedniego tygodnia, w punktach procentowych.</p></div>
    <div class="box bars2">${bars}</div>
    <p class="updated">Dane z ${esc(timeFmt.format(new Date(s.generatedAt)))}</p>`;
  view.querySelectorAll('.row').forEach(el => el.onclick = () => {
    const id = el.dataset.r; state.open[id] = !state.open[id];
    document.getElementById('d' + id).classList.toggle('open', !!state.open[id]);
  });
}

/* ---------- MECZE ---------- */
function mecze(wArg) {
  const s = state.stats; setTab('mecze');
  if (!s) { setHead('Mecze', ''); view.innerHTML = '<p class="empty">Nie udało się wczytać danych ligi.</p>'; return; }
  const weeks = s.weeks.map(w => w.week).sort((a, b) => a - b);
  const w = weeks.includes(+wArg) ? +wArg : (weeks.includes(s.currentWeek) ? s.currentWeek : weeks[weeks.length - 1]);
  const wk = s.weeks.find(x => x.week === w);
  setHead('Mecze', `Week ${w}${wk.playoffs ? ' · playoffy' : ''}`);
  const prevOdds = s.odds.byWeek[w - 1] || {};
  const chips = weeks.map(x => `<a class="chip ${x === w ? 'on' : ''}" href="#mecze/${x}" style="text-decoration:none">${x}</a>`).join('');

  const cards = wk.matchups.map(m => {
    const done = m.winner != null && !wk.live;
    const rowsHtml = m.teams.map(tm => {
      const t = team(tm.rosterId);
      const stars = (tm.topStarters || []).filter(p => p.points > 0).slice(0, 3).map(p => `${esc(surname(p.name, p.position))} ${n1(p.points)}`).join(' · ');
      const cls = done ? (m.winner === tm.rosterId ? 'win' : 'lose') : (m.leader === tm.rosterId ? 'win' : '');
      return `<div class="mt ${cls}">${logo(t)}<span class="nm"><b>${esc(t.short)}</b><span>${stars || esc(t.manager)}</span></span><span class="pts">${n2(tm.points)}</span></div>`;
    }).join('');
    let foot;
    if (wk.live) {
      const [a, b] = m.teams, oa = prevOdds[a.rosterId];
      foot = `<span class="live">na żywo</span><span>${oa && oa.nextWeek === w ? `Szansa przed kolejką: ${esc(team(a.rosterId).short)} ${pct(oa.nextWinChance)}` : ''}</span>`;
    } else if (done) {
      const loser = m.teams.find(x => x.rosterId !== m.winner);
      foot = `<span>Różnica ${n2(m.margin)} pkt</span><span>${loser && loser.optimal > (m.teams.find(x => x.rosterId === m.winner) || {}).points ? 'Przegrany miał wygraną na ławce' : ''}</span>`;
    } else foot = '<span>Mecz jeszcze się nie zaczął</span><span></span>';
    const key = `${w}-${m.matchupId}`, open = !!state.openMatch[key];
    return `<div class="box match ${open ? 'open' : ''}" data-m="${key}">
      <div class="mhead">${rowsHtml}<div class="mfoot">${foot}<span class="caret" aria-hidden="true">▾</span></div></div>
      <div class="mdet">${matchDetail(wk, m, s)}</div>
    </div>`;
  }).join('');

  view.innerHTML = `<div class="chips" id="wk">${chips}</div>
    ${wk.live ? `<div class="sec"><p>Wyniki na żywo najlepiej śledzić w Sleeperze. Tu dane odświeżają się co pół godziny w trakcie meczów. Stan z ${esc(timeFmt.format(new Date(s.generatedAt)))}.</p></div>` : '<div style="height:12px"></div>'}
    ${weekTiles(wk, s)}
    <div class="sec"><h2>Mecze</h2><p>Stuknij mecz, żeby zobaczyć przebieg i zawodników.</p></div>
    ${cards}
    ${curseSection(wk, s)}
    ${awardsSection(wk, s)}
    ${allPlaySection(wk, s)}`;
  const on = document.querySelector('#wk .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  view.querySelectorAll('.match .mhead').forEach(h => h.onclick = () => {
    const box = h.parentElement, key = box.dataset.m;
    state.openMatch[key] = !state.openMatch[key];
    box.classList.toggle('open', state.openMatch[key]);
  });
}

/* kafelki, klątwa czwartku, nagrody, każdy z każdym */
const windowPl = w => String(w || '').replace(/Wednesday/g, 'środzie').replace(/Thursday/g, 'czwartku').replace(/Friday/g, 'piątku').replace(/Saturday/g, 'sobocie').replace(/\s*\+\s*/g, ' i ');
const posPl = p => p ? ` (${p})` : '';
function tile(label, value, sub) {
  return `<div class="tile"><span class="tl">${label}</span><b class="tv num">${value}</b><span class="ts">${sub}</span></div>`;
}
function weekTiles(wk, s) {
  const a = wk.awards || {}, c = wk.curse;
  const total = wk.matchups.reduce((x, m) => x + m.total, 0);
  const teams = wk.matchups.length * 2 || 1;
  const t = [];
  if (a.topScore) t.push(tile(wk.live ? 'Prowadzi' : 'Najlepszy wynik', n2(a.topScore.points), esc(team(a.topScore.rosterId).short)));
  if (a.playerOfWeek) t.push(tile('Zawodnik tygodnia', n2(a.playerOfWeek.points), `${esc(a.playerOfWeek.name)}${posPl(a.playerOfWeek.position)}, ${esc(team(a.playerOfWeek.rosterId).short)}`));
  if (c) t.push(tile('Klątwa czwartku', wk.live ? `${c.leaders.length} ${c.leaders.length === 1 ? 'lider' : 'liderów'}` : `${c.leadersLost} z ${c.leadersDecided}`, wk.live ? `prowadzi po ${esc(windowPl(c.window))}` : 'liderów po czwartku przegrało'));
  t.push(tile('Punkty w kolejce', n1(total), `średnio ${n2(total / teams)} na drużynę`));
  return `<div class="tiles">${t.join('')}</div>`;
}
function curseSection(wk, s) {
  const c = wk.curse;
  let body;
  if (!c) body = '<p class="mnote" style="padding:0 14px 14px">Brak danych o meczach NFL w tej kolejce.</p>';
  else {
    const verdict = l => l.held === null ? '<span class="vd open">czeka</span>' : l.held ? '<span class="vd held">✔ utrzymał</span>' : '<span class="vd lost">🧿 przegrał</span>';
    const rows = c.leaders.map(l => `<div class="cr">${logo(team(l.rosterId))}<span><b>${esc(team(l.rosterId).short)}</b><br><span class="det">+${n2(l.lead)} z ${esc(team(l.opponent).short)}</span></span>${verdict(l)}</div>`).join('');
    const intro = wk.live ? 'Czy klątwa uderzy znowu?' : c.leadersDecided ? `${c.leadersLost} z ${c.leadersDecided} liderów przegrało.` : 'Po pierwszych meczach nikt nie prowadził.';
    const cb = c.biggestComeback ? `<p class="mnote" style="padding:0 14px 14px">Największy powrót: <b style="color:var(--ink)">${esc(team(c.biggestComeback.rosterId).short)}</b> przegrywał z ${esc(shortOf(c.biggestComeback.opponentTeam))} o ${n2(c.biggestComeback.deficit)} i wygrał.</p>` : '';
    body = `<p class="mnote" style="padding:12px 14px 4px;margin:0">Prowadzący po ${esc(windowPl(c.window))}. ${intro}</p>${rows || '<p class="mnote" style="padding:0 14px">Wszystkie mecze były remisowe.</p>'}${cb}`;
  }
  const done = s.weeks.filter(w => !w.live && w.curse);
  const lost = done.reduce((x, w) => x + w.curse.leadersLost, 0), dec = done.reduce((x, w) => x + w.curse.leadersDecided, 0);
  const best = done.map(w => w.curse.biggestComeback && { ...w.curse.biggestComeback, week: w.week }).filter(Boolean).sort((x, y) => y.deficit - x.deficit)[0];
  const season = dec ? `<div class="cseason"><b class="num">${Math.round(lost / dec * 100)}%</b><p>liderów po czwartku przegrało w tym sezonie (${lost} z ${dec}, week 1 do ${s.lastFinishedWeek}). Przy rzucie monetą byłoby około 50%.${best ? ` Powrót sezonu: ${esc(team(best.rosterId).short)} odrobił ${n2(best.deficit)} z ${esc(shortOf(best.opponentTeam))} w week ${best.week}.` : ''}</p></div>` : '';
  return `<div class="sec"><h2>Klątwa czwartku</h2><p>Czy drużyna prowadząca po czwartkowym meczu wygrywa całą kolejkę</p></div>
    <div class="box">${body}${season}</div>`;
}
const shortOf = full => (state.stats.teams.find(t => t.team === full) || {}).short || full;
function awardsSection(wk, s) {
  const a = wk.awards || {}, others = s.teams.length - 1, live = wk.live;
  const row = (icon, title, rid, detail, val) => `<div class="rc"><span class="aw">${icon}</span><span><span class="lbl">${title}</span><br><span class="who">${esc(team(rid).short)}</span>${detail ? `<br><span class="det">${detail}</span>` : ''}</span><span class="val">${val}</span></div>`;
  const pts = v => `${n2(v)}<small>pkt</small>`;
  const vs = x => `${esc(team(x.winner).short)} ${n2(x.score[0])} : ${n2(x.score[1])} ${esc(team(x.loser).short)}`;
  const r = [
    a.playerOfWeek && row('⭐', 'Zawodnik tygodnia', a.playerOfWeek.rosterId, `${esc(a.playerOfWeek.name)}${posPl(a.playerOfWeek.position)}`, pts(a.playerOfWeek.points)),
    a.benchOfWeek && row('🪑', 'Ławka tygodnia', a.benchOfWeek.rosterId, `${esc(a.benchOfWeek.name)}${posPl(a.benchOfWeek.position)}${a.benchOfWeek.lostBy !== undefined ? `, a mecz przegrany o ${n2(a.benchOfWeek.lostBy)}` : ''}`, pts(a.benchOfWeek.points)),
    a.moveOfWeek && row('🔄', 'Ruch tygodnia', a.moveOfWeek.rosterId, `${esc(a.moveOfWeek.name)}${posPl(a.moveOfWeek.position)}, ${a.moveOfWeek.type === 'waiver' ? 'z waivera' : 'wolny agent'} w tym tygodniu`, pts(a.moveOfWeek.weekPoints)),
    a.bestCoach && !live && row('🧠', 'Coach najlepszy %', a.bestCoach.rosterId, 'najlepszego możliwego składu', `${n1(a.bestCoach.coach * 100)}%`),
    a.mostLeftOnBench && !live && row('🤦', 'Najwięcej zostawione na ławce', a.mostLeftOnBench.rosterId, `coach ${n1(a.mostLeftOnBench.coach * 100)}%`, pts(a.mostLeftOnBench.left)),
    a.topScore && row('🚀', live ? 'Prowadzi' : 'Najwyższy wynik', a.topScore.rosterId, '', pts(a.topScore.points)),
    a.lowScore && !live && row('🧊', 'Najniższy wynik', a.lowScore.rosterId, '', pts(a.lowScore.points)),
    a.blowout && row('💥', 'Pogrom', a.blowout.winner, vs(a.blowout), `${n2(a.blowout.margin)}<small>pkt różnicy</small>`),
    a.closest && row('😬', 'Najbliższy mecz', a.closest.winner, vs(a.closest), `${n2(a.closest.margin)}<small>pkt różnicy</small>`),
    a.unluckiest && row('💔', 'Pechowiec', a.unluckiest.rosterId, `przegrał, a pokonałby ${a.unluckiest.allPlayWins} z ${others} drużyn`, pts(a.unluckiest.points)),
    a.luckiest && row('🍀', 'Szczęściarz', a.luckiest.rosterId, `wygrał, choć pokonałby tylko ${a.luckiest.allPlayWins} z ${others} drużyn`, pts(a.luckiest.points))
  ].filter(Boolean);
  if (!r.length) return '';
  return `<div class="sec"><h2>Nagrody tygodnia</h2>${live ? '<p>Stan na teraz, kolejka trwa</p>' : ''}</div><div class="box rec-list">${r.join('')}</div>`;
}
function allPlaySection(wk, s) {
  if (!wk.allPlay) return '';
  const rows = wk.matchups.flatMap(m => m.teams.map(t => ({ ...t, ap: wk.allPlay[t.rosterId] || [0, 0, 0], won: m.winner === t.rosterId })))
    .sort((x, y) => y.points - x.points);
  const res = r => wk.live ? '<span class="flat">trwa</span>' : r.won ? '<span class="up">W</span>' : '<span class="down">P</span>';
  return `<div class="sec"><h2>Każdy z każdym</h2><p>Bilans, gdyby w tej kolejce każdy zagrał z całą ligą. W/P: prawdziwy wynik meczu.</p></div>
    <div class="box ap">
      <div class="ap-r ap-h"><span>#</span><span>Drużyna</span><span>Pkt</span><span>Bilans</span><span>Mecz</span><span>Coach</span></div>
      ${rows.map((r, i) => `<div class="ap-r"><span class="pos">${i + 1}</span><span class="nm">${esc(team(r.rosterId).short)}</span><span class="num b">${n2(r.points)}</span><span class="num">${r.ap[0]}-${r.ap[1]}${r.ap[2] ? '-' + r.ap[2] : ''}</span><span>${res(r)}</span><span class="num">${wk.live || r.coach == null ? '–' : Math.round(r.coach * 100) + '%'}</span></div>`).join('')}
    </div>`;
}

/* szczegóły meczu: przebieg okno po oknie i najlepsi zawodnicy */
const WINDOWS = {
  'Wednesday': 'Śr', 'Thursday': 'Czw', 'Friday': 'Pt', 'Saturday': 'Sob',
  'Sunday morning': 'Nd rano', 'Sunday early': 'Nd 19', 'Sunday late': 'Nd 22',
  'Sunday night': 'Nd noc', 'Monday night': 'Pn noc', 'Tuesday': 'Wt'
};
function duelChart(wk, a, b, s) {
  const wins = wk.windows || [];
  if (!wins.length || !(a.timeline || []).length) return '<p class="mnote">Brak danych o godzinach meczów NFL w tej kolejce, więc bez wykresu.</p>';
  let n = wins.length;
  if (wk.live) {
    const now = new Date(s.generatedAt);
    n = wins.filter(x => new Date(x.start) <= now).length;
    if (!n) return '<p class="mnote">Wykres pojawi się po pierwszych meczach NFL tej kolejki.</p>';
  }
  const labels = ['Start', ...wins.slice(0, n).map(x => WINDOWS[x.name] || x.name)];
  const va = [0, ...a.timeline.slice(0, n)], vb = [0, ...b.timeline.slice(0, n)];
  const max = Math.max(50, Math.ceil(Math.max(...va, ...vb) / 50) * 50);
  const W = 320, H = 150, L = 30, R = 20, T = 10, B = 122;
  const x = i => L + (W - L - R) * (labels.length > 1 ? i / (labels.length - 1) : 0);
  const y = v => B - (B - T) * v / max;
  const line = (v, cls) => `<polyline class="${cls}" points="${v.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')}"/><circle class="${cls}" cx="${x(v.length - 1).toFixed(1)}" cy="${y(v[v.length - 1]).toFixed(1)}" r="3.5"/>`;
  const grid = [0, max / 2, max].map(g => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}"/><text class="ax" x="${L - 6}" y="${y(g) + 3.5}" text-anchor="end">${g}</text>`).join('');
  const xl = labels.map((t, i) => `<text class="ax" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : 'middle'}">${esc(t)}</text>`).join('');
  return `<div class="legend2"><span><i class="la"></i>${esc(team(a.rosterId).short)}</span><span><i class="lb"></i>${esc(team(b.rosterId).short)}</span></div>
    <svg class="duel" viewBox="0 0 ${W} ${H}" role="img" aria-label="Przebieg meczu po kolejnych meczach NFL">${grid}${line(vb, 'lb')}${line(va, 'la')}${xl}</svg>`;
}
function players(title, list, bench) {
  if (!list || !list.length) return '';
  return `<div class="plist"><h4>${esc(title)}</h4>${list.map(p => `<div class="pl ${bench ? 'bench' : ''}"><span>${esc(p.name)} <em>${esc(p.position || '')}</em></span><b class="num">${n2(p.points)}</b></div>`).join('')}</div>`;
}
function matchDetail(wk, m, s) {
  const [a, b] = m.teams, ta = team(a.rosterId), tb = team(b.rosterId);
  const temp = wk.live ? '' : m.margin < 5 ? '🔥🔥🔥 thriller' : m.margin < 15 ? '🔥🔥 wyrównany' : m.margin < 30 ? '🔥 pewna wygrana' : '🌡️ jednostronny';
  const coach = t => (t.coach != null && !wk.live) ? ` · coach ${n1(t.coach * 100)}%` : '';
  return `${temp ? `<p class="temp">${temp}</p>` : ''}
    ${duelChart(wk, a, b, s)}
    <div class="pgrid">
      ${players(`Najlepsi: ${ta.short}`, a.topStarters)}
      ${players(`Najlepsi: ${tb.short}`, b.topStarters)}
      ${players(`Ławka: ${ta.short}`, a.topBench, true)}
      ${players(`Ławka: ${tb.short}`, b.topBench, true)}
    </div>
    <p class="mnote">Najlepszy możliwy skład: ${esc(ta.short)} ${n2(a.optimal)}${coach(a)}, ${esc(tb.short)} ${n2(b.optimal)}${coach(b)}</p>`;
}

/* ---------- REKORDY ---------- */
const RECORD_TITLES = {
  highScore: 'Najwyższy wynik',
  lowScore: 'Najniższy wynik',
  bestLoss: 'Najwyższy wynik po porażce',
  worstWin: 'Najniższy wynik w zwycięstwie',
  blowout: 'Najwyższe zwycięstwo',
  closest: 'Najmniejsza przewaga',
  bench: 'Najwięcej punktów na ławce',
  coach: 'Coach najlepszy %',
  badCoach: 'Coach najgorszy %',
  playerGame: 'Najlepszy występ zawodnika',
  benchPlayer: 'Najlepszy występ na ławce',
  winStreak: 'Najdłuższa seria zwycięstw',
  lossStreak: 'Najdłuższa seria porażek'
};
function recordDetail(r) {
  let d = String(r.detail || '').replace(/(\d)\.(\d)/g, '$1,$2');
  state.stats.teams.forEach(t => { d = d.split(t.team).join(t.short); });
  switch (r.key) {
    case 'winStreak': case 'lossStreak': return '';
    case 'coach': return 'procent najlepszego możliwego składu';
    case 'badCoach': return d.replace(/points left on the bench/, 'pkt zostawionych na ławce');
    case 'bestLoss': return d.replace(/^lost to /, 'porażka z ');
    case 'worstWin': return d.replace(/^beat /, 'wygrana z ');
    default: return d.replace(/\bvs /, 'z ');
  }
}
function recordValue(r) {
  switch (r.key) {
    case 'winStreak': case 'lossStreak': return `${r.value}<small>${meczy(r.value)}</small>`;
    case 'coach': case 'badCoach': return `${n1(r.value)}%`;
    case 'blowout': case 'closest': return `${n2(r.value)}<small>pkt różnicy</small>`;
    default: return `${n2(r.value)}<small>pkt</small>`;
  }
}
function histRow(lbl, who, det, val) {
  return `<div class="rc"><span class="num" style="font:800 13px var(--sans);color:var(--muted)">${lbl}</span><span><span class="who">${who}</span><br><span class="det">${det}</span></span><span class="val">${val}</span></div>`;
}
function rekordy() {
  const s = state.stats; setTab('rekordy');
  if (!s) { setHead('Rekordy', ''); view.innerHTML = '<p class="empty">Nie udało się wczytać danych ligi.</p>'; return; }
  setHead('Rekordy', `Sezon ${s.season} i historia ligi`);
  const recs = s.records.map(r => {
    const t = team(r.rosterId), det = recordDetail(r);
    return `<div class="rc">${logo(t)}<span><span class="lbl">${esc(RECORD_TITLES[r.key] || r.title)}</span><br><span class="who">${esc(t.short)}</span>${r.week ? `<span class="det"> · week ${r.week}</span>` : ''}${det ? `<br><span class="det">${esc(det)}</span>` : ''}</span><span class="val">${recordValue(r)}</span></div>`;
  }).join('');
  const h = s.history || {};
  const ppg = x => `${n2(x.ppg)}<small>pkt na mecz</small>`;
  const best = (h.bestWithoutTitle || []).slice(0, 5).map(x => histRow(x.season, esc(x.team), `${esc(x.manager)} · ${esc(x.record)}, ${x.finalRank}. miejsce`, ppg(x))).join('');
  const weak = (h.weakestChampions || []).slice(0, 5).map(x => histRow(x.season, esc(x.team), `${esc(x.manager)} · ${esc(x.record)}, rozstawienie ${x.seed}`, ppg(x))).join('');
  const sezony = n => n === 1 ? 'sezon' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'sezony' : 'sezonów';
  const anti = (h.antiGallery || []).slice(0, 5).map((x, i) => histRow(i + 1 + '.', esc(x.manager), `${x.losingSeasons} ${sezony(x.losingSeasons)} na minusie z ${x.seasons} · ${esc(x.record)}`, `${x.lastPlaces}<small>ostatnie miejsca</small>`)).join('');
  const few = (h.fewestPointsPerGame || []).slice(0, 5).map(x => histRow(x.season, esc(x.team), `${esc(x.manager)} · ${esc(x.record)}`, ppg(x))).join('');
  const yrs = Array.isArray(h.seasons) ? `${h.seasons[0]} do ${h.seasons[1]}` : '';
  view.innerHTML = `
    <div class="sec"><h2>Rekordy sezonu ${s.season}</h2><p>Po ${s.lastFinishedWeek} zakończonych kolejkach</p></div>
    <div class="box rec-list">${recs}</div>
    <div class="sec"><h2>Najlepsze sezony bez tytułu</h2><p>Historia ligi ${yrs}</p></div>
    <div class="box rec-list">${best}</div>
    <div class="sec"><h2>Najsłabsi mistrzowie</h2><p>Tytuł mimo słabego sezonu zasadniczego</p></div>
    <div class="box rec-list">${weak}</div>
    <div class="sec"><h2>Antygaleria Sław</h2><p>Kto najczęściej kończył sezon na ostatnim miejscu</p></div>
    <div class="box rec-list">${anti}</div>
    <div class="sec"><h2>Najmniej punktów na mecz</h2><p>Najsłabsze ofensywy w historii ligi</p></div>
    <div class="box rec-list">${few}</div>
    <p class="updated">Dane z ${esc(timeFmt.format(new Date(s.generatedAt)))}</p>`;
}

/* ---------- TYPER ---------- */
function typer() {
  setTab('typer'); setHead('Typer', 'Playoffy 2026');
  view.innerHTML = `<div class="box soon">
    <div class="big">🏆</div>
    <h2>Już wkrótce</h2>
    <p>Typowanie playoffów ruszy, gdy poznamy czwórkę. Każdy typuje mecze, a wspólny ranking pokaże, kto z was zna tę ligę najlepiej.</p>
    <span class="tag">Start po week ${state.stats ? state.stats.regularSeasonEnd : 13}</span>
  </div>`;
}

/* ---------- routing ---------- */
function render() {
  const h = decodeURIComponent(location.hash.slice(1));
  const [tab, arg] = h.split('/');
  if (tab === 'p' && arg) return post(arg);
  if (tab === 'liga') return liga();
  if (tab === 'mecze') { mecze(arg); return scrollTo(0, 0); }
  if (tab === 'rekordy') { rekordy(); return scrollTo(0, 0); }
  if (tab === 'typer') { typer(); return scrollTo(0, 0); }
  prasa();
  restoreFeed();
}
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let lastTab = null;
window.addEventListener('hashchange', () => {
  const tab = location.hash.slice(1).split('/')[0];
  if (tab === 'liga' && lastTab !== 'liga') scrollTo(0, 0);
  lastTab = tab;
  render();
});

Promise.allSettled([getJSON('data/stats.json'), getJSON('posts/index.json')]).then(([a, b]) => {
  state.stats = a.status === 'fulfilled' ? a.value : null;
  state.posts = b.status === 'fulfilled' ? b.value : null;
  render();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('app-sw.js', { scope: './app' }).catch(() => {});
})();
