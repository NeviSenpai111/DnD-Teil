# Design System: 5eTools Builder

The single source of truth for how this app looks and moves. Tokens live in
`src/index.css` (`@theme` + `@layer components`). Icons live in
`src/components/common/Icon.tsx`. When a rule here and the code disagree, fix
the code.

## 1. Visual Theme & Atmosphere

**A field codex.** Imagine a well-kept reference binder on a cold stone desk:
zinc-grey pages, crisp ruled lines, one oxblood wax seal marking what matters.
The interface is a working tool for reading rules and filling in a character,
so it stays quiet and lets the content carry the fantasy. No parchment
textures, no faux-medieval type, no glowing runes.

| Dial      | Setting | Reading                                                                 |
| --------- | ------- | ----------------------------------------------------------------------- |
| Density   | 7       | Upper "Daily App Balanced": lists, statblocks and sheets are information-dense; whitespace is earned, never padded in. |
| Variance  | 4       | "Offset Asymmetric" kept in check: asymmetric two-pane splits (narrow rail + wide reading column), never centered heroes, but a predictable grid because users scan it repeatedly. |
| Motion    | 4       | "Fluid CSS": weighty, critically-damped settles on panels and pages; instant feedback on presses; one perpetual loop where something is genuinely alive (skeleton shimmer, unsaved-draft pulse). |

## 2. Color Palette & Roles

One neutral family (Zinc) plus a single accent. No warm/cool grey mixing.

- **Canvas Zinc** (`#F4F4F5`) — the app background behind every panel.
- **Pure Surface** (`#FFFFFF`) — panels, cards, inputs, the character sheet page.
- **Sunk Surface** (`#FAFAFA`) — rails and wells inside a surface: the content sidebar, list rails, table zebra rows, preview wells.
- **Charcoal Ink** (`#18181B`) — primary text, headings, active nav text. Never `#000000`.
- **Muted Steel** (`#52525B`) — secondary text, metadata, eyebrow labels. ≥ 7:1 on Pure Surface, ≥ 6:1 on Canvas Zinc, so it is safe at 11px.
- **Faint Steel** (`#A1A1AA`) — placeholders, disabled glyphs and decorative icons only. Never for text a user must read.
- **Whisper Line** (`#E4E4E7`) — 1px structural borders and dividers.
- **Firm Line** (`#D4D4D8`) — input borders, secondary-button outlines, hover borders.
- **Oxblood Seal** (`#9B2C2C`) — the only accent (HSL 0°, 55%, 39%). Primary actions, the active nav indicator, focus rings, selected-row markers, links. ~7.4:1 on white.
- **Oxblood Deep** (`#7F1D1D`) — hover and pressed state for Oxblood fills.
- **On-Seal** (`#FFFFFF`) — text and icons placed on Oxblood fills.

Functional status colours, used only to report state and never as decoration:

- **Verdant** (`#2F6B3A`) — completed checklist items and successful imports.
- **Amber Wash** (`#FBF3DC`) with **Amber Edge** (`#B7862C`) — warnings, such as a missing spell list or an import that skipped files.

Selected and tinted states use Oxblood at low opacity (6–10%), never a second hue.

## 3. Typography Rules

- **Interface & Display:** `Geist Variable` (self-hosted via `@fontsource-variable/geist`). Headlines are track-tight (`-0.02em` to `-0.025em`) at weight 600. Hierarchy comes from weight and colour first and size second. Page titles sit at `1.5rem`; statblock names at `clamp(1.5rem, 1.1rem + 1.2vw, 2rem)`.
- **Body:** Geist 400, `0.875rem`/`1.6` in panels and `1rem` in reading columns. Running rules text is capped at `68ch`.
- **Mono:** `Geist Mono Variable`. Every number a player reads in play uses it: ability scores, modifiers, HP, AC, level, dice, counts and spell slots. So do source tags (`PHB`, `XPHB`) and eyebrow labels. Numbers always use `tabular-nums`.
- **Eyebrow labels:** Geist Mono, `0.6875rem`, uppercase, `0.08em` tracking, Muted Steel. They title sections in place of coloured headings.
- **Banned:** Inter, system-UI stacks as the primary face, and every serif. The statblock look comes from rules and spacing, not from a book face.

## 4. Component Stylings

* **Buttons (`.btn`):** `0.5rem` radius, 36px tall (32px `.btn-sm`), weight 500, sentence case. On `:active` they press down 1px with no glow.
  * `.btn-primary`: Oxblood fill and On-Seal text. At most one per view region.
  * `.btn-secondary`: Pure Surface fill, Firm Line border and Ink text. Hover tints the background with Ink at 4%.
  * `.btn-ghost`: no border. Used for icon buttons and toolbar actions.
  * `.btn-danger`: secondary styling with Oxblood text. Used for destructive actions.
* **Panels (`.panel`):** Pure Surface, 1px Whisper Line, `0.875rem` radius and a whisper shadow tinted with Zinc (`0 1px 2px rgb(24 24 27/.04), 0 8px 24px -16px rgb(24 24 27/.12)`). Use a panel only when the elevation separates a region. Inside a panel, group with border-top dividers or spacing, not nested cards.
* **Inputs (`.field`):** Pure Surface, Firm Line, `0.5rem` radius and 36px tall. The label sits above the field and errors sit below it. Focus shows a 2px Oxblood ring. No floating labels.
* **Segmented controls:** a Canvas Zinc track with the active option raised on Pure Surface with the whisper shadow. Used for primary navigation and sheet tabs.
* **Chips (`.chip`):** a pill with a hairline border and mono text, for source tags, stat readouts and badges.
* **Selection lists:** the selected row gets an Oxblood 6% tint and a 2px Oxblood inset bar on its leading edge. Hover is Ink at 4%.
* **Loaders:** skeleton bars (`.skeleton`) sized to the content they stand in for, with a slow shimmer. No circular spinners.
* **Empty states:** a short composition with an outlined glyph tile, a heading, one sentence on how to fill the view, and the single action that fills it.
* **Icons:** inline SVG with a 1.5px stroke, sized at `1em` or `1.25rem`. No emoji anywhere in the UI, favicon or document title.

## 5. Layout Principles

* **Shell:** a 56px top bar (Pure Surface with a Whisper Line bottom border) above a two-column grid with a `17rem` content rail and a fluid main area. Below `64rem` the rail becomes an off-canvas drawer.
* **Asymmetric splits:** two-pane views pair a narrow rail with a wide reading column, never 50/50. Browse uses `20rem | 1fr`; the builder uses one `46rem` reading column.
* **Grid first:** CSS Grid for every two-dimensional arrangement, with no percentage `calc()` widths. Max-width containment: reading columns at `46rem`, sheets at `72rem`.
* **No overlap:** nothing is absolutely positioned on top of content. The builder's previous/next controls live in their own footer row, not on the content edges. The one floating layer allowed is a transient, dismissible toast anchored bottom-right, used for dice-roll results on the sheet.
* **Spacing scale:** 4px base. Panel padding is `1rem`–`1.5rem`; gaps between sections are `1.5rem`–`2rem`.
* **Mobile (< 768px):** everything collapses to a single column with no exceptions and no horizontal page scroll. Tap targets are at least 44px. Tab strips scroll inside their own row.

## 6. Motion & Interaction

* **Spring settle:** stiffness 100, damping 20, mass 1 gives a critically damped curve, encoded as `--ease-spring` (a CSS `linear()` curve) at `--duration-settle: 600ms`. Pages, detail panes, drawers and accordions settle with it.
* **Snap feedback:** hover and press transitions use `cubic-bezier(.2,.8,.2,1)` over 140ms. Nothing uses linear easing.
* **Staggered reveal:** list-like groups that mount together (builder sections, character cards, sheet stat tiles) cascade in with a 35ms step, capped at 12 steps.
* **Perpetual loops, sparingly:** the skeleton shimmer runs while an import is busy, and a slow pulse on the unsaved-draft dot runs while the draft differs from the library. Nothing else loops.
* **Performance:** only `transform` and `opacity` animate. Every animation respects `prefers-reduced-motion: reduce`, which collapses it to an instant change.

## 7. Anti-Patterns (Banned)

- Emoji anywhere, including the favicon and document title.
- The Inter font, system-UI stacks as the primary face, and every serif.
- Pure black (`#000000`).
- Neon or outer-glow shadows, gradient text, and the purple/blue "AI" gradient look.
- A second accent hue, or saturation above 80%.
- Parchment textures, faux-medieval type, or red-tinted borders used for structure.
- Three equal cards in a row, and centered hero layouts.
- Overlapping or absolutely positioned content over other content.
- Custom mouse cursors.
- Invented numbers, statistics or placeholder people ("John Doe"). Every figure on screen comes from the character or the imported content.
- Copywriting clichés ("Elevate", "Seamless", "Unleash", "Next-Gen") and filler UI text ("Scroll to explore", bouncing chevrons).
- `LABEL // YEAR` style typography.
- Circular spinners.
