/*
 * POLARIS Client — Injector
 * Wird nach dem Laden in die Kirka.io-Seite injiziert:
 * baut das Client-Menü (Quick CSS, Crosshair, Userscripts, Einstellungen),
 * das Crosshair-Overlay und den FPS-Zähler.
 * Alles eigener Code.
 */

(() => {
  if (window.__POLARIS_INJECTED__) return;
  window.__POLARIS_INJECTED__ = true;

  const pol = window.polaris;
  if (!pol) return;

  let config = null;
  pol.getConfig().then((c) => { config = c; syncCrosshair(); });

  /* ================= Menü-Container ================= */

  const style = document.createElement('style');
  style.textContent = `
    #polaris-menu * { box-sizing: border-box; }
    #polaris-menu {
      position: fixed; top: 40px; left: 40px; z-index: 2147483647;
      width: 460px; max-height: 80vh; overflow: auto;
      background: rgba(8, 10, 18, 0.92); color: #fff;
      border: 1px solid rgba(140, 160, 255, 0.25); border-radius: 16px;
      font-family: 'Segoe UI', sans-serif; font-size: 13px;
      box-shadow: 0 20px 60px rgba(0,0,0,.6); display: none;
    }
    #polaris-menu.open { display: block; }
    #polaris-menu .pl-head {
      padding: 14px 18px; border-bottom: 1px solid rgba(140,160,255,.15);
      font-family: 'Arial Black', sans-serif; font-weight: 900;
      letter-spacing: .18em; font-size: 20px; color: #fff;
      display: flex; justify-content: space-between; align-items: center;
    }
    #polaris-menu .pl-head small { font-size: 10px; letter-spacing: .1em; opacity: .5; font-weight: 400; }
    #polaris-menu .pl-tabs { display: flex; gap: 4px; padding: 10px 12px 0; flex-wrap: wrap; }
    #polaris-menu .pl-tab {
      background: transparent; color: #aab4dd; border: 1px solid rgba(140,160,255,.2);
      border-radius: 999px; padding: 5px 12px; cursor: pointer; font-size: 11px;
      text-transform: uppercase; letter-spacing: .06em;
    }
    #polaris-menu .pl-tab.active { background: #4f5bd5; color: #fff; border-color: #4f5bd5; }
    #polaris-menu .pl-body { padding: 14px 18px 18px; }
    #polaris-menu .pl-pane { display: none; }
    #polaris-menu .pl-pane.active { display: block; }
    #polaris-menu textarea {
      width: 100%; min-height: 200px; background: #05070d; color: #cfd8ff;
      border: 1px solid rgba(140,160,255,.25); border-radius: 10px;
      padding: 10px; font-family: Consolas, monospace; font-size: 12px; resize: vertical;
    }
    #polaris-menu .pl-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 8px 0; }
    #polaris-menu .pl-row label { color: #aab4dd; }
    #polaris-menu input[type=range] { flex: 1; }
    #polaris-menu input[type=color] { background: none; border: none; width: 40px; height: 26px; cursor: pointer; }
    #polaris-menu .pl-btn {
      background: #4f5bd5; color: #fff; border: none; border-radius: 999px;
      padding: 8px 18px; cursor: pointer; font-size: 12px; text-transform: uppercase;
      letter-spacing: .06em; margin: 4px 6px 0 0;
    }
    #polaris-menu .pl-btn.ghost { background: transparent; border: 1px solid rgba(140,160,255,.35); color: #cfd8ff; }
    #polaris-menu .pl-btn:hover { filter: brightness(1.2); }
    #polaris-menu .pl-note { color: #7a84ad; font-size: 11px; margin-top: 8px; line-height: 1.5; }
    #polaris-crosshair { position: fixed; z-index: 2147483646; top: 50%; left: 50%; pointer-events: none; }
    #polaris-crosshair .ch-line { position: absolute; background: var(--ch-color); }
    #polaris-fps {
      position: fixed; top: 8px; right: 10px; z-index: 2147483645;
      color: #9fd2ff; font: 12px Consolas, monospace; text-shadow: 0 0 4px #000;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);

  /* ================= Menü-HTML ================= */

  const menu = document.createElement('div');
  menu.id = 'polaris-menu';
  menu.innerHTML = `
    <div class="pl-head">POLARIS <small>Client v1.0 — F2 zum Schließen</small></div>
    <div class="pl-tabs">
      <div class="pl-tab active" data-pane="css">Quick CSS</div>
      <div class="pl-tab" data-pane="crosshair">Crosshair</div>
      <div class="pl-tab" data-pane="scripts">Scripts</div>
      <div class="pl-tab" data-pane="settings">Einstellungen</div>
    </div>
    <div class="pl-body">
      <div class="pl-pane active" data-pane="css">
        <textarea id="pl-css" placeholder="/* Dein Quick CSS hier — wird sofort angewendet */"></textarea>
        <button class="pl-btn" id="pl-css-apply">Anwenden</button>
        <button class="pl-btn ghost" id="pl-css-save">Speichern</button>
        <button class="pl-btn ghost" id="pl-css-reset">Zurücksetzen</button>
        <div class="pl-note">Anwenden = sofort testen. Speichern = dauerhaft (bleibt nach Neustart). Zurücksetzen = gespeicherten Stand laden.</div>
      </div>
      <div class="pl-pane" data-pane="crosshair">
        <div class="pl-row"><label>Aktiv</label><input type="checkbox" id="pl-ch-on"></div>
        <div class="pl-row"><label>Größe</label><input type="range" id="pl-ch-size" min="2" max="30" value="10"></div>
        <div class="pl-row"><label>Abstand</label><input type="range" id="pl-ch-gap" min="0" max="20" value="4"></div>
        <div class="pl-row"><label>Dicke</label><input type="range" id="pl-ch-thick" min="1" max="10" value="2"></div>
        <div class="pl-row"><label>Mittelpunkt</label><input type="checkbox" id="pl-ch-dot"></div>
        <div class="pl-row"><label>Farbe</label><input type="color" id="pl-ch-color" value="#ffffff"></div>
        <div class="pl-row"><label>Deckkraft</label><input type="range" id="pl-ch-op" min="0.1" max="1" step="0.05" value="1"></div>
      </div>
      <div class="pl-pane" data-pane="scripts">
        <textarea id="pl-script" placeholder="// Eigenes Userscript (JS), das in der Seite läuft"></textarea>
        <button class="pl-btn" id="pl-script-run">Ausführen</button>
        <button class="pl-btn ghost" id="pl-script-folder">Ordner öffnen</button>
        <div class="pl-note">Userscripts werden bei jedem Start automatisch geladen, wenn sie im Script-Ordner als .js-Datei liegen.</div>
      </div>
      <div class="pl-pane" data-pane="settings">
        <div class="pl-row"><label>FPS-Limit entfernen</label><input type="checkbox" id="pl-set-fps"></div>
        <div class="pl-row"><label>Adblock</label><input type="checkbox" id="pl-set-adblock"></div>
        <div class="pl-row"><label>RPC App-ID</label><input type="text" id="pl-set-rpcid" placeholder="Discord Application-ID" style="flex:1;background:#05070d;border:1px solid rgba(140,160,255,.25);border-radius:8px;padding:6px;color:#cfd8ff;"></div>
        <div class="pl-row"><label>RPC aktiv</label><input type="checkbox" id="pl-set-rpc"></div>
        <button class="pl-btn" id="pl-set-export">Exportieren</button>
        <button class="pl-btn ghost" id="pl-set-import">Importieren</button>
        <button class="pl-btn ghost" id="pl-set-swap">Swap-Ordner</button>
        <button class="pl-btn" id="pl-set-relaunch">Neustart</button>
        <div class="pl-note">FPS-Limit und Adblock ändern sich erst nach einem Client-Neustart.</div>
      </div>
    </div>
  `;
  document.body.appendChild(menu);

  /* ================= Tabs ================= */

  menu.querySelectorAll('.pl-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      menu.querySelectorAll('.pl-tab').forEach((t) => t.classList.remove('active'));
      menu.querySelectorAll('.pl-pane').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const pane = menu.querySelector(`.pl-pane[data-pane="${tab.dataset.pane}"]`);
      if (pane) pane.classList.add('active');
    });
  });

  /* ================= Quick CSS ================= */

  const cssArea = menu.querySelector('#pl-css');
  pol.getCss().then((css) => { cssArea.value = css; });

  menu.querySelector('#pl-css-apply').addEventListener('click', () => pol.applyCss(cssArea.value));
  menu.querySelector('#pl-css-save').addEventListener('click', () => pol.saveCss(cssArea.value));
  menu.querySelector('#pl-css-reset').addEventListener('click', () => pol.getCss().then((css) => { cssArea.value = css; }));

  /* ================= Crosshair ================= */

  const ch = document.createElement('div');
  ch.id = 'polaris-crosshair';
  document.body.appendChild(ch);

  function syncCrosshair() {
    const c = config && config.crosshair ? config.crosshair : null;
    ch.style.display = c && c.enabled ? 'block' : 'none';
    if (!c) return;
    ch.style.setProperty('--ch-color', c.color);
    ch.style.opacity = c.opacity;
    ch.innerHTML = '';
    const t = c.thickness, s = c.size, g = c.gap;
    const mk = (css) => {
      const el = document.createElement('div');
      el.className = 'ch-line';
      Object.assign(el.style, css);
      ch.appendChild(el);
    };
    // oben / unten / links / rechts
    mk({ left: '50%', top: `calc(50% - ${g + s}px)`, width: t, height: s, transform: 'translateX(-50%)' });
    mk({ left: '50%', top: `calc(50% + ${g}px)`, width: t, height: s, transform: 'translateX(-50%)' });
    mk({ top: '50%', left: `calc(50% - ${g + s}px)`, height: t, width: s, transform: 'translateY(-50%)' });
    mk({ top: '50%', left: `calc(50% + ${g}px)`, height: t, width: s, transform: 'translateY(-50%)' });
    if (c.dot) mk({ left: '50%', top: '50%', width: t, height: t, transform: 'translate(-50%,-50%)', borderRadius: '50%' });
  }

  function onChChange() {
    const c = {
      enabled: menu.querySelector('#pl-ch-on').checked,
      size: +menu.querySelector('#pl-ch-size').value,
      gap: +menu.querySelector('#pl-ch-gap').value,
      thickness: +menu.querySelector('#pl-ch-thick').value,
      dot: menu.querySelector('#pl-ch-dot').checked,
      color: menu.querySelector('#pl-ch-color').value,
      opacity: +menu.querySelector('#pl-ch-op').value,
    };
    config.crosshair = c;
    pol.setConfig({ crosshair: c });
    syncCrosshair();
  }

  ['#pl-ch-on', '#pl-ch-size', '#pl-ch-gap', '#pl-ch-thick', '#pl-ch-dot', '#pl-ch-color', '#pl-ch-op']
    .forEach((sel) => menu.querySelector(sel).addEventListener('input', onChChange));

  function fillCrosshairForm() {
    if (!config) return;
    const c = config.crosshair;
    menu.querySelector('#pl-ch-on').checked = c.enabled;
    menu.querySelector('#pl-ch-size').value = c.size;
    menu.querySelector('#pl-ch-gap').value = c.gap;
    menu.querySelector('#pl-ch-thick').value = c.thickness;
    menu.querySelector('#pl-ch-dot').checked = c.dot;
    menu.querySelector('#pl-ch-color').value = c.color;
    menu.querySelector('#pl-ch-op').value = c.opacity;
  }

  /* ================= Userscripts ================= */

  menu.querySelector('#pl-script-run').addEventListener('click', () => {
    const code = menu.querySelector('#pl-script').value;
    if (code.trim()) pol.runScript(code);
  });
  menu.querySelector('#pl-script-folder').addEventListener('click', () => pol.openFolder('scripts'));

  /* ================= Einstellungen ================= */

  function fillSettingsForm() {
    if (!config) return;
    menu.querySelector('#pl-set-fps').checked = config.fpsUnlock;
    menu.querySelector('#pl-set-adblock').checked = config.adblock;
    menu.querySelector('#pl-set-rpcid').value = config.rpc ? config.rpc.appId || '' : '';
    menu.querySelector('#pl-set-rpc').checked = config.rpc ? config.rpc.enabled : false;
  }

  menu.querySelector('#pl-set-fps').addEventListener('change', (e) => pol.setConfig({ fpsUnlock: e.target.checked }));
  menu.querySelector('#pl-set-adblock').addEventListener('change', (e) => pol.setConfig({ adblock: e.target.checked }));
  menu.querySelector('#pl-set-rpcid').addEventListener('change', (e) => pol.setConfig({ rpc: { ...config.rpc, appId: e.target.value } }));
  menu.querySelector('#pl-set-rpc').addEventListener('change', (e) => pol.setConfig({ rpc: { ...config.rpc, enabled: e.target.checked } }));
  menu.querySelector('#pl-set-export').addEventListener('click', () => pol.exportConfig());
  menu.querySelector('#pl-set-import').addEventListener('click', async () => { if (await pol.importConfig()) pol.relaunch(); });
  menu.querySelector('#pl-set-swap').addEventListener('click', () => pol.openFolder('swap'));
  menu.querySelector('#pl-set-relaunch').addEventListener('click', () => pol.relaunch());

  /* ================= Menü-Taste ================= */

  function toggleMenu() {
    menu.classList.toggle('open');
    if (menu.classList.contains('open')) {
      fillCrosshairForm();
      fillSettingsForm();
    }
  }

  window.addEventListener('keydown', (e) => {
    const key = (config && config.menuKey) || 'F2';
    if (e.key === key && !e.repeat && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    }
  }, true);

  /* ================= FPS-Zähler ================= */

  const fpsEl = document.createElement('div');
  fpsEl.id = 'polaris-fps';
  document.body.appendChild(fpsEl);

  let frames = 0, last = performance.now();
  function fpsLoop(now) {
    frames++;
    if (now - last >= 1000) {
      fpsEl.textContent = frames + ' FPS';
      frames = 0;
      last = now;
    }
    requestAnimationFrame(fpsLoop);
  }
  requestAnimationFrame(fpsLoop);

  /* ================= Presence & Init ================= */

  pol.updatePresence('Im Hauptmenü');
  const gameCanvas = document.getElementById('game');
  if (gameCanvas) {
    const obs = new MutationObserver(() => {
      pol.updatePresence(gameCanvas.offsetWidth > 0 ? 'Im Spiel' : 'Im Hauptmenü');
    });
    obs.observe(gameCanvas, { attributes: true, attributeFilter: ['style'] });
  }
})();
