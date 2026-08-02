/**
 * Ban rendering a date through `toLocaleDateString` / `toLocaleTimeString` /
 * `toLocaleString` (or `Intl.DateTimeFormat`) without an explicit `timeZone`.
 *
 * WHAT GOES WRONG. With no `timeZone`, these format in the *runtime's* zone.
 * That is the machine's zone, which is not the user's and not the tenant's, and
 * on a server it is whatever the container was built with — almost always UTC.
 * So a stored instant renders as one wall clock on the developer's laptop and a
 * different one in production, for the same input.
 *
 * This is the same failure as `no-utc-calendar-day`, arriving by the opposite
 * road. There the bug is that the zone is silently UTC; here it is that the zone
 * is silently *ambient*. Both produce code that is correct in every context
 * anyone inspects it in — a test suite pinning `TZ=UTC` agrees with a UTC
 * container, and a developer in the tenant's zone sees the right answer all day
 * — and wrong only in what the user is shown.
 *
 * WHAT TO USE INSTEAD. Pass the zone as an argument, always as a named IANA zone
 * ("Asia/Kolkata"), never the offset it currently resolves to ("+05:30"):
 *
 *   date.toLocaleString("en-IN", { dateStyle: "medium", timeZone: TENANT_TZ })
 *   new Intl.DateTimeFormat("en-IN", { timeZone: TENANT_TZ }).format(date)
 *   formatInTimeZone(date, TENANT_TZ, "d MMM yyyy, HH:mm")   // date-fns-tz
 *
 * If the intent really is "the viewer's own zone" — a browser-only clock, say —
 * that is still worth writing down rather than inheriting. `timeZone:
 * Intl.DateTimeFormat().resolvedOptions().timeZone` says it out loud and stops
 * this rule, because the option is present.
 *
 * SCOPE, AND WHY IT IS SHAPED THIS WAY. Only `Date` has `toLocaleDateString` and
 * `toLocaleTimeString`, so those two are unambiguous and are flagged whenever
 * `timeZone` is absent.
 *
 * `toLocaleString` is the hard one: `Number`, `BigInt`, `Array` and `Date` all
 * have it, and `(1234.5).toLocaleString()` is perfectly good code. Telling them
 * apart needs the receiver's *type*, which a syntactic linter does not have. So
 * this rule does not guess — it flags `toLocaleString` only when the options
 * object it was handed is already, unmistakably, formatting a date: it carries
 * one of the date/time option keys (`dateStyle`, `timeStyle`, `year`, `month`,
 * `day`, `hour`, `minute`, `second`, `weekday`, `era`, `dayPeriod`,
 * `fractionalSecondDigits`, `hour12`, `hourCycle`, `calendar`) and no
 * `timeZone`. A bare `x.toLocaleString()` with no options is left alone; it is
 * far more often a number than a date, and a rule that cried wolf on number
 * formatting would be switched off within a week.
 *
 * That is a real gap — `someDate.toLocaleString()` with no arguments is a
 * genuine instance this cannot see — and it is the right trade. A narrow rule
 * that always means something beats a broad one that gets suppressed.
 *
 * Options passed as a variable (`d.toLocaleString(locale, opts)`) are likewise
 * not followed: that needs data flow, not syntax.
 */

/**
 * Option keys that only make sense when formatting a date or time. Their
 * presence is what lets the ambiguous `toLocaleString` be judged at all.
 */
const DATE_OPTION_KEYS = new Set([
  "dateStyle",
  "timeStyle",
  "weekday",
  "era",
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
  "dayPeriod",
  "fractionalSecondDigits",
  "hour12",
  "hourCycle",
  "calendar",
  "timeZoneName",
]);

/** Methods that exist only on `Date`, so no type information is needed. */
const DATE_ONLY_METHODS = new Set(["toLocaleDateString", "toLocaleTimeString"]);

const MESSAGE =
  "This renders in the runtime's timezone — the machine's, not the user's or tenant's (and on a server, whatever the container was built with). Pass an explicit IANA zone: { timeZone: \"Asia/Kolkata\" }. If you really mean the viewer's own zone, say so with Intl.DateTimeFormat().resolvedOptions().timeZone.";

/**
 * Read an options argument that is an inline object literal. Returns null when
 * the argument is absent or is anything else (a variable, a spread, a call) —
 * resolving those needs data flow, which is out of scope.
 */
function objectLiteral(node) {
  return node?.type === "ObjectExpression" ? node : null;
}

/** The static key of a property, or null for computed/spread/dynamic ones. */
function staticKeyName(prop) {
  if (prop.type !== "Property" || prop.computed) return null;
  if (prop.key?.type === "Identifier") return prop.key.name;
  if (prop.key?.type === "Literal" && typeof prop.key.value === "string") {
    return prop.key.value;
  }
  return null;
}

function keyNames(objectExpression) {
  const names = new Set();
  for (const prop of objectExpression.properties) {
    const name = staticKeyName(prop);
    if (name !== null) names.add(name);
  }
  return names;
}

/**
 * A spread (`{ ...base, dateStyle: "medium" }`) could be carrying `timeZone` in
 * from somewhere this rule cannot see. Staying silent is the honest answer —
 * the alternative is a false positive on correct code.
 */
function hasSpread(objectExpression) {
  return objectExpression.properties.some((p) => p.type === "SpreadElement");
}

/** `Intl.DateTimeFormat` / `new Intl.DateTimeFormat`, in either spelling. */
function isDateTimeFormatCallee(callee) {
  return (
    callee?.type === "MemberExpression" &&
    !callee.computed &&
    callee.object?.type === "Identifier" &&
    callee.object.name === "Intl" &&
    callee.property?.type === "Identifier" &&
    callee.property.name === "DateTimeFormat"
  );
}

export default {
  create(context) {
    /**
     * `Intl.DateTimeFormat(…).resolvedOptions()` READS the ambient zone rather
     * than rendering in it — it is how you ask "what zone am I in?", and it is
     * the escape hatch this rule's own message recommends. Reporting it would
     * make the suggested fix trip the rule.
     *
     * Collected rather than resolved via `node.parent`, so the rule depends on
     * nothing beyond the visitor API. Traversal is top-down, so the outer
     * `.resolvedOptions()` call is always visited before the inner constructor
     * it exempts.
     */
    const introspected = new Set();

    /** Report unless the options literal already names a zone. */
    function checkOptions(node, options, requireDateKeys) {
      if (introspected.has(node)) return;
      const literal = objectLiteral(options);

      // No options at all: only decidable for the Date-only methods.
      if (literal === null) {
        if (options === undefined && !requireDateKeys) {
          context.report({ node, message: MESSAGE });
        }
        return;
      }

      if (hasSpread(literal)) return;

      const keys = keyNames(literal);
      if (keys.has("timeZone")) return;

      // For the ambiguous `toLocaleString`, the options must themselves prove
      // this is a date being formatted before we say anything.
      if (requireDateKeys) {
        let sawDateKey = false;
        for (const key of keys) {
          if (DATE_OPTION_KEYS.has(key)) {
            sawDateKey = true;
            break;
          }
        }
        if (!sawDateKey) return;
      }

      context.report({ node, message: MESSAGE });
    }

    return {
      NewExpression(node) {
        // `new Intl.DateTimeFormat(locale, options)` — unambiguously a date
        // formatter, so no date-key evidence is needed.
        if (!isDateTimeFormatCallee(node.callee)) return;
        checkOptions(node, node.arguments[1], false);
      },

      CallExpression(node) {
        const callee = node.callee;

        // Mark `<x>.resolvedOptions()`'s receiver as introspection, before the
        // traversal reaches it.
        if (
          callee?.type === "MemberExpression" &&
          !callee.computed &&
          callee.property?.type === "Identifier" &&
          callee.property.name === "resolvedOptions"
        ) {
          introspected.add(callee.object);
        }

        // `Intl.DateTimeFormat(locale, options)` is legal without `new`.
        if (isDateTimeFormatCallee(callee)) {
          checkOptions(node, node.arguments[1], false);
          return;
        }

        if (callee?.type !== "MemberExpression" || callee.computed) return;
        if (callee.property?.type !== "Identifier") return;
        const method = callee.property.name;

        if (DATE_ONLY_METHODS.has(method)) {
          checkOptions(node, node.arguments[1], false);
          return;
        }

        // The ambiguous one. Judge it only on the evidence in its own options.
        if (method === "toLocaleString") {
          if (node.arguments[1] === undefined) return;
          checkOptions(node, node.arguments[1], true);
        }
      },
    };
  },
};
