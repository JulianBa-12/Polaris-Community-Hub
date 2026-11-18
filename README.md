# Polaris Community Hub

Die öffentliche Website von Polaris: Home, About, Features, News, Changelog, Community, Skin-/Resource-/Plugin-Gallery, Documentation, Guides, Support, Bug Reports, Suggestions, Contact und Downloads.

- Statische Single-Page-App ohne Build-Schritt (`index.html`, `hub.css`, `hub.js`), Hash-Routing (`#/docs`, `#/item/<id>`, `#/p/<slug>`).
- Inhalte kommen aus `data/content.json`. Diese Datei wird von **Polaris Owner → Website Manager → Auf GitHub veröffentlichen** in einem Commit aktualisiert. GitHub Actions (`.github/workflows/pages.yml`) veröffentlicht die Seite danach automatisch.
- Optional: Ist im Owner eine öffentliche **https**-Backend-Adresse hinterlegt und erreichbar, lädt der Hub Live-Daten und erlaubt Anmeldung, Bewertungen, Favoriten, Kommentare, Bug Reports und Vorschläge. Ohne Backend zeigt er den veröffentlichten Stand und sagt das offen.
- Im Code liegen keine Schlüssel oder Tokens.

Lokal testen: `python3 -m http.server` im Ordner, dann `http://localhost:8000`. End-to-End-Test: `node test/run-e2e.js` (benötigt das Polaris-Monorepo daneben).
