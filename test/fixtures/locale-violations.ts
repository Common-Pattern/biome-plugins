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

export function explicitlyUndefinedOptionsAreStillNoOptions(instant: Date) {
  // Identical to omitting the argument: both render in the ambient zone. The
  // explicit spelling shows up when the argument is forwarded from a wrapper
  // whose caller left it out, which is exactly where the zone goes missing
  // without anyone noticing.
  const a = instant.toLocaleDateString("en-IN", undefined); // no-zoneless-locale-format
  const b = instant.toLocaleTimeString("en-IN", undefined); // no-zoneless-locale-format
  // A bare `null`: the fixture is linted, not compiled, and this is what a
  // wrapper forwarding an unset options argument actually passes.
  const c = instant.toLocaleDateString("en-IN", null); // no-zoneless-locale-format
  return [a, b, c];
}

export function timeZoneNameIsNotATimeZone(instant: Date) {
  // `timeZoneName` only chooses how the zone is LABELLED ("IST", "GMT+5:30").
  // It is date evidence, not a zone, so this still renders in the ambient one.
  return instant.toLocaleString("en-IN", { timeZoneName: "short" }); // no-zoneless-locale-format
}
