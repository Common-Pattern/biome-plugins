/**
 * Ban a glued timestamp that reaches a timezone-sensitive consumer THROUGH A
 * VARIABLE.
 *
 * This is the rule the earlier GritQL implementation of `no-glued-timestamps`
 * documented itself as unable to write:
 *
 *   > It is expressible … but GritQL has no scope resolution, so the match is
 *   > by NAME across the whole file. A `value` glued into a label in one
 *   > function then condemns an unrelated `value` holding a real ISO constant
 *   > in another … Caught at the call site or not at all.
 *
 * That gap is not hypothetical. In one codebase running the GritQL ban, a slot
 * generator wrote
 *
 *     const startStr = `${dateStr}T${normalizedTime}`;
 *     const startDate = fromZonedTime(startStr, timezone);
 *
 * and shipped, because the ban only ever looked at the argument expression.
 * Every session it generated was off by the tenant's UTC offset.
 *
 * WHY THIS IS SOUND HERE AND WAS NOT THERE. Oxlint and ESLint both give JS
 * plugins ESLint's scope analysis: `sourceCode.getScope(node)`, plus a
 * `Variable` object carrying `defs`, `references`, and `reference.resolved`.
 * So the identifier at the call site is resolved to the ONE binding it
 * actually refers to, honouring
 * shadowing and closures. A same-named variable in a sibling function is a
 * different `Variable` and is never consulted. The false positive that killed
 * the GritQL attempt is not a risk that has been traded away — it is
 * structurally absent.
 *
 * WHAT IS CHECKED. Every write to the resolved binding: the declarator's
 * initialiser plus every assignment (`reference.writeExpr`). If ANY of them
 * glues a `<date>T<time>` string, or embeds a hard-coded numeric offset, the
 * call site is reported. One glued write is enough — a variable that is
 * sometimes glued is a variable that is sometimes wrong, and which branch runs
 * is not something a linter gets to know.
 *
 * ALIASES ARE FOLLOWED. `const a = glued; const b = a; fromZonedTime(b, tz)`
 * reports, because a write that is itself a bare identifier is resolved in
 * turn. A `seen` set bounds the walk, so a cycle (`let a = b; b = a`) cannot
 * hang the linter.
 *
 * WHAT IS DELIBERATELY NOT CHECKED. The glued string has to reach the consumer
 * through a plain binding. Passing it into a helper, storing it on an object,
 * or pushing it through an array all escape this rule — following THOSE needs
 * data-flow analysis, not scope analysis, and a linter that guesses at
 * data flow produces exactly the false positives that get rules switched off.
 * Scope resolution is a real boundary and this rule sits on the near side of
 * it on purpose.
 */

import { isGluedDateTime, isGluedOffset } from "../lib/glue.js";

/**
 * Calls whose first argument is read as a moment in time, and which therefore
 * make a zone-less glued string unambiguously wrong.
 *
 * `parseISO` is included for a reason that is not obvious. `parseISO(dayKey)`
 * is RECOMMENDED by the sibling rule — it is the right way to get a
 * local-fields `Date` out of a bare calendar date. What is wrong is
 * `parseISO(<dayKey glued to a wall-clock time>)`: that names a moment, and
 * `parseISO` resolves it in the ambient zone. The glue check is what separates
 * the two, so only the second shape can reach a report.
 */
const CALL_CONSUMERS = new Map([
  ["fromZonedTime", 2],
  ["toDate", 2],
  ["parseISO", 1],
]);

const NEW_CONSUMERS = new Map([
  ["Date", 1],
  ["TZDate", 1],
]);

function messageFor(consumer, variableName, kind) {
  const what =
    kind === "offset"
      ? `\`${variableName}\` is built by pasting a hard-coded numeric UTC offset onto a date string`
      : `\`${variableName}\` is a timestamp glued together from a date and a time`;
  return `${what}, and it reaches ${consumer} here. The glue happens outside any timezone, so the moment this produces is the runtime's, not the tenant's — and holding it in a variable first hides that from the call site. Build the instant from the calendar date and the wall clock in one step, with the zone as an argument: toDate(dayKey, { timeZone }), or TZDate.tz(timeZone, year, monthIndex, day, hours, minutes).`;
}

/**
 * Resolve an identifier to the binding it actually refers to.
 *
 * Preferred path is the `Reference` recorded for this exact identifier, which
 * is scope analysis's own answer and needs no name matching at all. Nodes are
 * compared by source range rather than object identity, because the plugin
 * host is free to hand out fresh wrapper objects for the same AST node and
 * `===` would then quietly always be false — a failure that looks exactly like
 * "the rule found nothing".
 *
 * The fallback walks the scope chain by name, innermost first, which is the
 * same shadowing rule the language uses.
 */
function resolveVariable(sourceCode, identifier) {
  const start = sourceCode.getScope(identifier);

  for (let scope = start; scope != null; scope = scope.upper) {
    for (const reference of scope.references ?? []) {
      const id = reference.identifier;
      if (id != null && id.start === identifier.start && id.end === identifier.end) {
        if (reference.resolved != null) return reference.resolved;
      }
    }
  }

  for (let scope = start; scope != null; scope = scope.upper) {
    const found = (scope.variables ?? []).find((v) => v.name === identifier.name);
    if (found != null) return found;
  }

  return null;
}

/** Every expression ever written into this binding. */
function writesTo(variable) {
  const writes = [];
  for (const def of variable.defs ?? []) {
    if (def.node?.type === "VariableDeclarator" && def.node.init != null) writes.push(def.node.init);
  }
  for (const reference of variable.references ?? []) {
    if (reference.writeExpr != null) writes.push(reference.writeExpr);
  }
  return writes;
}

/**
 * Does this identifier ultimately hold a glued timestamp?
 *
 * Returns `"datetime"`, `"offset"`, or `null`. Aliases are followed; `seen`
 * bounds the walk.
 */
function gluedKindOf(sourceCode, identifier, seen) {
  const variable = resolveVariable(sourceCode, identifier);
  if (variable == null) return null;
  if (seen.has(variable)) return null;
  seen.add(variable);

  for (const write of writesTo(variable)) {
    if (isGluedDateTime(write)) return "datetime";
    if (isGluedOffset(write)) return "offset";
    if (write.type === "Identifier") {
      const kind = gluedKindOf(sourceCode, write, seen);
      if (kind != null) return kind;
    }
  }

  return null;
}

export default {
  create(context) {
    const sourceCode = context.sourceCode;

    function check(node, consumerLabel, minArgs) {
      if ((node.arguments?.length ?? 0) < minArgs) return;
      const arg = node.arguments[0];
      if (arg?.type !== "Identifier") return;

      const kind = gluedKindOf(sourceCode, arg, new Set());
      if (kind == null) return;

      context.report({ node: arg, message: messageFor(consumerLabel, arg.name, kind) });
    }

    return {
      CallExpression(node) {
        if (node.callee?.type !== "Identifier") return;
        const minArgs = CALL_CONSUMERS.get(node.callee.name);
        if (minArgs == null) return;
        check(node, `${node.callee.name}()`, minArgs);
      },
      NewExpression(node) {
        if (node.callee?.type !== "Identifier") return;
        const minArgs = NEW_CONSUMERS.get(node.callee.name);
        if (minArgs == null) return;
        check(node, `new ${node.callee.name}()`, minArgs);
      },
    };
  },
};
