# Design System: 5eTools Builder

The single source of truth for how this app looks and moves. Tokens live in
`src/index.css` (`@theme` + `@layer components`, then one `[data-theme]` block
per colour scheme). Icons live in `src/components/common/Icon.tsx`; the scheme
picker lives in `src/components/common/ThemeMenu.tsx` and its state in
`src/store/themeStore.ts`. When a rule here and the code disagree, fix the code.

## 1. Visual Theme & Atmosphere

**A field codex.** Imagine a well-kept reference binder on a cold stone desk:
zinc-grey pages, crisp ruled lines, one oxblood wax seal marking what matters.
The interface is a working tool for reading rules and filling in a character,
so it stays quiet and lets the content carry the fantasy. No parchment
textures, no faux-medieval type, no glowing runes.

The reader chooses the light the codex is read under. **Codex** is the house
scheme; **Legacy** brings back the app's original parchment and blood; four
well-known editor palettes (Solarized Light, Nord, Gruvbox, Catppuccin Mocha)
cover the rest of the light-to-dark range. Every scheme fills the same roles, so
layout, type and motion never change with it. A thin pane of **frosted glass**
sits over a soft two-tone backdrop: panels, the header, the rail and floating
layers are translucent and blur what is behind them. It is on by default, and
the reader can switch it off.

| Dial      | Setting | Reading                                                                 |
| --------- | ------- | ----------------------------------------------------------------------- |
| Density   | 7       | Upper "Daily App Balanced": lists, statblocks and sheets are information-dense; whitespace is earned, never padded in. |
| Variance  | 4       | "Offset Asymmetric" kept in check: asymmetric two-pane splits (narrow rail + wide reading column), never centered heroes, but a predictable grid because users scan it repeatedly. |
| Motion    | 4       | "Fluid CSS": weighty, critically-damped settles on panels and pages; instant feedback on presses; one perpetual loop where something is genuinely alive (skeleton shimmer, unsaved-draft pulse). |

## 2. Color Roles & Schemes

Colour is assigned by **role**. Components only ever use roles, never raw hex
values. Each scheme maps every role, with one neutral family and one accent
per scheme, and there is no warm/cool grey mixing inside a scheme.

| Role | Token | Codex value | Used for |
| --- | --- | --- | --- |
| Canvas | `canvas` | Canvas Zinc `#F4F4F5` | App background behind every panel. |
| Surface | `surface` | Pure Surface `#FFFFFF` | Panels, cards, inputs, the sheet page. |
| Sunk | `surface-sunk` | `#FAFAFA` | Rails and wells inside a surface: the content rail, zebra rows, preview wells. |
| Ink | `ink` | Charcoal Ink `#18181B` | Primary text and headings. Never `#000000`. |
| Muted ink | `ink-muted` | Muted Steel `#52525B` | Secondary text, metadata, eyebrow labels. |
| Faint ink | `ink-faint` | Faint Steel `#A1A1AA` | Placeholders, disabled glyphs and decorative icons only. |
| Line | `line` | Whisper Line `#E4E4E7` | 1px structural borders and dividers. |
| Firm line | `line-strong` | Firm Line `#D4D4D8` | Input borders, secondary-button outlines, hover borders. |
| Accent | `accent` | Oxblood Seal `#9B2C2C` | The only accent: primary actions, the active nav marker, focus rings, selected rows, links. |
| Accent hover | `accent-strong` | Oxblood Deep `#7F1D1D` | Hover and pressed state for accent fills. |
| On accent | `on-accent` | `#FFFFFF` | Text and icons on accent fills. |
| Success | `success` | Verdant `#2F6B3A` | Completed checklist items, successful imports. |
| Warning | `warning-surface` / `warning-border` | Amber Wash `#FBF3DC` / Amber Edge `#A87A26` | Warnings, such as a missing spell list or skipped import files. |
| Scrim | `scrim` | Ink at 30% | Backdrop behind the mobile drawer. |
| Aura | `--aura` | Brass `#B4955A` | The second wash of the glass backdrop. Decorative only: never text, borders or controls. |

Status colours report state and are never used as decoration. Selected and
tinted states use the accent at low opacity (6–10%), never a second hue.

**Schemes** (`data-theme` on `<html>`, stored in `localStorage`):

| Scheme | Tone | Canvas · Surface · Ink | Accent | Aura |
| --- | --- | --- | --- | --- |
| **Codex** (default) | light | `#F4F4F5` · `#FFFFFF` · `#18181B` | Oxblood `#9B2C2C` | Brass `#B4955A` |
| **Legacy** | light | `#E9E2CF` · Parchment `#F4ECD8` · `#1A1410` | Blood `#7B2D26` | Gold `#B7862C` |
| **Solarized Light** (Ethan Schoonover) | light | base2 `#EEE8D5` · base3 `#FDF6E3` · base02 `#073642` | Blue `#1D72AD` | Cyan `#2AA198` |
| **Nord** (Arctic Ice Studio) | dark | nord0 `#2E3440` · nord1 `#3B4252` · nord6 `#ECEFF4` | Frost `#88C0D0` | Aurora green `#A3BE8C` |
| **Gruvbox Dark** (Pavel Pertsev) | dark | bg0_h `#1D2021` · bg0 `#282828` · fg1 `#EBDBB2` | Yellow `#D79921` | Aqua `#689D6A` |
| **Catppuccin Mocha** | dark | crust `#11111B` · base `#1E1E2E` · text `#CDD6F4` | Maroon `#EBA0AC` | Teal `#94E2D5` |

Rules for every scheme, present and future:

- **Contrast floors** (WCAG 2.2): ink ≥ 7:1 on surface and canvas; muted ink ≥ 4.5:1 on surface, sunk and canvas; the accent ≥ 4.5:1 as text on surface; on-accent ≥ 4.5:1 on both accent shades; success and the warning edge ≥ 3:1 as non-text marks.
- **Famous palettes are adapted only to meet those floors**, and the code comments name each change. Solarized's blue moves from `#268BD2` to `#1D72AD`, its muted ink from base01 `#586E75` to `#52676E`, and its warning edge darkens to `#9C7600`.
- **Accents stay below 80% saturation**, which is why there is no Dracula (purple and neon) and why Catppuccin uses Maroon rather than Mauve.
- **Dark schemes** set `color-scheme: dark` and raise `--shadow-depth` to 3 so elevation still reads. Shadows are tinted with each scheme's darkest ink (`--shadow-ink`).
- **Legacy keeps its blood-red header.** `.chrome` remaps the roles for the top bar: the surface is blood, the ink is parchment, the active nav pill is parchment with blood text, and the edition select is a parchment field.
- **Print always uses Codex.** The scheme blocks are screen-only, so a dark scheme never prints light ink on white paper.

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
* **Panels (`.panel`):** Surface, 1px Line, `0.875rem` radius and a whisper shadow tinted with the scheme's ink (`0 1px 2px` at 4%, `0 8px 24px -16px` at 12%, times `--shadow-depth`). Use a panel only when the elevation separates a region. Inside a panel, group with border-top dividers or spacing, not nested cards.
* **Frosted glass:** applies to `.panel`, `.detail`, `.rail` (the content rail and drawer) and `.glass` (the header bar, roll toast, Level Up menu and appearance menu).
  * With glass on, the surface is drawn at `--glass-alpha` (72% light, 70% dark) with `backdrop-filter: blur(18px) saturate(1.6)`, plus a 1px top sheen (white at 70% light, 7% dark) painted as a background layer so it never fights the surface's shadow.
  * Behind everything, a fixed `body::before` backdrop paints two soft radial washes: the accent at the top-left and the scheme's aura at the bottom-right, each at 14% (22% in dark schemes).
  * Surfaces fall back to solid when glass is switched off (`data-glass="off"`), when `prefers-reduced-transparency: reduce` is set, where `backdrop-filter` is unsupported, and in print.
  * Inputs, buttons, chips and running text are never glass.
  * A glass surface is a stacking context, so a surface that owns a dropdown (the sheet header) is lifted with `relative z-10`.
* **Appearance menu (`.popover-menu`):** a native `popover` dropped under the header's right edge. It holds scheme radios, each with a live swatch (a subtree rendered under that scheme's own `data-theme`), and the glass switch. Below `sm` the same options sit inline in the content drawer.
* **Switch (`.switch`):** a native checkbox with `role="switch"`: a Firm Line track with a muted-ink thumb, turning into an accent track with an on-accent thumb that springs across.
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
* **No overlap:** nothing is absolutely positioned on top of content. The builder's previous/next controls live in their own footer row, not on the content edges. The only floating layers allowed are transient and dismissible: the dice-roll toast anchored bottom-right on the sheet, and menus opened from a button (the appearance popover, the Level Up menu).
* **Spacing scale:** 4px base. Panel padding is `1rem`–`1.5rem`; gaps between sections are `1.5rem`–`2rem`.
* **Mobile (< 768px):** everything collapses to a single column with no exceptions and no horizontal page scroll. Tap targets are at least 44px. Tab strips scroll inside their own row.

## 6. Motion & Interaction

* **Spring settle:** stiffness 100, damping 20, mass 1 gives a critically damped curve, encoded as `--ease-spring` (a CSS `linear()` curve) at `--duration-settle: 600ms`. Pages, detail panes, drawers and accordions settle with it.
* **Snap feedback:** hover and press transitions use `cubic-bezier(.2,.8,.2,1)` over 140ms. Nothing uses linear easing.
* **Toggles:** the switch thumb travels on the spring (300ms). The appearance menu settles in like a page.
* **Staggered reveal:** list-like groups that mount together (builder sections, character cards, sheet stat tiles) cascade in with a 35ms step, capped at 12 steps.
* **Perpetual loops, sparingly:** the skeleton shimmer runs while an import is busy, and a slow pulse on the unsaved-draft dot runs while the draft differs from the library. Nothing else loops.
* **Performance:** only `transform` and `opacity` animate. Every animation respects `prefers-reduced-motion: reduce`, which collapses it to an instant change.

## 7. Anti-Patterns (Banned)

- Emoji anywhere, including the favicon and document title.
- The Inter font, system-UI stacks as the primary face, and every serif.
- Pure black (`#000000`).
- Neon or outer-glow shadows, gradient text, and the purple/blue "AI" gradient look.
- A second accent hue within a scheme, or an accent above 80% saturation. The aura is backdrop-only.
- Glass on inputs, buttons, chips or blocks of running text. Blur above 24px, surfaces more transparent than 65%, rainbow or neon backdrops, and glass in print.
- Hard-coded colours in components. Use a role token so every scheme can restyle it.
- Parchment textures, faux-medieval type, or red-tinted borders used for structure.
- Three equal cards in a row, and centered hero layouts.
- Overlapping or absolutely positioned content over other content.
- Custom mouse cursors.
- Invented numbers, statistics or placeholder people ("John Doe"). Every figure on screen comes from the character or the imported content.
- Copywriting clichés ("Elevate", "Seamless", "Unleash", "Next-Gen") and filler UI text ("Scroll to explore", bouncing chevrons).
- `LABEL // YEAR` style typography.
- Circular spinners.
