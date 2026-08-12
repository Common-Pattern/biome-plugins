/**
 * Ban the double assertion `x as unknown as T`.
 *
 * A single `as T` is checked: TypeScript rejects it unless one of the two types
 * is assignable to the other, so it can narrow or widen but it cannot invent.
 * Routing through `unknown` removes that check entirely — the compiler stops
 * relating the two types and simply believes the second annotation. Whatever
 * `T` claims is then true for every downstream reader, including the ones who
 * typecheck against it and ship.
 *
 * It is worth being precise about why this is worse than `as T` rather than
 * just more of it: `as T` is a claim TypeScript can still partly verify, and
 * its failure mode is a compile error. `as unknown as T` is a claim nothing
 * verifies, and its failure mode is a runtime error in a file that never
 * mentioned the cast. The usual sign is a comment next to it explaining why the
 * two types "really are" compatible — prose standing in for a check, and prose
 * that goes stale. One such comment claimed two generated types differed by two
 * fields; they differed by six.
 *
 * WHAT TO USE INSTEAD
 *   - two shapes that only overlap partially -> name the overlap. A type alias
 *     for the fields the consumer actually reads (`Omit<…>`, `Pick<…>`, or a
 *     plain interface) lets both shapes satisfy it with no cast, and states the
 *     requirement where a reader will find it.
 *   - a value of genuinely unknown shape (a driver internal, a parsed payload,
 *     a mock) -> a user-defined type guard, `value is T`. Same narrowing, but
 *     earned at runtime rather than asserted, so a shape that changes upstream
 *     fails loudly at the boundary instead of silently three call sites later.
 *   - a nominal mismatch you cannot restructure -> fix the declaration, or make
 *     the conversion explicit as a function with a checked body.
 *
 * SCOPE. Only the literal `unknown` bridge matches. `x as T` is untouched — it
 * is checked, and banning it would flag a large amount of legitimate narrowing.
 * `x as any as T` is not matched either, because `as any` is already caught by
 * `noExplicitAny`; if you have that rule off, add the alternative here.
 *
 * The `<T>` angle-bracket spelling of the same bridge (`<T><unknown>x`) parses
 * to `TSTypeAssertion` rather than `TSAsExpression`, and is matched too. It is
 * vanishingly rare in `.tsx` (a syntax error there) but free to cover.
 *
 * TESTS. This fires in test files too. That is a real cost: mocks and fixtures
 * are where "bridge a closed generated interface" is most defensible. Under
 * oxlint you can scope it off for a glob with `overrides`; decide per repo
 * whether test directories are inside the linted set before adopting it.
 */

const MESSAGE =
  "`as unknown as T` disables the assignability check rather than satisfying it — nothing verifies this claim. Name the shape both sides share (Omit/Pick/an interface), or narrow with a `value is T` type guard.";

function isUnknownKeyword(typeNode) {
  return typeNode?.type === "TSUnknownKeyword";
}

/** The inner half of a bridge: `x as unknown` / `<unknown>x`. */
function isWidenToUnknown(node) {
  if (node?.type === "TSAsExpression") return isUnknownKeyword(node.typeAnnotation);
  if (node?.type === "TSTypeAssertion") return isUnknownKeyword(node.typeAnnotation);
  return false;
}

export default {
  create(context) {
    return {
      TSAsExpression(node) {
        // The outer hop must land on something concrete. `x as unknown` on its
        // own is the safe direction and stops there.
        if (isUnknownKeyword(node.typeAnnotation)) return;
        if (!isWidenToUnknown(node.expression)) return;
        context.report({ node: node.typeAnnotation, message: MESSAGE });
      },
      TSTypeAssertion(node) {
        if (isUnknownKeyword(node.typeAnnotation)) return;
        if (!isWidenToUnknown(node.expression)) return;
        context.report({ node: node.typeAnnotation, message: MESSAGE });
      },
    };
  },
};
