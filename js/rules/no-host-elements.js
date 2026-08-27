/**
 * Ban raw HTML in JSX — every lowercase (host) element, minus a stated
 * allowlist.
 *
 * This is a rule for a directory that has committed to a component library
 * completely: page chrome comes from the library's layout components, structure
 * from its stack/grid/section components, text from its text component, and
 * nothing is hand-rolled out of `<div>`. In such a directory a raw host element
 * is not a small local escape — it is a second layout system with one member,
 * and it grows. `no-style-prop` closes the styling half of the same door; this
 * closes the markup half, and neither is much use without the other, since a
 * `<div className="row">` needs no `style` prop to reintroduce a parallel
 * layout vocabulary.
 *
 * WHY AN ALLOWLIST, AND NOT A LIST OF BANNED TAGS. This is the whole design,
 * and it is the reason the rule exists rather than a configured
 * `react/forbid-elements`, which takes an enumerated list of tags to forbid.
 * An enumeration of the forbidden is a losing side of the trade twice over.
 * HTML has well over a hundred elements and it gains more — `<dialog>`,
 * `<search>`, `<selectedcontent>` all postdate plenty of "we banned raw HTML"
 * commits — so a denylist is out-run by whatever tag the next person reaches
 * for, and it fails *open*: the unlisted tag is silently fine. The permitted
 * set, meanwhile, is small (typically nought to five) and every member has a
 * reason someone can state. So enumerate that side instead. A new tag is then
 * banned the day it ships, with no edit here, and switching one on is a visible
 * change to a config file rather than a silence.
 *
 * WHY A GREP IS NOT ENOUGH. `grep '<div'` matches `<divider>`, matches the word
 * inside a comment, a string, or a Markdown fixture, and misses
 * `<div\n  className=…>` where the attributes push the tag onto the next line.
 * More to the point, it cannot answer the question the rule actually asks,
 * which is not "does this text appear" but "is this JSX element a host element
 * or a component" — and that distinction is syntactic. `<Card>` and `<card>`
 * differ by one bit of casing and compile to entirely different things; so do
 * `<foo.bar>` (a component, always) and `<foo>` (the DOM, always). No pattern
 * over source text decides that; the parser already has.
 *
 * WHY THIS SHIPS OFF BY DEFAULT. Every other rule in this package encodes a
 * mistake that is a mistake everywhere — a zoneless date is wrong in any file.
 * This one encodes a decision a *directory* has taken. A `<div>` in an ordinary
 * React app is correct code, and a repo that renders host elements anywhere
 * outside the committed directory must not have this rule reach them. So it has
 * no useful global setting: switch it on per-glob, for the tree that made the
 * commitment, and leave it off elsewhere. That is also why the message is
 * configurable — it has to name the library the reader is meant to use instead,
 * and this package does not know it.
 *
 * THE ALLOWLIST IS THE RULE'S REAL CONTENT, and it should be read as a document
 * rather than a setting. Each entry is a claim that the library has no
 * equivalent *and* that the host element is unavoidable. In the codebase this
 * was written for the whole list is five, and it is worth seeing the shape of
 * the reasons because they are the standard a sixth entry has to meet:
 *   html, body — a Next root layout must render them; there is nowhere else
 *     the document element can come from.
 *   form       — a Server Action submits through a native `<form action>`. The
 *     library's `FormLayout` is layout, not a submitting form.
 *   input      — `<input type="hidden">` is the only way to carry a value into
 *     that submission. Visible inputs still use the library's `TextInput`, and
 *     a raw visible `<input>` would be an obvious anomaly in review.
 *   meta       — document metadata is not UI, so no component library should
 *     have a component for it.
 * An allowlist that grows without reasons of that kind is the ban switched off
 * one tag at a time, which is worse than not having it, because the config
 * still reads as though something is being enforced.
 *
 * SCOPE, AND THE HOLES IT LEAVES.
 *   - `React.createElement("div")` is NOT caught. The tag is a string argument
 *     there, not JSX, so this rule never sees it. Reaching for
 *     `createElement` by hand in a codebase that has banned raw HTML is a
 *     deliberate act, like the spread holes in the other rules here.
 *   - `dangerouslySetInnerHTML` is NOT caught. Its content is an opaque string;
 *     a linter can see the attribute but not the markup, and banning the
 *     attribute is a different rule with a different argument (it is about
 *     injection, not about layout vocabulary).
 *   - Member expressions are NOT caught, whatever their casing. `<foo.bar />`
 *     is a component reference to JSX — it compiles to `foo.bar`, never to the
 *     string `"foo.bar"` — so a namespaced component object (`<layout.Row />`)
 *     is correct code and must pass.
 *   - Namespaced names (`<svg:circle />`) are NOT caught. React does not
 *     support them, so a codebase hitting this rule does not have them; a
 *     parser that accepts them should not have them silently reported under a
 *     message about component libraries.
 *   - A component held in a lowercase binding IS caught, and correctly.
 *     `const card = Card; <card />` renders the string `"card"` to the DOM —
 *     JSX decides host-versus-component on casing alone, so the rule agrees
 *     with the runtime rather than with the author's intent.
 *   - Fragments (`<>…</>`) are not host elements and are unaffected.
 */

/**
 * The tag name, if this opening element is a host element — otherwise null.
 *
 * `JSXMemberExpression` and `JSXNamespacedName` both return null; see SCOPE.
 * The test is JSX's own: a `JSXIdentifier` whose first character is a lowercase
 * ASCII letter is compiled to a string tag, and anything else to a reference.
 */
function hostTagName(opening) {
  const name = opening?.name;
  if (name?.type !== "JSXIdentifier") return null;
  return /^[a-z]/.test(name.name) ? name.name : null;
}

/**
 * The half of the message that does not depend on the tag, built once per run
 * rather than once per diagnostic.
 *
 * Naming the permitted tags in the message is deliberate: the commonest reason
 * to hit this rule is reaching for a tag that is one entry away from being
 * allowed (`<section>` when `<form>` is fine), and a reader who can see the
 * whole list can tell immediately whether to argue for an addition or to go and
 * find the component.
 */
function buildSuffix(allow, docs) {
  const permitted =
    allow.length === 0
      ? " No host element is permitted here."
      : ` The host elements permitted here, each for a stated reason, are ${allow.map((tag) => `\`<${tag}>\``).join(", ")}.`;
  return `${permitted}${docs ? ` See ${docs}.` : ""}`;
}

export default {
  meta: {
    schema: [
      {
        type: "object",
        properties: {
          /** Host elements this glob permits. Every entry needs a reason. */
          allow: { type: "array", items: { type: "string" }, uniqueItems: true },
          /** The component library to name in the message, e.g. "@astryxdesign/core". */
          library: { type: "string" },
          /** Where the convention is written down, e.g. "web/CLAUDE.md". */
          docs: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const { allow = [], library, docs } = context.options[0] ?? {};
    const permitted = new Set(allow);
    const target = library ? `a component from \`${library}\`` : "a component from this directory's library";
    const suffix = buildSuffix(allow, docs);

    return {
      JSXOpeningElement(node) {
        const tag = hostTagName(node);
        if (tag === null || permitted.has(tag)) return;
        // Report the name rather than the whole element: the element spans its
        // children, and a diagnostic covering forty lines buries the one word
        // that has to change.
        context.report({
          node: node.name,
          message: `\`<${tag}>\` is a raw HTML element. Use ${target} instead — a hand-rolled host element is a second layout system with one member, and it grows.${suffix}`,
        });
      },
    };
  },
};
