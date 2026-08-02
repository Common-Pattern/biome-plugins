/**
 * `@common-pattern/lint` — the JavaScript flavour.
 *
 * Seven rules, written as plain ESLint rule objects. Oxlint's JS plugin host
 * implements the ESLint v9 rule API, so the same objects run under either
 * linter unmodified; nothing here imports from oxlint or from ESLint.
 *
 * That portability is the point, not a bonus. Oxlint's plugin API is alpha and
 * has no semver, so a rule set that could only ever run under oxlint would be
 * trading one lock-in for another. These move to ESLint by changing the config
 * that loads them, and nothing else.
 *
 * Each rule carries its own reasoning at the top of its file — what bug it
 * prevents, not just what it matches. The README is the shorter tour.
 */

import noDoubleAssertion from "./rules/no-double-assertion.js";
import noGluedTimestampViaVariable from "./rules/no-glued-timestamp-via-variable.js";
import noGluedTimestamps from "./rules/no-glued-timestamps.js";
import noStyleProp from "./rules/no-style-prop.js";
import noSuppressions from "./rules/no-suppressions.js";
import noUtcCalendarDay from "./rules/no-utc-calendar-day.js";
import noZonelessLocaleFormat from "./rules/no-zoneless-locale-format.js";

export default {
  meta: { name: "common-pattern" },
  rules: {
    "no-utc-calendar-day": noUtcCalendarDay,
    "no-glued-timestamps": noGluedTimestamps,
    "no-glued-timestamp-via-variable": noGluedTimestampViaVariable,
    "no-double-assertion": noDoubleAssertion,
    "no-suppressions": noSuppressions,
    "no-style-prop": noStyleProp,
    "no-zoneless-locale-format": noZonelessLocaleFormat,
  },
};
