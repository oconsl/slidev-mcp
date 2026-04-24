/**
 * Cross-tool defaults based on accumulated project observations/preferences.
 * Source: memory observation #54 — preference/style-class1
 *
 * These values are applied whenever the agent doesn't explicitly override them.
 */

// ── Theme ────────────────────────────────────────────────────────────────────
export const DEFAULT_THEME = "seriph";

// ── Color schema ──────────────────────────────────────────────────────────────
/** Force the dark variant of the theme. Slidev themes that support dark/light use this key. */
export const DEFAULT_COLOR_SCHEMA = "dark";

// ── Canvas ───────────────────────────────────────────────────────────────────
/** Standard Slidev canvas width used for newly initialized presentations. */
export const DEFAULT_CANVAS_WIDTH = 1080;

// ── Base-style protection guide for Tailwind/UnoCSS classes ──────────────────
/**
 * Guidance for using Tailwind/UnoCSS utility classes in Slidev frontmatter (class field)
 * or inline in slide content WITHOUT overriding the base styles already defined by
 * the MCP global style.css.
 *
 * RULE: Do NOT add any Tailwind/UnoCSS class that modifies a property already set by
 * style.css (typography, colors, spacing, font sizes, weights, line heights, borders,
 * shadows, backgrounds). Only add classes when explicitly instructed by the user or
 * when the class is purely for layout/positioning and does not conflict.
 *
 * ── FORBIDDEN — overrides base typography set by style.css ──────────────────
 *   text-xs, text-sm, text-base, text-lg, text-xl, text-2xl ... text-9xl
 *     → h1/h2/h3/p/li font sizes are already set by style.css
 *   font-sans, font-serif, font-mono
 *     → Inter and JetBrains Mono are already applied via style.css
 *   font-thin, font-extralight, font-light, font-normal, font-medium,
 *   font-semibold, font-bold, font-extrabold, font-black
 *     → font-weight is already controlled per element in style.css
 *   leading-none, leading-tight, leading-snug, leading-normal,
 *   leading-relaxed, leading-loose, leading-[*]
 *     → line-height is set on p and li in style.css
 *   tracking-tighter, tracking-tight, tracking-normal, tracking-wide,
 *   tracking-wider, tracking-widest
 *     → letter-spacing is set on h1/h3 in style.css
 *
 * ── FORBIDDEN — overrides base color scheme (dark palette) ──────────────────
 *   bg-white, bg-gray-50..200, bg-slate-50..100, bg-zinc-50..100,
 *   bg-neutral-50..100, bg-stone-50..100
 *     → Break the dark #0d0d0f base background
 *   text-black, text-gray-700..900, text-slate-800..900, text-zinc-800..900
 *     → Break the #e8e8f0 text palette
 *   border-gray-200..300, border-white, border-slate-200..300
 *     → Border colors are set via --color-border in style.css
 *   shadow-*, ring-*
 *     → No shadow system defined; avoid arbitrary additions
 *
 * ── ALLOWED — layout & positioning (no style.css conflict) ──────────────────
 *   text-center, text-left, text-right, text-justify
 *   flex, grid, inline-flex, inline-grid
 *   items-center, items-start, items-end, items-stretch
 *   justify-center, justify-between, justify-start, justify-end, justify-around
 *   flex-col, flex-row, flex-wrap, flex-nowrap
 *   p-*, px-*, py-*, pt-*, pb-*, pl-*, pr-*
 *   m-*, mx-*, my-*, mt-*, mb-*, ml-*, mr-*
 *   gap-*, gap-x-*, gap-y-*, space-x-*, space-y-*
 *   w-*, h-*, max-w-*, min-w-*, max-h-*, min-h-*
 *   col-span-*, row-span-*, col-start-*, row-start-*
 *   overflow-hidden, overflow-auto, overflow-scroll, overflow-visible
 *   relative, absolute, fixed, sticky, inset-*, top-*, left-*, right-*, bottom-*
 *   z-*, opacity-* (only for explicit layering, not to dim/lighten base text)
 *   rounded-*, rounded-[*] (border-radius only; no border color)
 *   self-*, place-*, place-items-*, place-content-*
 *   truncate, line-clamp-*
 *
 * ── ALLOWED — dark-compatible color classes (when color IS explicitly needed) ─
 *   bg-transparent, bg-black/*, bg-gray-800..900, bg-zinc-800..900,
 *   bg-slate-800..900, bg-neutral-800..900, bg-stone-800..900
 *   text-white, text-gray-100..400, text-slate-100..300, text-zinc-100..300
 *
 * ── PREFERRED APPROACH ───────────────────────────────────────────────────────
 *   Avoid adding ANY color or typography class. Rely exclusively on the CSS
 *   variables already defined in style.css:
 *     var(--color-bg), var(--color-surface), var(--color-border),
 *     var(--color-text), var(--color-text-dim), var(--color-muted),
 *     var(--color-accent), var(--color-accent2), var(--color-accent3),
 *     var(--color-danger), var(--color-success)
 *   Apply them via <style scoped> blocks instead of Tailwind classes.
 */
export const DARK_SAFE_CLASSES_GUIDE =
  "BASE STYLE PROTECTION RULE — Do NOT add Tailwind/UnoCSS classes that override the MCP base styles " +
  "already defined in style.css, unless the user explicitly requests it. " +

  "FORBIDDEN — typography overrides (style.css controls these): " +
  "text-xs/sm/base/lg/xl/2xl..9xl (font sizes set per element), " +
  "font-sans/serif/mono (Inter + JetBrains Mono already applied), " +
  "font-thin..black (font-weight set per element), " +
  "leading-* (line-height set on p/li), " +
  "tracking-* (letter-spacing set on h1/h3). " +

  "FORBIDDEN — color overrides (breaks dark palette #0d0d0f/#e8e8f0): " +
  "bg-white, bg-gray-50..200, bg-slate-50..100, bg-zinc-50..100, bg-neutral-50..100, bg-stone-50..100, " +
  "text-black, text-gray-700..900, text-slate-800..900, text-zinc-800..900, " +
  "border-gray-200..300, border-white, border-slate-200..300, shadow-*, ring-*. " +

  "ALLOWED — layout/positioning only (no style.css conflict): " +
  "text-center/left/right, flex, grid, items-*, justify-*, flex-col/row, " +
  "p-*, m-*, gap-*, w-*, h-*, max-w-*, overflow-*, relative, absolute, z-*, " +
  "col-span-*, row-span-*, rounded-*, self-*, truncate, line-clamp-*. " +

  "ALLOWED — dark-compatible colors (only when color is explicitly needed): " +
  "bg-transparent, bg-black/*, bg-gray-800..900, bg-zinc-800..900, " +
  "text-white, text-gray-100..400, text-slate-100..300. " +

  "PREFERRED: skip color/typography classes entirely — use <style scoped> with " +
  "CSS variables: var(--color-bg), var(--color-text), var(--color-accent), " +
  "var(--color-accent2), var(--color-accent3), var(--color-surface), var(--color-border).";

// ── Global aspect ratio ───────────────────────────────────────────────────────
export const DEFAULT_ASPECT_RATIO = "16/9";

// ── Default global transition ─────────────────────────────────────────────────
export const DEFAULT_TRANSITION = "fade";

// ── Global CSS (style.css) ────────────────────────────────────────────────────
/**
 * Full dark-minimal palette with Inter + JetBrains Mono typography,
 * violet/teal/amber accent system, tables, code blocks, cards, and Mermaid.
 *
 * Palette:
 *   --color-bg:       #0d0d0f  (dark base)
 *   --color-surface:  #16161a  (elevated surface)
 *   --color-border:   #2a2a35  (subtle borders)
 *   --color-muted:    #5a5a72  (dimmed text)
 *   --color-text:     #e8e8f0  (main text)
 *   --color-text-dim: #9898b0  (secondary text)
 *   --color-accent:   #7c6af7  (violet — primary accent)
 *   --color-accent2:  #4fd1c5  (teal — secondary accent)
 *   --color-accent3:  #f6ad55  (amber — emphasis/warnings)
 *   --color-danger:   #fc8181  (red — danger/negative)
 *   --color-success:  #68d391  (green — success/positive)
 */
export const DEFAULT_GLOBAL_STYLE_CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');

:root {
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  --color-bg:       #0d0d0f;
  --color-surface:  #16161a;
  --color-border:   #2a2a35;
  --color-muted:    #5a5a72;
  --color-text:     #e8e8f0;
  --color-text-dim: #9898b0;
  --color-accent:   #7c6af7;
  --color-accent2:  #4fd1c5;
  --color-accent3:  #f6ad55;
  --color-danger:   #fc8181;
  --color-success:  #68d391;
}

/* ── Base layout ────────────────────────────────────────────────────── */
.slidev-layout {
  font-family: var(--font-sans) !important;
  background: var(--color-bg);
  color: var(--color-text);
}

/* ── Headings ───────────────────────────────────────────────────────── */
h1 {
  font-size: 2.4rem !important;
  font-weight: 800 !important;
  letter-spacing: -0.03em !important;
  line-height: 1.15 !important;
  background: linear-gradient(135deg, #ffffff 40%, var(--color-accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

h2 {
  font-size: 1.4rem !important;
  font-weight: 500 !important;
  color: var(--color-text-dim) !important;
  letter-spacing: -0.01em !important;
  -webkit-text-fill-color: var(--color-text-dim);
}

h3 {
  font-size: 1rem !important;
  font-weight: 600 !important;
  color: var(--color-accent) !important;
  text-transform: uppercase;
  letter-spacing: 0.08em !important;
  -webkit-text-fill-color: var(--color-accent);
}

/* ── Body text ──────────────────────────────────────────────────────── */
p, li {
  font-size: 0.95rem;
  line-height: 1.75;
  color: var(--color-text-dim);
}

strong {
  color: var(--color-text);
  font-weight: 600;
}

/* ── Code ───────────────────────────────────────────────────────────── */
pre, code {
  font-family: var(--font-mono) !important;
  background: #111118 !important;
  border: 1px solid var(--color-border) !important;
  border-radius: 8px !important;
  font-size: 0.78rem !important;
}

code:not(pre code) {
  background: rgba(124, 106, 247, 0.12) !important;
  color: var(--color-accent) !important;
  padding: 1px 6px !important;
  border-radius: 4px !important;
  border: 1px solid rgba(124, 106, 247, 0.2) !important;
  font-size: 0.85em !important;
}

/* ── Tables ─────────────────────────────────────────────────────────── */
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

th {
  background: rgba(124, 106, 247, 0.1);
  color: var(--color-accent);
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
}

td {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(42, 42, 53, 0.6);
  color: var(--color-text-dim);
}

tr:hover td {
  background: rgba(124, 106, 247, 0.04);
  color: var(--color-text);
}

/* ── Links ──────────────────────────────────────────────────────────── */
a {
  color: var(--color-accent2);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

/* ── Blockquote ─────────────────────────────────────────────────────── */
blockquote {
  border-left: 3px solid var(--color-accent) !important;
  background: rgba(124, 106, 247, 0.06) !important;
  padding: 12px 20px !important;
  border-radius: 0 8px 8px 0 !important;
  font-style: italic;
  color: var(--color-text-dim) !important;
}

/* ── Section layout ─────────────────────────────────────────────────── */
.slidev-layout.section {
  background: var(--color-bg);
  position: relative;
  overflow: hidden;
}

.slidev-layout.section::before {
  content: '';
  position: absolute;
  top: -120px;
  left: -80px;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(124,106,247,0.08) 0%, transparent 70%);
  pointer-events: none;
}

.slidev-layout.section::after {
  content: '';
  position: absolute;
  bottom: -80px;
  right: -60px;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(79,209,197,0.06) 0%, transparent 70%);
  pointer-events: none;
}

.slidev-layout.section h1 {
  font-size: 3rem !important;
}

/* ── Cover layout ───────────────────────────────────────────────────── */
.slidev-layout.cover h1 {
  font-size: 3.2rem !important;
  text-shadow: 0 0 60px rgba(124,106,247,0.4);
}

/* ── Center layout ──────────────────────────────────────────────────── */
.slidev-layout.center {
  background: var(--color-bg);
}

/* ── Cards / highlight boxes ─────────────────────────────────────────── */
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem 1.25rem;
}

.card-accent { border-left: 3px solid var(--color-accent); }
.card-teal   { border-left: 3px solid var(--color-accent2); }
.card-amber  { border-left: 3px solid var(--color-accent3); }

.accent-card {
  background: rgba(124, 106, 247, 0.06);
  border: 1px solid rgba(124, 106, 247, 0.2);
  border-radius: 12px;
  padding: 16px 20px;
}

/* ── Mermaid diagrams ────────────────────────────────────────────────── */
:deep(.mermaid) {
  transform: scale(1.15);
  transform-origin: top center;
}

:deep(.mermaid svg) {
  width: 100%;
  height: auto;
}

/* ── Table utility variants ──────────────────────────────────────────── */

/* Glosario: prevents term column from wrapping */
.glosario-table td:first-child,
.glosario-table th:first-child {
  white-space: nowrap;
  width: 9rem;
}

.glosario-table table {
  font-size: 0.78rem;
}

.glosario-table td,
.glosario-table th {
  padding: 5px 8px;
}

/* Compact table: tighter row padding */
.table-compact td,
.table-compact th {
  padding: 5px 10px;
}

/* Small table: tighter rows + smaller font */
.table-sm table {
  font-size: 0.78rem;
}

.table-sm td,
.table-sm th {
  padding: 4px 8px;
}

.table-sm h3 {
  margin-top: 0 !important;
  margin-bottom: 0.25rem !important;
}

/* ── Smooth transitions ──────────────────────────────────────────────── */
* {
  transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
}

/* ── Scrollbar (for code blocks) ─────────────────────────────────────── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }
`;

// ── Mermaid init ──────────────────────────────────────────────────────────────
/** Mermaid init config to improve default readability in Slidev (dark theme, larger font). */
export const DEFAULT_MERMAID_INIT =
  "%%{init: { 'theme': 'dark', 'themeVariables': { 'fontSize': '18px' } }}%%";

// ── Layout-conditional defaults ───────────────────────────────────────────────

/**
 * Layouts that require a default `class: mx-2` when no class is explicitly set.
 * This adds horizontal margin so content doesn't hug the column edges.
 */
const TWO_COLS_LAYOUTS = new Set(["two-cols", "two-cols-header"]);

/**
 * Applies layout-conditional defaults to a per-slide frontmatter string.
 *
 * Rules:
 *   - `two-cols` / `two-cols-header`: inject `class: mx-2` when no `class` key
 *     is already present in the frontmatter.
 *
 * @param frontmatter  Raw per-slide frontmatter text (without --- delimiters), or undefined.
 * @returns Updated frontmatter string (trimmed), or undefined if no frontmatter was produced.
 */
export function applyLayoutDefaults(frontmatter: string | undefined): string | undefined {
  if (!frontmatter) return frontmatter;

  const fm = frontmatter.trim();
  if (!fm) return frontmatter;

  // Extract layout value (e.g. `layout: two-cols`)
  const layoutMatch = fm.match(/^layout\s*:\s*(.+)$/m);
  if (!layoutMatch) return frontmatter;

  const layout = layoutMatch[1].trim().replace(/^["']|["']$/g, "");

  if (!TWO_COLS_LAYOUTS.has(layout)) return frontmatter;

  // Only inject if `class` key is not already present
  if (/^class\s*:/m.test(fm)) return frontmatter;

  return `${fm}\nclass: mx-2`;
}

// ── Cover slide template ───────────────────────────────────────────────────────
/**
 * Recommended layout for cover/closing slides.
 * Use `layout: cover` with `class: text-center` and an Unsplash background.
 */
export const DEFAULT_COVER_FRONTMATTER = `layout: cover
class: text-center
background: https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1920&q=80`;

// ── Section slide template ─────────────────────────────────────────────────────
/**
 * Recommended layout for section divider slides.
 * Use `layout: section` with `slide-up` transition override.
 */
export const DEFAULT_SECTION_FRONTMATTER = `layout: section
transition: slide-up`;
