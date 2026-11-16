# Markup Ventures — operations identity

Markup Ventures builds dependable tools for people responsible for physical systems.
The interface should resemble a technical instrument: legible, consistent and explicit
about what is measured, current, historical or unknown.

## Visual language

- **Mark:** open brackets around a rising signal. Pair with the lowercase markup wordmark.
  The mark is shared by login and dashboard in `components/brand.tsx`.
- **Typography:** self-hosted DejaVu Sans Mono, regular and bold. Use regular weight for
  large readings and titles; bold for short structural labels. Font license is bundled.
  Avoid condensed tracking in long text. Tabular numbers make measurements comparable.
- **Surfaces:** graphite (#101214) and instrument gray (#171a1d) in dark mode;
  warm white (#f0f0eb / #fafaf7) in light mode. Use flat surfaces and one-pixel rules.
- **Action color:** cobalt (#8bb5ff dark / #234ed1 light). Use sparingly for navigation,
  primary actions and keyboard focus. It does not represent equipment health.
- **Conditions:** green = good; amber = warning; red = error; gray = unknown.
  Always pair color with text. Preserve the same meanings in both themes.
- **Geometry:** two-pixel corner radius, aligned columns, compact controls. Group related
  readings into divided instrument panels instead of floating cards.
- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32 px. Leave more space between sections than
  between a reading and its label. Keep units next to values.

## Voice and interaction

Use direct descriptions: “Recorded readings”, “Last seen”, “Maintenance history”.
Explain state and scope. Avoid promotional slogans, invented performance claims,
decorative live indicators, simulated terminal output and unnecessary animation.
A terminal aesthetic must still support ordinary labeled buttons, visible focus,
readable errors and mouse/touch use.

Reserve shadows for overlays that need depth. Avoid gradients, glow, pill-shaped
navigation and decorative chart colors that compete with threshold conditions.
Keep interfaces useful at small widths, with scroll confined to dense data tables.
