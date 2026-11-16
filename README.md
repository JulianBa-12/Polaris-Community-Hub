# POLARIS Client

Inoffizieller Electron-Client für [Kirka.io](https://kirka.io/) — geschrieben als Eigenimplementierung der Features, die Community-Clients wie Dawn, juice oder Redline populär gemacht haben. Enthält keinerlei Code aus diesen Projekten.

## Features

- **Quick CSS** — CSS-Editor direkt im Client (Taste `F2`), sofortiges Anwenden, dauerhaftes Speichern. Das POLARIS-Theme ist bereits als Standard hinterlegt (schwarzer Hintergrund, weißer POLARIS-Schriftzug, komplett durchsichtige UI).
- **FPS-Unlock** — deaktiviert VSync und das Frame-Limit (`disable-gpu-vsync`, `disable-frame-rate-limit`), plus GPU-Optimierungen. Wirksam ab dem nächsten Client-Start.
- **Adblock** — blockiert bekannte Werbe- und Tracker-Netzwerke (AdinPlay, viTAG, Google Ads u. a.).
- **Custom Crosshair** — eigenes Fadenkreuz-Overlay mit Größe, Abstand, Dicke, Mittelpunkt, Farbe und Deckkraft, live einstellbar.
- **Userscripts** — eigene JavaScript-Snippets direkt ausführen; Scripts im Script-Ordner laufen automatisch.
- **Resource-Swapper** — ersetzt Kirka-Assets (Skyboxes, Texturen, Sounds, Icons) durch eigene Dateien: gleiche URL-Pfade in den `swap`-Ordner legen, fertig.
- **Deeplinks** — `polaris://`-Protokoll, z. B. `polaris://hub/live`.
- **Discord Rich Presence** — optional, eigene Discord-Application-ID nötig.
- **FPS-Zähler** — immer sichtbar oben rechts.
- **Einstellungen Import/Export** — komplette Konfiguration als JSON sichern und teilen.
- **Externe Links** öffnen sich im Standard-Browser statt im Client.

## Installation (Entwicklung)

```bash
npm install
npm start
```

## Build (Windows-Installer & Portable)

```bash
npm run dist
```

Die fertige Datei liegt danach in `dist/`.

## Benutzung

| Taste / Ort | Funktion |
|---|---|
| `F2` | Client-Menü öffnen/schließen |
| Menü → Quick CSS | CSS bearbeiten, anwenden, speichern |
| Menü → Crosshair | Fadenkreuz konfigurieren |
| Menü → Scripts | Userscripts ausführen |
| Menü → Einstellungen | FPS-Unlock, Adblock, RPC, Export/Import, Neustart |
| Ordner `swap/` | Resource-Swapper (Dateien mit gleichem Pfad wie die Original-URL) |
| Ordner `scripts/` | Userscripts, die automatisch geladen werden |

## Ordner

Alle Daten liegen im Benutzerdaten-Verzeichnis des Clients (`%APPDATA%/polaris-client` unter Windows):
- `quick.css` — gespeichertes Quick CSS
- `scripts/` — Userscripts (`.js`)
- `swap/` — ersetzte Ressourcen
- `config.json` — Einstellungen

## Rechtliches / Hinweis

Inoffizielles Fan-Projekt, keine Verbindung zu Kirka.io. Nutzung auf eigene Verantwortung — Third-Party-Clients können theoretisch gegen die Spielregeln von Kirka verstoßen. Kein Code aus anderen Clients wurde übernommen; alle Features sind eigenständig implementiert.

## Geplante Erweiterungen

- Skybox-/Texturen-Pakete mit Vorschau
- Kill-Icons und Sound-Pakete
- Freundessuche im Client
- In-Game-Statistiken (Ping, Tick-Rate)
- Auto-Updater
