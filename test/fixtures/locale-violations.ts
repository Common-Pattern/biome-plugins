// Every line marked here MUST be reported by `no-zoneless-locale-format`.
// `test/run.sh` asserts the count, so adding a case means updating
// EXPECTED_LOCALE_VIOLATIONS in that script.
//
// Not real code — these exist to be linted, not run.

export function dateOnlyMethodsWithNoOptions(instant: Date) {
  // Only `Date` has these two, so no options are needed as evidence.
  return [
    instant.toLocaleDateString(), // no-zoneless-locale-format
    instant.toLocaleTimeString(), // no-zoneless-locale-format
  ];
}

export function dateOnlyMethodsWithALocaleButNoZone(instant: Date) {
  return [
    instant.toLocaleDateString("en-IN"), // no-zoneless-locale-format
    instant.toLocaleTimeString("en-IN", { timeStyle: "short" }), // no-zoneless-locale-format
  ];
}

export function toLocaleStringCarryingDateOptions(instant: Date) {
  // The options prove this is a date, and none of them names a zone.
  return [
    instant.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }), // no-zoneless-locale-format
    instant.toLocaleString("en-IN", { year: "numeric", month: "short", day: "numeric" }), // no-zoneless-locale-format
    instant.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" }), // no-zoneless-locale-format
  ];
}

export function intlDateTimeFormatWithoutAZone(instant: Date) {
  // `Intl.DateTimeFormat` is unambiguously a date formatter, so an options
  // object is not required as evidence — its absence is itself the bug.
  const a = new Intl.DateTimeFormat("en-IN"); // no-zoneless-locale-format
  const b = new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }); // no-zoneless-locale-format
  // Legal without `new`, and just as wrong.
  const c = Intl.DateTimeFormat("en-IN", { timeStyle: "short" }); // no-zoneless-locale-format
  return [a.format(instant), b.format(instant), c.format(instant)];
}

export function quotedOptionKeysAreStillKeys(instant: Date) {
  return instant.toLocaleString("en-IN", { "dateStyle": "medium" }); // no-zoneless-locale-format
}
