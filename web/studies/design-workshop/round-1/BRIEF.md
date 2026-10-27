# Design-Workshop Runde 1 — gemeinsamer Brief für alle Varianten

## Produkt
proofofwork.fyi — eine Lernsimulation im Browser: Man sieht Miner um einen Hash wetteifern,
schickt Coins zwischen Wallets, und manipuliert eine Transaktion, um zu sehen, wie die Kette
das erkennt. Zielgruppe: Neugierige, Studierende, Lehrende (CS50-Herkunft). Keine echten Coins,
kein Netzwerk. Werkzeuge: Simulator (Hauptfläche), "Hash lab" (Nachricht+Nonce → SHA-256,
Nonce-Suche nach führenden Nullen), "Chain lab" (3 verknüpfte Blöcke bearbeiten und in
Reihenfolge neu minen). Sprache der UI: Englisch.

Die heutige UI (Original) ist ein SAP-Fiori-artiges 3-Spalten-Dashboard: links Wallets +
Mining Race + Analytics, Mitte vertikale Blockliste, rechts Transaktionsformular + Mempool +
"Tamper"-Knopf, oben eine Kopfzeile mit 7 gleichrangigen Textknöpfen. Probleme: kein
Fokus, alles gleich laut, Emoji-Icons, Lernziel nicht geführt, Hashes dominieren ohne Erklärung.

## Gemeinsame Beispieldaten (in jeder Variante dieselben, wo sie vorkommen)
- Coin: powCoin. Difficulty 2 (= 2 führende Nullen). Block reward 1.5625 (Epoch 2, halving alle 4 Blöcke). Target block time 10 s.
- Chain valid: ja (Variante darf zusätzlich einen "manipuliert"-Zustand andeuten, wenn es zur UX passt).
- Blöcke:
  - #0 Genesis — hash 0000a1f3c9e2b7d4…, 0 tx
  - #1 mined by Minas — 00d1664c1246a070cebdc05febb822d3b66af97bf43bb6fd7ad9835f2ceaaf48 — 1 tx — 0.3 s
  - #2 mined by Lars — 009a6e73cac3934378dbc6e1f385239bc4ef87a5bc351687156c97341f438394 — 5 tx — 0.1 s
  - #3 mined by Lars — 00e61301ea0b9765106bd0eaa4ed68c1a108de9f700451072c4b75f5830011f8 — 1 tx — 8.0 s
  - #4 mined by Lars (neu) — 0080a3e897fb1e3839f43f95b033620ff7fb2f9739c8e415e5ce6e7df0726c4d — 1 tx — 7.1 s
- Wallets (powCoin): Alice 0.60000000, Bob 0.60000000, Chris 0.60000000, Lars 8.41250004 (Miner, 3 Blöcke), Minas 0.72499996 (Miner, 1 Block)
- Miner-Race (laufend oder gerade beendet): Lars 11,133 H/s nonce 5,775 → Hash 0080a3e8… (2/2 Nullen, gewonnen); Minas 11,000 H/s nonce 905 → dc80146e… (0/2). Gesamt 332 Versuche.
- Mempool: 2 pending — Alice → Bob 0.25 "Coffee"; Chris → Alice 0.10 "Rent split"
- Statistik: Ø Blockzeit 3.9 s, schnellster 0.1 s, langsamster 8.0 s, total gemint 10.9375.

## Technische Regeln (verbindlich)
- Genau eine selbständige HTML-Datei pro Variante: inline <style>, keine externen Requests (keine CDN, keine Webfonts von außen, keine Bilder per URL). Icons als inline SVG, keine Emojis.
- Systemschriften: z. B. -apple-system/"SF Pro", ui-serif/"New York"/Georgia, ui-monospace/"SF Mono"/Menlo, "Avenir Next", "Iowan Old Style", "Charter" — was zur Richtung passt.
- Zielviewport 1440×900. Der erste Bildschirm (above the fold) muss die Richtung komplett zeigen. Kein horizontaler Überlauf. Seite darf darunter weitergehen.
- Statisches Mockup; kein JS nötig (kleine Hover/Fokus-States in CSS erwünscht).
- Professionelle Qualität: echtes Typo-Raster, konsistente Abstände (4/8-er Raster), echte Hierarchie, ein klarer Hauptschritt pro Ansicht. Keine Platzhalter-"Lorem". Texte kurz, konkret, englisch.
- Ganz oben in der Datei ein HTML-Kommentar mit: Variante, UX-Fokus, UI-Geschmack, 3 Sätze Begründung.

## Validierung (selbst ausführen, Ergebnis berichten)
`node /private/tmp/claude-501/-Users-d068879-1-dev-blockchainSimulacrumApp/684ebfac-916c-4730-af35-0a76dd027c2f/scratchpad/shot.cjs <datei.html> <datei.png>`
Erwartet: `overflowX` ≤ 0 und `external` leer. Dann das PNG mit dem Read-Tool ansehen und selbst
bewerten (Lesbarkeit, Hierarchie, nichts abgeschnitten/überlappend). Eine Korrekturrunde nach
dem Ansehen ist erlaubt und erwünscht; das ist Teil des Bauens, keine fehlgeschlagene Prüfung.
