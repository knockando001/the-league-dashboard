/* Shared helpers and SVG charts for the season pages (Season, Week Centre,
   Waiver Wire, Hall of Shame). Data comes from data/stats.json, built by
   scripts/build_stats.py. No dependencies. */
(() => {
  const SVG = 'http://www.w3.org/2000/svg';
  // Categorical palette (dark steps), validated against the site surface #101d2f.
  const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
  const CONTEXT = '#2f4560';
  // Sequential blue, dark mode: low recedes towards the surface, high is light.
  const RAMP = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const num = (value, digits = 2) => value === null || value === undefined || Number.isNaN(+value)
    ? '—' : new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(+value);
  const int = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('en-GB').format(+value);
  const pct = (value, digits = 1) => value === null || value === undefined ? '—' : `${(+value * 100).toFixed(digits)}%`;
  const signed = (value, digits = 2) => value === null || value === undefined ? '—' : `${+value > 0 ? '+' : +value < 0 ? '−' : ''}${num(Math.abs(+value), digits)}`;
  const oddsText = value => value === null || value === undefined ? '—'
    : value >= 0.9995 ? '>99.9%' : value > 0 && value < 0.001 ? '<0.1%' : pct(value);

  // Older pages wire the menu button in their own scripts; only the season pages need it here.
  if (['season', 'week', 'waivers', 'shame'].includes(document.body.dataset.page)) {
    document.querySelector('.nav-toggle')?.addEventListener('click', () => document.querySelector('.nav')?.classList.toggle('open'));
  }

  let statsPromise;
  function loadStats() {
    statsPromise ??= fetch('data/stats.json', { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error('data/stats.json is unavailable');
      return r.json();
    }).then(stats => {
      const order = [...stats.teams].sort((a, b) => a.rosterId - b.rosterId);
      stats.byRoster = Object.fromEntries(order.map((t, i) => [t.rosterId, { ...t, color: PALETTE[i % PALETTE.length] }]));
      return stats;
    });
    return statsPromise;
  }

  function team(stats, rosterId) {
    return stats.byRoster[rosterId] || { rosterId, team: `Roster ${rosterId}`, short: `Roster ${rosterId}`, color: CONTEXT };
  }

  function logo(stats, rosterId, size = 28) {
    const t = team(stats, rosterId);
    if (!t.franchiseId) return `<span class="s-logo s-logo--blank" style="width:${size}px;height:${size}px"></span>`;
    return `<img class="s-logo" src="logos/${esc(t.franchiseId)}.png" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'s-logo s-logo--blank'}))">`;
  }

  function teamCell(stats, rosterId, { short = false, size = 28, link = true } = {}) {
    const t = team(stats, rosterId);
    const name = esc(short ? t.short : t.team);
    const label = link && t.franchiseId ? `<a href="franchise.html?id=${esc(t.franchiseId)}">${name}</a>` : `<span>${name}</span>`;
    return `<span class="s-team">${logo(stats, rosterId, size)}${label}</span>`;
  }

  function formChips(results) {
    return `<span class="s-form">${(results || []).map(r => `<i class="s-form-${esc(r || 'x')}" title="${r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Tie'}">${esc(r || '·')}</i>`).join('')}</span>`;
  }

  function rampColor(value, min, max) {
    if (max <= min) return RAMP[Math.floor(RAMP.length / 2)];
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))];
  }
  const inkOn = color => RAMP.indexOf(color) >= 7 ? '#0b0b0b' : '#ffffff';

  // ------------------------------------------------------------ tooltip
  let tip;
  function tooltip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 's-tooltip';
      tip.setAttribute('role', 'status');
      document.body.append(tip);
    }
    return tip;
  }
  function showTip(event, build) {
    const el = tooltip();
    el.replaceChildren(build());
    el.hidden = false;
    const pad = 14;
    const rect = el.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + rect.width > innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > innerHeight - 8) y = event.clientY - rect.height - pad;
    el.style.left = `${Math.max(8, x)}px`;
    el.style.top = `${Math.max(8, y)}px`;
  }
  function hideTip() { if (tip) tip.hidden = true; }

  /** Tooltip content: a title and rows of [color, label, value]; values lead. */
  function tipContent(title, rows) {
    const frag = document.createDocumentFragment();
    const head = document.createElement('div');
    head.className = 's-tip-title';
    head.textContent = title;
    frag.append(head);
    for (const [color, label, value] of rows) {
      const row = document.createElement('div');
      row.className = 's-tip-row';
      const key = document.createElement('i');
      key.style.background = color || 'transparent';
      const v = document.createElement('strong');
      v.textContent = value;
      const l = document.createElement('span');
      l.textContent = label;
      row.append(key, v, l);
      frag.append(row);
    }
    return frag;
  }

  function el(name, attrs = {}, parent) {
    const node = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, v);
    if (parent) parent.append(node);
    return node;
  }

  function niceTicks(min, max, count = 5) {
    const span = max - min || 1;
    const step0 = span / count;
    const mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count) || 10 * mag;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }

  function onResize(container, draw) {
    let width = 0;
    let frame = 0;
    // Redraw on the next frame so drawing never resizes the observed box inside the callback.
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const w = Math.round(container.clientWidth);
        if (w && w !== width) { width = w; draw(w); }
      });
    });
    ro.observe(container);
  }

  /**
   * Multi-series line chart with focus + context: every series is drawn in a
   * recessive gray, the focused one in its own color. A crosshair snaps to the
   * nearest X and the tooltip lists every series there.
   * opts: {xs, series:[{id,label,color,values}], yMin, yMax, yFormat, invert,
   *        yTicks, height, focus, endLabels:'focus'|'all', ariaLabel}
   */
  function lineChart(container, opts) {
    const state = { focus: opts.focus ?? null };
    container.classList.add('s-chart');
    const draw = width => {
      container.replaceChildren();
      const height = opts.height || 300;
      const m = { top: 16, right: opts.endLabels === 'all' ? 120 : 56, bottom: 30, left: 44 };
      const w = Math.max(10, width - m.left - m.right);
      const h = height - m.top - m.bottom;
      const values = opts.series.flatMap(s => s.values).filter(v => v !== null && v !== undefined);
      const yMin = opts.yMin ?? Math.min(...values);
      const yMax = opts.yMax ?? Math.max(...values);
      const x = i => m.left + (opts.xs.length <= 1 ? w / 2 : (i / (opts.xs.length - 1)) * w);
      const y = v => opts.invert
        ? m.top + ((v - yMin) / (yMax - yMin || 1)) * h
        : m.top + h - ((v - yMin) / (yMax - yMin || 1)) * h;
      const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': opts.ariaLabel || '' });
      const grid = el('g', { class: 's-grid' }, svg);
      for (const t of opts.yTicks || niceTicks(yMin, yMax, 4)) {
        el('line', { x1: m.left, x2: m.left + w, y1: y(t), y2: y(t) }, grid);
        const label = el('text', { x: m.left - 8, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 's-axis' }, grid);
        label.textContent = opts.yFormat ? opts.yFormat(t) : t;
      }
      const every = Math.ceil(opts.xs.length / Math.max(1, Math.floor(w / 56)));
      opts.xs.forEach((label, i) => {
        if (i % every && i !== opts.xs.length - 1) return;
        const t = el('text', { x: x(i), y: m.top + h + 20, 'text-anchor': 'middle', class: 's-axis' }, svg);
        t.textContent = label;
      });
      const path = s => s.values.map((v, i) => v === null || v === undefined ? null : `${x(i)},${y(v)}`)
        .filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p}`).join('');
      const lines = el('g', {}, svg);
      const ordered = [...opts.series].sort((a, b) => (a.id === state.focus) - (b.id === state.focus));
      for (const s of ordered) {
        const focused = state.focus === null || s.id === state.focus;
        const solo = state.focus !== null && s.id === state.focus;
        el('path', { d: path(s), class: 's-line', stroke: focused && (state.focus !== null || opts.colorAll) ? s.color : CONTEXT,
          'stroke-width': solo ? 3 : 2, opacity: focused ? 1 : 0.9 }, lines);
        const lastIndex = s.values.map((v, i) => v === null || v === undefined ? -1 : i).reduce((a, b) => Math.max(a, b), -1);
        if (lastIndex < 0) continue;
        const showLabel = opts.endLabels === 'all' || solo;
        if (solo || opts.endLabels === 'all') {
          el('circle', { cx: x(lastIndex), cy: y(s.values[lastIndex]), r: 4.5, fill: solo || opts.colorAll ? s.color : CONTEXT, class: 's-dot' }, lines);
        }
        if (showLabel) {
          const t = el('text', { x: x(lastIndex) + 9, y: y(s.values[lastIndex]), 'dominant-baseline': 'middle',
            class: solo ? 's-end-label s-end-label--focus' : 's-end-label' }, lines);
          t.textContent = opts.endLabels === 'all' ? s.label : (opts.yFormat ? opts.yFormat(s.values[lastIndex]) : s.values[lastIndex]);
        }
      }
      // Hover layer: crosshair snapping to the nearest X.
      const cross = el('line', { y1: m.top, y2: m.top + h, class: 's-cross', visibility: 'hidden' }, svg);
      const hit = el('rect', { x: m.left - 10, y: m.top, width: w + 20, height: h, fill: 'transparent' }, svg);
      const nearest = event => {
        const box = svg.getBoundingClientRect();
        const px = (event.clientX - box.left) * (width / box.width);
        return Math.max(0, Math.min(opts.xs.length - 1, Math.round(((px - m.left) / (w || 1)) * (opts.xs.length - 1))));
      };
      hit.addEventListener('pointermove', event => {
        const i = nearest(event);
        cross.setAttribute('x1', x(i));
        cross.setAttribute('x2', x(i));
        cross.setAttribute('visibility', 'visible');
        const rows = opts.series.filter(s => s.values[i] !== null && s.values[i] !== undefined)
          .sort((a, b) => opts.invert ? a.values[i] - b.values[i] : b.values[i] - a.values[i])
          .map(s => [s.color, s.label, opts.yFormat ? opts.yFormat(s.values[i]) : s.values[i]]);
        showTip(event, () => tipContent(opts.xs[i], rows));
      });
      hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
      container.append(svg);
    };
    onResize(container, draw);
    return {
      setFocus(id) { state.focus = id; draw(Math.round(container.clientWidth)); },
    };
  }

  /** Chips that pick the focused team for one or more charts. */
  function teamPicker(container, stats, rosterIds, onPick, initial = null) {
    let current = initial;
    const render = () => {
      container.innerHTML = `<button type="button" class="s-chip${current === null ? ' is-on' : ''}" data-id="">All teams</button>` +
        rosterIds.map(id => {
          const t = team(stats, id);
          return `<button type="button" class="s-chip${current === id ? ' is-on' : ''}" data-id="${id}"><i style="background:${t.color}"></i>${logo(stats, id, 20)}${esc(t.short)}</button>`;
        }).join('');
    };
    container.addEventListener('click', event => {
      const button = event.target.closest('button[data-id]');
      if (!button) return;
      current = button.dataset.id ? +button.dataset.id : null;
      render();
      onPick(current);
    });
    render();
  }

  /** Diverging horizontal bars around zero (luck). */
  function divergingBars(container, rows, { format = v => signed(v), positive = '#3987e5', negative = '#e66767', label } = {}) {
    container.classList.add('s-chart');
    const draw = width => {
      container.replaceChildren();
      const rowH = 34;
      const m = { top: 8, right: 64, bottom: 8, left: 150 };
      const height = m.top + m.bottom + rows.length * rowH;
      const w = Math.max(10, width - m.left - m.right);
      const maxAbs = Math.max(0.5, ...rows.map(r => Math.abs(r.value)));
      const x = v => m.left + w / 2 + (v / maxAbs) * (w / 2);
      const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': label || '' });
      el('line', { x1: x(0), x2: x(0), y1: m.top - 4, y2: height - m.bottom + 4, class: 's-baseline' }, svg);
      rows.forEach((r, i) => {
        const cy = m.top + i * rowH + rowH / 2;
        const name = el('text', { x: m.left - 12, y: cy, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 's-bar-label' }, svg);
        name.textContent = r.label;
        const x0 = x(0);
        const x1 = x(r.value);
        const barW = Math.abs(x1 - x0);
        const thick = 18;
        if (barW > 0.5) {
          const left = Math.min(x0, x1);
          const rad = Math.min(4, barW);
          // Rounded at the data end, square at the baseline.
          const d = r.value >= 0
            ? `M${left},${cy - thick / 2}H${left + barW - rad}Q${left + barW},${cy - thick / 2} ${left + barW},${cy - thick / 2 + rad}V${cy + thick / 2 - rad}Q${left + barW},${cy + thick / 2} ${left + barW - rad},${cy + thick / 2}H${left}Z`
            : `M${left + barW},${cy - thick / 2}H${left + rad}Q${left},${cy - thick / 2} ${left},${cy - thick / 2 + rad}V${cy + thick / 2 - rad}Q${left},${cy + thick / 2} ${left + rad},${cy + thick / 2}H${left + barW}Z`;
          el('path', { d, fill: r.value >= 0 ? positive : negative }, svg);
        }
        const v = el('text', { x: r.value >= 0 ? x1 + 8 : x1 - 8, y: cy, 'text-anchor': r.value >= 0 ? 'start' : 'end',
          'dominant-baseline': 'middle', class: 's-bar-value' }, svg);
        v.textContent = format(r.value);
        const hit = el('rect', { x: 0, y: cy - rowH / 2, width, height: rowH, fill: 'transparent' }, svg);
        hit.addEventListener('pointermove', event => showTip(event, () => tipContent(r.label, r.tip || [[r.value >= 0 ? positive : negative, 'value', format(r.value)]])));
        hit.addEventListener('pointerleave', hideTip);
      });
      container.append(svg);
    };
    onResize(container, draw);
  }

  /** Horizontal bars from a zero baseline (pickup values, counts). */
  function bars(container, rows, { format = v => num(v), color = '#3987e5', label } = {}) {
    container.classList.add('s-chart');
    const draw = width => {
      container.replaceChildren();
      const rowH = rows.some(r => r.sub) ? 46 : 34;
      const m = { top: 6, right: 78, bottom: 6, left: Math.min(240, Math.max(150, width * 0.38)) };
      const height = m.top + m.bottom + rows.length * rowH;
      const w = Math.max(10, width - m.left - m.right);
      const max = Math.max(1, ...rows.map(r => r.value));
      const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': label || '' });
      el('line', { x1: m.left, x2: m.left, y1: m.top, y2: height - m.bottom, class: 's-baseline' }, svg);
      rows.forEach((r, i) => {
        const cy = m.top + i * rowH + rowH / 2;
        const name = el('text', { x: m.left - 12, y: cy - (r.sub ? 7 : 0), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 's-bar-label' }, svg);
        name.textContent = r.label;
        if (r.sub) {
          const sub = el('text', { x: m.left - 12, y: cy + 8, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 's-axis' }, svg);
          sub.textContent = r.sub;
        }
        const barW = (r.value / max) * w;
        const thick = 18;
        const rad = Math.min(4, barW);
        if (barW > 0.5) {
          el('path', { d: `M${m.left},${cy - thick / 2}H${m.left + barW - rad}Q${m.left + barW},${cy - thick / 2} ${m.left + barW},${cy - thick / 2 + rad}V${cy + thick / 2 - rad}Q${m.left + barW},${cy + thick / 2} ${m.left + barW - rad},${cy + thick / 2}H${m.left}Z`,
            fill: r.color || color }, svg);
        }
        const v = el('text', { x: m.left + barW + 8, y: cy, 'dominant-baseline': 'middle', class: 's-bar-value' }, svg);
        v.textContent = format(r.value);
        const hit = el('rect', { x: 0, y: cy - rowH / 2, width, height: rowH, fill: 'transparent' }, svg);
        hit.addEventListener('pointermove', event => showTip(event, () => tipContent(r.label, r.tip || [[r.color || color, r.sub || '', format(r.value)]])));
        hit.addEventListener('pointerleave', hideTip);
      });
      container.append(svg);
    };
    onResize(container, draw);
  }

  /** Small two-line chart of a matchup's cumulative score per game window. */
  function duel(container, windows, a, b, colors = ['#3987e5', '#d95926']) {
    container.classList.add('s-chart');
    const draw = width => {
      container.replaceChildren();
      const height = 132;
      const m = { top: 12, right: 14, bottom: 28, left: 34 };
      const w = Math.max(10, width - m.left - m.right);
      const h = height - m.top - m.bottom;
      const n = windows.length + 1;
      const av = [0, ...a.values];
      const bv = [0, ...b.values];
      const max = Math.max(10, ...av, ...bv);
      const x = i => m.left + (i / (n - 1)) * w;
      const y = v => m.top + h - (v / max) * h;
      const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img',
        'aria-label': `${a.label} ${num(a.values.at(-1))}, ${b.label} ${num(b.values.at(-1))} by game window` });
      for (const t of niceTicks(0, max, 3)) {
        el('line', { x1: m.left, x2: m.left + w, y1: y(t), y2: y(t), class: 's-gridline' }, svg);
        const label = el('text', { x: m.left - 6, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 's-axis' }, svg);
        label.textContent = t;
      }
      const abbreviations = { 'Thursday': 'Thu', 'Friday': 'Fri', 'Saturday': 'Sat', 'Wednesday': 'Wed', 'Sunday morning': 'Sun AM',
        'Sunday early': 'Sun 1pm', 'Sunday late': 'Sun 4pm', 'Sunday night': 'SNF', 'Monday night': 'MNF', 'Tuesday': 'Tue' };
      ['Start', ...windows.map(wn => abbreviations[wn.name] || wn.name)].forEach((label, i) => {
        if (width < 360 && i % 2 && i !== n - 1) return;
        const t = el('text', { x: x(i), y: height - 8, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', class: 's-axis' }, svg);
        t.textContent = label;
      });
      [[bv, colors[1]], [av, colors[0]]].forEach(([vals, color]) => {
        el('path', { d: vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(''), class: 's-line', stroke: color, 'stroke-width': 2 }, svg);
        el('circle', { cx: x(n - 1), cy: y(vals.at(-1)), r: 4, fill: color, class: 's-dot' }, svg);
      });
      const cross = el('line', { y1: m.top, y2: m.top + h, class: 's-cross', visibility: 'hidden' }, svg);
      const hit = el('rect', { x: m.left - 8, y: 0, width: w + 16, height, fill: 'transparent' }, svg);
      hit.addEventListener('pointermove', event => {
        const box = svg.getBoundingClientRect();
        const px = (event.clientX - box.left) * (width / box.width);
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.left) / w) * (n - 1))));
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
        const title = i === 0 ? 'Start' : `After ${windows[i - 1].name}`;
        showTip(event, () => tipContent(title, [[colors[0], a.label, num(av[i])], [colors[1], b.label, num(bv[i])]]));
      });
      hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
      container.append(svg);
    };
    onResize(container, draw);
  }

  /** Tiny sparkline for table rows (decorative; values are in the table). */
  function sparkline(values, { width = 96, height = 26 } = {}) {
    const vals = (values || []).filter(v => v !== null && v !== undefined);
    if (vals.length < 2) return '';
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const x = i => 2 + (i / (vals.length - 1)) * (width - 6);
    const y = v => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
    const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    return `<svg class="s-spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><path d="${d}"/><circle cx="${x(vals.length - 1)}" cy="${y(vals.at(-1))}" r="3"/></svg>`;
  }

  /** Clickable column sorting for a rendered table. */
  function sortable(table, rows, render) {
    let key = null;
    let dir = 1;
    table.addEventListener('click', event => {
      const th = event.target.closest('th[data-sort]');
      if (!th) return;
      const k = th.dataset.sort;
      dir = key === k ? -dir : (th.dataset.dir === 'asc' ? 1 : -1);
      key = k;
      const get = r => k.split('.').reduce((o, p) => o?.[p], r);
      rows.sort((a, b) => {
        const va = get(a); const vb = get(b);
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        return (va > vb ? 1 : -1) * dir;
      });
      render(rows, key, dir);
    });
  }

  /** Explanation dialog opened by [data-explain] buttons. */
  function explainers(texts) {
    let dialog = $('#s-explain');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 's-explain';
      dialog.className = 'methodology-dialog';
      dialog.innerHTML = '<div class="dialog-head"><div><p class="eyebrow">How it is calculated</p><h2 class="s-explain-title"></h2></div><button class="dialog-close" type="button" aria-label="Close">×</button></div><div class="methodology-content s-explain-body"></div>';
      document.body.append(dialog);
      dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    }
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-explain]');
      if (!button || !texts[button.dataset.explain]) return;
      const [title, body] = texts[button.dataset.explain];
      dialog.querySelector('.s-explain-title').textContent = title;
      dialog.querySelector('.s-explain-body').innerHTML = body;
      dialog.showModal();
    });
  }

  function infoButton(key, label = 'How is this calculated?') {
    return `<button class="info-icon" type="button" data-explain="${esc(key)}" aria-label="${esc(label)}">i</button>`;
  }

  function fail(container, error) {
    container.innerHTML = `<div class="error">Could not load the season data: ${esc(error.message)}</div>`;
  }

  window.Season = {
    PALETTE, CONTEXT, RAMP, $, $$, esc, num, int, pct, signed, oddsText, loadStats, team, logo, teamCell, formChips,
    rampColor, inkOn, showTip, hideTip, tipContent, lineChart, teamPicker, divergingBars, bars, duel, sparkline,
    sortable, explainers, infoButton, fail,
  };
})();
