# Oren Design System

Design system for **Oren** — a privately-held Brazilian institutional conglomerate with 30+
years of operation, organized as a **branded house** under **Oren Corp**, with Wyoming-incorporated
entities under one institutional roof. This system codifies the production of **institutional
documents (A4) and presentations (16:9 decks)**: covers, leave-behinds, briefs, white papers, and
slide decks aimed at governments, regulators, and institutional partners.

> Oren is a **branded house** (May 2026 architecture): one master brand — **Oren Corp** — is the
> institutional holding and primary issuer, and every business operates as a same-named platform
> pillar. The pillars replace the former independent sub-brands (BTS Global Corp, Bateia Capital,
> Uaipay, Oikos Advisors), which are retired as public marks.
>
> | Pillar | Function | Inherits |
> |---|---|---|
> | **Oren Payments** | International payments, FX, settlement, banking infrastructure, B2B | Uaipay |
> | **Oren Capital** | Global investments, wealth management, family office, private markets | Bateia Capital · Oikos Advisors |
> | **Oren Governance** | International structures, holdings, trusts, compliance, succession | BTS Global Corp |
>
> House-line (always in this order): `OREN PAYMENTS · OREN CAPITAL · OREN GOVERNANCE`.
>
> **Positioning is dual.** The branded house carries a **global** narrative — *"a global platform
> for payments, capital and governance"*, tagline **"Building the future of global finance"**. The
> existing **Wyoming-first** institutional posture (anchor phrases, the Wyoming leave-behind and
> deck) is **preserved** beneath that umbrella: Wyoming is one market within the global platform,
> not the headline.

## Source of truth
This system is derived from two authoritative, self-contained sources:
- `uploads/OREN_MANUAL_DIRETRIZES.md` (and the identical `.pdf`) — *Manual de Diretrizes de
  Produção, v1.0, May 2026* — the visual/content production rules. Section references throughout
  (e.g. §17 = the Itaville card) point back to this manual.
- `uploads/Novas marcas Oren.pdf` — *Arquitetura de Marca, May 2026* — the branded-house
  architecture (Oren Corp + Payments/Capital/Governance), pillar colors, and the wordmark lockups.
  Where the two conflict on brand structure, **the architecture deck prevails**; on visual/content
  rules the production manual prevails.

There is **no codebase or Figma** — these documents are authoritative.

---

## CONTENT FUNDAMENTALS

How Oren writes. The voice is **institutional but accessible — formal without being stiff,
professional without being pompous.** The governing principle is *"show me, don't tell me"*:
substance over rhetoric. Oren presents as a **strategic partner, never a supplicant**.

**Language by audience (§4):**
- **External** (decks, leave-behinds, proposals, white papers) → **concise professional
  English.** Short, active sentences. No colloquialism, no fluff.
  - *"We propose an institutional partnership between…"*
- **Internal** (pocket guides, conduct manuals, operational briefs) → **direct Brazilian
  Portuguese**, correct accents, no excessive formality.
  - *"A reunião precisa ser eficiente sem ser apressada."*

**Person & address:** institutional first-person plural — **"we"** for Oren, **"you/Wyoming"** for
the counterpart. Never "I".

**Casing:** sentence case for body and headlines. **UPPERCASE only for eyebrows and the
house-line**, and it is typed uppercase in the content — never via `text-transform` (§6).

**Emoji:** never, in institutional documents.

**Anti-AI rules (§3) — humanization is mandatory:**
- No "It's important to note that…", "In today's fast-paced world…", "In conclusion…".
- No "transformative / revolutionary / game-changing / robust / scalable / best-in-class" unless
  immediately backed by a fact or number.
- No stacked generic adjectives ("comprehensive, robust, scalable solution").
- Not everything is a bullet — when the argument is a logical chain, write dense prose.
- No generic closers ("Looking forward to hearing from you!").

**Numbers are always sourced (§25).** Every material figure carries a discreet italic source line:
`USD 654.5B` → *Banco Central do Brasil — CBE Census, data-base 2024.* Estimates are prefixed `~`
or "approximately". Never invent data; when evidence is missing, omit or ask.

**Anchor phrases (§24)** recur verbatim across documents — keep the exact wording:
- *"We are not asking for a decision in this room."*
- *"We are not asking Wyoming to invest money — we fund the operations."*
- *"Wyoming has the framework. Oren has the market and the commitment. The partnership is the bridge."*
- *"Our commitment to this state is operational, not opportunistic."*

**Positioning guardrails:** Wyoming-first (§26) — never disparage other jurisdictions or imply
parallel deals. Some topics are mentioned only if asked (§28). Forbidden palettes/terms in
external docs are listed in §5/§31.

---

## VISUAL FOUNDATIONS

The Oren look is **quiet institutional confidence** — deep greens, generous whitespace, large
light-weight headlines, hairline rules, and square corners. It reads as "stable, long-lived,
valuable" rather than tech-startup or corporate-blue (§41).

**Color (§5).** Four functional greens are the **core** — the default for any Oren-Corp document,
still no deviation:
- `--oren-deep #092d29` — dark cover/slide backgrounds; h1/h2 on white.
- `--oren-mid #0e5351` — the Itaville card fill, callout/phase left rules, eyebrows on light.
- `--oren-light #affa57` — the single bright accent: eyebrows/labels/numbers on dark.
- `--oren-cream #e8f3e8` — title/text on dark.
- A green-tinted neutral ramp (`#1a1a1a → #6b7672`) for body, captions, footers; near-white
  surfaces (`#ffffff`, `#fafaf8`, `#f3f6f3`) for sheets and alternating rows.

**Pillar colors (branded house).** Each platform pillar additionally owns **one signature green**,
used for its symbol/lockup, section eyebrows, and accent rules in *pillar-scoped* material. The
core greens above remain the default; the pillar color retheme accents only — set `--pillar` on a
document root, never repaint the whole surface.
- `--oren-payments #affa57` — Oren Payments (verde luz; shares the core light green).
- `--oren-capital #62cc6d` — Oren Capital (verde-folha).
- `--oren-governance #1da688` — Oren Governance (jade; carries the BTS Global legacy).
- The Oren-Corp master mark uses a jade→leaf-green **gradient** (`oren-symbol-gradient.svg`).

- **Forbidden in external docs:** red, orange, royal blue, metallic gold, any competitor palette.
  (Internal PT guides may use a discreet `#b00020` / `#1a6e3a` for don't/do.)

**Typography (§6, §39–§40).** Single family: **Inter** (300–900), loaded from Google Fonts.
- **Headlines are weight 400 — never bold.** Elegance comes from large size (36–64pt) plus
  negative tracking (−0.018em to −0.03em). Bold headlines read as generic sales decks.
- **Body weight 400.** Emphasis = `color + weight 500`, never 700.
- **Eyebrows weight 500, positive tracking 0.14em, UPPERCASE in content.**
- Tabular figures (`"tnum"`) for pagination and stats.

**Spacing (§7, §42).** Modular system in **millimetres** — documents live in physical units.
Anchors: 2 · 4 · 6 · 9 · 14 · 18 · 20 mm. Page margins, body insets, card gaps and heights are
all mm-fixed. Sheets/slides have **fixed heights with `overflow: hidden`** so content never bleeds.

**Backgrounds.** Mostly flat white sheets / deep-green dark surfaces. **No gradients, no photos,
no textures.** The only decorative element is the radial symbol used as a low-opacity (0.15)
corner watermark on dark covers and closings.

**Corners & borders.** **Square corners everywhere** — cards, tables, phase boxes. The *only*
circle is the numbered step badge. Dividers are **hairlines** (0.4–0.8px): footer top-rule,
stat top-rule, table row borders. Accent rules: callout `border-left 1.5px`, active phase
`border-left 2.5px`. **No drop shadows** in the print artifact (the leave-behind viewer adds a
faint preview shadow only on screen, never in PDF).

**Cards.** The icon component is the **Itaville card** (§17): a flat `--oren-mid` rectangle, no
rounding, no shadow, with a light-green UPPERCASE label, a white title, and muted-green body.

**Animation & states.** Documents and PDFs are static — **no animation**. The only interactive
surface is the deck viewer: slide nav buttons fade to the light-green accent on hover
(150ms), no bounces. Reduced-motion safe by construction.

**Transparency & blur.** Used sparingly — only the deck-viewer nav pill (translucent deep-green
with a small backdrop blur). Document content is fully opaque.

**Imagery vibe.** Cool-toned and sober, to sit with the greens. Two brand backgrounds ship in
`assets/backgrounds/`: **petals-dark.png** (a dark 3D-petal hero field — covers and section
dividers; keep the headline in the open upper-left) and **deep-texture.jpg** (a flat deep-green
grain — a quieter full-bleed dark surface). Photos are still avoided; the brand relies on type,
the symbol, and these two fields.

---

## ICONOGRAPHY

Oren is **deliberately icon-light**. The system ships **no icon set** — institutional documents
use type, hairlines, and the symbol rather than UI glyphs. Specifically:

- **The Oren symbol** — a radial **flower of 16 petals**, the official organic artwork (not a
  geometric reconstruction). Recolorable: color follows context: `--oren-deep` on
  white, `--oren-cream` (small accent) or `--oren-light` (large watermark) on dark; per-pillar
  tones (`payments`/`capital`/`governance`) and the corp `gradient` for branded-house material.
  The `OrenSymbol` React component embeds the silhouette and recolors it via CSS mask (solid tone
  or gradient) — no external asset needed. Standalone files in `assets/` carry the same organic
  artwork: `oren-symbol-deep/-cream/-light/-gradient.svg`, a `currentColor` `oren-symbol.svg`, and
  full-color raster marks per pillar in `assets/symbols/` (`oren`/`payments`/`capital`/
  `governance`/`deep`/`cream`/`light`.png). An animated build-on of the mark lives at
  `assets/oren-symbol-animated.gif` (screen only, never print).
- **The lockup** — symbol + the **Oren** wordmark + an optional *italic pillar descriptor*
  (`OrenLockup` component; reference artwork in `assets/lockups/`). One master wordmark; the
  symbol and descriptor carry the pillar color, the wordmark stays legible (deep on light, cream
  on dark). The wordmark is weight 500, the descriptor italic 400 — never bold.
- **No icon font, no SVG icon library, no PNG icons.**
- **No emoji** in institutional documents (§3).
- **Unicode as punctuation only:** the middle dot `·` separates house-line marks and meta; `‹ ›`
  in the deck nav; `§`, `~`, and law citations (`W.S. §17-30`) inside body text. These are
  typographic, not decorative icons.

If a future need genuinely requires icons, add a minimal, hairline-weight set that matches the
0.6px rule weight — and document it here. Until then, **do not introduce icons or emoji.**

> Substitution flag: **Inter is loaded from the Google Fonts CDN** (per the manual), not bundled
> as local font files — so the compiler reports "Fonts: none" (it only counts local `@font-face`).
> Consumers still get Inter at runtime. If you need a fully offline bundle, drop Inter `woff2`
> files into `assets/fonts/` and replace the `@import` in `tokens/fonts.css` with `@font-face`
> rules. No icon assets were substituted — the system genuinely has none.

---

## INDEX / MANIFEST

**Root**
- `styles.css` — global entry point (import this). `@import`s the four token files below.
- `readme.md` — this guide. `SKILL.md` — Agent-Skills-compatible entry.
- `uploads/OREN_MANUAL_DIRETRIZES.{md,pdf}` — the source manual.

**Tokens** (`tokens/`)
- `fonts.css` — Inter via Google Fonts CDN.
- `colors.css` — primaries, neutrals, semantic aliases.
- `typography.css` — family, weights, full pt type scale.
- `spacing.css` — mm scale, page geometry, card sizes, borders/radii.

**Components** (`components/`) — React primitives, namespace `window.OrenDesignSystem_058acc`
- `brand/OrenSymbol` — the 16-petal mark (core + pillar tones + corp gradient).
- `brand/OrenLockup` — symbol + Oren wordmark + pillar descriptor (branded house).
- `typographic/Eyebrow`, `typographic/Callout`.
- `cards/CardIt` — the Itaville card.
- `data/Stat`, `data/PhaseBox`, `data/StepList`, `data/InvestTable`.
- Each has `.jsx` + `.d.ts` + `.prompt.md`; each directory has a `@dsCard` HTML.

**UI kits** (`ui_kits/`)
- `deck/` — interactive 16:9 presentation (DECK · WBC-02), 7 slides, prev/next + arrow keys.
- `leave_behind/` — A4 paginated leave-behind (DOC · LB-WBC-A), 5 pages, fit-to-width.

**Slide specimens** (`slides/`)
- `TitleSlide`, `CardsSlide`, `StatsSlide`, `ClosingSlide` (+ shared `slide.css`).

**Foundation cards** (`guidelines/`) — the Design System tab specimens (Colors, Type, Spacing,
Brand).

**Assets** (`assets/`) — the symbol artwork: standalone organic SVGs
(deep/cream/light/gradient/currentColor), full-color raster marks in `assets/symbols/`, the
animated mark `oren-symbol-animated.gif`, the wordmark lockups in `assets/lockups/`, and the two
brand backgrounds in `assets/backgrounds/`.

**Document conventions** (from the manual)
- DOC IDs: `LB-XXX-Y` (leave-behind), `DECK · XXX-NN · vY.Y` (deck), `BRIEF · XXX-NN · vY.Y`,
  `MANUAL · XXX-NN`.
- Formats: A4 portrait `210 × 297mm`; deck `297 × 167mm` (16:9). Boilerplate templates: §33–§35.
- QA before shipping: §36–§38 (fixed heights, house-line on every internal page, headlines at
  weight 400, eyebrows uppercase, every number sourced).
