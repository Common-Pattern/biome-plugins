/**
 * Ban gluing a timestamp together from a date string, AT THE CALL SITE.
 *
 * `` `${dayKey}T00:00:00Z` `` and its noon-anchored cousin
 * `` `${dayKey}T12:00:00Z` `` hide two different mistakes.
 *
 * **The interpolation hides the timezone question.** A glued
 * `` `${date}T00:00:00` `` with no `Z` parses in whatever zone the runtime
 * happens to be in, which is the server's — not the user's, and not the
 * tenant's. `toDate(date, { timeZone })` from `date-fns-tz` has nowhere to put
 * that mistake, because the zone is a required argument rather than an accident
 * of deployment.
 *
 * **The noon anchor hides a category error.** It exists because
 * `` `${key}T00:00:00Z` `` renders as the *previous* day for any zone west of
 * UTC, so someone moved the anchor to noon to buy ±12h of slack. That is a fix
 * sized to the zones its author had in mind: at UTC+13/+14 (Pacific/Apia,
 * Pacific/Kiritimati) noon UTC is already the next day, and it renders
 * tomorrow. The deeper problem is that a day key has no instant behind it at
 * all — "28 July" is a calendar fact, not a moment — so asking which zone to
 * project it into is asking the wrong question.
 *
 * WHAT TO USE INSTEAD
 *   - rendering a bare `date` column or day key -> format it with no timezone
 *     at all. The date that goes in is the date that comes out.
 *   - a day key -> an instant -> `toDate(key, { timeZone })` from
 *     `date-fns-tz`. A parser, not string surgery.
 *   - a `Date` for a consumer that reads LOCAL fields (react-day-picker, and
 *     anything calling `getDate`/`getDay`) -> `parseISO(key)`.
 *   - comparing or bucketing day keys -> compare the strings. `yyyy-MM-dd`
 *     sorts lexicographically in chronological order, so building a `Date` to
 *     compare two of them is overhead and one more place for a zone to creep in.
 *
 * THE OFFSET VARIANT. `` new Date(`${s}+05:30`) `` is the same habit with the
 * zone spelled as a number, and it is the more tempting one because it looks
 * deliberate — the author clearly thought about timezones. What they wrote down
 * is a fact with an expiry date: an offset is the tz database's current answer
 * for a zone, not the zone itself. Zones change their offsets (Egypt reinstated
 * DST in 2023; Chile, Morocco and Samoa have all moved), and when one does, an
 * IANA name is a package update while a literal offset is a code edit nobody
 * knows to make.
 *
 * The offset branches are restricted to `new Date` and `toDate` on purpose.
 * `` `${x}-10:30` `` is not inherently date-shaped — it could be a range label
 * — so the enclosing call is what makes the intent unambiguous.
 *
 * `toDate` gets its own message because it fails differently: an embedded
 * offset takes PRECEDENCE over the `timeZone` option, so the argument the
 * author passed is silently discarded rather than merely redundant.
 *
 * SCOPE. This matches the call shapes glued timestamps actually take, rather
 * than every template literal — so prose in doc comments (including the ones
 * explaining this rule) is untouched. How "glued" is decided lives in
 * `../lib/glue.js`: a shape derived from the AST, not a regex over source text.
 *
 * The variable-indirection case that this rule gives up on lives in its
 * sibling, `no-glued-timestamp-via-variable`.
 */

import { isAssembledString, isGluedDateTime, isGluedOffset } from "../lib/glue.js";

const MESSAGES = {
  tzdate:
    "new TZDate(string, zone) parses in the AMBIENT zone and only re-tags for display, so a glued wall-clock string lands off by the tenant's UTC offset. Use TZDate.tz(zone, year, monthIndex, day, hours, minutes) — the component constructor, which reads the fields IN that zone.",
  newDate:
    "Don't glue a timestamp out of a date string — it parses in whatever zone the runtime is in. Use toDate(key, { timeZone }) for an instant, or parseISO(key) for a local-fields Date.",
  fromZonedTime: "fromZonedTime over a glued wall-clock string is exactly toDate(key, { timeZone }) — use that instead.",
  formatDateTime:
    "This is a bare calendar date, not an instant — there is no zone to render it in. Format the day key directly, with no timezone.",
  newDateOffset:
    "Don't append a numeric UTC offset to a date string. That hard-codes today's offset as source text, so a zone that gains DST (or changes its offset by decree, as several have) becomes a code edit. Use toDate(s, { timeZone }) with an IANA zone name.",
  toDateOffset:
    "An embedded offset takes precedence over the timeZone option, so this silently ignores the zone you passed. Drop the offset and let toDate apply the zone.",
};

function calleeName(node) {
  return node.callee?.type === "Identifier" ? node.callee.name : null;
}

export default {
  create(context) {
    return {
      NewExpression(node) {
        const name = calleeName(node);
        const arg = node.arguments?.[0];
        if (arg == null || arg.type === "SpreadElement") return;

        if (name === "TZDate") {
          // Two-argument form only: a one-argument `new TZDate(x)` has no zone
          // to be wrong about.
          if (node.arguments.length < 2) return;
          if (isAssembledString(arg)) context.report({ node: arg, message: MESSAGES.tzdate });
          return;
        }

        if (name === "Date") {
          if (isGluedDateTime(arg)) context.report({ node: arg, message: MESSAGES.newDate });
          else if (isGluedOffset(arg)) context.report({ node: arg, message: MESSAGES.newDateOffset });
        }
      },

      CallExpression(node) {
        const name = calleeName(node);
        const arg = node.arguments?.[0];
        if (arg == null || arg.type === "SpreadElement") return;

        if (name === "fromZonedTime" && node.arguments.length >= 2) {
          if (isGluedDateTime(arg)) context.report({ node: arg, message: MESSAGES.fromZonedTime });
          return;
        }

        if (name === "formatDateTime" && node.arguments.length >= 3) {
          if (isGluedDateTime(arg)) context.report({ node: arg, message: MESSAGES.formatDateTime });
          return;
        }

        if (name === "toDate" && node.arguments.length >= 2) {
          if (isGluedOffset(arg)) context.report({ node: arg, message: MESSAGES.toDateOffset });
        }
      },
    };
  },
};
