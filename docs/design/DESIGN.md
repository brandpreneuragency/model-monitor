# Design system — Model Directory

**Status:** visual contract for the redesign  
**Source of truth:** `packages/ui/src/tokens.css` (SPEC §7.1) + the four static HTML
reference screens in this folder  
**Screenshots:** plan `screenshots/` (corroborating detail only; HTML wins on conflict)

This document tells later UI phases **which token to use for what**, the component rules
from SPEC §7.2, density definitions, and an explicit forbidden list. When building a
screen, open the matching reference HTML first, then this file, then the screenshot.

---

## 1. Principles

1. **Dark only.** No light theme block. Theme toggle is out of scope for this redesign.
2. **Tokens only.** Every colour, radius, spacing step, type size, and row height comes
   from `tokens.css` custom properties. Components never invent values.
3. **Borders over shadows.** Surfaces are separated by `--border` / `--border-subtle`.
   The single shadow token `--shadow-drawer` is reserved for the model details drawer and
   floating popovers/menus.
4. **Colour is never the only signal.** Status chips, speed, and confidence always pair a
   semantic colour with a text label (and preferably an icon).
5. **Restrained motion.** Transitions are `120ms ease-out` on `color`, `background-color`,
   and `border-color` only. Never animate `width`, `height`, `top`, `left`, `margin`, or
   `padding`.
6. **Personal ≠ external scores.** Never average, never merge into one column, never fall
   back from one to the other. Untested personal scores render the empty/untested state.

---

## 2. Token catalogue — what to use where

### 2.1 Surfaces

| Token | Use |
|---|---|
| `--bg-app` | Page canvas behind everything |
| `--bg-sidebar` | Fixed left navigation |
| `--bg-surface` | Main content well |
| `--bg-card` | Cards, panels, table body, drawer body |
| `--bg-card-hover` | Card hover fill |
| `--bg-input` | Inputs, selects, search fields, segmented controls track |
| `--bg-drawer` | Right details drawer surface (slightly lifted from surface) |
| `--bg-overlay` | Dimmer behind modal/drawer if needed |
| `--bg-row-hover` | Table row hover |
| `--bg-row-selected` / `--accent-bg` | Selected table row fill |

### 2.2 Borders

| Token | Use |
|---|---|
| `--border` | Default card, table, input borders |
| `--border-subtle` | Dividers inside cards, sidebar section rules |
| `--border-strong` | Emphasised outlines (focused filter group, active segment) |
| `--accent-border` | Selected row left edge, focus-adjacent accents |

### 2.3 Text

| Token | Use |
|---|---|
| `--text` | Primary copy, page titles, model names, numbers |
| `--text-muted` | Secondary labels, column headers, sub-lines, icons at rest |
| `--text-faint` | Tertiary hints, placeholders, disabled, `⌘ K` |
| `--text-inverse` | Text on solid accent buttons |

### 2.4 Accent

| Token | Use |
|---|---|
| `--accent` | Primary buttons, active nav item fill, active tab underline, links |
| `--accent-hover` | Primary button / nav hover |
| `--accent-bg` | Selected row, active skill chip, soft selected fills |
| `--accent-border` | Selected row left border, soft outlines |

### 2.5 Semantic colours

Each semantic colour has a paired `*-bg`. Chips use `color: var(--sem)` and
`background: var(--sem-bg)` with a 1px border at ~25% of the same hue via the bg token
(do not introduce a third hex).

| Token | Meaning | Examples |
|---|---|---|
| `--ok` / `--ok-bg` | Active, available, High confidence, success | Status `Active`, confidence High |
| `--info` / `--info-bg` | Preferred, flagship, informational | `Flagship` chip, info icons |
| `--fast` / `--fast-bg` | Fast / Very Fast speed text, efficient tags | Speed column (text, not chip) |
| `--advanced` / `--advanced-bg` | Reasoning, advanced capability | Advanced tags, score exceptional band |
| `--warn` / `--warn-bg` | Preview, limited, Medium confidence, Needs Review | Confidence Medium, warning KPI |
| `--danger` / `--danger-bg` | Deprecated, error, Low confidence | Confidence Low, destructive affordance |
| `--neutral` / `--neutral-bg` | Legacy, unknown, Medium speed, muted tags | Default tags, unknown state |

**Speed column:** colour-coded **text**, never a chip. Map:

- Very Fast → `--fast`
- Fast → `--ok` (or `--fast` at slightly lower emphasis via muted pairing)
- Medium → `--warn`
- Slow → `--danger`

**Status chips:** solid soft fill (`--ok-bg` + `--ok` text) with label.

### 2.6 Score bands

Used by Overall Score boxes, heatmap cells, and the Score Scale legend.

| Band | Range | Token pair |
|---|---|---|
| Exceptional | 9–10 | `--score-exceptional` / `--score-exceptional-bg` |
| Strong | 7–8 | `--score-strong` / `--score-strong-bg` |
| Average | 5–6 | `--score-average` / `--score-average-bg` |
| Below Avg | 3–4 | `--score-below` / `--score-below-bg` |
| Weak | 0–2 | `--score-weak` / `--score-weak-bg` |
| Empty / untested | — | `--score-empty` / `--score-empty-bg` (em dash or `—`) |

Score boxes are bordered (`1px solid` at the band colour’s border feel via bg + color),
`border-radius: var(--radius-md)`, tabular nums, weight 600.

### 2.7 Chart series

Sparklines and multi-series marks use `--chart-1` … `--chart-6`. Grid lines use
`--chart-grid`; axis labels use `--chart-axis` (aliases `--text-faint`).

Do **not** paint chart fills with CSS gradients. Use solid strokes, solid area fills at
low alpha via the chart token’s own rgba if needed, or discrete SVG path fills. A
single-hue area fill at fixed opacity is allowed; multi-stop gradients are forbidden.

### 2.8 Radii

| Token | px | Use |
|---|---|---|
| `--radius-sm` | 4 | Tiny chips, score boxes, mini bars |
| `--radius-md` | 6 | Inputs, small buttons, table chips |
| `--radius-lg` | 8 | Cards, panels, nav item, drawer |
| `--radius-xl` | 12 | Large promo cards, icon tiles |
| `--radius-full` | pill | Avatars, medal circles, search |

### 2.9 Spacing

Scale: `2 / 4 / 6 / 8 / 12 / 16 / 24 / 32 / 48` → `--space-0_5` … `--space-12`.

- Card padding: `--space-4` (16) typical; dense cards `--space-3`
- Page padding: `--space-6`
- Stack gaps inside cards: `--space-3`
- Filter chip gap: `--space-2`
- Sidebar item padding: `--space-2` × `--space-3`

### 2.10 Type

| Role | Size / weight | Tokens |
|---|---|---|
| Page title | 24 / 600 | `--text-page-*` |
| Section heading | 15 / 600 | `--text-section-*` |
| Card heading | 13 / 600 | `--text-card-*` |
| Table / body | 13 / 400 | `--text-body-*` |
| Metadata | 12 / 400 | `--text-meta-*` |
| KPI number | 28 / 600 | `--text-stat-*` |

Font stack: `--font-sans` = Geist with Inter fallback (self-hosted in the app; mockups
declare the stack only). Monospace for model IDs: `--font-mono`.

### 2.11 Density / row heights

| Density | Token | Height | When |
|---|---|---|---|
| Comfortable | `--row-comfortable` | 52px | Cards view, overview lists |
| Standard | `--row-standard` | 44px | Default table (`Table` segment) |
| Compact | `--row-compact` | 36px | `Compact` segment |

Sticky table headers and sticky filter bars use the same surface tokens with a bottom
border; they do not gain shadow.

### 2.12 Layout chrome

| Token | Default | Use |
|---|---|---|
| `--sidebar-width` | 220px | Fixed left nav |
| `--topbar-height` | 56px | Top search bar |
| `--drawer-width` | 400px | Model details drawer |
| `--rail-width` | 300px | Overview / Rankings / Providers right rail |

### 2.13 Motion & focus

- `--duration-fast`: 120ms
- `--ease-out`: ease-out
- `--focus-ring`: dual-ring focus for keyboard users on interactive controls

---

## 3. Component styling rules (SPEC §7.2)

### 3.1 Shell

- **Sidebar:** `--bg-sidebar`, full viewport height, wordmark top, primary nav (four
  items only: Overview, Models, Rankings, Providers & Plans). Active item: `--accent` fill
  (or `--accent-bg` + `--accent` text — mockups use solid accent with inverse/light text),
  radius `--radius-lg`.
- **SHORTCUTS** group: provider rows with logo tiles; ends with `View all`.
- Below divider: Import / Export, Settings.
- Optional foot promo card on some screens (`--bg-card`, `--border`).
- **Top bar:** centred search (`--bg-input`, pill/radius full, `⌘ K` hint in `--text-faint`),
  right cluster: saved-view select, filter icon button, primary accent action, theme icon
  (present in chrome but non-functional — dark-only), avatar.

### 3.2 Buttons

- **Primary:** `background: var(--accent)`; hover `--accent-hover`; text `--text` or white-equivalent via `--text` on accent (mockups use light text on indigo). Radius `--radius-md`.
- **Secondary / ghost:** transparent or `--bg-input`, border `--border`, text `--text`.
- **Icon button:** square-ish, `--radius-md`, muted icon.

### 3.3 Chips

- **Status / confidence / access-type:** soft semantic bg + semantic text, `--radius-md`,
  meta size, no hard shadow.
- **FilterChip (applied):** `--accent-bg` + `--accent` text, trailing `×`.
- **Tag chips:** `--neutral-bg` + `--text-muted`, stack in table cells.
- **Skill chips (toggle):** idle = `--bg-input` + border; active = `--accent` / `--accent-bg`.

### 3.4 Cards & panels

- Background `--bg-card`, border `1px solid var(--border)`, radius `--radius-lg`.
- Section titles 15/600; card titles 13/600.
- Hover on clickable cards: `--bg-card-hover`.

### 3.5 Tables

- Header: sticky, `--text-muted`, meta or body size, weight 500–600, bottom border.
- Rows: `--row-standard` default; hover `--bg-row-hover`.
- Selected row: left border `2–3px solid var(--accent)`, background `--accent-bg`.
- Footer bar: selection count, compare hint, rows-per-page, range, pager.
- Overall Score: bordered score box, colour-banded (see §2.6).
- Speed: coloured text only.

### 3.6 Drawer / popover

- Width `--drawer-width`, `--bg-drawer` or `--bg-card`, border-left `--border`,
  **`box-shadow: var(--shadow-drawer)` only here** (and popovers/menus).
- Header: title, favourite star, overflow, close.
- Tabs: underline active with `--accent`.
- Footer actions: Compare, Edit Model, overflow.

### 3.7 Forms & filters

- Inputs/selects: `--bg-input`, border `--border`, radius `--radius-md`, body text.
- Two stacked filter rows on Models: dropdowns, then applied FilterChips + `Clear all`.
- Sticky filter controls under the page header.

### 3.8 Empty states

- Centred muted message + one primary action. Never a blank void.

### 3.9 Progress / quota bars

- Track: `--bg-input` or `--border-subtle` fill, radius full, height 4–6px.
- Fill: solid semantic/chart colour (no gradient). Unlimited: `∞` glyph, no percentage.

### 3.10 Charts (static reference)

- Sparklines: SVG stroke using `--chart-n`, optional low-opacity area fill of the **same**
  token (solid, not a multi-stop gradient).
- Bar charts: solid fills from chart/semantic tokens.
- Scatter: discrete dots, log x-axis labels exactly
  `$0.01 / $0.10 / $1.00 / $10.00 / $100.00` where shown.
- Radar: stroked polygons per series colour; grid in `--chart-grid`.
- Heatmap: cell background = score band `*-bg`, text = band colour or `--text`.

---

## 4. Density definitions

| Mode | Row height | Use |
|---|---|---|
| Comfortable | 52px | Spacious lists, card grids |
| Standard | 44px | Default Models table |
| Compact | 36px | High-density table mode |

Segmented control `Table / Cards / Compact` switches view mode; Cards is not a row-height
mode but a layout mode. Compact maps to `--row-compact`.

---

## 5. Forbidden patterns

These fail phase gates and review:

1. **Raw hex / `rgb()` / `hsl()` outside `packages/ui/src/tokens.css`.**  
   HTML mockups and components may only reference `var(--…)`.
2. **CSS gradients** (`linear-gradient`, `radial-gradient`, `conic-gradient`) anywhere in
   product UI or reference HTML.
3. **Glows** (`box-shadow` coloured blurs, `filter: drop-shadow` neon, text-shadow glows).
4. **Shadows other than `--shadow-drawer`** on components. No card drop shadows, no table
   shadows, no button elevation shadows.
5. **Animation on layout properties** (`width`, `height`, `top`, `left`, `right`, `margin`,
   `padding`, `gap`, `transform` used to reflow layout). Allowed: colour/background/border
   transitions at 120ms ease-out; opacity fades for enter/exit of popovers are acceptable
   if ≤150ms and not layout-shifting.
6. **Light-mode blocks** or theme toggles that switch token sets in this redesign.
7. **Merging personal and external scores** into one value or one column.
8. **Colour-only status** without a text label.
9. **Invented spacing/radius/type** off the scales above.

---

## 6. Reference screens

| File | Screen |
|---|---|
| `overview.html` | Overview dashboard + right Quota Summary (and optional peek drawer) |
| `models.html` | Models table, filters, selection, open details drawer |
| `rankings.html` | Leaderboard, score matrix, skill radar, ranking profiles |
| `providers.html` | Provider cards, plans table, quota + renewals rail |

Each file is **static, self-contained HTML** linking

```html
<link rel="stylesheet" href="../../packages/ui/src/tokens.css" />
```

No React, no build step, no data wiring. They are the picture later phases must match.

### Content notes (seed realism)

Reference copy uses real directory entities where practical:

- Models: GPT-5.6 Sol, Claude Sonnet 5, GLM-5.2, Gemini 3.5 Flash, Grok 4.5, and peers
- Nine providers in shortcuts / bars
- Plans: OpenCode Go, ChatGPT Plus, Claude API, Gemini Advanced, etc., with quota figures
  such as OpenCode Go `42 / 90` requests and ChatGPT Plus unlimited
- Rankings personal score cells show the **untested** empty state (product rule D13);
  external scores may show research values

---

## 7. Conflict policy

1. Reference HTML is the gateable contract.
2. Screenshots are corroborating detail when HTML is silent.
3. If HTML and screenshot disagree, HTML wins; log the conflict under
   `progress.md` → Deferred issues.

---

## 8. Checklist for UI phases

- [ ] Colours only via `var(--…)` from `tokens.css`
- [ ] No gradients, glows, or extra shadows
- [ ] Active nav = one of the four primaries
- [ ] Selected table row = accent left border + `--accent-bg`
- [ ] Status/speed/confidence = colour + text
- [ ] Personal and external scores in separate columns/fields
- [ ] Drawer uses `--shadow-drawer`
- [ ] Motion ≤120ms on colour/background only
- [ ] Sticky headers/filters without shadow elevation
