/**
 * Ban pinned widths on component props — `width`, `maxWidth`, `minWidth` set to
 * a pixel count, an absolute unit, or a value the rule cannot read.
 *
 * This is a rule for codebases that have decided layout flows to the viewport
 * by default, and that any exception to that is a design decision somebody
 * takes on purpose rather than a number somebody reaches for while building a
 * screen. It is the width half of what a design system's spacing scale already
 * does for padding: `padding={6}` is a token, `maxWidth={768}` is a measurement,
 * and only one of them survives a redesign.
 *
 * WHY THIS AND NOT A CODE REVIEW HABIT. Same reason as `no-style-prop`, with
 * the same evidence. In the repo this was written for, a sweep removed ninety
 * pinned widths in one afternoon — `Dialog width={520}` twelve times over,
 * `TextInput width={280}` on every search box, a `maxWidth={768}` reading
 * measure on the legal pages, a `lib/measures.ts` of shell constants. None of
 * them arrived carelessly. Most had a comment above them explaining the number,
 * which is exactly the problem: a justified pin reads like a considered
 * decision, so nobody removes it, and the next screen copies it. The sweep is
 * cheap; staying swept is not, and that is what a rule is for.
 *
 * WHAT COUNTS AS RESPONSIVE, AND THE ONE JUDGEMENT IN IT. Allowed are values
 * that resolve against something that changes: the viewport (`vw`/`vh` and the
 * small/large/dynamic and logical families), the container (`%`, the `cq*`
 * container-query units), and the intrinsic keywords (`auto`, `min-content`,
 * `max-content`, `fit-content()`, `stretch`). `calc()`, `min()`, `max()` and
 * `clamp()` are allowed when every term inside them is.
 *
 * FONT-RELATIVE UNITS ARE BANNED, and that is the judgement. `rem`, `em`, `ch`
 * and `lh` do respond to something — the reader's text size — which is a real
 * accessibility axis and the reason they are the right unit for typography.
 * They do not respond to the viewport. On a width prop, `maxWidth="65ch"` is a
 * fixed measure wearing a relative unit: it is the deleted `maxWidth={768}`
 * reading measure, re-spelled, and it would pass a rule that only banned `px`.
 * A repo that wants the classic reading measure back should decide that once,
 * for every run of text at the same time, rather than one screen at a time —
 * which is precisely the decision this rule exists to force upward.
 *
 * WHY A GREP IS NOT ENOUGH, and it is the same lesson `no-style-prop` learned.
 * `width={520}` is the easy half. The entrenched half is `maxWidth={PROSE}` —
 * hoisted to a constant, often to a shared module, *because* it was used in
 * several places and therefore mattered most. A text search for a digit finds
 * the casual ones and misses those. So a value this rule cannot read statically
 * is reported too, under its own message: not because it is certainly a pin,
 * but because a width that cannot be checked is a width that is not checked,
 * and the constant is where these go to hide.
 *
 * WHAT TO USE INSTEAD
 *   - nothing. Most components size themselves from their container when the
 *     prop is absent; check before adding one. A form library's own layout
 *     component usually flexes its fields already, so a width on each field is
 *     fighting the layout rather than helping it.
 *   - `width="100%"` where a component must fill its parent — relative, so it
 *     says "as wide as whatever contains me", which is the opposite of a pin.
 *   - a responsive grid floor. `columns={{ minWidth: 250 }}` on a grid is a
 *     REFLOW THRESHOLD, not a pin — it says "wrap to fewer columns below 250px
 *     each", so it causes reflow where a `maxWidth` prevents it. Those are
 *     object properties rather than JSX attributes, so they do not match here,
 *     deliberately. See SCOPE.
 *   - a container query, when a component genuinely needs to change shape at a
 *     size rather than merely fit one.
 *
 * SCOPE, AND THE HOLES IT LEAVES.
 *   - Only JSX attributes named `width`, `maxWidth` or `minWidth` match, on
 *     components only. **Host elements are exempt**: `<img width={800}>` and
 *     `<svg width={24}>` are intrinsic dimensions, and on an image that
 *     attribute is what lets the browser reserve the right box before the file
 *     arrives — banning it would trade a layout pin for layout shift.
 *   - HEIGHTS ARE OUT OF SCOPE. A pinned height does not stop a page reflowing
 *     horizontally, and the honest uses are common: a skeleton bar's height, a
 *     scroll ceiling on a log viewer. If a repo wants those too, the prop list
 *     below is the only thing to change.
 *   - Object properties are not read: `{ width: 520 }` passed as a prop, a
 *     stylex or CSS-in-JS object, or a column config, all pass. This is the
 *     grid-floor carve-out above, and it is also this rule's real limit —
 *     pair it with `no-style-prop` so the inline-style route is closed.
 *   - Spreads (`<Foo {...{ width: 520 }} />`) are not caught. As with every
 *     rule in this package: evading a lint rule through a spread is a
 *     deliberate act, not an accident.
 */

/**
 * The props this rule reads. Names only — the value is what gets judged.
 *
 * Heights are deliberately absent; see SCOPE above. Adding `height`,
 * `maxHeight` and `minHeight` here is all it would take, and the value grammar
 * below needs no change to cover them.
 */
const PINNABLE_PROPS = new Set(["width", "maxWidth", "minWidth"]);

/**
 * Units that resolve against something that changes.
 *
 * Built rather than listed: the viewport units come in a logical pair
 * (`vi`/`vb`) and a physical pair (`vw`/`vh`) plus `vmin`/`vmax`, and each of
 * those six has small/large/dynamic variants (`svw`, `lvw`, `dvw`). Spelling
 * out all twenty-four invites a typo that silently bans a valid unit.
 */
const RESPONSIVE_UNITS = new Set([
  "%",
  ...["", "s", "l", "d"].flatMap((prefix) => ["vw", "vh", "vi", "vb", "vmin", "vmax"].map((unit) => `${prefix}${unit}`)),
  // Container-query units: relative to the nearest query container, which is
  // the most local "responds to its context" there is.
  "cqw",
  "cqh",
  "cqi",
  "cqb",
  "cqmin",
  "cqmax",
]);

/**
 * Keywords that describe a behaviour rather than a size. `none` is here for
 * `maxWidth: none`, which REMOVES a cap and is therefore the opposite of a pin.
 */
const RESPONSIVE_KEYWORDS = new Set([
  "auto",
  "none",
  "normal",
  "stretch",
  "available",
  "min-content",
  "max-content",
  "fit-content",
  "-webkit-fill-available",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

/**
 * Functions whose result is as responsive as their arguments. Every term inside
 * is checked, so `min(400px, 90vw)` is still a violation — the `px` term is the
 * ceiling that actually binds on a desktop.
 *
 * `var()` is absent on purpose: a custom property can hold anything, so a
 * `var()` width falls through to the "cannot be verified" message rather than
 * being waved through.
 */
const RESPONSIVE_FUNCTIONS = new Set(["calc", "min", "max", "clamp", "fit-content"]);

const PIN_MESSAGE =
  "Pinned width. Layout flows to its container by default here — drop the prop and let the component size itself, or use a relative value (`100%`, `90vw`, a `cq*` container unit, `auto`/`fit-content`). Pixel counts, absolute units and font-relative units (`rem`/`em`/`ch`) are all fixed measures; a grid's `columns={{minWidth}}` is a reflow threshold and is not this.";

const OPAQUE_MESSAGE =
  "This width cannot be read statically, so it cannot be checked — and a hoisted constant is where pinned widths go to hide (`maxWidth={PROSE_WIDTH}`). Inline the value so the unit is visible at the call site, or drop the prop and let the layout flow.";

/** `-3.5e2` and friends, followed by an optional unit or `%`. */
const DIMENSION = /(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(%|[a-z]+)?/gi;
/** A bare word, or a word immediately followed by `(` — i.e. a function call. */
const WORD = /([a-z][a-z0-9-]*)\s*(\()?/gi;

/**
 * Does this CSS value resolve against something that changes?
 *
 * Returns false for anything it does not positively recognise: an unknown unit
 * or an unknown function is a value nobody has thought about, and the allowlist
 * is the whole point of the rule.
 */
function isResponsiveValue(raw) {
  const value = raw.trim().toLowerCase();
  if (value === "") return false;
  if (RESPONSIVE_KEYWORDS.has(value)) return true;

  // A bare number is pixels in every design system that takes `number | string`
  // sizing props, so it is a pin — except inside a function, where bare numbers
  // are arithmetic terms (`calc(100% / 3)`, `clamp(…)`'s multipliers) and carry
  // no length of their own. Tracking which parenthesis a token sits inside is
  // more machinery than this earns; the presence of any call is enough, and the
  // hole it leaves — `min(520, 90vw)` — is not valid CSS anyway, so it would
  // fail in the browser rather than pin anything.
  const hasCall = /[a-z][a-z0-9-]*\s*\(/i.test(value);

  for (const [, number, unit] of value.matchAll(DIMENSION)) {
    if (unit === undefined) {
      if (Number(number) !== 0 && !hasCall) return false;
      continue;
    }
    if (!RESPONSIVE_UNITS.has(unit)) return false;
  }

  // Every word must be a keyword this rule allows or a function it allows.
  // `e` in `1e3` and the units above are consumed by DIMENSION first only when
  // they follow a number, so a stray identifier still lands here.
  for (const [match, word, call] of value.matchAll(WORD)) {
    // Skip the tail of a dimension: `90vw` yields the word `vw`.
    if (match.length > 0 && RESPONSIVE_UNITS.has(word) && !call) continue;
    if (call) {
      if (!RESPONSIVE_FUNCTIONS.has(word)) return false;
      continue;
    }
    if (!RESPONSIVE_KEYWORDS.has(word)) return false;
  }

  return true;
}

/**
 * A component, not a host element. `<Card>` is a component; `<img>` and `<svg>`
 * are the DOM, where `width` is an intrinsic dimension rather than a layout
 * decision — see SCOPE. Namespaced and member names (`<Foo.Bar>`) are
 * components too.
 */
function isComponentElement(opening) {
  const name = opening?.name;
  if (!name) return false;
  if (name.type === "JSXIdentifier") return /^[A-Z]/.test(name.name);
  return true;
}

/**
 * The element is visited rather than the attribute, so the rule never reads
 * `node.parent`. Oxlint's plugin host is an alpha reimplementation of the
 * ESLint rule API and parent links are not part of what this package is willing
 * to depend on; walking down from the opening element needs nothing but the
 * node it was handed.
 */
export default {
  create(context) {
    function checkAttribute(node) {
      {
        if (node.type !== "JSXAttribute" || node.name?.type !== "JSXIdentifier") return;
        if (!PINNABLE_PROPS.has(node.name.name)) return;

        const value = node.value;
        // `<Foo width />` — a boolean shorthand, not a size.
        if (value === null || value === undefined) return;

        // `width="100%"`
        if (value.type === "Literal" && typeof value.value === "string") {
          if (!isResponsiveValue(value.value)) context.report({ node: value, message: PIN_MESSAGE });
          return;
        }

        if (value.type !== "JSXExpressionContainer") return;
        const expression = value.expression;

        // `width={520}` — a bare number is pixels.
        if (expression.type === "Literal" && typeof expression.value === "number") {
          if (expression.value !== 0) context.report({ node: expression, message: PIN_MESSAGE });
          return;
        }

        // `width={"100%"}` and `width={`100%`}` — the same literal, spelled
        // around the expression container. A template with substitutions is a
        // value nobody can read, so it falls through to OPAQUE_MESSAGE below.
        if (expression.type === "Literal" && typeof expression.value === "string") {
          if (!isResponsiveValue(expression.value)) context.report({ node: expression, message: PIN_MESSAGE });
          return;
        }
        if (expression.type === "TemplateLiteral" && expression.expressions.length === 0) {
          if (!isResponsiveValue(expression.quasis[0]?.value?.cooked ?? "")) {
            context.report({ node: expression, message: PIN_MESSAGE });
          }
          return;
        }

        // A comment in the expression slot, which is not a value at all.
        if (expression.type === "JSXEmptyExpression") return;

        // Anything else: an identifier, a member expression, a call, a
        // conditional, a template with holes. Unreadable, therefore unchecked.
        context.report({ node: expression, message: OPAQUE_MESSAGE });
      }
    }

    return {
      JSXOpeningElement(node) {
        if (!isComponentElement(node)) return;
        for (const attribute of node.attributes ?? []) checkAttribute(attribute);
      },
    };
  },
};
