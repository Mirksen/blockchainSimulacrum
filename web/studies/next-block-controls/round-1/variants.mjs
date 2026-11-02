// Round 1 of the Next block controls workshop: how the Auto-mine toggle sits beside Play.
// Every variant is a CSS overlay on the real product, so the screenshots show the real card,
// its tokens and its states. Tile 0 is the product as built (Auto-mine as a setting, PR of
// 2026-11-02). Labels and notes are German for Mirko's prioritization.

const hideLabel = '.next-block-repeat > span { display: none; }';

export const variants = [
  {
    n: 0, title: 'Heute', ux: 'Gleich hohes Segment, voller Text', ui: 'An = blau gefüllt',
    why: 'Ausgangspunkt. An ist das Segment so gefüllt wie der Primary: zwei gefüllte Flächen, obwohl DESIGN.md genau eine verlangt. Der Text „Auto-mine“ macht das Segment fast so breit wie Play.',
    css: ''
  },
  {
    n: 1, title: 'Schmaler Reiter „Auto“', ux: 'Kürzer, gleiche Höhe', ui: 'An = getönt statt gefüllt',
    why: 'Deine Idee direkt umgesetzt: Text auf „Auto“ gekürzt, Polster kleiner. An färbt nur Text und Fläche leicht ein, so bleibt Play die einzige gefüllte Fläche.',
    css: `${hideLabel}
      .next-block-repeat { padding: 0 9px; gap: 5px; }
      .next-block-repeat::after { content: 'Auto'; }
      .next-block-repeat[aria-pressed="true"], .next-block-repeat[aria-pressed="true"]:hover { background: var(--blue-bg); color: var(--blue); }`
  },
  {
    n: 2, title: 'Nur Symbol', ux: 'Quadrat, Name im Tooltip', ui: 'An = getönt + Punkt',
    why: 'Am kompaktesten: ein 36-px-Quadrat mit dem Wiederholen-Symbol. Ein kleiner blauer Punkt sagt „an“. Risiko: Neue verstehen das Symbol erst beim Hovern.',
    css: `${hideLabel}
      .next-block-repeat { position: relative; width: 38px; padding: 0; }
      .next-block-repeat[aria-pressed="true"], .next-block-repeat[aria-pressed="true"]:hover { background: var(--blue-bg); color: var(--blue); }
      .next-block-repeat[aria-pressed="true"]::after { content: ''; position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 50%; background: var(--blue); }`
  },
  {
    n: 3, title: 'Mini-Schalter im Anbau', ux: 'Sieht aus wie ein Schalter', ui: 'Spur + Knopf, „Auto“',
    why: 'Die Form sagt, was es ist: ein Ein/Aus-Schalter, kein zweiter Knopf. Damit liest niemand „Auto“ als „startet etwas“. Der Anbau bleibt schmal.',
    css: `.next-block-repeat > svg { display: none; }
      .next-block-repeat > span { font-size: 0; }
      .next-block-repeat > span::after { content: 'Auto'; font-size: 12px; }
      .next-block-repeat { position: relative; padding: 0 10px 0 40px; }
      .next-block-repeat::before { content: ''; position: absolute; left: 10px; top: 50%; width: 24px; height: 14px; margin-top: -7px; border-radius: 7px; background: var(--panel-3); border: 1px solid var(--line-3); box-sizing: border-box; }
      .next-block-repeat::after { content: ''; position: absolute; left: 13px; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; background: var(--text-2); transition: left 160ms ease; }
      .next-block-repeat[aria-pressed="true"], .next-block-repeat[aria-pressed="true"]:hover { background: transparent; color: var(--text); }
      .next-block-repeat[aria-pressed="true"]::before { background: var(--blue); border-color: transparent; }
      .next-block-repeat[aria-pressed="true"]::after { left: 23px; background: var(--on-accent); }`
  },
  {
    n: 4, title: 'Abgestufter Anbau', ux: 'Niedriger als Play, angedockt', ui: 'Leiser Grund, an = blaue Linie',
    why: 'Der Anbau ist 28 statt 36 px hoch und sitzt mittig an Play: Man sieht sofort, was Hauptaktion und was Zusatz ist. Getrennter Rahmen statt gemeinsamer Hülle.',
    css: `${hideLabel}
      .next-block-action { border: 0; background: transparent; overflow: visible; align-items: center; }
      .next-block-action .btn-primary { border-radius: var(--r-md); }
      .next-block-repeat { min-height: 28px; height: 28px; margin-left: -1px; padding: 0 9px 0 8px; gap: 5px; border: 1px solid var(--line-3); border-left: 0; border-radius: 0 var(--r-sm) var(--r-sm) 0; background: var(--panel-2); box-shadow: none; }
      .next-block-repeat::after { content: 'Auto'; }
      .next-block-repeat[aria-pressed="true"], .next-block-repeat[aria-pressed="true"]:hover { background: var(--blue-bg); color: var(--blue); border-color: var(--blue-line); }`
  },
  {
    n: 5, title: 'Split-Button', ux: 'Ein Bedienelement mit Fach', ui: 'Gleiche Füllung, Trennstrich',
    why: 'Play und Wiederholen sind ein einziger gefüllter Knopf mit rechtem Fach (Symbol). An zeigt ein heller Balken unter dem Symbol. Wirkt am geschlossensten, ist aber am wenigsten als Schalter erkennbar.',
    css: `${hideLabel}
      .next-block-action { border-color: transparent; }
      .next-block-repeat { position: relative; width: 38px; padding: 0; background: var(--blue); color: color-mix(in srgb, var(--on-accent) 55%, transparent); box-shadow: inset 1px 0 0 color-mix(in srgb, var(--on-accent) 28%, transparent); }
      .next-block-repeat:hover:not(:disabled) { background: var(--blue-2); color: var(--on-accent); }
      .next-block-repeat[aria-pressed="true"], .next-block-repeat[aria-pressed="true"]:hover { color: var(--on-accent); }
      .next-block-repeat[aria-pressed="true"]::after { content: ''; position: absolute; left: 11px; right: 11px; bottom: 5px; height: 2px; border-radius: 1px; background: var(--on-accent); }`
  },
  {
    n: 6, title: 'Schalter links, abgesetzt', ux: 'Einstellung getrennt von Aktion', ui: 'Pill-Schalter vor Play',
    why: 'Trennt sauber: links die Einstellung als Schalter mit Text „Auto-mine“, rechts allein die Aktion. Kein Anbau mehr, dafür eindeutig. Weicht von deiner Vorgabe „anliegen wie jetzt“ ab.',
    css: `.next-block-action { border: 0; background: transparent; overflow: visible; flex-direction: row-reverse; gap: 12px; align-items: center; }
      .next-block-action .btn-primary { border-radius: var(--r-md); }
      .next-block-repeat > svg { display: none; }
      .next-block-repeat { position: relative; min-height: 28px; height: 28px; padding: 0 10px 0 38px; border: 1px solid var(--line-3); border-radius: 14px; background: var(--panel); box-shadow: none; }
      .next-block-repeat::before { content: ''; position: absolute; left: 8px; top: 50%; width: 22px; height: 12px; margin-top: -6px; border-radius: 6px; background: var(--panel-3); }
      .next-block-repeat::after { content: ''; position: absolute; left: 10px; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; background: var(--text-3); transition: left 160ms ease; }
      .next-block-repeat[aria-pressed="true"], .next-block-repeat[aria-pressed="true"]:hover { background: var(--panel); color: var(--text); border-color: var(--blue-line); }
      .next-block-repeat[aria-pressed="true"]::before { background: var(--blue); }
      .next-block-repeat[aria-pressed="true"]::after { left: 20px; background: var(--on-accent); }`
  },
  {
    n: 7, title: 'Rundes Badge an Play', ux: 'Kleines Rad am rechten Rand', ui: 'An = blauer Ring',
    why: 'Ein 28-px-Kreis überlappt die rechte Kante von Play wie ein Abzeichen. Sehr leicht, klar „Zusatz“. Läuft der Lauf, könnte sich das Symbol langsam drehen (hier statisch).',
    css: `${hideLabel}
      .next-block-action { border: 0; background: transparent; overflow: visible; align-items: center; }
      .next-block-action .btn-primary { border-radius: var(--r-md); padding-right: 22px; }
      .next-block-repeat { position: relative; z-index: 1; width: 30px; height: 30px; min-height: 30px; margin-left: -15px; padding: 0; border-radius: 50%; border: 2px solid var(--panel); background: var(--panel-2); box-shadow: 0 0 0 1px var(--line-3); }
      .next-block-repeat[aria-pressed="true"], .next-block-repeat[aria-pressed="true"]:hover { background: var(--panel); color: var(--blue); box-shadow: 0 0 0 2px var(--blue); }`
  },
  {
    n: 8, title: 'Segment „Once | Repeat“', ux: 'Modus wählen statt Schalter', ui: 'Zwei Stellungen sichtbar',
    why: 'Beide Zustände stehen da, der gewählte ist hinterlegt. Am erklärendsten (Play mint einen Block oder fortlaufend), aber am breitesten. Gut, wenn Neue den Unterschied lernen sollen.',
    css: `.next-block-repeat > svg { display: none; }
      .next-block-repeat > span { display: none; }
      .next-block-repeat { gap: 0; padding: 0 4px; }
      .next-block-repeat::before, .next-block-repeat::after { display: inline-block; padding: 5px 7px; border-radius: 4px; font: 600 11px/1 var(--ui); }
      .next-block-repeat::before { content: 'Once'; background: var(--panel-3); color: var(--text); }
      .next-block-repeat::after { content: 'Repeat'; color: var(--text-3); }
      .next-block-repeat[aria-pressed="true"], .next-block-repeat[aria-pressed="true"]:hover { background: transparent; }
      .next-block-repeat[aria-pressed="true"]::before { background: transparent; color: var(--text-3); }
      .next-block-repeat[aria-pressed="true"]::after { background: var(--blue-bg); color: var(--blue); }`
  }
];
