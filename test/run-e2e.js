// End-to-end test for the Community Hub: snapshot mode (as on GitHub Pages) and live mode against a real backend.
// Run: node test/run-e2e.js   (env CHROME=/path/to/chrome, HUB_URL=https://… to test a deployed copy in snapshot mode)
const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os');
const ROOT = path.join(__dirname, '..');
const req = (m) => { for (const p of [m, path.join(ROOT, '..', 'polaris-client', 'node_modules', m), path.join(ROOT, '..', 'polaris-owner', 'node_modules', m)]) { try { return require(p); } catch (_) { /* next */ } } throw new Error(m + ' nicht gefunden'); };
const { chromium } = req('playwright-core');
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const findChrome = () => { if (process.env.CHROME) return process.env.CHROME; const b = path.join(os.homedir(), '.cache', 'ms-playwright'); for (const d of fs.readdirSync(b).filter((x) => /^chromium-\d+/.test(x))) { const p = path.join(b, d, 'chrome-linux64', 'chrome'); if (fs.existsSync(p)) return p; const q = path.join(b, d, 'chrome-linux', 'chrome'); if (fs.existsSync(q)) return q; } throw new Error('Chromium nicht gefunden (CHROME setzen)'); };

let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' – ' + info : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
function staticServer() {
  const s = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'index.html' : u); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  return new Promise((res) => s.listen(0, '127.0.0.1', () => res(s)));
}
const PAGES = ['', 'about', 'features', 'news', 'changelog', 'community', 'skins', 'themes', 'crosshairs', 'leaderboard', 'submit', 'account', 'resources', 'plugins', 'docs', 'guides', 'support', 'bugs', 'suggestions', 'contact', 'downloads', 'p/about'];

(async () => {
  const srv = HUB() ? null : await staticServer();
  function HUB() { return process.env.HUB_URL; }
  const base = HUB() || 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  const errors = [];
  const newPage = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); }); return p; };

  console.log('Snapshot-Modus (' + base + ')');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await newPage(ctx);
  await pg.goto(base + '#/'); await pg.waitForSelector('html[data-ready="1"]', { timeout: 15000 });
  ok(/Polaris/.test(await pg.locator('h1').first().innerText()), 'Startseite lädt mit Titel');
  ok(await pg.locator('.nav details').count() === 3, 'Navigation mit Gruppen');
  for (const p of PAGES) {
    await pg.goto(base + '#/' + p); await pg.waitForTimeout(150);
    const t = await pg.locator('main h1').first().innerText().catch(() => '');
    ok(t && !/Nicht gefunden/.test(t), 'Seite #/' + p + ' rendert („' + t + '“)');
    if (process.env.HUB_SHOTS !== '0') await pg.screenshot({ path: path.join(SHOTS, 'd-' + (p.replace('/', '_') || 'home') + '.png'), fullPage: true });
  }
  await pg.goto(base + '#/features'); ok(await pg.locator('.feat').count() >= 20, 'Features aus Snapshot (' + await pg.locator('.feat').count() + ')');
  await pg.goto(base + '#/docs'); ok(await pg.locator('.toc a').count() >= 3, 'Dokumentation mit Inhaltsverzeichnis');
  await pg.locator('.toc a').nth(1).click(); await pg.waitForTimeout(100); ok(/#\/docs\/e_/.test(pg.url()) && await pg.locator('.toc a.on').count() === 1, 'Dokument wechseln');
  await pg.goto(base + '#/skins'); const cards = await pg.locator('.grid .card').count(); ok(cards >= 2, 'Skin Gallery zeigt Einträge (' + cards + ')');
  ok(await pg.locator('.card .xh svg').count() >= 1, 'Crosshair-Vorschau gerendert');
  await pg.fill('.bar input', 'zzzz-nichts'); ok(/Keine Treffer/.test(await pg.locator('.grid').innerText()), 'Galerie-Suche filtert');
  await pg.goto(base + '#/plugins'); await pg.locator('.grid .card').first().click(); await pg.waitForSelector('pre');
  ok(/polaris\.notify/.test(await pg.locator('pre').innerText()), 'Plugin-Detail zeigt Quellcode');
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 5000 }).catch(() => null), pg.getByText('Plugin herunterladen').click()]);
  ok(dl && /\.plugin\.json$/.test(dl.suggestedFilename()), 'Plugin-Download als Datei');
  ok(/öffentlichen Polaris-Backend/.test(await pg.locator('aside').innerText()), 'Ohne Backend: ehrlicher Hinweis statt Bewertung');
  await pg.goto(base + '#/bugs'); ok(/erreichbares Polaris-Backend/.test(await pg.locator('main').innerText()), 'Bug Reports ohne Backend: Hinweis');
  await pg.goto(base + '#/crosshairs'); ok(await pg.locator('.grid .card .xh svg').count() >= 1, 'Crosshairs-Seite mit Vorschau');
  await pg.goto(base + '#/leaderboard'); ok(/öffentlichen Polaris-Backend/.test(await pg.locator('main').innerText()), 'Leaderboard ohne Backend: ehrlicher Hinweis');
  await pg.goto(base + '#/submit'); ok(/öffentlichen Polaris-Backend/.test(await pg.locator('main').innerText()), 'Einreichen ohne Backend: Hinweis');
  await pg.goto(base + '#/gibtsnicht'); ok(/Nicht gefunden/.test(await pg.locator('main h1').innerText()), '404-Seite');
  await pg.goto(base + '#/downloads'); ok(/chmod \+x/.test(await pg.locator('main').innerText()), 'Downloads mit Installationshinweis');

  const m = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
  const mp = await newPage(m);
  for (const p of ['', 'docs', 'skins', 'themes', 'crosshairs', 'leaderboard', 'bugs', 'downloads']) {
    await mp.goto(base + '#/' + p); await mp.waitForSelector('html[data-ready="1"]'); await mp.waitForTimeout(150);
    const ov = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(ov <= 0, 'Mobil ohne horizontales Scrollen: #/' + p, 'overflow ' + ov + 'px');
    await mp.screenshot({ path: path.join(SHOTS, 'm-' + (p || 'home') + '.png'), fullPage: true });
  }
  await mp.click('#menu'); ok(await mp.locator('#nav.open').isVisible(), 'Mobiles Menü öffnet');
  await mp.locator('#nav summary', { hasText: 'Hilfe' }).click(); await mp.screenshot({ path: path.join(SHOTS, 'm-menu.png') });
  await mp.locator('#nav a', { hasText: 'Support' }).click(); await mp.waitForTimeout(150);
  ok(/#\/support/.test(mp.url()) && !(await mp.locator('#nav.open').count()), 'Navigation mobil + Menü schließt');

  if (!HUB()) {
    console.log('Live-Modus (echtes Backend hinter https-Route)');
    const { createServer } = require('../../polaris-backend/src/server.js');
    const be = await createServer({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hub-e2e-')) });
    const addr = await be.listen(0, '127.0.0.1'); const local = 'http://127.0.0.1:' + addr.port;
    const API = 'https://api.polaris.test';
    const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content.json'), 'utf8'));
    snap.site.site.apiUrl = API;
    be.db.run("INSERT INTO settings (key, value) VALUES ('site', ?)", [JSON.stringify(Object.assign({}, be.getSettings().site, { hidden: ['contact'] }))]);
    const lc = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await lc.route('**/data/content.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(snap) }));
    await lc.route(API + '/**', async (r) => { const u = r.request().url().replace(API, local); const res = await fetch(u, { method: r.request().method(), headers: Object.fromEntries(Object.entries(r.request().headers()).filter(([k]) => ['content-type', 'authorization'].includes(k))), body: r.request().postData() || undefined });
      r.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json', 'access-control-allow-origin': '*' }, body: Buffer.from(await res.arrayBuffer()) }); });
    const lp = await newPage(lc);
    await lp.goto(base + '#/'); await lp.waitForSelector('html[data-ready="1"]');
    ok(/Live-Daten/.test(await lp.locator('footer').innerText()), 'Live-Backend erkannt');
    ok(!(await lp.locator('#nav a', { hasText: 'Contact' }).count()), 'Ausgeblendete Seite fehlt in Navigation');
    await lp.goto(base + '#/contact'); ok(/Nicht verfügbar/.test(await lp.locator('main h1').innerText()), 'Ausgeblendete Seite gesperrt');
    await lp.goto(base + '#/bugs');
    await lp.fill('form input >> nth=0', 'Overlay flackert'); await lp.fill('form textarea >> nth=0', 'Das FPS-Overlay flackert nach Alt+Tab.');
    await lp.click('form button[type=submit]'); await lp.waitForSelector('.okm', { timeout: 8000 }).catch(() => {});
    ok(/übermittelt/.test(await lp.locator('main').innerText()) && /Overlay flackert/.test(await lp.locator('.list').innerText()), 'Bug Report als Gast gesendet und gelistet');
    ok(be.db.all("SELECT * FROM entities WHERE kind='bug'").length === 1, 'Bug Report im Backend gespeichert');
    await lp.click('#acct button'); await lp.click('.mdl button.ghost');
    await lp.fill('.mdl input >> nth=0', 'hubtester'); await lp.fill('.mdl input >> nth=1', 'geheim123!'); await lp.click('.mdl button[type=submit]');
    await lp.waitForSelector('#acct .sm', { timeout: 8000 }).catch(() => {});
    ok(/hubtester/.test(await lp.locator('#acct').innerText()), 'Registrierung + Anmeldung');
    await lp.goto(base + '#/skins'); await lp.locator('.grid .card').first().click(); await lp.waitForSelector('.stars');
    await lp.locator('.stars button').nth(3).click(); await lp.waitForSelector('.okm');
    ok(be.db.get('SELECT value FROM ratings').value === 4, 'Bewertung gespeichert');
    await lp.getByText('♡ Favorisieren').click(); await lp.waitForTimeout(300);
    ok(be.db.all('SELECT * FROM favorites').length === 1, 'Favorit gespeichert');
    await lp.fill('aside textarea', 'Sehr sauberes Fadenkreuz.'); await lp.getByText('Kommentieren', { exact: true }).click(); await lp.waitForSelector('.cmt', { timeout: 8000 }).catch(() => {});
    ok(/sauberes Fadenkreuz/.test(await lp.locator('aside').innerText()), 'Kommentar erscheint', (await lp.locator('aside').innerText()).slice(-300));
    await lp.screenshot({ path: path.join(SHOTS, 'live-item.png'), fullPage: true });
    // download is recorded and appears in the history
    await lp.goto(base + '#/crosshairs'); await lp.locator('.grid .card').first().click(); await lp.waitForSelector('aside');
    const [xdl] = await Promise.all([lp.waitForEvent('download', { timeout: 5000 }).catch(() => null), lp.getByText('Als Datei herunterladen').click()]);
    ok(xdl && /\.polaris\.json$/.test(xdl.suggestedFilename()), 'Crosshair-Download als Datei');
    await lp.waitForTimeout(400); ok(be.db.all('SELECT * FROM downloads').length === 1, 'Download im Backend gezählt');
    await lp.goto(base + '#/account/downloads'); await lp.waitForSelector('.list .li', { timeout: 8000 }).catch(() => {});
    ok(/Classic Crosshair/.test(await lp.locator('main').innerText()), 'Download-Verlauf im Konto');
    await lp.goto(base + '#/account/favorites'); await lp.waitForSelector('.grid .card', { timeout: 8000 }).catch(() => {});
    ok(await lp.locator('.grid .card').count() === 1, 'Favoriten im Konto');
    // profile edit
    await lp.goto(base + '#/account/profile'); await lp.waitForSelector('form textarea');
    await lp.fill('form input >> nth=1', 'Hub Tester'); await lp.fill('form textarea', 'Ich teste den Hub.'); await lp.click('form button[type=submit]'); await lp.waitForSelector('.okm', { timeout: 8000 }).catch(() => {});
    ok(be.db.get("SELECT display_name, bio FROM users WHERE username='hubtester'").bio === 'Ich teste den Hub.', 'Profil gespeichert');
    // submit a crosshair (validated) and a skin with wrong size (rejected client-side)
    await lp.goto(base + '#/submit'); await lp.waitForSelector('form select');
    await lp.selectOption('form select >> nth=0', 'skin');
    const bigPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR42mP8z8DwnwEJMMIAAPgRA/2Wr+CDAAAAAElFTkSuQmCC', 'base64');
    await lp.setInputFiles('form input[type=file]', { name: 'tiny.png', mimeType: 'image/png', buffer: bigPng }); await lp.waitForTimeout(300);
    ok(/64×64 oder 128×128/.test(await lp.locator('main').innerText()), 'Skin mit falscher Größe wird abgelehnt');
    await lp.selectOption('form select >> nth=0', 'crosshair');
    await lp.fill('form input >> nth=0', 'Hub Kreuz'); await lp.fill('form textarea >> nth=0', 'Über den Hub eingereicht');
    ok(await lp.locator('.pv svg').count() === 1, 'Live-Vorschau beim Einreichen');
    await lp.click('form button[type=submit]'); await lp.waitForSelector('.okm', { timeout: 8000 }).catch(() => {});
    const sub = be.db.get("SELECT * FROM entities WHERE title='Hub Kreuz'");
    ok(sub && sub.status === 'pending' && JSON.parse(sub.data).payload.shape === 'cross-dot', 'Einreichung gespeichert (in Prüfung)');
    ok(!(await lp.locator('#acct a', { hasText: 'Moderation' }).count()), 'Normale Nutzer sehen keine Moderation');
    await lp.goto(base + '#/mod'); ok(/keine Moderationsrechte/.test(await lp.locator('main').innerText()), 'Moderation für normale Nutzer gesperrt');
    // the Owner grants admin (simulated directly in the DB here; real path: signed Owner API) → staff panel works
    be.db.run("UPDATE users SET role = 'admin' WHERE username = 'hubtester'");
    await lp.reload(); await lp.waitForSelector('html[data-ready="1"]');
    ok(await lp.locator('#acct a', { hasText: 'Moderation' }).count() === 1, 'Admin sieht Moderation');
    await lp.goto(base + '#/mod/queue'); await lp.waitForSelector('.li.mod', { timeout: 8000 }).catch(() => {});
    ok(/Hub Kreuz/.test(await lp.locator('main').innerText()), 'Einreichung in der Warteschlange');
    await lp.getByText('Freigeben').first().click(); await lp.waitForTimeout(600);
    ok(be.db.get("SELECT status FROM entities WHERE title='Hub Kreuz'").status === 'published', 'Freigabe durch Moderation');
    await lp.goto(base + '#/mod/announce'); await lp.waitForSelector('form');
    await lp.fill('form input >> nth=0', 'Wartung Samstag'); await lp.fill('form textarea', 'Kurze Wartung.'); await lp.click('form button[type=submit]'); await lp.waitForSelector('.okm', { timeout: 8000 }).catch(() => {});
    ok(!!be.db.get("SELECT id FROM entities WHERE kind='announcement' AND title='Wartung Samstag'"), 'Ankündigung veröffentlicht');
    await lp.goto(base + '#/mod/log'); await lp.waitForSelector('table', { timeout: 8000 }).catch(() => {});
    ok(/mod\.entity\.published/.test(await lp.locator('main').innerText()), 'Moderationsprotokoll');
    await lp.goto(base + '#/leaderboard'); await lp.waitForSelector('table', { timeout: 8000 }).catch(() => {});
    ok(/Hub Tester/.test(await lp.locator('main').innerText()), 'Leaderboard listet Creator (live)');
    await lp.screenshot({ path: path.join(SHOTS, 'live-leaderboard.png'), fullPage: true });
    await lp.goto(base + '#/u/hubtester'); await lp.waitForSelector('main h1');
    ok(/Hub Tester/.test(await lp.locator('main h1').innerText()) && /Hub Kreuz/.test(await lp.locator('main').innerText()), 'Öffentliches Profil mit Inhalten');
    // password change
    await lp.goto(base + '#/account/security'); await lp.waitForSelector('form');
    await lp.fill('form input >> nth=0', 'geheim123!'); await lp.fill('form input >> nth=1', 'neuesPass456'); await lp.fill('form input >> nth=2', 'neuesPass456'); await lp.click('form button[type=submit]');
    await lp.waitForSelector('.okm', { timeout: 8000 }).catch(() => {});
    const loginNew = await fetch(local + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'hubtester', password: 'neuesPass456' }) });
    ok(loginNew.status === 200, 'Passwort geändert');
    await lp.reload(); await lp.waitForSelector('html[data-ready="1"]');
    ok(/Hub Tester|hubtester/.test(await lp.locator('#acct').innerText()), 'Sitzung bleibt nach Neuladen (kein erneuter Login)');
    await lp.click('#acct button'); await lp.waitForTimeout(300);
    ok(/Anmelden/.test(await lp.locator('#acct').innerText()), 'Abmelden');
    await be.close();
  }
  ok(!errors.length, 'Keine JavaScript-Fehler', errors.slice(0, 3).join(' | '));
  await browser.close(); if (srv) srv.close();
  console.log(pass + ' bestanden, ' + fail + ' fehlgeschlagen');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
