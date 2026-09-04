/**
 * Ban a caught error — or its `.message` — from reaching a client-facing
 * response.
 *
 * The shape this exists to stop is one line long and reads as diligence:
 *
 *     } catch (err) {
 *       const msg = err instanceof Error ? err.message : "Failed to create member";
 *       throw new HttpError(422, [msg]);
 *     }
 *
 * It looks like it is preserving a useful diagnostic. What it actually does
 * depends entirely on which error arrives, and the author does not get to
 * choose. Since drizzle-orm 0.41 every failed query is wrapped in a
 * `DrizzleQueryError` whose `.message` is
 *
 *     Failed query: select "users"."id", "users"."email", … from "users" where …
 *     params: 42, sudhir@example.com, <the token you were checking>
 *
 * so the branch that was meant to surface "email already taken" surfaces the
 * statement and every bound parameter instead — schema, column names, and
 * whatever values the request happened to carry — to whoever made the request.
 * The same is true of any driver that puts its internals in `.message`, which
 * is most of them: `pg`, `mysql2`, `ioredis`, the AWS SDK, `node-fetch` on a
 * DNS failure. One codebase shipped this in ~30 handlers before anyone read a
 * 422 body closely.
 *
 * WHY A LINT RULE AND NOT A REVIEW NOTE. The fix is mechanical and the mistake
 * is not: `err.message` is the obvious thing to write, it is correct for the
 * errors the author had in mind, and the leak is invisible in every test that
 * asserts on a status code. It also comes back — a new handler is written the
 * same way six weeks later, because the convention lived in a pull-request
 * comment. A rule is the version that still holds after everyone who read that
 * comment has moved on.
 *
 * WHAT IS FLAGGED. Inside a `catch` block, or in a `.catch(cb)` / `.then(ok,
 * cb)` handler, where `E` is the caught binding:
 *   - `new HttpError(<status>, X)`
 *   - `c.json({ error: X })` / `{ errors: X }` — any `.json(…)` method call,
 *     which covers Hono's `c.json` and Express's `res.json` alike
 *   - `new Response(X, …)`
 *   - an object literal IN RETURN POSITION with a property named `message`,
 *     `error`, `errors` or `reason` — the Next.js Server Action shape,
 *     `return { ok: false, message: e.message }`
 *   - an object literal passed to a function the `sinks` option names, with
 *     one of those same four keys — `recordFailure({ reason: E.message })`,
 *     where the function writes that value somewhere an endpoint later serves
 *     back out. Empty by default; see the schema for why it has to be.
 * …where `X` is `E`, `E.message`, or any of the wrappings people reach for
 * around them: a conditional (`E instanceof Error ? E.message : "…"`), an
 * array literal, a template literal, `+` concatenation, `??`/`||` with a
 * fallback, a nested object, or a local binding in scope that was written from
 * any of those.
 *
 * WHAT IS DELIBERATELY NOT FLAGGED, and each of these is load-bearing:
 *   - `console.error(err)`, `logger.error({ err })`, Sentry, any logging call.
 *     The server log is exactly where the full error belongs; a rule that
 *     pushed people to redact it there would trade a disclosure bug for an
 *     undebuggable one.
 *   - `throw err` and `throw new Error(…, { cause: err })`. Rethrowing hands
 *     the error to an error handler, which is the layer that decides what the
 *     client sees. That decision is made once, in one file, and it is not this
 *     one.
 *   - a bare `return err.message` from an ordinary function. That is a value
 *     being passed along, not a response body: it is how a sanitizer is
 *     written, and how a CLI wrapper hands a subprocess failure back to its
 *     own caller. Only the object shape counts in return position.
 *   - `E.message` passed to ANY call expression other than the sinks above.
 *     This is the escape hatch, and it is deliberately generous: a call is a
 *     place where a human made a decision about this value, and the rule has
 *     no way to tell a good decision from a bad one. `clientMessage(err, "…")`,
 *     `userFacingMessage(err.message)`, `formStateFromError(err)`,
 *     `redact(String(err))` all pass. A rule with no cheap way to say "I have
 *     handled this" gets suppressed wholesale, and a suppressed rule protects
 *     nothing. Naming a function in `sinks` is the one way to take a call back
 *     out of the hatch, and only for its object-literal arguments.
 *
 * SCOPE, AND THE BOUNDARY IT SITS ON. The error has to reach the response
 * through a plain binding. Passing it into a helper, storing it on an object
 * that is later spread, or pushing it through an array all escape the rule —
 * following those needs data-flow analysis, and this is scope analysis, the
 * same limit `no-glued-timestamp-via-variable` accepts for the same reason. In
 * practice the binding hop is the shape that actually occurs, because the
 * `const msg = …` line exists precisely to hold the ternary.
 *
 * The corollary is that the rule is not a security boundary and must not be
 * sold as one. It catches the spelling that shows up in review, on the day it
 * is written. The boundary is a single error handler that decides what leaves
 * the process, and this rule is what stops handlers routing around it.
 */

import { resolveVariable, writesTo } from "../lib/scope.js";

const DEFAULT_SANITIZERS = ["clientMessage", "userFacingMessage", "formStateFromError"];

/**
 * Object keys whose value is read by a client. `errors` is here as well as
 * `error` because validation responses are conventionally plural, and a rule
 * that caught only the singular would be a rule you could get round by adding
 * a letter.
 */
const RESPONSE_KEYS = new Set(["message", "error", "errors", "reason"]);

/** `a.b` / `a["b"]` -> "b"; anything computed and non-literal -> null. */
function staticPropertyName(memberExpression) {
  const key = memberExpression.property;
  if (key == null) return null;
  if (!memberExpression.computed && key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
}

/** The key of an object-literal property, or null for a spread or a computed key. */
function propertyKeyName(property) {
  if (property.type !== "Property" && property.type !== "ObjectProperty") return null;
  const key = property.key;
  if (key == null) return null;
  if (!property.computed && key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
}

/**
 * Strip the wrappers that change a node's type without changing its value.
 * `(err as Error).message` and `err!.message` are the same access as
 * `err.message` and have to be treated as one.
 */
function unwrap(node) {
  let current = node;
  while (
    current != null &&
    (current.type === "TSAsExpression" ||
      current.type === "TSSatisfiesExpression" ||
      current.type === "TSNonNullExpression" ||
      current.type === "TSInstantiationExpression" ||
      current.type === "ParenthesizedExpression")
  ) {
    current = current.expression;
  }
  return current;
}

export default {
  meta: {
    schema: [
      {
        type: "object",
        properties: {
          /**
           * Helpers this codebase already has for turning an error into
           * something a client may read. They are named in the diagnostic so a
           * reader is told what to write instead of only what not to.
           *
           * They do NOT widen the escape hatch — every call expression is
           * already one, for the reason in the header — so this list changes
           * the message and nothing else. That is the honest description of
           * it: naming the wrong helper in a report is how a rule teaches the
           * wrong habit.
           */
          sanitizers: { type: "array", items: { type: "string" }, uniqueItems: true },
          /**
           * Functions whose object-literal arguments are response bodies.
           * `recordPlatformActionFailure({ orgId, reason: err.message })`
           * writes that `reason` to a column three listing endpoints serve
           * back out: stored, then served, with no response object in sight
           * at the call site.
           *
           * EMPTY BY DEFAULT, and this is opt-in rather than a heuristic
           * because there is no syntactic difference between that call and
           * `logger.error({ err, message: err.message })`, which is an
           * explicit non-goal of this rule. Nothing in the source text
           * separates a persistence call from a logging one, so the author
           * names the sinks or gets nothing. Inferring from the callee name,
           * or carrying a denylist of logger-ish names, would be a guess
           * wearing the clothes of a rule — the same reason
           * `no-host-elements` takes an `allow` list rather than deciding for
           * itself which tags a codebase means.
           *
           * A name here is an assertion the linter cannot check: "what goes
           * into this function comes back out to someone". A rule can see the
           * write. It cannot see the round-trip.
           */
          sinks: { type: "array", items: { type: "string" }, uniqueItems: true },
          /** Where the convention is written down, e.g. "api-ts/CLAUDE.md". */
          docs: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const { sanitizers = DEFAULT_SANITIZERS, sinks = [], docs } = context.options[0] ?? {};
    const sinkNames = new Set(sinks);

    /**
     * Functions passed to `.catch(cb)` or as the rejection half of
     * `.then(ok, cb)`, keyed by source range.
     *
     * Recorded on the way down rather than looked up on the way back, because
     * a call expression is always visited before anything inside it, and
     * neither host is relied on to expose `node.parent` or `:exit`.
     */
    const rejectionHandlers = new Set();

    const rangeKey = (node) => `${node.start}:${node.end}`;

    function isRejectionHandler(fn) {
      return fn != null && rejectionHandlers.has(rangeKey(fn));
    }

    /**
     * Does this identifier hold the caught error itself?
     *
     * True for the `catch (err)` binding and for a rejection handler's first
     * parameter, and for an alias of either (`const e = err`). `seen` bounds
     * the walk so `let a = b; b = a` cannot hang the linter.
     */
    function isErrorBinding(identifier, seen) {
      const variable = resolveVariable(sourceCode, identifier);
      if (variable == null || seen.has(variable)) return false;
      seen.add(variable);

      for (const def of variable.defs ?? []) {
        if (def.type === "CatchClause") return true;
        if (def.type === "Parameter" && isRejectionHandler(def.node)) {
          const first = def.node.params?.[0];
          if (first?.type === "Identifier" && first.name === identifier.name) return true;
        }
      }

      for (const write of writesTo(variable)) {
        const target = unwrap(write);
        if (target?.type === "Identifier" && isErrorBinding(target, seen)) return true;
      }

      return false;
    }

    /** `err.message`, on the caught error or an alias of it. */
    function isErrorMessageAccess(node) {
      if (node.type !== "MemberExpression") return false;
      if (staticPropertyName(node) !== "message") return false;
      const object = unwrap(node.object);
      return object?.type === "Identifier" && isErrorBinding(object, new Set());
    }

    /**
     * Does this expression carry the caught error, or its message, out to a
     * caller?
     *
     * A `CallExpression` is the escape hatch and returns false — see the
     * header. A `ConditionalExpression`'s TEST is not inspected, only its
     * branches: `err instanceof Error ? "" : ""` mentions `err` and leaks
     * nothing, and flagging it would make the rule fire on the guard that
     * makes the code correct. `&&` is checked on its right only, for the same
     * reason: `err && safe` yields a falsy error or `safe`.
     */
    function carries(node, seen) {
      const target = unwrap(node);
      if (target == null) return false;

      switch (target.type) {
        case "Identifier": {
          // `isErrorBinding` gets a fresh cycle guard: it and `carries` walk
          // the same graph for different questions, and sharing one set lets
          // the first walk mark a binding the second still has to inspect.
          if (isErrorBinding(target, new Set())) return true;
          const variable = resolveVariable(sourceCode, target);
          if (variable == null || seen.has(variable)) return false;
          seen.add(variable);
          return writesTo(variable).some((write) => carries(write, seen));
        }
        case "MemberExpression":
          return isErrorMessageAccess(target);
        case "ConditionalExpression":
          return carries(target.consequent, seen) || carries(target.alternate, seen);
        case "LogicalExpression":
          return target.operator === "&&"
            ? carries(target.right, seen)
            : carries(target.left, seen) || carries(target.right, seen);
        case "ArrayExpression":
          return (target.elements ?? []).some((element) =>
            element == null
              ? false
              : element.type === "SpreadElement"
                ? carries(element.argument, seen)
                : carries(element, seen),
          );
        case "TemplateLiteral":
          return (target.expressions ?? []).some((expression) => carries(expression, seen));
        case "BinaryExpression":
          return target.operator === "+" && (carries(target.left, seen) || carries(target.right, seen));
        case "ObjectExpression":
          return carryingProperties(target, seen).length > 0;
        default:
          return false;
      }
    }

    /**
     * Is this a RESPONSE OBJECT carrying the error — an object literal with a
     * leaking `message`/`error`/`errors`/`reason` key, or a binding holding
     * one?
     *
     * Narrower than `carries` on purpose. `return err.message` from an
     * ordinary helper is not a response; it is how a sanitizer is written, and
     * how a CLI wrapper hands a subprocess failure back to its own caller.
     * Only the object shape is a response, and only when it is what the
     * function returns.
     */
    function carriesAsResponseObject(node, seen) {
      const target = unwrap(node);
      if (target == null) return false;

      switch (target.type) {
        case "ObjectExpression":
          return carryingProperties(target, seen).length > 0;
        case "ConditionalExpression":
          return carriesAsResponseObject(target.consequent, seen) || carriesAsResponseObject(target.alternate, seen);
        case "LogicalExpression":
          return target.operator === "&&"
            ? carriesAsResponseObject(target.right, seen)
            : carriesAsResponseObject(target.left, seen) || carriesAsResponseObject(target.right, seen);
        case "Identifier": {
          const variable = resolveVariable(sourceCode, target);
          if (variable == null || seen.has(variable)) return false;
          seen.add(variable);
          return writesTo(variable).some((write) => carriesAsResponseObject(write, seen));
        }
        default:
          return false;
      }
    }

    /** The `message`/`error`/`errors`/`reason` properties of an object literal that carry. */
    function carryingProperties(objectExpression, seen) {
      return (objectExpression.properties ?? []).filter((property) => {
        const key = propertyKeyName(property);
        if (key === null || !RESPONSE_KEYS.has(key)) return false;
        return carries(property.value, seen);
      });
    }

    function report(node) {
      const named = sanitizers.length === 0 ? "" : ` This codebase has ${sanitizers.map((name) => `\`${name}()\``).join(", ")} for exactly this.`;
      context.report({
        node,
        message: `A caught error reaches the client here. A failed query, a driver timeout and a DNS failure all put their internals in \`.message\` — drizzle's is \`Failed query: <the SQL>\` followed by \`params: <every bound value>\` — so this sends the statement, the schema and the request's own values to whoever called it. Log the error, and send a message you chose rather than one the error chose.${named}${docs ? ` See ${docs}.` : ""}`,
      });
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee?.type === "MemberExpression") {
          const method = staticPropertyName(callee);
          if (method === "catch" && node.arguments?.[0] != null) {
            rejectionHandlers.add(rangeKey(node.arguments[0]));
          } else if (method === "then" && node.arguments?.[1] != null) {
            rejectionHandlers.add(rangeKey(node.arguments[1]));
          }
          if (method === "json") {
            const body = unwrap(node.arguments?.[0]);
            if (body?.type === "ObjectExpression") {
              for (const property of carryingProperties(body, new Set())) report(property.value);
            } else if (body != null && carries(body, new Set())) {
              report(body);
            }
          }
        }

        // A function the config named as a sink, by bare identifier or by the
        // property name of a member expression (`audit.recordFailure`). Its
        // object literals are response bodies because the author said so, and
        // are then checked exactly as one in return position is.
        //
        // Only object literals, and only the response keys. A positional
        // argument has no key to test, and the escape hatch stands everywhere
        // the config has not spoken.
        if (sinkNames.size > 0) {
          const name =
            callee?.type === "Identifier"
              ? callee.name
              : callee?.type === "MemberExpression"
                ? staticPropertyName(callee)
                : null;
          if (name != null && sinkNames.has(name)) {
            for (const argument of node.arguments ?? []) {
              const body = unwrap(argument);
              if (body?.type !== "ObjectExpression") continue;
              for (const property of carryingProperties(body, new Set())) report(property.value);
            }
          }
        }
      },

      NewExpression(node) {
        if (node.callee?.type !== "Identifier") return;

        if (node.callee.name === "HttpError") {
          // Argument 0 is the status. Everything after it is body.
          for (const argument of (node.arguments ?? []).slice(1)) {
            if (carries(argument, new Set())) report(argument);
          }
          return;
        }

        if (node.callee.name === "Response") {
          const body = node.arguments?.[0];
          if (body != null && carries(body, new Set())) report(body);
        }
      },

      /**
       * The Server Action shape: an object literal that IS a function's
       * result — `return { ok: false, message: e.message }`.
       *
       * RETURN POSITION IS THE WHOLE TEST, and it is what makes this half of
       * the rule usable. An object literal with a `message` key is not by
       * itself a response; it is also how a browser component holds the state
       * it is about to render. Run against a real app, the version of this
       * check that looked at every object literal reported two client
       * components building `result = { status: "failed", message: … }` from a
       * failed action call — already on the client, nothing disclosed, and
       * exactly the kind of finding that gets a rule switched off. What a
       * function RETURNS crosses a boundary; what it assigns to a local does
       * not.
       *
       * The cost is the assign-then-return spelling, and it is smaller than it
       * looks: `const state = {…}; return state;` is still caught, because the
       * returned identifier resolves to the binding and the object literal is
       * its write.
       *
       * Only the OBJECT shape counts here. A bare `return err.message` is not
       * a response — it is how a sanitizer is written, and how a CLI wrapper
       * hands a subprocess failure back to its own caller (two such helpers in
       * `e2e/run.ts` were what this narrowing was measured against). The rule
       * reports where the message is put into something a client reads, not
       * everywhere it is passed along.
       */
      ReturnStatement(node) {
        if (node.argument != null && carriesAsResponseObject(node.argument, new Set())) report(node.argument);
      },

      ArrowFunctionExpression(node) {
        const body = node.body;
        if (body == null || body.type === "BlockStatement") return;
        if (carriesAsResponseObject(body, new Set())) report(body);
      },
    };
  },
};
