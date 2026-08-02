// Nothing here may be reported. This is the false-positive guard for
// `no-zoneless-locale-format`, and it is the more important half: the rule
// shares a method name with number formatting, which is everywhere. A rule that
// fired on `(1234.5).toLocaleString()` would be switched off within a week, and
// a suppressed rule protects nothing.
//
// Not real code — these exist to be linted, not run.

declare const TENANT_TZ: string;

export function zoneGivenExplicitly(instant: Date) {
  return [
    instant.toLocaleDateString("en-IN", { timeZone: TENANT_TZ }),
    instant.toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" }),
    instant.toLocaleString("en-IN", { dateStyle: "medium", timeZone: TENANT_TZ }),
    new Intl.DateTimeFormat("en-IN", { timeZone: TENANT_TZ }).format(instant),
    Intl.DateTimeFormat("en-IN", { timeZone: TENANT_TZ }).format(instant),
  ];
}

export function theViewersOwnZoneSaidOutLoud(instant: Date) {
  // Wanting the viewer's zone is legitimate; inheriting it silently is not.
  // Naming it is what distinguishes the two, and it satisfies the rule.
  return instant.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

export function numberFormattingIsNotDateFormatting(amount: number, big: bigint) {
  // The whole reason `toLocaleString` is judged on its options rather than its
  // receiver: these are not dates and must never be reported.
  return [
    amount.toLocaleString(),
    amount.toLocaleString("en-IN"),
    amount.toLocaleString("en-IN", { style: "currency", currency: "INR" }),
    amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    big.toLocaleString("en-IN", { notation: "compact" }),
    (1234.5).toLocaleString(),
  ];
}

export function arrayToLocaleStringIsAlsoNotADate(xs: number[]) {
  return xs.toLocaleString();
}

export function bareToLocaleStringIsDeliberatelyNotJudged(instant: Date) {
  // A genuine instance the rule cannot see: no options, so nothing distinguishes
  // it from number formatting without type information. Documented as a known
  // gap rather than guessed at.
  return instant.toLocaleString();
}

export function optionsBehindAVariableAreNotFollowed(instant: Date, opts: Intl.DateTimeFormatOptions) {
  // Resolving this needs data flow, not syntax. Staying silent is the honest
  // answer; `opts` may well carry a timeZone.
  return instant.toLocaleDateString("en-IN", opts);
}

export function spreadOptionsAreNotFollowed(instant: Date, base: Intl.DateTimeFormatOptions) {
  // The spread could be carrying `timeZone` in from somewhere unseen.
  return instant.toLocaleString("en-IN", { ...base, dateStyle: "medium" });
}

export function numberFormatIsADifferentConstructor(amount: number) {
  // Only `Intl.DateTimeFormat` is matched; its siblings have no timezone.
  return [
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount),
    new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" }).format(-1, "day"),
    new Intl.ListFormat("en-IN").format(["a", "b"]),
  ];
}
