/**
 * Ban deriving a calendar date from an instant with `.toISOString().slice(…)`
 * or `.toISOString().split(…)`.
 *
 * It reads as "today". It means *the UTC calendar day* — a different day from
 * the user's or the tenant's for a window as wide as their UTC offset: 05:30
 * every morning for Asia/Kolkata, the whole evening for the Americas. Such a
 * value is then typically compared against a `date` column, which holds a local
 * calendar date, so the comparison runs across two different calendars.
 *
 * This is unusually good at hiding. Test suites commonly pin `TZ=UTC`,
 * production is commonly a UTC datacentre, and nobody develops at 03:00 — so
 * the expression is right in every context anyone inspects it in, and wrong
 * only in the answer given to the user.
 *
 * WHAT TO USE INSTEAD
 *   - "today, for this tenant" -> `formatInTimeZone(new Date(), timeZone,
 *     "yyyy-MM-dd")` from `date-fns-tz`.
 *   - "the calendar day this instant falls on" -> the same, passing the
 *     instant.
 *   - shifting a `yyyy-MM-dd` key -> calendar arithmetic on the key, never
 *     `addDays` on an instant: adding 24h drifts across a DST boundary.
 *
 * SCOPE. Only string surgery applied directly to a `.toISOString()` result
 * matches. The bare form — `row.created_at.slice(0, 10)` on a string column —
 * is deliberately not matched: it is indistinguishable at the AST level from
 * `array.slice(0, 10)` meaning "the first ten", and a rule that needs
 * suppressions to pass is worse than no rule.
 *
 * THE `.split("T")` SPELLING. `.toISOString().split("T")[0]` is the same bug
 * wearing different clothes, and it cost real debugging time *after* the
 * `.slice` form was banned — the rule looked like it covered the class, and
 * covered one spelling of it. Both halves of the split are wrong for the same
 * reason: `[0]` is the UTC calendar day, `[1]` is the UTC wall clock. The
 * receiver is what makes this unambiguous, so no argument check is needed —
 * `formatInTimeZone(instant, tz, "yyyy-MM-dd HH:mm").split(" ")` has already
 * chosen a zone and stays legal.
 *
 * A rule per spelling would keep losing that race, so both branches live in one
 * rule: the objection is to deriving a calendar day from an ISO string at all,
 * not to a particular string method.
 *
 * Matching any arity of `slice` means `.slice(0, 10)` and `.slice(0)` are both
 * caught by one branch.
 */

const BANNED_METHODS = new Set(["slice", "split"]);

const MESSAGES = {
  slice:
    "This is the UTC calendar day, not the user's or tenant's. Derive the day in an explicit timezone — e.g. formatInTimeZone(value, timeZone, 'yyyy-MM-dd') — rather than slicing an ISO string.",
  split:
    "Splitting an ISO string on 'T' gives the UTC calendar day (and the UTC wall clock), not the user's or tenant's. Derive the day in an explicit timezone — e.g. formatInTimeZone(value, timeZone, 'yyyy-MM-dd').",
};

/** `<something>.toISOString()` — the receiver that makes the intent unambiguous. */
function isToISOStringCall(node) {
  return (
    node?.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === "toISOString"
  );
}

export default {
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee?.type !== "MemberExpression" || callee.computed) return;
        if (callee.property?.type !== "Identifier") return;

        const method = callee.property.name;
        if (!BANNED_METHODS.has(method)) return;
        if (!isToISOStringCall(callee.object)) return;

        // Span the receiver, as the GritQL rule did — the reader needs to see
        // WHICH instant is being flattened, not just that a `.slice` happened.
        context.report({ node: callee.object.callee.object, message: MESSAGES[method] });
      },
    };
  },
};
