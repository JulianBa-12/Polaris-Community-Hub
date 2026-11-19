// Polaris Community Hub – static single-page app.
// Content comes from data/content.json (snapshot published by Polaris Owner). If the Owner configured a
// public https backend (site.apiUrl) and it is reachable, the hub switches to live data and enables
// accounts, ratings, favorites, comments, bug reports and suggestions. No secrets live in this code.

const SNAP = 'data/content.json';
const TOKEN_KEY = 'polaris-hub-session';
const S = { data: null, live: false, api: '', token: null, user: null, liveError: '' };

// ---------- tiny DOM helper ----------
function h(sel, ...args) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_x, t, n) => { if (t === '.') el.classList.add(n); else el.id = n; });
  for (const a of args) add(el, a);
  return el;
}
function add(el, a) {
  if (a == null || a === false) return;
  if (Array.isArray(a)) { a.forEach((x) => add(el, x)); return; }
  if (a instanceof Node) { el.append(a); return; }
  if (typeof a === 'object') {
    for (const [k, v] of Object.entries(a)) {
      if (v == null || v === false) continue;
      if (k === 'html') el.innerHTML = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    return;
  }
  el.append(String(a));
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : '');
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const fmtDate = (d) => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const fmtSize = (n) => (!n ? '' : n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

// Small, safe markdown subset (HTML is escaped first; only https and in-hub links are allowed).
function md(src) {
  let s = esc(String(src || '').replace(/\r/g, ''));
  const blocks = [];
  s = s.replace(/```[a-z]*\n?([\s\S]*?)```/g, (_m, c) => { blocks.push('<pre>' + c.replace(/\n$/, '') + '</pre>'); return '\u0000' + (blocks.length - 1) + '\u0000'; });
  s = s.replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^## (.*)$/gm, '<h3>$1</h3>').replace(/^# (.*)$/gm, '<h3>$1</h3>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+|#\/[^)\s]*)\)/g, (_m, t, u) => u.startsWith('#') ? `<a href="${u}">${t}</a>` : `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  s = s.replace(/(^|\n)((?:- .*(?:\n|$))+)/g, (_m, p, list) => p + '<ul>' + list.trim().split('\n').map((l) => '<li>' + l.slice(2) + '</li>').join('') + '</ul>');
  s = s.replace(/(^|\n)((?:\d+\. .*(?:\n|$))+)/g, (_m, p, list) => p + '<ol>' + list.trim().split('\n').map((l) => '<li>' + l.replace(/^\d+\.\s/, '') + '</li>').join('') + '</ol>');
  s = s.split(/\n{2,}/).map((b) => /^\s*<(h\d|ul|ol)|^\u0000/.test(b) ? b : '<p>' + b.replace(/\n/g, '<br>') + '</p>').join('');
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => blocks[i]);
}
const mdEl = (src, cls = '.prose') => h('div' + cls, { html: md(src) });

// Crosshair preview (same geometry as the client overlay). Values are validated before use.
function crosshairSvg(c) {
  const n = (v, d, max) => Math.min(max, Math.max(0, Number.isFinite(+v) ? +v : d));
  const s = n(c.size, 8, 40), g = n(c.gap, 4, 40), th = Math.max(1, n(c.thickness, 2, 12)), ow = n(c.outlineWidth, 1, 6);
  const col = isHex(c.color) ? c.color : '#ffffff'; const o = c.outline ? (isHex(c.outlineColor) ? c.outlineColor : '#000000') : null;
  const W = (s + g) * 2 + th * 2 + 8, m = W / 2, P = [];
  const line = (x1, y1, x2, y2) => { if (o) P.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o}" stroke-width="${th + ow * 2}" stroke-linecap="square"/>`); P.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${th}" stroke-linecap="square"/>`); };
  const circ = (r, fill) => { if (o) P.push(`<circle cx="${m}" cy="${m}" r="${r}" fill="${fill ? o : 'none'}" stroke="${o}" stroke-width="${fill ? ow : th + ow * 2}"/>`); P.push(`<circle cx="${m}" cy="${m}" r="${r}" fill="${fill ? col : 'none'}" stroke="${fill ? 'none' : col}" stroke-width="${th}"/>`); };
  if (['cross', 'cross-dot', 't'].includes(c.shape)) { if (c.shape !== 't') line(m, m - g - s, m, m - g); line(m, m + g, m, m + g + s); line(m - g - s, m, m - g, m); line(m + g, m, m + g + s, m); }
  if (c.shape === 'circle' || c.shape === 'circle-dot') circ(s, false);
  if (['dot', 'cross-dot', 'circle-dot'].includes(c.shape) || c.dot) circ(Math.max(1, n(c.dotSize, th, 12)), true);
  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">${P.join('')}</svg>`;
}

// ---------- data access ----------
const site = () => (S.data.site && S.data.site.site) || {};
const title = () => (S.data.site && S.data.site.title) || 'Polaris Community Hub';
const ents = (kind) => (S.data.entities && S.data.entities[kind]) || [];
const allEnts = () => Object.values(S.data.entities || {}).flat();
const hidden = (id) => (site().hidden || []).includes(id);
function imgUrl(u) {
  if (typeof u !== 'string' || !u) return '';
  if (/^https:\/\//.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,/.test(u)) return u;
  if (/^data\/uploads\/[\w.-]+$/.test(u)) return u;
  if (/^\/uploads\/[\w.-]+$/.test(u)) return S.live ? S.api + u : 'data' + u;
  return '';
}

async function api(path, { method = 'GET', body, auth = true, timeout = 10000 } = {}) {
  if (!S.live) throw new Error('Kein Live-Backend verbunden');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  const headers = { 'Content-Type': 'application/json' };
  if (auth && S.token) headers.Authorization = 'Bearer ' + S.token;
  try {
    const r = await fetch(S.api + '/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal, credentials: 'omit' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401 && S.token && auth) { setSession(null); } throw new Error(j.error || ('Fehler ' + r.status)); }
    return j;
  } catch (e) { if (e.name === 'AbortError') throw new Error('Zeitüberschreitung – das Backend antwortet nicht'); if (e instanceof TypeError) throw new Error('Backend nicht erreichbar'); throw e; } finally { clearTimeout(t); }
}

const KINDS = ['news', 'announcement', 'changelog', 'featured', 'help', 'tutorial', 'docs', 'guide', 'page', 'download', 'gallery', 'resource', 'theme', 'plugin', 'bug', 'suggestion'];
async function loadLiveKind(kind) { S.data.entities[kind] = await api('/entities?kind=' + kind + '&limit=500'); }
async function goLive(apiUrl) {
  S.api = apiUrl.replace(/\/+$/, '');
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(S.api + '/api/health', { signal: ctl.signal, credentials: 'omit' }); clearTimeout(t);
    const j = await r.json(); if (!j.ok) throw new Error('unerwartete Antwort');
  } catch (e) { S.liveError = 'Live-Backend nicht erreichbar – angezeigt wird der veröffentlichte Stand vom ' + fmtDate(S.data.generatedAt) + '.'; return; }
  S.live = true;
  try {
    const [st, rel] = await Promise.all([api('/site', { auth: false }), api('/releases', { auth: false })]);
    S.data.site = { title: st.title, site: Object.assign({}, site(), st.site || {}, { apiUrl: S.data.site.site.apiUrl }), pages: st.pages };
    S.data.releases = rel.map((r) => ({ app: r.app, version: r.version, channel: r.channel, notes: r.notes, fileUrl: safeUrl(r.file_url) || null, sha256: r.sha256, size: r.size, createdAt: r.created_at }));
    S.token = localStorage.getItem(TOKEN_KEY + ':' + S.api);
    if (S.token) { try { S.user = await api('/me'); } catch { S.user = null; } }
    await Promise.all(KINDS.map(loadLiveKind));
  } catch (e) { S.live = false; S.liveError = 'Live-Daten konnten nicht geladen werden (' + e.message + '). Angezeigt wird der veröffentlichte Stand.'; }
}
function setSession(token, user) {
  S.token = token; S.user = user || null;
  if (token) localStorage.setItem(TOKEN_KEY + ':' + S.api, token); else localStorage.removeItem(TOKEN_KEY + ':' + S.api);
  renderAcct();
}

// ---------- shell ----------
const NAV = [
  { id: 'home', l: 'Home', href: '#/' },
  { g: 'Polaris', items: [['about', 'About Polaris'], ['features', 'Features'], ['news', 'News'], ['changelog', 'Changelog'], ['downloads', 'Downloads']] },
  { g: 'Community', items: [['community', 'Community'], ['skins', 'Skin Gallery'], ['themes', 'Themes'], ['crosshairs', 'Crosshairs'], ['resources', 'Resource Gallery'], ['plugins', 'Plugin Gallery'], ['leaderboard', 'Leaderboard'], ['submit', 'Inhalt einreichen']] },
  { g: 'Hilfe', items: [['docs', 'Documentation'], ['guides', 'Guides'], ['support', 'Support'], ['bugs', 'Bug Reports'], ['suggestions', 'Suggestions'], ['contact', 'Contact']] }
];
function renderNav(route) {
  const nav = document.getElementById('nav'); const cur = route[0] || 'home';
  const pages = ((S.data.site && S.data.site.pages) || []).filter((p) => p.nav && p.slug && p.slug !== 'about').sort((a, b) => (a.order || 0) - (b.order || 0));
  nav.replaceChildren(...NAV.map((n) => {
    if (n.id) return h('a', { href: n.href, class: cur === n.id ? 'on' : null }, n.l);
    let items = n.items.filter(([id]) => !hidden(id)).map(([id, l]) => h('a', { href: '#/' + id, class: cur === id ? 'on' : null }, l));
    if (n.g === 'Polaris') items = items.concat(pages.map((p) => h('a', { href: '#/p/' + encodeURIComponent(p.slug), class: cur === 'p' && route[1] === p.slug ? 'on' : null }, p.title)));
    if (!items.length) return null;
    const on = items.some((a) => a.classList.contains('on'));
    const d = h('details', { class: on ? 'on' : null }, h('summary', n.g), h('div.dd', items));
    return d;
  }).filter(Boolean));
  nav.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', () => { if (d.open && matchMedia('(min-width: 901px)').matches) nav.querySelectorAll('details').forEach((o) => { if (o !== d) o.open = false; }); }));
}
function renderAcct() {
  const el = document.getElementById('acct'); if (!el) return;
  if (!S.live) { el.replaceChildren(); return; }
  if (S.user) el.replaceChildren(isStaff() ? h('a.btn.sm.ghost', { href: '#/mod' }, 'Moderation') : null, h('a.sm', { href: '#/account', title: 'Mein Konto' }, S.user.displayName || S.user.username), h('button.btn.sm.ghost', { onclick: logout }, 'Abmelden'));
  else el.replaceChildren(h('button.btn.sm', { onclick: () => loginDialog() }, 'Anmelden'));
}
async function logout() { try { await api('/auth/logout', { method: 'POST' }); } catch { /* session may already be gone */ } setSession(null); route(); }
function renderNotices() {
  const el = document.getElementById('notice'); const out = [];
  const dismissed = JSON.parse(localStorage.getItem('polaris-hub-dismissed') || '[]');
  for (const a of ents('announcement').slice(0, 2)) {
    if (dismissed.includes(a.id)) continue;
    const lvl = ['info', 'ok', 'warn', 'danger'].includes(a.data.level) ? a.data.level : 'info';
    out.push(h('div.nt.' + lvl, h('div.wrap', h('b', a.title), h('span.muted', String(a.data.body || '').split('\n')[0].slice(0, 160)),
      h('button.x', { 'aria-label': 'Hinweis ausblenden', onclick: (e) => { localStorage.setItem('polaris-hub-dismissed', JSON.stringify(dismissed.concat(a.id).slice(-50))); e.currentTarget.closest('.nt').remove(); } }, '×'))));
  }
  if (S.liveError) out.push(h('div.nt.warn', h('div.wrap', h('span', S.liveError))));
  el.replaceChildren(...out);
}
function renderFoot() {
  const s = site(); const links = [];
  if (safeUrl(s.github)) links.push(h('a', { href: s.github, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub'));
  if (safeUrl(s.discord)) links.push(h('a', { href: s.discord, target: '_blank', rel: 'noopener noreferrer' }, 'Discord'));
  if (!hidden('contact')) links.push(h('a', { href: '#/contact' }, 'Kontakt'));
  if (!hidden('changelog')) links.push(h('a', { href: '#/changelog' }, 'Changelog'));
  document.getElementById('foot').replaceChildren(
    h('div', h('div', s.footer || '© ' + new Date().getFullYear() + ' Polaris'), h('div.sm', 'Inoffizielles Community-Projekt. Polaris ist nicht mit Kirka.io verbunden; Käufe von Kirka-Items erfolgen ausschließlich bei Kirka.io.')),
    h('div', h('div.fl', links), h('div.sm', S.live ? 'Live-Daten vom Polaris-Backend' : 'Stand: ' + fmtDate(S.data.generatedAt) + (S.data.revision ? ' · Revision #' + S.data.revision : ''))));
}

// ---------- reusable views ----------
const statusTag = (s) => { const m = { open: ['offen', 'warn'], planned: ['geplant', 'acc'], done: ['erledigt', 'ok'], rejected: ['abgelehnt', 'bad'], published: ['veröffentlicht', 'ok'] }[s] || [s, '']; return h('span.tag' + (m[1] ? '.' + m[1] : ''), m[0]); };
function pageHead(t, desc) { document.title = t + ' – ' + title(); return h('div.ph', h('h1', t), desc ? h('p', desc) : null); }
const empty = (t) => h('div.empty', t);
function thumb(e) {
  const d = e.data || {}; const u = imgUrl(d.preview || d.image || d.thumbnail);
  if (u) return h('div.th', h('img', { src: u, alt: '', loading: 'lazy' }));
  if (d.type === 'crosshair' && d.payload && typeof d.payload === 'object') return h('div.th', h('div.xh', { html: crosshairSvg(d.payload) }));
  if (d.type === 'theme' && d.payload && d.payload.colors && typeof d.payload.colors === 'object') return h('div.th', themeSwatch(d.payload.colors));
  return h('div.th', h('span.ph-t', d.type || e.kind));
}
function card(e) {
  const d = e.data || {};
  return h('a.card', { href: '#/item/' + encodeURIComponent(e.id) }, thumb(e), h('div.cb', h('div.ct', e.title), d.description || d.body ? h('div.cd', String(d.description || d.body).replace(/[#*`>-]/g, '').slice(0, 220)) : null,
    h('div.cm', d.type ? h('span.tag', d.type) : null, e.featured ? h('span.tag.acc', 'empfohlen') : null, e.kind === 'plugin' && d.version ? h('span', 'v' + d.version) : null,
      e.rating ? h('span', '★ ' + e.rating + ' (' + e.ratingCount + ')') : null, e.favorites ? h('span', '♥ ' + e.favorites) : null, e.downloads ? h('span', '↓ ' + e.downloads) : null, e.author ? h('span', e.author.displayName || e.author.username) : null)));
}
function gallery(root, items, { types, emptyText }) {
  let q = ''; let type = '';
  const grid = h('div.grid');
  const draw = () => {
    const list = items.filter((e) => (!type || e.data.type === type || (type === '_' + e.kind)) && (!q || (e.title + ' ' + (e.data.description || '') + ' ' + (e.data.tags || []).join(' ')).toLowerCase().includes(q)));
    grid.replaceChildren(...(list.length ? list.map(card) : [empty(items.length ? 'Keine Treffer für diese Auswahl.' : emptyText)]));
  };
  const chips = h('div.chips', [['', 'Alle']].concat(types).map(([v, l]) => h('button', { class: v === type ? 'on' : null, 'aria-pressed': String(v === type), onclick: (ev) => { type = v; chips.querySelectorAll('button').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); ev.currentTarget.classList.add('on'); ev.currentTarget.setAttribute('aria-pressed', 'true'); draw(); } }, l)));
  root.append(h('div.bar', h('input.inp', { type: 'search', placeholder: 'Suchen …', 'aria-label': 'Suchen', oninput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } }), types.length ? chips : null), grid);
  draw();
}
function submitHint() {
  const s = site(); const alt = [];
  if (safeUrl(s.github)) alt.push(h('a', { href: s.github.replace(/\/+$/, '') + (/github\.com\/[^/]+\/[^/]+$/.test(s.github) ? '/issues' : ''), target: '_blank', rel: 'noopener noreferrer' }, 'GitHub'));
  if (s.contactEmail) alt.push(h('a', { href: 'mailto:' + s.contactEmail }, s.contactEmail));
  return h('div.box.hint', 'Diese Funktion braucht ein erreichbares Polaris-Backend. Die Website zeigt gerade den veröffentlichten Stand. Im Polaris Client kannst du Bug Reports und Vorschläge direkt senden', alt.length ? [', oder über ', alt.map((a, i) => [i ? ' / ' : '', a])] : null, '.');
}

// ---------- pages ----------
const P = {};
P.home = (root) => {
  const s = site(); document.title = title();
  const cl = ents('changelog')[0]; const rel = (S.data.releases || []).find((r) => r.app === 'client' && r.channel === 'stable') || (S.data.releases || []).find((r) => r.app === 'client');
  const featured = ents('featured').concat(allEnts().filter((e) => e.featured && ['gallery', 'resource', 'theme', 'plugin'].includes(e.kind))).slice(0, 6);
  const featCount = Object.values(S.data.features || {}).filter((f) => f.enabled).length;
  root.append(
    h('section.hero',
      h('div', h('h1', title()), h('p.lead', s.tagline || 'Der schnelle, aufgeräumte Client für Kirka.io – mit Studios, Live-Konfiguration und einer offenen Community.'),
        s.intro ? mdEl(s.intro) : null,
        h('div.cta', !hidden('downloads') ? h('a.btn.pri', { href: '#/downloads' }, 'Polaris herunterladen') : null, !hidden('features') ? h('a.btn', { href: '#/features' }, 'Features ansehen') : null, !hidden('docs') ? h('a.btn.ghost', { href: '#/docs' }, 'Dokumentation') : null)),
      h('div.facts',
        h('div', h('span.muted', 'Aktuelle Version'), h('b', rel ? rel.version + (rel.channel !== 'stable' ? ' (' + rel.channel + ')' : '') : (cl && cl.data.version) || '–')),
        h('div', h('span.muted', 'Funktionen'), h('b', featCount ? featCount + ' Module' : '–')),
        h('div', h('span.muted', 'Galerie'), h('b', String(ents('gallery').length + ents('resource').length + ents('theme').length) + ' Einträge')),
        h('div', h('span.muted', 'Plugins'), h('b', String(ents('plugin').length))),
        h('div', h('span.muted', 'Plattform'), h('b', 'Linux (AppImage)')),
        h('div', h('span.muted', 'Datenstand'), h('b', S.live ? 'live' : fmtDate(S.data.generatedAt))))),
    featured.length ? h('section.sec', h('div.sech', h('h2', 'Empfohlen')), h('div.grid', featured.map((e) => e.kind === 'featured' ? featuredCard(e) : card(e)))) : null,
    h('div.cols2',
      !hidden('news') ? h('section.sec', h('div.sech', h('h2', 'News'), h('a.sm', { href: '#/news' }, 'Alle News')), listOf(ents('news').slice(0, 4), 'Noch keine News.')) : null,
      !hidden('changelog') ? h('section.sec', h('div.sech', h('h2', 'Changelog'), h('a.sm', { href: '#/changelog' }, 'Alle Versionen')), cl ? h('div.box', h('div.meta', h('b', cl.data.version || cl.title), h('span', fmtDate(cl.createdAt))), mdEl(cl.data.body)) : empty('Noch kein Changelog.')) : null));
};
function featuredCard(e) {
  const link = safeUrl(e.data.link) || (/^#\//.test(e.data.link || '') ? e.data.link : '');
  const inner = [thumb(e), h('div.cb', h('div.ct', e.title), e.data.body ? h('div.cd', String(e.data.body).slice(0, 220)) : null)];
  return link ? h('a.card', { href: link, target: link.startsWith('#') ? null : '_blank', rel: link.startsWith('#') ? null : 'noopener noreferrer' }, inner) : h('div.card', inner);
}
function listOf(items, emptyText, href = (e) => '#/item/' + encodeURIComponent(e.id)) {
  if (!items.length) return empty(emptyText);
  return h('div.list', items.map((e) => h('a.li', { href: href(e) }, h('div', h('div.lt', e.title), e.data.body ? h('div.ld', String(e.data.body).replace(/[#*`]/g, '').split('\n')[0].slice(0, 140)) : null), h('span.lm', fmtDate(e.createdAt)))));
}
P.about = (root) => {
  const pg = ents('page').find((p) => p.data.slug === 'about');
  root.append(pageHead(pg ? pg.title : 'About Polaris'), mdEl((pg && pg.data.body) || site().about || 'Polaris ist ein Client-Ökosystem für Kirka.io: der Polaris Client für alle Spieler, die private Verwaltungsanwendung Polaris Owner und dieser Community Hub.'),
    h('section.sec', h('h2', 'Grundsätze'), h('div.grid',
      [['Fair', 'Keine Cheats, Aimbots, Wallhacks, Exploits oder Anti-Cheat-Umgehungen. Polaris nutzt nur offiziell verfügbare Wege.'], ['Ohne Zwang zum Konto', 'Der Client startet im Gastmodus, lokale Funktionen laufen offline. Ein Konto brauchst du nur für Cloud, Social und Community.'],
        ['Ehrlich über Daten', 'Wo Kirka keine Schnittstelle anbietet, zeigt Polaris das offen und arbeitet mit lokalen Daten statt mit erfundenen Werten.'], ['Sicher erweiterbar', 'Plugins laufen isoliert und bekommen nur die Berechtigungen, die du freigibst.']]
        .map(([t, d]) => h('div.feat', h('h3', t), h('p', d))))));
};
P.features = (root) => {
  root.append(pageHead('Features', 'Alles, was im Polaris Client aktuell freigeschaltet ist. Das Polaris-Team kann einzelne Module zentral aktivieren oder deaktivieren.'));
  const f = Object.entries(S.data.features || {}).filter(([, v]) => v.enabled);
  if (!f.length) { root.append(empty('Die Feature-Liste wurde noch nicht veröffentlicht.')); return; }
  const CAT = { core: 'Grundlagen', game: 'Spiel', studio: 'Studios', data: 'Daten & Analyse', library: 'Bibliothek', community: 'Community', polaris: 'Polaris exklusiv', system: 'System' };
  const cats = {}; f.forEach(([id, v]) => { const c = CAT[v.category] || v.category || 'Weitere'; (cats[c] = cats[c] || []).push([id, v]); });
  for (const [c, list] of Object.entries(cats)) root.append(h('section.cat', h('h2', c), h('div.grid', list.map(([, v]) => h('div.feat', h('h3', v.label), v.description ? h('p', v.description) : null)))));
};
P.news = (root, [, id]) => {
  if (id) return P.item(root, ['item', id]);
  root.append(pageHead('News', 'Neuigkeiten und Ankündigungen rund um Polaris.'));
  const items = ents('news').concat(ents('announcement')).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!items.length) { root.append(empty('Noch keine News.')); return; }
  root.append(h('div.prose', items.map((e) => h('article.art', { id: 'n-' + e.id }, h('h2', h('a', { href: '#/item/' + encodeURIComponent(e.id) }, e.title)), h('div.meta', h('span', fmtDate(e.createdAt)), e.kind === 'announcement' ? h('span.tag.acc', 'Ankündigung') : null),
    imgUrl(e.data.image) ? h('img', { src: imgUrl(e.data.image), alt: '', loading: 'lazy' }) : null, mdEl(e.data.body, '.md')))));
};
P.changelog = (root) => {
  root.append(pageHead('Changelog', 'Alle Versionen und Änderungen.'));
  const items = ents('changelog');
  if (!items.length) { root.append(empty('Noch kein Changelog veröffentlicht.')); return; }
  root.append(h('div.prose', items.map((e) => h('article.art', h('h2', e.data.version ? 'Version ' + e.data.version : e.title), h('div.meta', h('span', fmtDate(e.createdAt)), e.data.version && e.title !== e.data.version ? h('span', e.title) : null), mdEl(e.data.body, '.md')))));
};
P.community = (root) => {
  const s = site();
  root.append(pageHead('Community', 'Teile Presets, Skins und Plugins mit anderen Spielern.'));
  root.append(h('div.cols2',
    h('div', mdEl(s.communityText || 'Alle Inhalte der Galerie stammen aus der Community und werden vor der Veröffentlichung geprüft. Einreichen kannst du direkt im Polaris Client unter **Creator Gallery**.'),
      h('div.cta', safeUrl(s.discord) ? h('a.btn.pri', { href: s.discord, target: '_blank', rel: 'noopener noreferrer' }, 'Discord beitreten') : null, safeUrl(s.github) ? h('a.btn', { href: s.github, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub') : null, !hidden('suggestions') ? h('a.btn.ghost', { href: '#/suggestions' }, 'Vorschlag einreichen') : null)),
    h('div.facts', h('div', h('span.muted', 'Galerie-Einträge'), h('b', String(ents('gallery').length))), h('div', h('span.muted', 'Ressourcen & Themes'), h('b', String(ents('resource').length + ents('theme').length))),
      h('div', h('span.muted', 'Plugins'), h('b', String(ents('plugin').length))), h('div', h('span.muted', 'Offene Vorschläge'), h('b', String(ents('suggestion').filter((x) => x.status === 'open').length))))));
  const latest = ents('gallery').concat(ents('resource'), ents('plugin')).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
  root.append(h('section.sec', { style: { marginTop: '30px' } }, h('div.sech', h('h2', 'Neu in der Galerie'), h('a.sm', { href: '#/skins' }, 'Zur Galerie')), latest.length ? h('div.grid', latest.map(card)) : empty('Noch keine Einträge.')));
  root.append(h('section.sec', h('h2', 'Regeln'), h('ul.prose', h('li', 'Nur eigene oder frei lizenzierte Inhalte teilen.'), h('li', 'Keine Cheats, Exploits, Anti-Cheat-Umgehungen oder Inhalte, die anderen Spielern schaden.'), h('li', 'Respektvoll bleiben – Meldungen landen direkt bei der Moderation.'))));
};
const TYPE_LABEL = { skin: 'Skins', background: 'Hintergründe', crosshair: 'Fadenkreuze', hud: 'HUD-Layouts', theme: 'Themes', workspace: 'Workspaces', resource: 'Ressourcen', plugin: 'Plugins' };
P.skins = (root) => {
  root.append(pageHead('Skin Gallery', 'Skins, Fadenkreuze, HUD-Layouts, Hintergründe und Themes aus der Community. Importieren kannst du sie im Polaris Client über die Creator Gallery.'));
  const items = ents('gallery').filter((e) => !['resource', 'plugin'].includes(e.data.type));
  const types = [...new Set(items.map((e) => e.data.type))].filter(Boolean).map((t) => [t, TYPE_LABEL[t] || t]);
  gallery(root, items, { types, emptyText: 'Noch keine Einträge in der Skin Gallery.' });
};
P.resources = (root) => {
  root.append(pageHead('Resource Gallery', 'Texturen, Sounds, Schriften, Pakete und Themes für deine Polaris-Konfiguration.'));
  const items = ents('resource').concat(ents('theme').map((e) => Object.assign({}, e, { data: Object.assign({ type: 'theme' }, e.data) })), ents('gallery').filter((e) => e.data.type === 'resource'));
  const types = [...new Set(items.map((e) => e.data.type))].filter(Boolean).map((t) => [t, TYPE_LABEL[t] || t]);
  gallery(root, items, { types, emptyText: 'Noch keine Ressourcen veröffentlicht.' });
};
P.plugins = (root) => {
  root.append(pageHead('Plugin Gallery', 'Plugins laufen im Polaris Client in einer isolierten Sandbox und erhalten nur die Berechtigungen, die du bei der Installation freigibst.'));
  gallery(root, ents('plugin').concat(ents('gallery').filter((e) => e.data.type === 'plugin')), { types: [], emptyText: 'Noch keine Plugins veröffentlicht.' });
};
function docsView(root, kinds, head, desc, base, id) {
  root.append(pageHead(head, desc));
  const items = kinds.flatMap(ents).sort((a, b) => (a.data.order ?? 999) - (b.data.order ?? 999) || a.title.localeCompare(b.title));
  if (!items.length) { root.append(empty('Hier gibt es noch keine Inhalte.')); return; }
  const cur = items.find((e) => e.id === id) || items[0];
  const cats = {}; items.forEach((e) => { const c = e.data.category || (e.kind === 'tutorial' ? 'Tutorials' : e.kind === 'help' ? 'Hilfe' : 'Allgemein'); (cats[c] = cats[c] || []).push(e); });
  root.append(h('div.side', h('nav.toc', { 'aria-label': head }, Object.entries(cats).map(([c, list]) => [h('div.tg', c), list.map((e) => h('a', { href: '#/' + base + '/' + encodeURIComponent(e.id), class: e === cur ? 'on' : null }, e.title))])),
    h('article', h('h2', cur.title), h('div.meta', h('span', 'Aktualisiert ' + fmtDate(cur.updatedAt || cur.createdAt))), mdEl(cur.data.body))));
}
P.docs = (root, [, id]) => docsView(root, ['docs'], 'Documentation', 'Technische Dokumentation zu Polaris Client, Plugins und Backend.', 'docs', id);
P.guides = (root, [, id]) => docsView(root, ['guide', 'tutorial'], 'Guides', 'Schritt-für-Schritt-Anleitungen aus der Praxis.', 'guides', id);
P.support = (root) => {
  const s = site();
  root.append(pageHead('Support', 'Hilfe zu Installation, Einstellungen und Problemen.'));
  root.append(h('div.cols2', h('div', mdEl(s.supportText || 'Prüfe zuerst die häufigen Fragen. Im Polaris Client findest du unter **Diagnostics** einen Systembericht, den du einer Fehlermeldung beilegen kannst.')),
    h('div.box', h('h3', 'Weiter'), h('div.cta', { style: { marginTop: '6px' } }, !hidden('bugs') ? h('a.btn', { href: '#/bugs' }, 'Bug melden') : null, !hidden('docs') ? h('a.btn', { href: '#/docs' }, 'Dokumentation') : null, !hidden('contact') ? h('a.btn.ghost', { href: '#/contact' }, 'Kontakt') : null))));
  const faq = ents('help');
  root.append(h('section.sec', { style: { marginTop: '28px' } }, h('h2', 'Häufige Fragen'), faq.length ? h('div.list', faq.map((e) => h('details.li', { style: { display: 'block' } }, h('summary.lt', { style: { cursor: 'pointer' } }, e.title), h('div', { style: { marginTop: '8px' } }, mdEl(e.data.body))))) : empty('Noch keine Fragen veröffentlicht.')));
};
function reportsView(root, kind) {
  const isBug = kind === 'bug';
  root.append(pageHead(isBug ? 'Bug Reports' : 'Suggestions', isBug ? 'Fehler melden und den Bearbeitungsstand verfolgen.' : 'Ideen für Polaris vorschlagen und sehen, was geplant ist.'));
  const listBox = h('div'); const formBox = h('div');
  const drawList = () => {
    const items = ents(kind);
    listBox.replaceChildren(h('h2', isBug ? 'Gemeldete Fehler' : 'Vorschläge'), items.length ? h('div.list', items.map((e) => h('a.li', { href: '#/item/' + encodeURIComponent(e.id) }, h('div', h('div.lt', e.title), e.data.response ? h('div.ld', 'Antwort: ' + String(e.data.response).slice(0, 140)) : (e.data.body ? h('div.ld', String(e.data.body).slice(0, 140)) : null)), h('span.lm', statusTag(e.status), ' ', fmtDate(e.createdAt))))) : empty(isBug ? 'Keine öffentlichen Bug Reports.' : 'Noch keine Vorschläge.'));
  };
  drawList();
  if (!S.live) formBox.append(h('h2', isBug ? 'Fehler melden' : 'Vorschlag einreichen'), submitHint());
  else {
    const f = { title: '', body: '', steps: '', version: '' }; const msg = h('div');
    const send = async (ev) => {
      ev.preventDefault(); msg.replaceChildren();
      const form = ev.currentTarget; const b = form.querySelector('button[type=submit]'); b.disabled = true;
      try {
        if (f.title.trim().length < 2) throw new Error('Bitte einen Titel angeben');
        if (f.body.trim().length < 5) throw new Error('Bitte beschreibe ' + (isBug ? 'den Fehler' : 'deinen Vorschlag') + ' etwas genauer');
        await api('/entities', { method: 'POST', body: { kind, title: f.title.trim(), data: isBug ? { body: f.body.trim(), steps: f.steps.trim(), version: f.version.trim() } : { body: f.body.trim() } } });
        form.reset(); Object.keys(f).forEach((k) => { f[k] = ''; });
        msg.replaceChildren(h('p.okm', 'Danke! ' + (isBug ? 'Dein Bug Report' : 'Dein Vorschlag') + ' wurde übermittelt.'));
        await loadLiveKind(kind); drawList();
      } catch (e) { msg.replaceChildren(h('p.err', e.message)); } finally { b.disabled = false; }
    };
    const inp = (k, label, opts = {}) => h('label.fld', h('span', label), h(opts.area ? 'textarea.inp' : 'input.inp', Object.assign({ oninput: (e) => { f[k] = e.target.value; }, maxlength: opts.max || 2000 }, opts.attrs || {})));
    formBox.append(h('h2', isBug ? 'Fehler melden' : 'Vorschlag einreichen'), h('form.box', { onsubmit: send, novalidate: true },
      inp('title', 'Titel', { max: 120, attrs: { required: true } }), inp('body', 'Beschreibung', { area: true, attrs: { rows: 5 } }),
      isBug ? [inp('steps', 'Schritte zum Nachstellen', { area: true, attrs: { rows: 3 } }), inp('version', 'Polaris-Version', { max: 20, attrs: { placeholder: 'z. B. 1.0.0' } })] : null,
      h('div.bar', { style: { marginBottom: 0 } }, h('button.btn.pri', { type: 'submit' }, 'Senden'), h('span.sm.muted', S.user ? 'Angemeldet als ' + S.user.username : 'Ohne Anmeldung (sofern vom Team erlaubt)')), msg));
  }
  root.append(h('div.cols2', listBox, formBox));
}
P.bugs = (root) => reportsView(root, 'bug');
P.suggestions = (root) => reportsView(root, 'suggestion');
P.contact = (root) => {
  const s = site();
  root.append(pageHead('Contact', 'So erreichst du das Polaris-Team.'));
  const rows = [];
  if (s.contactEmail) rows.push(['E-Mail', h('a', { href: 'mailto:' + s.contactEmail }, s.contactEmail)]);
  if (safeUrl(s.discord)) rows.push(['Discord', h('a', { href: s.discord, target: '_blank', rel: 'noopener noreferrer' }, s.discord.replace(/^https:\/\//, ''))]);
  if (safeUrl(s.github)) rows.push(['GitHub', h('a', { href: s.github, target: '_blank', rel: 'noopener noreferrer' }, s.github.replace(/^https:\/\//, ''))]);
  root.append(rows.length ? h('dl.kv.box', rows.map(([k, v]) => [h('dt', k), h('dd', v)])) : empty('Das Team hat noch keine Kontaktwege hinterlegt.'));
  root.append(h('p.muted.sm', { style: { marginTop: '16px' } }, 'Für Fehler und Ideen nutze bitte ', h('a', { href: '#/bugs' }, 'Bug Reports'), ' bzw. ', h('a', { href: '#/suggestions' }, 'Suggestions'), ' – so geht nichts verloren. Fragen zu Kirka-Konten oder -Käufen kann nur Kirka.io selbst beantworten.'));
};
P.downloads = (root) => {
  root.append(pageHead('Downloads', 'Offizielle Polaris-Builds. Prüfe nach dem Download die SHA-256-Prüfsumme; der Polaris Client macht das bei Updates automatisch.'));
  const rel = S.data.releases || []; const dl = ents('download');
  const latest = {}; rel.forEach((r) => { const k = r.app + ':' + r.channel; if (!latest[k]) latest[k] = r; });
  const appName = { client: 'Polaris Client', owner: 'Polaris Owner' };
  const rows = Object.values(latest).filter((r) => r.app === 'client');
  root.append(h('section.sec', h('h2', 'Polaris Client'), rows.length ? h('div.list', rows.map((r) => h('div.li', h('div', h('div.lt', (appName[r.app] || r.app) + ' ' + r.version, ' ', h('span.tag' + (r.channel === 'stable' ? '.ok' : '.warn'), r.channel)), r.notes ? h('div.ld', String(r.notes).split('\n')[0].slice(0, 160)) : null, r.sha256 ? h('div.ld.mono', 'SHA-256 ' + r.sha256) : null),
    h('span.lm', r.fileUrl ? h('a.btn.sm.pri', { href: r.fileUrl, rel: 'noopener noreferrer' }, 'Download' + (r.size ? ' · ' + fmtSize(r.size) : '')) : h('span', 'Datei nur im Client-Update-Center'))))) : empty('Noch kein Release veröffentlicht.')));
  if (dl.length) root.append(h('section.sec', h('h2', 'Weitere Downloads'), h('div.list', dl.map((e) => h('div.li', h('div', h('div.lt', e.title, e.data.version ? ' ' + e.data.version : ''), e.data.description ? h('div.ld', String(e.data.description).slice(0, 160)) : null, e.data.sha256 ? h('div.ld.mono', 'SHA-256 ' + e.data.sha256) : null),
    h('span.lm', safeUrl(e.data.url) ? h('a.btn.sm', { href: e.data.url, rel: 'noopener noreferrer' }, 'Download' + (e.data.size ? ' · ' + fmtSize(e.data.size) : '')) : null))))));
  root.append(h('div.box.hint', 'Installation unter Linux: Datei herunterladen, mit ', h('code', 'chmod +x Polaris-Client.AppImage'), ' ausführbar machen und starten. Fehlt auf deinem System FUSE, starte mit ', h('code', '--appimage-extract-and-run'), '.'));
};
P.p = (root, [, slug]) => {
  const pg = ents('page').find((p) => p.data.slug === decodeURIComponent(slug || ''));
  if (!pg) return notFound(root);
  root.append(pageHead(pg.title), mdEl(pg.data.body));
};
P.item = async (root, [, rawId]) => {
  const id = decodeURIComponent(rawId || '');
  let e = allEnts().find((x) => x.id === id);
  if (!e && !S.live) return notFound(root);
  if (S.live) { try { e = await api('/entities/' + encodeURIComponent(id)); } catch (err) { if (!e) { root.append(h('p.err', err.message)); return; } } }
  const d = e.data || {};
  const back = { news: ['#/news', 'News'], announcement: ['#/news', 'News'], changelog: ['#/changelog', 'Changelog'], plugin: ['#/plugins', 'Plugin Gallery'], resource: ['#/resources', 'Resource Gallery'], theme: ['#/themes', 'Themes'], bug: ['#/bugs', 'Bug Reports'], suggestion: ['#/suggestions', 'Suggestions'], docs: ['#/docs', 'Documentation'], guide: ['#/guides', 'Guides'], tutorial: ['#/guides', 'Guides'], help: ['#/support', 'Support'] }[e.kind] || ['#/skins', 'Skin Gallery'];
  document.title = e.title + ' – ' + title();
  root.append(h('a.crumb', { href: back[0] }, '← ' + back[1]));
  const visual = ['gallery', 'resource', 'theme', 'plugin', 'marketplace'].includes(e.kind);
  const meta = [['Typ', d.type || e.kind], e.author ? ['Von', e.author.displayName || e.author.username] : null, ['Veröffentlicht', fmtDate(e.createdAt)], e.updatedAt && e.updatedAt !== e.createdAt ? ['Aktualisiert', fmtDate(e.updatedAt)] : null,
    d.version ? ['Version', d.version] : null, d.license ? ['Lizenz', d.license] : null, d.polaris ? ['Benötigt', 'Polaris ' + d.polaris] : null, Array.isArray(d.permissions) ? ['Berechtigungen', d.permissions.length ? d.permissions.join(', ') : 'keine'] : null,
    d.sha256 ? ['SHA-256', h('span.mono', d.sha256)] : null, Array.isArray(d.tags) && d.tags.length ? ['Tags', d.tags.join(', ')] : null, ['bug', 'suggestion'].includes(e.kind) ? ['Status', statusTag(e.status)] : null,
    e.rating ? ['Bewertung', '★ ' + e.rating + ' (' + e.ratingCount + ')'] : null, e.favorites ? ['Favoriten', String(e.favorites)] : null, e.downloads ? ['Downloads', String(e.downloads)] : null].filter(Boolean);
  const actions = h('div.cta');
  if (d.payload && typeof d.payload === 'object') actions.append(h('button.btn', { onclick: () => recordDownload(e) && download(slugify(e.title) + '.polaris.json', JSON.stringify({ polaris: 1, kind: e.kind, type: d.type, title: e.title, payload: d.payload }, null, 2)) }, 'Als Datei herunterladen'));
  if (e.kind === 'plugin' && d.code) actions.append(h('button.btn', { onclick: () => download(slugify(e.title) + '.plugin.json', JSON.stringify({ manifest: { id: slugify(e.title).slice(0, 36) + '-' + String(e.id).slice(-4).toLowerCase().replace(/[^a-z0-9]/g, ''), name: e.title, version: d.version || '1.0.0', author: d.author || (e.author && e.author.username) || 'unbekannt', description: d.description || '', permissions: d.permissions || [], hosts: d.hosts || [] }, code: d.code }, null, 2)) }, 'Plugin herunterladen'));
  if (safeUrl(d.url)) actions.append(h('a.btn', { href: d.url, target: '_blank', rel: 'noopener noreferrer' }, 'Datei öffnen'));
  root.append(h(visual ? 'div.det' : 'div',
    h('div', h('h1', e.title), visual ? thumb(e) : null, h('div', { style: { marginTop: visual ? '18px' : '0' } }, mdEl(d.description || d.body || '')),
      d.steps ? [h('h3', 'Schritte'), mdEl(d.steps)] : null, d.response ? h('div.box', { style: { marginTop: '14px' } }, h('b', 'Antwort des Teams'), mdEl(d.response)) : null,
      e.kind === 'plugin' && d.code ? [h('h3', { style: { marginTop: '20px' } }, 'Quellcode'), h('p.muted.sm', 'Prüfe den Code vor der Installation. Im Client läuft er isoliert in einer Sandbox.'), h('pre', d.code)] : null,
      visual ? h('p.muted.sm', { style: { marginTop: '14px' } }, 'Im Polaris Client: Creator Gallery bzw. Plugins öffnen und den Eintrag dort installieren oder die heruntergeladene Datei importieren.') : null),
    h('aside', visual ? null : h('div', { style: { marginTop: '18px' } }), h('dl.kv.box', meta.map(([k, v]) => [h('dt', k), h('dd', v)])), actions.childNodes.length ? h('div', { style: { marginTop: '14px' } }, actions) : null, interactBox(e))));
};
function interactBox(e) {
  if (!['gallery', 'resource', 'theme', 'plugin', 'news', 'changelog', 'suggestion', 'guide', 'tutorial', 'docs'].includes(e.kind)) return null;
  const box = h('div.box', { style: { marginTop: '14px' } });
  if (!S.live) { box.className = 'box hint'; box.style.marginTop = '14px'; box.append('Bewerten, Favorisieren und Kommentieren ist möglich, sobald der Hub mit einem öffentlichen Polaris-Backend verbunden ist.'); return box; }
  const comments = h('div');
  const drawComments = () => comments.replaceChildren(h('h3', { style: { marginTop: '14px' } }, 'Kommentare (' + (e.comments || []).length + ')'), ...(e.comments || []).map((c) => h('div.cmt', h('div.meta', h('b', c.author ? (c.author.displayName || c.author.username) : 'Gast'), h('span', fmtDate(c.createdAt))), mdEl(c.data.body, '.md'))));
  drawComments();
  if (!S.user) { box.append(h('p.sm.muted', 'Melde dich an, um zu bewerten, zu favorisieren und zu kommentieren.'), h('button.btn.sm', { onclick: () => loginDialog() }, 'Anmelden'), comments); return box; }
  const msg = h('div');
  const stars = h('div.stars', { role: 'group', 'aria-label': 'Bewertung' }, [1, 2, 3, 4, 5].map((v) => h('button', { class: (e.myRating || 0) >= v ? 'on' : null, 'aria-label': v + ' Sterne', onclick: async () => { try { await api('/entities/' + encodeURIComponent(e.id) + '/rate', { method: 'POST', body: { value: v } }); e.myRating = v; stars.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i < v)); msg.replaceChildren(h('span.okm', 'Bewertung gespeichert')); } catch (err) { msg.replaceChildren(h('span.err', err.message)); } } }, '★')));
  const fav = h('button.btn.sm', { onclick: async () => { try { const r = await api('/entities/' + encodeURIComponent(e.id) + '/favorite', { method: 'POST' }); e.favorited = r.favorited; fav.textContent = r.favorited ? '♥ Favorit' : '♡ Favorisieren'; } catch (err) { msg.replaceChildren(h('span.err', err.message)); } } }, e.favorited ? '♥ Favorit' : '♡ Favorisieren');
  let body = '';
  const ta = h('textarea.inp', { rows: 3, maxlength: 2000, placeholder: 'Kommentar schreiben …', 'aria-label': 'Kommentar', oninput: (ev) => { body = ev.target.value; } });
  const send = h('button.btn.sm.pri', { onclick: async () => { if (!body.trim()) return; send.disabled = true; try { await api('/entities', { method: 'POST', body: { kind: 'comment', title: 'Kommentar', data: { target: e.id, body: body.trim() } } }); const fresh = await api('/entities/' + encodeURIComponent(e.id)); e.comments = fresh.comments; ta.value = ''; body = ''; drawComments(); } catch (err) { msg.replaceChildren(h('span.err', err.message)); } finally { send.disabled = false; } } }, 'Kommentieren');
  box.append(h('div.bar', { style: { marginBottom: '8px' } }, stars, fav), msg, comments, h('div', { style: { marginTop: '10px' } }, ta, h('div', { style: { marginTop: '8px' } }, send)));
  return box;
}
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'polaris';
function download(name, text) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
function notFound(root) { root.append(pageHead('Nicht gefunden', 'Diese Seite gibt es nicht (mehr).'), h('a.btn', { href: '#/' }, 'Zur Startseite')); }

function loginDialog() {
  let mode = 'login'; const f = { username: '', password: '', email: '' };
  const msg = h('div'); const ov = h('div.ov', { onclick: (e) => { if (e.target === ov) close(); } });
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const draw = () => {
    const form = h('form', { onsubmit: async (ev) => { ev.preventDefault(); msg.replaceChildren(); const b = form.querySelector('button[type=submit]'); b.disabled = true;
      try { const r = await api('/auth/' + (mode === 'login' ? 'login' : 'register'), { method: 'POST', auth: false, body: { username: f.username.trim(), password: f.password, email: mode === 'register' && f.email.trim() ? f.email.trim() : undefined, device: 'Community Hub' } }); setSession(r.token, r.user); close(); route(); }
      catch (e) { msg.replaceChildren(h('p.err', e.message)); b.disabled = false; } } },
      h('label.fld', h('span', 'Benutzername'), h('input.inp', { autocomplete: 'username', value: f.username, oninput: (e) => { f.username = e.target.value; }, required: true })),
      h('label.fld', h('span', 'Passwort'), h('input.inp', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', oninput: (e) => { f.password = e.target.value; }, required: true, minlength: mode === 'register' ? 8 : null })),
      mode === 'register' ? h('label.fld', h('span', 'E-Mail (optional)'), h('input.inp', { type: 'email', autocomplete: 'email', oninput: (e) => { f.email = e.target.value; } })) : null,
      msg, h('div.bar', { style: { marginBottom: 0 } }, h('button.btn.pri', { type: 'submit' }, mode === 'login' ? 'Anmelden' : 'Konto erstellen'), h('button.btn.ghost', { type: 'button', onclick: () => { mode = mode === 'login' ? 'register' : 'login'; draw(); } }, mode === 'login' ? 'Neues Konto' : 'Ich habe ein Konto')),
      h('p.sm.muted', { style: { marginTop: '12px', marginBottom: 0 } }, 'Dasselbe Konto wie im Polaris Client.'));
    ov.replaceChildren(h('div.mdl', { role: 'dialog', 'aria-modal': 'true', 'aria-label': mode === 'login' ? 'Anmelden' : 'Registrieren' }, h('h2', mode === 'login' ? 'Anmelden' : 'Registrieren'), form));
    setTimeout(() => { const i = ov.querySelector('input'); if (i) i.focus(); }, 0);
  };
  draw(); document.body.append(ov); document.addEventListener('keydown', onKey);
}

// ---------- themes, crosshairs, leaderboard ----------
function themeSwatch(c) {
  const keys = ['bg', 'panel', 'panel2', 'accent', 'text', 'ok', 'warn', 'danger'].filter((k) => isHex(c[k]));
  return h('div.sw', { style: { background: isHex(c.bg) ? c.bg : '#111316' } }, keys.map((k) => h('span', { title: k + ' ' + c[k], style: { background: c[k] } })));
}
const galleryOfType = (t) => ents('gallery').filter((e) => e.data.type === t);
P.themes = (root) => {
  root.append(pageHead('Themes', 'Farbschemata für den Polaris Client. Herunterladen und im Client unter Creator Gallery → Importieren übernehmen.'));
  const items = galleryOfType('theme').concat(ents('theme').map((e) => Object.assign({}, e, { data: Object.assign({ type: 'theme' }, e.data) })));
  gallery(root, items, { types: [], emptyText: 'Noch keine Themes veröffentlicht.' });
};
P.crosshairs = (root) => {
  root.append(pageHead('Crosshairs', 'Fadenkreuze der Community mit Live-Vorschau. Polaris zeigt sie als Overlay – das Spiel selbst wird dabei nicht verändert.'));
  const items = galleryOfType('crosshair');
  const shapes = [...new Set(items.map((e) => e.data.payload && e.data.payload.shape).filter(Boolean))];
  let shape = '';
  const holder = h('div');
  const draw = () => { holder.replaceChildren(); gallery(holder, shape ? items.filter((e) => e.data.payload && e.data.payload.shape === shape) : items, { types: [], emptyText: 'Noch keine Fadenkreuze veröffentlicht.' }); };
  if (shapes.length > 1) {
    const sel = h('select.inp', { 'aria-label': 'Form', style: { width: 'auto' }, onchange: (ev) => { shape = ev.target.value; draw(); } }, h('option', { value: '' }, 'Alle Formen'), shapes.map((x) => h('option', { value: x }, x)));
    root.append(h('div.bar', h('span.sm.muted', 'Form'), sel));
  }
  root.append(holder); draw();
};
P.leaderboard = async (root) => {
  root.append(pageHead('Leaderboard', 'Ranglisten der Polaris-Community: aktivste Creator und beliebteste Inhalte. Kirka.io-Spielstatistiken sind nicht enthalten, weil Kirka.io dafür keine öffentliche Schnittstelle anbietet.'));
  if (!S.live) {
    const items = ents('gallery').concat(ents('resource'), ents('theme'), ents('plugin')).filter((e) => e.favorites || e.rating || e.downloads)
      .sort((a, b) => (b.downloads || 0) - (a.downloads || 0) || (b.favorites || 0) - (a.favorites || 0) || (b.rating || 0) - (a.rating || 0)).slice(0, 25);
    root.append(h('div.box.hint', { style: { marginBottom: '16px' } }, 'Live-Ranglisten erscheinen, sobald der Hub mit einem öffentlichen Polaris-Backend verbunden ist. Angezeigt wird der veröffentlichte Stand.'));
    root.append(items.length ? lbContent(items) : empty('Noch keine Bewertungen oder Downloads.'));
    return;
  }
  let period = '30d';
  const out = h('div');
  const chips = h('div.chips', [['7d', '7 Tage'], ['30d', '30 Tage'], ['all', 'Gesamt']].map(([v, l]) => h('button', { class: v === period ? 'on' : null, 'aria-pressed': String(v === period), onclick: (ev) => { period = v; chips.querySelectorAll('button').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); ev.currentTarget.classList.add('on'); ev.currentTarget.setAttribute('aria-pressed', 'true'); load(); } }, l)));
  root.append(h('div.bar', chips), out);
  async function load() {
    out.replaceChildren(h('p.muted', 'Lädt …'));
    try {
      const lb = await api('/leaderboard?period=' + period, { auth: false });
      out.replaceChildren(
        h('div.facts.row3', h('div', h('span.muted', 'Aktive Konten'), h('b', String(lb.totals.users))), h('div', h('span.muted', 'Veröffentlichte Inhalte'), h('b', String(lb.totals.items))), h('div', h('span.muted', 'Downloads im Zeitraum'), h('b', String(lb.totals.downloads)))),
        h('div.cols2', { style: { marginTop: '22px' } },
          h('section', h('h2', 'Top Creator'), lb.creators.length ? h('table.tbl', h('thead', h('tr', h('th', '#'), h('th', 'Creator'), h('th', 'Inhalte'), h('th', 'Downloads'), h('th', 'Favoriten'), h('th', 'Punkte'))),
            h('tbody', lb.creators.map((r) => h('tr', h('td', String(r.rank)), h('td', h('a', { href: '#/u/' + encodeURIComponent(r.user.username) }, r.user.displayName)), h('td', String(r.items)), h('td', String(r.downloads)), h('td', String(r.favorites)), h('td', h('b', String(r.score))))))) : empty('Noch keine Creator im Zeitraum.'),
            h('p.sm.muted', 'Punkte = 5 je Inhalt + 1 je Download + 3 je Favorit + 2 × Durchschnittsbewertung. Private Profile werden nicht gelistet.')),
          h('section', h('h2', 'Beliebteste Inhalte'), lb.content.length ? lbContent(lb.content) : empty('Noch keine Inhalte.'))));
    } catch (e) { out.replaceChildren(h('p.err', e.message)); }
  }
  load();
};
function lbContent(items) {
  return h('div.list', items.map((e, i) => h('a.li', { href: '#/item/' + encodeURIComponent(e.id) }, h('span.rk', String(e.rank || i + 1)), h('div', h('div.lt', e.title), h('div.ld', [e.data.type || e.kind, e.author ? (e.author.displayName || e.author.username) : null].filter(Boolean).join(' · '))),
    h('span.lm', [e.periodDownloads != null ? '↓ ' + e.periodDownloads : e.downloads ? '↓ ' + e.downloads : null, e.favorites ? '♥ ' + e.favorites : null, e.rating ? '★ ' + e.rating : null].filter(Boolean).join('  ')))));
}
P.u = async (root, parts) => {
  const name = decodeURIComponent(parts[1] || '');
  if (!S.live) { root.append(pageHead('Profil', 'Profile sind verfügbar, sobald der Hub mit einem Live-Backend verbunden ist.')); return; }
  try {
    const u = await api('/users/' + encodeURIComponent(name));
    if (u.restricted) { root.append(pageHead(u.displayName || u.username, 'Dieses Profil ist nicht öffentlich.')); return; }
    root.append(pageHead(u.displayName || u.username, '@' + u.username + (u.role && u.role !== 'user' ? ' · ' + u.role : '') + ' · dabei seit ' + fmtDate(u.createdAt)));
    if (u.bio) root.append(mdEl(u.bio));
    const theirs = (u.submissions || []).filter((e) => ['gallery', 'resource', 'theme', 'plugin'].includes(e.kind));
    root.append(h('section.sec', { style: { marginTop: '22px' } }, h('h2', 'Inhalte (' + theirs.length + ')'), theirs.length ? h('div.grid', theirs.map(card)) : empty('Noch keine veröffentlichten Inhalte.')));
  } catch (e) { root.append(pageHead('Profil'), h('p.err', e.message)); }
};

// ---------- downloads ----------
function recordDownload(e) {
  if (S.live) api('/entities/' + encodeURIComponent(e.id) + '/download', { method: 'POST', body: { source: 'hub' } }).catch(() => { /* counting is best effort, the file is local */ });
  return true;
}

// ---------- account ----------
const isStaff = () => !!(S.user && ['moderator', 'admin'].includes(S.user.role));
function needLogin(root, what) {
  if (!S.live) { root.append(h('div.box.hint', what + ' ist verfügbar, sobald der Hub mit einem öffentlichen Polaris-Backend verbunden ist.')); return true; }
  if (!S.user) { root.append(h('div.box', h('p', 'Bitte melde dich an, um fortzufahren.'), h('button.btn.pri', { onclick: () => loginDialog() }, 'Anmelden oder registrieren'))); return true; }
  return false;
}
function tabs(root, list, cur, base) {
  root.append(h('div.tabs', { role: 'tablist' }, list.map(([id, l]) => h('a', { href: base + id, role: 'tab', 'aria-selected': String(id === cur), class: id === cur ? 'on' : null }, l))));
}
const STATUS_DE = { pending: ['in Prüfung', 'warn'], published: ['veröffentlicht', 'ok'], rejected: ['abgelehnt', 'bad'], removed: ['entfernt', 'bad'], open: ['offen', 'warn'], planned: ['geplant', 'acc'], done: ['erledigt', 'ok'] };
const stTag = (s) => { const m = STATUS_DE[s] || [s, '']; return h('span.tag' + (m[1] ? '.' + m[1] : ''), m[0]); };
P.account = async (root, parts) => {
  root.append(pageHead('Mein Konto', 'Profil, eigene Inhalte, Favoriten, Download-Verlauf und Sicherheit. Dasselbe Konto gilt im Polaris Client.'));
  if (needLogin(root, 'Das Konto')) return;
  const tab = parts[1] || 'profile';
  tabs(root, [['profile', 'Profil'], ['uploads', 'Meine Inhalte'], ['favorites', 'Favoriten'], ['downloads', 'Downloads'], ['security', 'Sicherheit']], tab, '#/account/');
  const box = h('div', { style: { marginTop: '18px' } }); root.append(box);
  try {
    if (tab === 'profile') {
      const me = await api('/me'); const f = { displayName: me.displayName || '', bio: me.bio || '', profile: (me.privacy || {}).profile || 'public' };
      const msg = h('div');
      box.append(h('form.box.narrow', { onsubmit: async (ev) => { ev.preventDefault(); msg.replaceChildren(); try { const r = await api('/me', { method: 'PUT', body: { displayName: f.displayName.trim(), bio: f.bio, privacy: { profile: f.profile } } }); S.user = Object.assign(S.user, r); renderAcct(); msg.replaceChildren(h('p.okm', 'Gespeichert.')); } catch (e) { msg.replaceChildren(h('p.err', e.message)); } } },
        h('label.fld', h('span', 'Benutzername'), h('input.inp', { value: me.username, disabled: true })),
        h('label.fld', h('span', 'Anzeigename'), h('input.inp', { value: f.displayName, maxlength: 40, required: true, oninput: (e) => { f.displayName = e.target.value; } })),
        h('label.fld', h('span', 'Über mich'), h('textarea.inp', { rows: 4, maxlength: 500, oninput: (e) => { f.bio = e.target.value; } }, f.bio)),
        h('label.fld', h('span', 'Profil-Sichtbarkeit'), h('select.inp', { onchange: (e) => { f.profile = e.target.value; } }, [['public', 'Öffentlich (auch im Leaderboard)'], ['friends', 'Nur Freunde'], ['private', 'Privat']].map(([v, l]) => h('option', { value: v, selected: v === f.profile ? true : null }, l)))),
        msg, h('button.btn.pri', { type: 'submit' }, 'Speichern'), h('a.btn.ghost', { href: '#/u/' + encodeURIComponent(me.username), style: { marginLeft: '8px' } }, 'Öffentliches Profil ansehen')));
    }
    if (tab === 'uploads') {
      const mine = (await api('/me/entities')).filter((e) => e.kind !== 'comment');
      box.append(h('div.bar', h('a.btn.pri.sm', { href: '#/submit' }, '+ Neuen Inhalt einreichen')));
      box.append(mine.length ? h('div.list', mine.map((e) => h('div.li', h('div', h('div.lt', e.status === 'published' ? h('a', { href: '#/item/' + encodeURIComponent(e.id) }, e.title) : e.title), h('div.ld', (e.data.type || e.kind) + ' · ' + fmtDate(e.createdAt) + (e.downloads ? ' · ↓ ' + e.downloads : ''))), h('span.lm', stTag(e.status),
        h('button.btn.sm.ghost', { style: { marginLeft: '8px' }, onclick: async (ev) => { if (!confirm('„' + e.title + '“ wirklich entfernen?')) return; ev.currentTarget.disabled = true; try { await api('/entities/' + encodeURIComponent(e.id), { method: 'DELETE' }); route(); } catch (x) { alert(x.message); } } }, 'Entfernen'))))) : empty('Du hast noch nichts eingereicht.'));
    }
    if (tab === 'favorites') { const fav = await api('/me/favorites'); box.append(fav.length ? h('div.grid', fav.map(card)) : empty('Noch keine Favoriten. Öffne einen Eintrag und klicke auf „Favorisieren“.')); }
    if (tab === 'downloads') {
      const dl = await api('/me/downloads');
      box.append(h('div.bar', h('span.sm.muted', dl.length + ' Einträge – pro Inhalt und Tag wird ein Download gespeichert.'), dl.length ? h('button.btn.sm.ghost', { onclick: async () => { if (!confirm('Download-Verlauf löschen?')) return; await api('/me/downloads', { method: 'DELETE' }); route(); } }, 'Verlauf löschen') : null));
      box.append(dl.length ? h('div.list', dl.map((e) => h('a.li', { href: '#/item/' + encodeURIComponent(e.id) }, h('div', h('div.lt', e.title), h('div.ld', (e.data.type || e.kind) + ' · über ' + (e.source === 'client' ? 'Polaris Client' : 'Community Hub'))), h('span.lm', fmtDate(e.downloadedAt))))) : empty('Noch keine Downloads.'));
    }
    if (tab === 'security') {
      const pw = { cur: '', next: '', rep: '' }; const msg = h('div');
      box.append(h('form.box.narrow', { onsubmit: async (ev) => { ev.preventDefault(); msg.replaceChildren(); if (pw.next !== pw.rep) return msg.replaceChildren(h('p.err', 'Die neuen Passwörter stimmen nicht überein.')); try { await api('/me', { method: 'PUT', body: { currentPassword: pw.cur, newPassword: pw.next } }); ev.target.reset(); msg.replaceChildren(h('p.okm', 'Passwort geändert. Andere Geräte wurden abgemeldet.')); } catch (e) { msg.replaceChildren(h('p.err', e.message)); } } },
        h('h3', 'Passwort ändern'),
        h('label.fld', h('span', 'Aktuelles Passwort'), h('input.inp', { type: 'password', autocomplete: 'current-password', required: true, oninput: (e) => { pw.cur = e.target.value; } })),
        h('label.fld', h('span', 'Neues Passwort (mind. 8 Zeichen)'), h('input.inp', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true, oninput: (e) => { pw.next = e.target.value; } })),
        h('label.fld', h('span', 'Neues Passwort wiederholen'), h('input.inp', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true, oninput: (e) => { pw.rep = e.target.value; } })),
        msg, h('button.btn.pri', { type: 'submit' }, 'Passwort ändern')));
      const sessions = await api('/me/sessions');
      box.append(h('section.box.narrow', { style: { marginTop: '16px' } }, h('h3', 'Angemeldete Geräte'), h('div.list', sessions.map((x) => h('div.li', h('div', h('div.lt', x.device + (x.current ? ' (dieses Gerät)' : '')), h('div.ld', 'zuletzt aktiv ' + fmtDate(x.last_seen))),
        x.current ? null : h('button.btn.sm.ghost.lm', { onclick: async () => { await api('/me/sessions/' + encodeURIComponent(x.id), { method: 'DELETE' }); route(); } }, 'Abmelden'))))));
      box.append(h('section.box.narrow', { style: { marginTop: '16px' } }, h('h3', 'Meine Daten'), h('p.sm.muted', 'Exportiere alle über dich gespeicherten Daten als JSON oder lösche dein Konto dauerhaft.'),
        h('div.bar', h('button.btn.sm', { onclick: async () => { const d = await api('/me/export'); download('polaris-konto-export.json', JSON.stringify(d, null, 2)); } }, 'Daten exportieren'),
          h('button.btn.sm.ghost.danger', { onclick: async () => { const p = prompt('Konto endgültig löschen? Zur Bestätigung Passwort eingeben:'); if (!p) return; try { await api('/me', { method: 'DELETE', body: { password: p } }); setSession(null); location.hash = '#/'; } catch (e) { alert(e.message); } } }, 'Konto löschen'))));
    }
  } catch (e) { box.append(h('p.err', e.message)); }
};

// ---------- submit (uploads are validated here and again on the server) ----------
const MAX_IMG = 2 * 1024 * 1024;
function readImage(file) {
  return new Promise((res, rej) => {
    if (!file) return rej(new Error('Keine Datei gewählt'));
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return rej(new Error('Nur PNG, JPG oder WebP erlaubt'));
    if (file.size > MAX_IMG) return rej(new Error('Datei ist größer als 2 MB'));
    const r = new FileReader(); r.onerror = () => rej(new Error('Datei konnte nicht gelesen werden'));
    r.onload = () => { const img = new Image(); img.onload = () => res({ dataUrl: r.result, w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => rej(new Error('Kein gültiges Bild')); img.src = r.result; };
    r.readAsDataURL(file);
  });
}
P.submit = (root) => {
  root.append(pageHead('Inhalt einreichen', 'Skins, Fadenkreuze, Themes und HUD-Layouts teilen. Jede Einreichung wird vor der Veröffentlichung von der Moderation geprüft.'));
  if (needLogin(root, 'Das Einreichen')) return;
  const f = { type: 'skin', title: '', description: '', tags: '', license: 'CC BY 4.0', image: null, xh: { shape: 'cross-dot', color: '#5aa9e6', size: 8, thickness: 2, gap: 4, outline: true, outlineColor: '#000000', outlineWidth: 1, opacity: 1 },
    theme: { bg: '#111316', panel: '#16191d', panel2: '#1c2026', border: '#262b33', text: '#d9dde3', muted: '#8a929e', accent: '#5aa9e6', ok: '#5cb87a', warn: '#d9a23f', danger: '#d9534f' }, json: '' };
  const msg = h('div'); const specific = h('div'); const preview = h('div.pv');
  const typeSel = h('select.inp', { onchange: (e) => { f.type = e.target.value; drawSpecific(); } }, [['skin', 'Skin (PNG 64×64 oder 128×128)'], ['crosshair', 'Fadenkreuz'], ['theme', 'Theme'], ['hud', 'HUD-Layout (JSON)'], ['background', 'Hintergrund (Bild)']].map(([v, l]) => h('option', { value: v }, l)));
  function drawSpecific() {
    specific.replaceChildren(); preview.replaceChildren();
    if (f.type === 'skin' || f.type === 'background') {
      const info = h('p.sm.muted', f.type === 'skin' ? 'Quadratisches PNG mit 64×64 oder 128×128 Pixeln, max. 2 MB.' : 'PNG, JPG oder WebP, max. 2 MB.');
      specific.append(h('label.fld', h('span', 'Datei'), h('input.inp', { type: 'file', accept: f.type === 'skin' ? 'image/png' : 'image/png,image/jpeg,image/webp', onchange: async (e) => {
        msg.replaceChildren(); f.image = null; preview.replaceChildren();
        try { const im = await readImage(e.target.files[0]); if (f.type === 'skin' && !((im.w === 64 && im.h === 64) || (im.w === 128 && im.h === 128))) throw new Error('Skin muss 64×64 oder 128×128 Pixel groß sein (ist ' + im.w + '×' + im.h + ')');
          f.image = im.dataUrl; preview.append(h('img', { src: im.dataUrl, alt: 'Vorschau', class: f.type === 'skin' ? 'pix' : null }), h('span.sm.muted', im.w + '×' + im.h + ' px')); } catch (x) { e.target.value = ''; msg.replaceChildren(h('p.err', x.message)); } } })), info);
    }
    if (f.type === 'crosshair') {
      const upd = () => preview.replaceChildren(h('div.xh.big', { html: crosshairSvg(f.xh) }));
      const num = (k, l, min, max) => h('label.fld', h('span', l + ' (' + min + '–' + max + ')'), h('input.inp', { type: 'number', min, max, value: f.xh[k], oninput: (e) => { f.xh[k] = Math.min(max, Math.max(min, Number(e.target.value) || 0)); upd(); } }));
      specific.append(h('div.g2', h('label.fld', h('span', 'Form'), h('select.inp', { onchange: (e) => { f.xh.shape = e.target.value; upd(); } }, ['cross', 'cross-dot', 't', 'dot', 'circle', 'circle-dot'].map((x) => h('option', { value: x, selected: x === f.xh.shape ? true : null }, x)))),
        h('label.fld', h('span', 'Farbe'), h('input.inp', { type: 'color', value: f.xh.color, oninput: (e) => { f.xh.color = e.target.value; upd(); } })),
        num('size', 'Länge', 1, 40), num('thickness', 'Stärke', 1, 12), num('gap', 'Abstand', 0, 40), num('outlineWidth', 'Rand', 0, 6),
        h('label.fld', h('span', 'Randfarbe'), h('input.inp', { type: 'color', value: f.xh.outlineColor, oninput: (e) => { f.xh.outlineColor = e.target.value; upd(); } })),
        h('label.fld.chk', h('input', { type: 'checkbox', checked: true, onchange: (e) => { f.xh.outline = e.target.checked; upd(); } }), h('span', 'Rand anzeigen'))));
      upd();
    }
    if (f.type === 'theme') {
      const upd = () => preview.replaceChildren(themeSwatch(f.theme));
      specific.append(h('div.g2', Object.keys(f.theme).map((k) => h('label.fld', h('span', k), h('input.inp', { type: 'color', value: f.theme[k], oninput: (e) => { f.theme[k] = e.target.value; upd(); } })))));
      upd();
    }
    if (f.type === 'hud') specific.append(h('label.fld', h('span', 'HUD-Layout als JSON (aus dem Client: HUD Editor → Exportieren)'), h('textarea.inp.mono', { rows: 8, oninput: (e) => { f.json = e.target.value; } })));
  }
  function payload() {
    if (f.type === 'crosshair') return Object.assign({}, f.xh, { enabled: true });
    if (f.type === 'theme') return { name: f.title.trim(), colors: Object.assign({}, f.theme) };
    if (f.type === 'hud') { let j; try { j = JSON.parse(f.json); } catch (_) { throw new Error('HUD-Layout ist kein gültiges JSON'); } if (!j || typeof j !== 'object' || typeof (j.widgets || j.payload && j.payload.widgets) !== 'object') throw new Error('HUD-Layout braucht ein Objekt „widgets“'); return j.widgets ? { widgets: j.widgets } : j.payload; }
    return undefined;
  }
  const form = h('form.box', { onsubmit: async (ev) => {
    ev.preventDefault(); msg.replaceChildren(); const b = form.querySelector('button[type=submit]');
    try {
      if ((f.type === 'skin' || f.type === 'background') && !f.image) throw new Error('Bitte eine gültige Bilddatei wählen');
      const data = { type: f.type, description: f.description.trim(), license: f.license, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8) };
      const pl = payload(); if (pl) data.payload = pl;
      if (f.image) data.preview = f.image;
      b.disabled = true;
      const r = await api('/entities', { method: 'POST', body: { kind: 'gallery', title: f.title.trim(), data } });
      form.replaceChildren(h('p.okm', '„' + r.title + '“ wurde eingereicht (' + (STATUS_DE[r.status] || [r.status])[0] + ').'), h('div.bar', h('a.btn.pri', { href: '#/account/uploads' }, 'Meine Inhalte'), h('button.btn', { type: 'button', onclick: () => route() }, 'Weiteren Inhalt einreichen')));
    } catch (e) { b.disabled = false; msg.replaceChildren(h('p.err', e.message)); }
  } },
  h('div.det', h('div',
    h('label.fld', h('span', 'Art'), typeSel),
    h('label.fld', h('span', 'Titel'), h('input.inp', { required: true, minlength: 2, maxlength: 120, oninput: (e) => { f.title = e.target.value; } })),
    h('label.fld', h('span', 'Beschreibung'), h('textarea.inp', { rows: 3, maxlength: 2000, oninput: (e) => { f.description = e.target.value; } })),
    h('div.g2', h('label.fld', h('span', 'Tags (mit Komma getrennt)'), h('input.inp', { maxlength: 200, oninput: (e) => { f.tags = e.target.value; } })),
      h('label.fld', h('span', 'Lizenz'), h('select.inp', { onchange: (e) => { f.license = e.target.value; } }, ['CC BY 4.0', 'CC BY-SA 4.0', 'CC0', 'Alle Rechte vorbehalten'].map((x) => h('option', { value: x }, x))))),
    specific),
  h('aside', h('div.sm.muted', 'Vorschau'), preview, h('p.sm.muted', { style: { marginTop: '12px' } }, 'Nur eigene oder frei lizenzierte Inhalte. Keine Cheats oder Inhalte, die das Spiel manipulieren.'))),
  msg, h('button.btn.pri', { type: 'submit' }, 'Zur Prüfung einreichen'));
  root.append(form); drawSpecific();
};

// ---------- moderation (moderator/admin – every action is checked by the server) ----------
P.mod = async (root, parts) => {
  root.append(pageHead('Moderation', 'Einreichungen prüfen, Meldungen bearbeiten und – als Admin – Konten und Ankündigungen verwalten. Rollen vergibt ausschließlich der Owner.'));
  if (needLogin(root, 'Die Moderation')) return;
  if (!isStaff()) { root.append(h('p.err', 'Dein Konto hat keine Moderationsrechte.')); return; }
  const admin = S.user.role === 'admin';
  const tab = parts[1] || 'queue';
  tabs(root, [['queue', 'Warteschlange'], ['reports', 'Meldungen']].concat(admin ? [['users', 'Nutzer'], ['announce', 'Ankündigung'], ['log', 'Protokoll']] : []), tab, '#/mod/');
  const box = h('div', { style: { marginTop: '18px' } }); root.append(box);
  const act = async (fn) => { try { await fn(); route(); } catch (e) { alert(e.message); } };
  try {
    if (tab === 'queue' || tab === 'reports') {
      const q = await api('/mod/queue');
      box.append(h('div.facts.row3', { style: { marginBottom: '18px' } }, h('div', h('span.muted', 'Offene Einreichungen'), h('b', String(q.stats.pending))), h('div', h('span.muted', 'Offene Meldungen'), h('b', String(q.stats.reports))), h('div', h('span.muted', 'Downloads gesamt'), h('b', String(q.stats.downloads)))));
      if (tab === 'queue') box.append(q.pending.length ? h('div.list', q.pending.map((e) => h('div.li.mod', thumb(e), h('div', h('div.lt', e.title), h('div.ld', (e.data.type || e.kind) + ' · von ' + (e.author ? e.author.username : 'Gast') + ' · ' + fmtDate(e.createdAt)), e.data.description ? h('div.ld', String(e.data.description).slice(0, 200)) : null),
        h('span.lm', h('button.btn.sm.pri', { onclick: () => act(() => api('/mod/entities/' + encodeURIComponent(e.id), { method: 'PUT', body: { status: 'published' } })) }, 'Freigeben'),
          h('button.btn.sm.ghost', { style: { marginLeft: '6px' }, onclick: () => { const reason = prompt('Begründung für die Ablehnung (wird dem Creator angezeigt):'); if (reason === null) return; act(() => api('/mod/entities/' + encodeURIComponent(e.id), { method: 'PUT', body: { status: 'rejected', reason } })); } }, 'Ablehnen'))))) : empty('Keine offenen Einreichungen.'));
      if (tab === 'reports') box.append(q.reports.length ? h('div.list', q.reports.map((r) => h('div.li', h('div', h('div.lt', r.target_type + ' · ' + r.target_id), h('div.ld', r.reason), h('div.ld', fmtDate(r.created_at))),
        h('span.lm', h('button.btn.sm', { onclick: () => act(() => api('/mod/reports/' + encodeURIComponent(r.id), { method: 'PUT', body: { status: 'resolved', removeTarget: true, resolution: 'Inhalt entfernt' } })) }, 'Inhalt entfernen'),
          h('button.btn.sm.ghost', { style: { marginLeft: '6px' }, onclick: () => act(() => api('/mod/reports/' + encodeURIComponent(r.id), { method: 'PUT', body: { status: 'rejected', resolution: 'Kein Verstoß' } })) }, 'Kein Verstoß'))))) : empty('Keine offenen Meldungen.'));
    }
    if (tab === 'users' && admin) {
      let q = ''; const list = h('div');
      const load = async () => { const us = await api('/mod/users?q=' + encodeURIComponent(q)); list.replaceChildren(us.length ? h('table.tbl', h('thead', h('tr', h('th', 'Nutzer'), h('th', 'Rolle'), h('th', 'Status'), h('th', 'Inhalte'), h('th', ''))), h('tbody', us.map((u) => h('tr', h('td', h('b', u.username), h('div.sm.muted', 'seit ' + fmtDate(u.created_at))),
        h('td', u.role === 'admin' ? 'admin' : h('select.inp.sm', { 'aria-label': 'Rolle von ' + u.username, onchange: (e) => act(() => api('/mod/users/' + encodeURIComponent(u.id), { method: 'PUT', body: { role: e.target.value } })) }, ['user', 'creator', 'moderator'].map((r) => h('option', { value: r, selected: r === u.role ? true : null }, r)))),
        h('td', stTag(u.status === 'active' ? 'published' : 'removed')), h('td', String(u.uploads)),
        h('td', u.role === 'admin' || u.id === S.user.id ? null : h('button.btn.sm.ghost', { onclick: () => act(() => api('/mod/users/' + encodeURIComponent(u.id), { method: 'PUT', body: { status: u.status === 'active' ? 'suspended' : 'active' } })) }, u.status === 'active' ? 'Sperren' : 'Entsperren')))))) : empty('Keine Nutzer gefunden.')); };
      box.append(h('div.bar', h('input.inp', { type: 'search', placeholder: 'Nutzer suchen …', 'aria-label': 'Nutzer suchen', oninput: (e) => { q = e.target.value.trim(); clearTimeout(load.t); load.t = setTimeout(load, 250); } })), list);
      await load();
    }
    if (tab === 'announce' && admin) {
      const f = { title: '', body: '', level: 'info', kind: 'announcement' }; const msg = h('div');
      box.append(h('form.box.narrow', { onsubmit: async (ev) => { ev.preventDefault(); try { await api('/mod/announcements', { method: 'POST', body: f }); msg.replaceChildren(h('p.okm', 'Veröffentlicht.')); ev.target.reset(); } catch (e) { msg.replaceChildren(h('p.err', e.message)); } } },
        h('label.fld', h('span', 'Art'), h('select.inp', { onchange: (e) => { f.kind = e.target.value; } }, h('option', { value: 'announcement' }, 'Ankündigung (Banner)'), h('option', { value: 'news' }, 'News-Beitrag'))),
        h('label.fld', h('span', 'Stufe'), h('select.inp', { onchange: (e) => { f.level = e.target.value; } }, [['info', 'Info'], ['ok', 'Erfolg'], ['warn', 'Wartung / Warnung'], ['danger', 'Störung']].map(([v, l]) => h('option', { value: v }, l)))),
        h('label.fld', h('span', 'Titel'), h('input.inp', { required: true, minlength: 2, maxlength: 120, oninput: (e) => { f.title = e.target.value; } })),
        h('label.fld', h('span', 'Text (Markdown)'), h('textarea.inp', { rows: 5, required: true, maxlength: 4000, oninput: (e) => { f.body = e.target.value; } })),
        msg, h('button.btn.pri', { type: 'submit' }, 'Veröffentlichen')));
    }
    if (tab === 'log' && admin) {
      const log = await api('/mod/audit');
      box.append(log.length ? h('table.tbl', h('thead', h('tr', h('th', 'Zeit'), h('th', 'Wer'), h('th', 'Aktion'), h('th', 'Ziel'))), h('tbody', log.map((a) => h('tr', h('td.sm', new Date(a.created_at).toLocaleString('de-DE')), h('td', a.actor.replace(/^user:/, '')), h('td.mono', a.action), h('td.mono.sm', a.target || ''))))) : empty('Noch keine Moderationsaktionen.'));
    }
  } catch (e) { box.append(h('p.err', e.message)); }
};

// ---------- router ----------
async function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  const id = parts[0] || 'home';
  renderNav(parts);
  const nav = document.getElementById('nav'); nav.classList.remove('open'); document.getElementById('menu').setAttribute('aria-expanded', 'false');
  nav.querySelectorAll('details').forEach((d) => { d.open = false; });
  const main = document.getElementById('main'); const root = h('div');
  main.replaceChildren(root);
  try {
    if (!P[id]) notFound(root);
    else if (!['home', 'item', 'p', 'account', 'mod', 'u'].includes(id) && hidden(id)) root.append(pageHead('Nicht verfügbar', 'Diese Seite ist derzeit deaktiviert.'), h('a.btn', { href: '#/' }, 'Zur Startseite'));
    else await P[id](root, parts);
  } catch (e) { console.error(e); root.append(h('p.err', 'Diese Seite konnte nicht angezeigt werden: ' + e.message)); }
  window.scrollTo(0, 0);
}

async function boot() {
  try {
    const r = await fetch(SNAP, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    S.data = await r.json();
    if (S.data.format !== 1) throw new Error('unbekanntes Datenformat');
  } catch (e) {
    S.data = { format: 1, site: { title: 'Polaris Community Hub', site: {}, pages: [] }, features: {}, entities: {}, releases: [] };
    S.liveError = 'Die Inhalte konnten nicht geladen werden (' + e.message + ').';
  }
  S.data.site = S.data.site || { site: {} }; S.data.site.site = S.data.site.site || {}; S.data.entities = S.data.entities || {};
  const apiUrl = safeUrl(site().apiUrl);
  if (apiUrl) await goLive(apiUrl);
  if (isHex(site().accent)) document.documentElement.style.setProperty('--accent', site().accent);
  document.getElementById('menu').addEventListener('click', (e) => { const n = document.getElementById('nav'); const open = n.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.nav details')) document.querySelectorAll('.nav details[open]').forEach((d) => { if (matchMedia('(min-width: 901px)').matches) d.open = false; }); });
  renderAcct(); renderNotices(); renderFoot();
  window.addEventListener('hashchange', route);
  await route();
  document.documentElement.dataset.ready = '1';
}
boot();
