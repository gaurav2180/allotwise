# Allotwise — Design Direction

> This file is **design data, not instructions to reinterpret**. It is the
> governing spec for the frontend. Build against it. If a choice is not covered
> here, the tie-breaker is: whichever option makes scanning ten IPOs faster.

## Identity

A serious market tool for people who check quote screens daily, not a lifestyle
app. Nearer to a broker terminal than a consumer fintech. Numbers are the hero.
Every choice should make scanning ten IPOs faster.

## Palette

Light default, working dark mode.

**Light**
- bg `#F5F5F3`
- surface `#FFFFFF`
- text `#15151A`
- dim `#6B6B72`
- border `#E0E0DA`

**Dark**
- bg `#0E0E11`
- surface `#17171B`
- text `#F0F0EE`
- dim `#94949C`
- border `#28282E`

One accent, ink blue: `#1B3DEB` light, `#6B87FF` dark. Focus rings and active
state only in the app shell (`/app`, `/pans`). Never decoration there.

Data states, not accents:
- allotted / positive `#0B7A4B` light, `#3BB77E` dark
- negative `#B23A2F` light, `#E0705F` dark

**Amendment (landing page, take two):** a first pass opened the ink-blue
accent up into full-bleed tinted section bands and a repeated icon-in-a-circle
badge on every card. Reviewed and rejected — that combination (pastel wash +
circle badge + eyebrow pill + stat grid) is the generic AI-landing-page
template, not a design decision, and blue read as the default SaaS "AI slop"
color regardless.

Fix shipped: a second hue, deep market gold — `--highlight`, `#8A5A10` light /
`#D9A441` dark (primitives `--gold-700`/`--gold-400` in `globals.css`; the
light value is darkened off the requested `#9C6B12` to clear 4.5:1 against
`--bg`). It exists only for `/`, `/terms`, `/privacy`, `/disclaimer`, and only
as a text color, never a background: one emphasis phrase in the H1, the
`01`/`02`/`03` numerals in "Three steps," and the hover color on the two
in-copy legal links (`TextLink` in `app/page.tsx`). No badges, no tinted
section bands, no pill-shaped eyebrow tags, no stat-card grid under the hero —
those got removed along with the blue wash, not just recolored gold. The app
shell's ink-blue `--accent` is untouched and still governs focus rings and
active state there, per the rule above.

## Buttons and logo mark

White background, black text. Light mode needs a hairline border at
`rgba(21,21,26,.20)` or they disappear into the off-white page. Dark mode drops
the border.

## Typography

Geist for UI and for every number. Both use `next/font`.

**Amendment:** the original brief specified JetBrains Mono for figures. Changed
on request — the monospace treatment read as "code," not as a market tool.
Numbers stay tabular (`.num`: `font-variant-numeric: tabular-nums` +
`font-feature-settings: "tnum"`) so columns still align vertically; Geist ships
the `tnum` OpenType feature, so alignment holds without a mono face — verified
all ten digits render at an identical width. JetBrains Mono remains loaded and
is used for genuine code-like content (`code`/`kbd`/`samp`), which is a
different case from a price column.

## Shape rule, enforce it

Cards 12px, controls 10px, pills and chips fully rounded. Nothing else.

## Dials

ENERGY 5, RHYTHM 6, MOTION 3.

## Stack

Next.js App Router, TypeScript strict, Tailwind v4, shadcn/ui primitives,
TanStack Query (allotment check as a mutation), Zod for PAN validation and
response parsing, next-themes, Phosphor Icons as the single library at one
weight.

## Motion

Use transitions.dev token values unchanged. Each of these has a specific job:

- **Tabs sliding** — 250ms, `cubic-bezier(0.22,1,0.36,1)` — on the IPO filter
- **Skeleton reveal** — 1000ms pulse, 400ms cross-fade, 2px blur — while a check
  is in flight
- **Number pop-in** — 500ms, 8px, 70ms stagger, `cubic-bezier(0.34,1.45,0.64,1)`
  — on the allotted share count, the one number the screen exists for
- **Error shake** — 6px/4px, 80/60/80/60ms, 3000ms revert — on invalid PAN
- **Accordion** — 300ms `grid-rows`, `cubic-bezier(0.16,1,0.3,1)` — on row
  expand (IPO detail, PAN remove, GMP history)
- **Toast** — for check failures

Stagger multiple PAN results ~260ms apart, total under 300ms.
`prefers-reduced-motion` guard on everything. No infinite loops beyond the
bounded skeleton pulse.

**Amendment:** the accordion originally animated `grid-template-rows` alone,
reusing the tab-slide easing. Reported janky on a real iPhone — some mobile
WebKit versions interpolate an animated grid `fr` track roughly rather than
smoothly, and the tab-slide curve (`--ease-slide`, tuned for a small
width move) read as an abrupt snap at accordion height. Fixed two ways: a
dedicated `--ease-reveal` curve (`cubic-bezier(0.16,1,0.3,1)`, gentler
deceleration) for grid-rows, plus the content itself now fades and lifts 4px
in parallel — the fade gives the eye something smooth to follow regardless of
how evenly the browser steps the height, and it plays in both directions
(open and close), not just on reveal.

## Screens

### 1. Main screen (build first)

A list of IPO rows: name, board, GMP, estimated gain, subscription. Each row
expands to one line per saved PAN with its result. A "check all" action runs
every saved PAN against that IPO.

The screen's job is **"did any of my PANs get allotment, and what is it worth"**,
and the one decision is **which IPO to check next**. Build the hierarchy around
that. No sidebar, no stat-card row, no chart, no activity feed.

#### Row anatomy (amendment, from reference review)

Density and per-row scanning were weaker than a market tool needs. The row is:

`[logo] [name + state line] [Issue price] [GMP + gain%] [Subs]`

- **Logo tile** — a visual anchor makes a list of twenty issues scannable by
  shape rather than by reading. Falls back to a monogram when no logo resolves;
  the fallback is a designed state, not a broken image.
- **State line** — the plain-language state (`Allotment out`, `Open now`,
  `Opens 10 Sept`), not the raw status enum. This is what decides the next click.
- **Issue price** is a column, not hidden. **GMP carries its gain % inline**
  rather than occupying two columns.
- **Two filter axes**: status tabs, and a board filter (All / Mainboard / SME).
  Board was previously display-only.
- **Bottom navigation on mobile**; the top bar stays on desktop.

Adopted as information architecture only — palette, shape, type, motion and the
accent discipline above are unchanged.

#### Row anatomy, revised (second reference pass)

Stat labels cannot live only in a column header, because at 390px there is no
header. So the row is two lines on a phone and one line from `sm`:

```
[logo] Name                              [caret]
       Opens in 3d · Mainboard
       Issue price   GMP           Subs
       ₹124          ₹27 +21.77%   —
```

- **All three figures survive at 390px** by moving to their own row, rather than
  dropping two of them. Labels sit above the values on mobile and move to the
  sticky column header from `sm`.
- **Relative dates inside a week** — "Opens in 3d", "Closes today" — because the
  question is whether to act now. Past seven days it reverts to a date.
- **Expanding a row loads the issue record**: lot size, minimum investment,
  estimated profit per lot, issue size, face value, issue type, listing venue,
  and the full open → close → allotment → listing timeline. This data was
  already in the API and previously unused. Fetched only on expand.
- **Est. profit per lot = GMP × lot size**, labelled an estimate with the reason
  stated: its input is unofficial.

#### Listed issues

Once an issue lists, the outcome replaces the forecast. The row's columns become
**Issue price · Listed at · Result**, the state line reads "Listed", and GMP and
subscription drop out — both were predictions of a thing that has now happened.
A negative result carries the full negative colour, unsoftened, exactly as in
the Past tab.

Because a listed row's columns differ from the sticky header, those cells keep
their own labels at every width. A header must never sit above a value it does
not name.

Listing is detected by matching the live list against the outcome table, which
only gains a row after an issue lists — so the match is itself the signal.

Not adopted, for want of data rather than taste: a day-wise GMP history table
(the store holds a single point per IPO so far). Not worth faking. The price
*range* was previously listed here as unavailable; it is in fact on the detail
page and is now shown.

### 2. PAN manager

Add, label ("You", "Papa"), delete. localStorage only. Masked in the UI as
`AAAAA****A`.

### 3. Landing page

Asymmetric split hero with a real working demo component on the right, not a
screenshot. Real GMP table. Feature section with varied composition, not one
repeated card. Privacy section. Waitlist form.

## Mobile-first (amendment)

The phone is the default target, not the fallback. Concretely:

- **Base styles are the phone.** `sm:` and above *tighten* for pointer input —
  never the reverse. A control is comfortable first and compact second.
- **Touch targets are at least 44px on mobile**, shrinking at `sm`. This applies
  to buttons, tabs, filter chips, nav items and the wordmark.
- **Inputs are 16px on mobile.** Below 16px, iOS Safari zooms the whole page on
  focus, which then leaves the layout scrolled sideways.
- **Columns drop by priority, not by convenience.** The name and the one number
  that drives the decision survive at 390px; Issue price and Subs return at `sm`
  and `md`. A dropped column is never silently a zero — say it is uncovered.
- **Bottom navigation on phones**, top bar from `sm`; the two never both show.
- **No horizontal page scroll at any width.** Wide strips (the filter tabs)
  scroll inside their own container, and the selected item is scrolled into view
  so nothing is stranded off-screen.
- Verified by measurement at 390px, not by eye.

## Non-negotiables

- Every interactive element works or does not exist. No dead nav links.
- Empty, loading, and error states name the cause and the next action. Never
  "No data available". First run, filtered-to-nothing, and registrar-unreachable
  are three different screens.
- No invented metrics or deltas, no fake user counts, no fabricated feed, no
  "trusted by" logo bar. The product has not launched, so nothing may imply it
  has.
- No emoji in UI text, no blue-purple gradients, no page-wide glassmorphism, no
  background grid, no mesh blobs, no bento grid, no gradient text, no fake
  terminal window.
- Keyboard navigable, visible focus, WCAG AA contrast, holds at every breakpoint
  in both themes.

## Privacy

Privacy is a product feature, so surface it in the UI. PANs stay on the device,
pass through to the registrar only for the seconds a check takes, and are never
persisted server-side. Say that where the user enters a PAN, not in a settings
page.
