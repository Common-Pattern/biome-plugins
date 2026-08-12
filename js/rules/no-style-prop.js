/**
 * Ban the JSX `style` prop.
 *
 * This is a rule for codebases that have committed to a component library —
 * one where every spacing, colour and size value is supposed to come from the
 * library's own vocabulary (props, tokens, variants) rather than from CSS
 * written at the call site. In such a codebase an inline `style` is not a small
 * local override; it is a second styling system with one member, and it grows.
 *
 * WHY THIS AND NOT A CODE REVIEW HABIT. The rule exists because the habit
 * demonstrably failed. In the repo it was written for, the project's own
 * conventions file asserted there was "no `style={{…}}` anywhere" in the app
 * directory. There were twenty. Nobody was being careless: each one arrived
 * with a paragraph of measured justification attached, which is exactly why
 * none of them looked like the thing the rule was supposed to stop. A claim
 * about a codebase that nothing checks is a claim about the day it was written.
 *
 * WHY A GREP IS NOT ENOUGH, AND THIS IS THE PART THAT MATTERS. The obvious
 * search is `style={{`, and it is wrong. Half the real usages were
 * `style={columnWidth}` or `style={SEARCH_INPUT_STYLE}` — the object hoisted to
 * a constant, often precisely because it was shared between several call sites
 * and therefore load-bearing. A text search finds the casual ones and misses
 * the entrenched ones, which inverts the priority. Matching `JSXAttribute` by
 * name catches every spelling: object literal, identifier, member expression,
 * call, conditional, template — the value is never inspected.
 *
 * WHAT TO USE INSTEAD
 *   - a prop the component already has. Ask the library rather than recalling
 *     it: most design systems ship a CLI or `.d.ts` that lists the real prop
 *     names, and layout, spacing and width are usually among them.
 *   - a variant or token, where the value is a design decision rather than a
 *     measurement.
 *   - a colocated CSS Module (`Foo.module.css`) for the genuine residue —
 *     pseudo-classes, media queries, fixed positioning. None of those can be
 *     expressed by an inline style anyway, so they were never this rule's
 *     target. Scoped and next to its component beats a global stylesheet.
 *   - if the library genuinely cannot express it and you own the element,
 *     reconsider whether the element should be a library component at all.
 *
 * SCOPE, AND THE HOLES IT LEAVES. Only a JSX attribute literally named `style`
 * matches, so:
 *   - `<Foo {...{ style: x }} />` and `<Foo {...props} />` are NOT caught. The
 *     rule reads attribute names, not data flow. This is the same limitation
 *     every rule in this package has and it is not worth chasing: spreading a
 *     style to evade a lint rule is a deliberate act, not an accident.
 *   - `className` is NOT caught, deliberately. It is the seam a CSS Module
 *     needs, so banning it would ban the recommended alternative above. A repo
 *     that wants no call-site styling at all should pair this rule with a
 *     review convention about what classes are allowed to exist.
 *   - a prop named `style` on a non-visual component (a chart config, say)
 *     matches too. That is the cost of a name-based rule; use `overrides` to
 *     scope it off for such a directory if it comes up.
 *
 * `<html>` and `<body>` are not special-cased. A document-level style belongs
 * in the global stylesheet the framework already loads.
 */

const MESSAGE =
  "The JSX `style` prop is banned — call-site CSS is a second styling system that competes with the component library. Use a prop the component already exposes (ask the library's CLI or its .d.ts rather than guessing), a token or variant, or a colocated `.module.css` for pseudo-classes and media queries.";

/**
 * The attribute's name node is a `JSXIdentifier` for `style` and a
 * `JSXNamespacedName` for something like `xml:style`. Only the plain identifier
 * is the React style prop; a namespaced attribute is passed through to the DOM
 * verbatim and is not what this rule is about.
 */
function isStyleAttribute(node) {
  return node.name?.type === "JSXIdentifier" && node.name.name === "style";
}

export default {
  create(context) {
    return {
      JSXAttribute(node) {
        if (!isStyleAttribute(node)) return;
        // Report the attribute name rather than the whole attribute: on a
        // hoisted object (`style={SEARCH_INPUT_STYLE}`) the value is defined
        // elsewhere, and pointing at it would move the caret away from the
        // line that has to change.
        context.report({ node: node.name, message: MESSAGE });
      },
    };
  },
};
