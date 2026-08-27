(() => {
  const LOGO_DIR = 'logos';
  const LOGO_SIZE = 36;
  let franchises = [];

  const style = document.createElement('style');
  style.textContent = `
    .team-with-logo{display:inline-flex;align-items:center;gap:10px;min-width:0;vertical-align:middle}
    .team-logo{width:${LOGO_SIZE}px;height:${LOGO_SIZE}px;flex:0 0 ${LOGO_SIZE}px;border-radius:50%;background:transparent;border:0;padding:0;object-fit:cover;box-shadow:0 1px 4px rgba(0,0,0,.28);vertical-align:middle}
    .team-logo--large{width:64px;height:64px;flex-basis:64px;padding:0}
    .franchise-title-with-logo{display:flex;align-items:center;gap:16px}
    .franchise-title-with-logo h3,.franchise-title-with-logo h4{margin:0}
    td .team-with-logo{white-space:nowrap}
    @media(max-width:570px){.team-logo{width:32px;height:32px;flex-basis:32px}.team-logo--large{width:52px;height:52px;flex-basis:52px}}
  `;
  document.head.appendChild(style);

  function normalise(value) {
    return String(value || '').trim().toLocaleLowerCase('en-GB');
  }

  function idFromHref(href) {
    try {
      const url = new URL(href, location.href);
      if (!url.pathname.endsWith('/franchise.html') && !url.pathname.endsWith('franchise.html')) return null;
      return url.searchParams.get('id');
    } catch {
      return null;
    }
  }

  function idFromName(name) {
    const key = normalise(name);
    const franchise = franchises.find(f => {
      const names = [f.currentName, ...(f.historicalNames || [])];
      return names.some(n => normalise(n) === key);
    });
    return franchise ? String(franchise.franchiseId) : null;
  }

  function makeLogo(id, name, large = false) {
    const img = document.createElement('img');
    img.className = `team-logo${large ? ' team-logo--large' : ''}`;
    img.src = `${LOGO_DIR}/${id}.png`;
    img.alt = `${name || `Franchise ${id}`} logo`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.dataset.logoId = id;
    img.addEventListener('error', () => img.remove(), { once: true });
    return img;
  }

  function wrapNode(node, id, name, large = false) {
    if (!node || !id || node.closest('.team-with-logo') || node.querySelector?.('.team-logo')) return;
    const wrapper = document.createElement('span');
    wrapper.className = 'team-with-logo';
    node.parentNode.insertBefore(wrapper, node);
    wrapper.append(makeLogo(id, name, large), node);
  }

  function enhanceLinks(root = document) {
    root.querySelectorAll('a[href*="franchise.html?id="]').forEach(link => {
      const id = idFromHref(link.getAttribute('href'));
      if (id) wrapNode(link, id, link.textContent.trim());
    });
  }

  function enhanceTables(root = document) {
    root.querySelectorAll('table tr').forEach(row => {
      if (row.querySelector('.team-logo')) return;
      const cells = [...row.querySelectorAll('td')];
      if (!cells.length) return;
      const linked = row.querySelector('a[href*="franchise.html?id="]');
      if (linked) return;
      for (const cell of cells) {
        const name = cell.textContent.trim();
        const id = idFromName(name);
        if (id) {
          const text = document.createElement('span');
          text.textContent = name;
          cell.textContent = '';
          const wrapper = document.createElement('span');
          wrapper.className = 'team-with-logo';
          wrapper.append(makeLogo(id, name), text);
          cell.append(wrapper);
          break;
        }
      }
    });
  }

  function enhanceCards(root = document) {
    root.querySelectorAll('.record-card,.timeline-card,.insight-card,.podium-card,.dynasty-card').forEach(card => {
      if (card.querySelector('.team-logo')) return;
      const candidates = [...card.querySelectorAll('a,h3,h4,.insight-value,.record-detail')];
      for (const node of candidates) {
        const name = node.textContent.trim();
        const id = node.matches('a[href*="franchise.html?id="]')
          ? idFromHref(node.getAttribute('href'))
          : idFromName(name);
        if (id) {
          wrapNode(node, id, name);
          break;
        }
      }
    });
  }

  function enhanceFranchiseHeader(root = document) {
    const header = root.querySelector('#franchise-header');
    if (!header || header.querySelector('.team-logo')) return;
    const id = new URLSearchParams(location.search).get('id') || document.querySelector('#franchise-select')?.value;
    const heading = header.querySelector('h2,h3,h4');
    if (!id || !heading) return;
    const row = document.createElement('div');
    row.className = 'franchise-title-with-logo';
    heading.parentNode.insertBefore(row, heading);
    row.append(makeLogo(id, heading.textContent.trim(), true), heading);
  }

  function enhance(root = document) {
    enhanceLinks(root);
    enhanceTables(root);
    enhanceCards(root);
    enhanceFranchiseHeader(root);
  }

  async function start() {
    try {
      franchises = await fetch('data/franchises.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []);
    } catch {
      franchises = [];
    }
    enhance();
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelector('#franchise-select')?.addEventListener('change', () => setTimeout(() => enhanceFranchiseHeader(), 0));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
