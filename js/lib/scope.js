/**
 * Scope-analysis helpers shared by the rules that follow a binding rather than
 * matching a call site.
 *
 * Both linters give JS plugins ESLint's scope analysis — `sourceCode.getScope`,
 * plus a `Variable` carrying `defs`, `references` and `reference.resolved` — so
 * an identifier can be resolved to the ONE binding it refers to, honouring
 * shadowing and closures. That is the difference between a rule that follows a
 * variable and a rule that matches by name across a file, and the latter is
 * unwritable: names like `msg`, `err`, `value` and `start` collide constantly,
 * and a rule with that false-positive rate gets suppressed.
 */

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
export function resolveVariable(sourceCode, identifier) {
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
export function writesTo(variable) {
  const writes = [];
  for (const def of variable.defs ?? []) {
    if (def.node?.type === "VariableDeclarator" && def.node.init != null) writes.push(def.node.init);
  }
  for (const reference of variable.references ?? []) {
    if (reference.writeExpr != null) writes.push(reference.writeExpr);
  }
  return writes;
}
