# @common-pattern/lint

Lint rules for conventions that are easy to state and easy to forget.

Writing a convention down helps for a while; a linter is the version that still
works in six months, and in code nobody remembers writing.

MIT licensed, and not specific to any one codebase — each rule encodes a
mistake that is general to JavaScript and TypeScript, with the reasoning in a
comment at the top of the file.

## Two flavours

The same conventions, in two implementations, because the two linters that can
enforce them take completely different plugin formats.

| | `js/` | `biome/` |
| --- | --- | --- |
| format | ESLint rule objects | GritQL patterns |
| runs under | **oxlint**, ESLint | **Biome** |
| rules | all six | three |
| status | primary — new rules go here | frozen at parity |

**Use `js/` unless you can't.** It carries three rules the GritQL flavour does not
have (see the table below), it is ~4.6× faster than the same three
rules under Biome's GritQL engine, and — the part that matters most — it is
portable. These are plain ESLint rule objects; nothing in them imports from
oxlint or from ESLint, so the same files run under either. Oxlint's JS plugin
API is alpha and unversioned, and that is a much smaller bet when the escape
hatch is "load them from a different config".

**Use `biome/` if Biome is the only linter you run** and adding a second one
isn't worth it for three rules. It is not going away; it is simply not where
new rules land.

Nothing stops you running both. Nothing is gained by it either — they overlap
exactly on the three shared rules, and you would get every diagnostic twice.

## Rules

| rule | `js/` | `biome/` |
| --- | :-: | :-: |
| [`no-utc-calendar-day`](#no-utc-calendar-day) | ✅ | ✅ |
| [`no-glued-timestamps`](#no-glued-timestamps) | ✅ | ✅ |
| [`no-double-assertion`](#no-double-assertion) | ✅ | ✅ |
| [`no-glued-timestamp-via-variable`](#no-glued-timestamp-via-variable) | ✅ | — needs scope resolution |
| [`no-suppressions`](#no-suppressions) | ✅ | — needs to see comments |
| [`no-style-prop`](#no-style-prop) | ✅ | — `biome/` is frozen at parity |

### `no-utc-calendar-day`

Bans `.toISOString().slice(…)` and `.toISOString().split(…)` — deriving a
calendar date from an instant by string surgery.

It reads as "today". It means *the UTC calendar day*, which is a different day
from the user's for a window as wide as their UTC offset: 05:30 every morning
in `Asia/Kolkata`, the whole evening in the Americas. That value then gets
compared against a `date` column holding a local calendar date, and the
comparison runs across two different calendars.

This one is unusually good at hiding. Test suites commonly pin `TZ=UTC`,
production is commonly a UTC datacentre, and nobody develops at 03:00 — so the
expression is correct in every context anyone inspects it in, and wrong only in
the answer given to the user.

**Both spellings are one rule on purpose.** `.toISOString().split("T")[0]` is
the same bug in different clothes, and in one codebase it survived months of
the `.slice` ban precisely because the rule looked like it covered the class and
covered one spelling of it. `[1]` is no better than `[0]` — that is the UTC wall
clock. The receiver is what makes this unambiguous, so there is no check on the
arguments: `formatInTimeZone(instant, tz, "yyyy-MM-dd HH:mm").split(" ")` has
already chosen a zone and stays legal.

### `no-glued-timestamps`

Bans `` `${dayKey}T00:00:00Z` `` and its noon-anchored cousin
`` `${dayKey}T12:00:00Z` ``, which hide two different mistakes.

**The interpolation hides the timezone question.** A glued
`` `${date}T00:00:00` `` with no `Z` parses in whatever zone the runtime is in
— the server's, not the user's. `toDate(date, { timeZone })` has nowhere to put
that mistake, because the zone is a required argument rather than an accident
of deployment.

**The noon anchor hides a category error.** It exists because
`` `${key}T00:00:00Z` `` renders as the *previous* day west of UTC, so someone
moved the anchor to noon to buy ±12h of slack. That is a fix sized to the zones
its author had in mind: at UTC+13/+14 (`Pacific/Apia`, `Pacific/Kiritimati`)
noon UTC is already the next day and it renders tomorrow. The deeper problem is
that a day key has no instant behind it at all — "28 July" is a calendar fact,
not a moment — so asking which zone to project it into is the wrong question.

**It also bans the offset variant** — `` new Date(`${wallClock}+05:30`) `` and
`` toDate(`${wallClock}-08:00`, { timeZone }) ``. This is the same habit with
the zone spelled as a number, and it is more tempting because it looks
deliberate: the author obviously thought about timezones. What they wrote down
is a fact with an expiry date. An offset is the tz database's *current answer*
for a zone, not the zone itself — Egypt reinstated DST in 2023, and Chile,
Morocco and Samoa have all moved — and when one changes, an IANA name is a
package update while a literal offset is a code edit nobody knows to make.

The `toDate` form fails a second way worth its own message: an embedded offset
takes **precedence** over the `timeZone` option, so the zone argument isn't
merely redundant, it is silently discarded.

**It also bans the `TZDate` variant** — `` new TZDate(`${date}T${time}:00`, tz) ``
and its `+`-concatenated equivalent. `@date-fns/tz` gives `TZDate` two
constructors that look interchangeable and are not: `new TZDate(string, zone)`
parses the string in the **ambient** zone (the browser's, or the datacentre's)
and only re-tags the result for display, while
`TZDate.tz(zone, year, monthIndex, day, hours, minutes)` reads calendar
components *in that zone*. So the glued form is wrong by the tenant's UTC offset
while reading as the careful, zone-aware thing to do — measured at +5:30 for an
IST org, where 9:30 PM was stored as 21:30Z and rendered back as 3:00 AM the
next day. The named zone in the call is what makes it convincing: the author
demonstrably thought about timezones and still got the opposite of what they
asked for.

This does **not** ban the string constructor. `new TZDate(iso, zone)` over an
unambiguous ISO string carrying a `Z` is legitimate — it parses as UTC whatever
the ambient zone is, and the zone argument only chooses how it renders. Only a
string *glued at the call site* is banned, because that string carries no zone
and therefore inherits one by accident. Two limits keep it honest: only the
two-argument form matches (a one-argument `new TZDate(x)` has no zone to be
wrong about), and the concatenation branch requires a **string literal** operand
so that `new TZDate(base + offsetMs, zone)` — ordinary epoch arithmetic through
the millisecond constructor — stays legal.

Matches call shapes (`new Date(…)`, `fromZonedTime(…)`, `formatDateTime(…)`,
`new TZDate(…, zone)`, and `toDate(…)` for the offset form) rather than every
template literal. The offset branches are deliberately scoped to
`new Date`/`toDate`: `` `${x}-10:30` `` is not inherently date-shaped — it could
be a range label — so the enclosing call is what makes the intent unambiguous.

Not matched, and deliberately legal: `` `${date}T${time}` `` **as a wire
value**, joining two already-validated fields into a string that is about to be
sent somewhere. There is no instant and no zone in it. Passed to a date
function, though, it is a bug — which is what the next rule is for.

> **The two flavours differ here, and the JS one is wider.** The GritQL rule
> decides "is this glued?" with a regex over the argument's *source text*, which
> requires literal digits after the `T` (`\$\{[^}]*\}T[0-2][0-9]:[0-5][0-9]`).
> So it catches `` `${key}T00:00:00Z` `` and misses `` `${dateStr}T${time}` `` —
> the more dangerous of the two, because nothing about it is inspectable at the
> call site. The JS rule flattens the expression into a *shape* instead (every
> interpolation collapses to one sentinel character), so a template literal and
> the equivalent `+` chain cannot diverge, and the time half may be a variable.

### `no-glued-timestamp-via-variable`

**`js/` only.** Bans the same glued timestamp when it reaches a
timezone-sensitive consumer *through a variable*:

```ts
const startStr = `${dateStr}T${normalizedTime}`;
const startDate = fromZonedTime(startStr, timezone);   // reported here
```

This is the rule `no-glued-timestamps` documents itself as unable to write.
GritQL has no scope resolution, so a pattern matching an interpolated assignment
plus a use of that name matches **by name across the whole file**: a `value`
glued into a label in one function then condemns an unrelated `value` holding a
real ISO constant in another, and names like `value`, `key`, `iso` and `start`
collide constantly. A rule with that false-positive rate gets suppressed, and a
suppressed rule protects nothing.

ESLint's scope analysis — which oxlint's plugin host implements — resolves the
identifier at the call site to the **one** binding it actually refers to,
honouring shadowing and closures. A same-named variable in a sibling function is
a different `Variable` and is never consulted. The false positive isn't traded
away; it is structurally absent, and `test/fixtures/scope-clean.ts` is built out
of exactly those collisions to keep it that way.

Every write to the resolved binding is checked — the declarator's initialiser
plus every later assignment — and aliases are followed (`const b = a`). One
glued write is enough: a variable that is *sometimes* glued is sometimes wrong,
and which branch ran is not something a linter gets to know.

**Deliberately not checked:** the glued string has to reach the consumer through
a plain binding. Passing it into a helper, storing it on an object, or pushing
it through an array all escape this rule. Following those needs data-flow
analysis rather than scope analysis, and a linter that guesses at data flow
produces exactly the false positives that get rules switched off. Scope
resolution is a real boundary and this rule sits on the near side of it.

### `no-double-assertion`

Bans `x as unknown as T`.

A single `as T` is checked: TypeScript rejects it unless one of the two types
is assignable to the other, so it can narrow or widen but it cannot invent.
Routing through `unknown` removes that check — the compiler stops relating the
two types and simply believes the second annotation. Whatever `T` claims is
then true for every downstream reader, including the ones who typecheck against
it and ship.

The distinction worth keeping is not "more of the same": `as T` is a partly
verifiable claim whose failure mode is a compile error. `as unknown as T` is an
unverified claim whose failure mode is a runtime error in a file that never
mentioned the cast. The usual tell is a comment beside it explaining why the
two types "really are" compatible — prose standing in for a check, and prose
goes stale. One such comment claimed two generated types differed by two
fields; they differed by six.

Instead: name the overlap (`Omit`/`Pick`/an interface) so both shapes satisfy
it with no cast, or narrow with a `value is T` type guard, so the shape is
earned at runtime rather than asserted.

Not matched: `x as T` (checked), `x as unknown` on its own (widening is the
safe direction), and `x as any as T` — `as any` is already caught by
`noExplicitAny` in both linters. The JS flavour additionally matches the
angle-bracket spelling `<T><unknown>x`, which is free once you have a real AST
and is a syntax error in `.tsx` anyway.

⚠️ **This fires in test files too.** Mocks and fixtures are where bridging a
closed generated interface is most defensible, so check whether your test
directories are inside the linted set before adopting it. Under oxlint you can
scope it off for a glob with `overrides`; under Biome you **cannot** — an
`overrides` entry carrying `plugins` is accepted and has no effect (measured
against 2.5). The better answer in both is usually to write the one checked
cast inside a helper whose parameter type is *derived from* the target, so no
`unknown` bridge is needed anywhere.

### `no-suppressions`

**`js/` only.** Bans `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`,
`biome-ignore`, `eslint-disable*` and `oxlint-disable*`.

"Never suppress, fix the root cause" is a convention almost every codebase
states and almost none enforces, for a mechanical reason: the suppressions are
comments. GritQL cannot match comments at all — they are not in the AST it
queries — and Biome ships no rule banning its own `biome-ignore`. So it has been
enforceable only by review, which lasts as long as the reviewer remembers.
`sourceCode.getAllComments()` makes it enforceable.

**This is not optional if you adopt the JS flavour.** Oxlint's own disable
directives *do* silence custom JS-plugin rules — verified, and covered by
`test/fixtures/suppression.ts`. The GritQL flavour has no such escape hatch,
because Biome cannot switch a plugin off for a line or even for a glob. So
moving the date rules to oxlint without this rule trades a gap in the rules for
a gap in the enforcement: every one of them silently becomes opt-out.

Two honest limits. It **cannot protect itself** — `// oxlint-disable
common-pattern/no-suppressions` works, and oxlint has no `noInlineConfig` to
close that. And it reports its own source file, which mentions every directive
it bans; consumers never see this, because `node_modules` is ignored by default.

### `no-style-prop`

Bans the JSX `style` prop.

This one is for a codebase that has committed to a component library, where
every spacing, colour and size is meant to come from the library's own
vocabulary. There, an inline `style` is not a small local override — it is a
second styling system with one member, and it grows.

**Why a rule and not a convention.** Because the convention demonstrably
failed. In the codebase this was written for, the project's own conventions
file asserted there was "no `style={{…}}` anywhere" in the app directory. There
were twenty. Nobody had been careless: each arrived with a paragraph of
measured justification, which is exactly why none of them looked like the thing
the convention was meant to stop.

**Why a grep is not enough, and this is the part that matters.** The obvious
search is `style={{`, and it is wrong. Half the real usages were
`style={columnWidth}` or `style={SEARCH_INPUT_STYLE}` — hoisted to a constant,
often *because* they were shared across call sites and therefore the most
entrenched. A text search finds the casual ones and misses the load-bearing
ones, which inverts the priority. Matching `JSXAttribute` by name catches every
spelling, because the attribute's value is never inspected:

```jsx
<Table style={{ minWidth: 1180 }} />   // found by a grep
<Table style={COLUMN_WIDTH} />          // not found by a grep
<Table style={styles.row} />            // not found by a grep
<Table style={cond ? a : b} />          // not found by a grep
```

**What to use instead.** A prop the component already has — ask the library's
CLI or its `.d.ts` rather than recalling it, since layout, spacing and width
are usually among them. A token or variant, where the value is a design
decision rather than a measurement. Or, for the genuine residue an inline style
could never express anyway — pseudo-classes, media queries, fixed positioning —
a colocated `Foo.module.css`, scoped and next to its component.

**Holes it leaves.** `<Foo {...{ style: x }} />` and `<Foo {...props} />` are
not caught; the rule reads attribute names, not data flow, and spreading a
style to evade a linter is a deliberate act rather than an accident.
`className` is not caught **deliberately** — it is the seam a CSS Module needs,
so banning it would ban the rule's own recommended alternative. And a prop
named `style` on a non-visual component matches too; that is the cost of a
name-based rule, and `overrides` can scope it off for such a directory.

## Install

```jsonc
// package.json — pinned to a SHA; see "Why this isn't on npm" below
{
  "devDependencies": {
    "@common-pattern/lint": "github:Common-Pattern/lint#<40-char-sha>"
  }
}
```

### With oxlint

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["./node_modules/@common-pattern/lint/js/index.js"],

  // Explicitly off. `"categories": {}` does NOT disable the default rule set —
  // it leaves ~500 native rules on at warning severity, which is a lot of noise
  // to inherit by accident. Drop this block if you actually want them.
  "categories": {
    "correctness": "off", "perf": "off", "pedantic": "off",
    "restriction": "off", "style": "off", "suspicious": "off"
  },

  // Severity must be set, and must be "error". Warnings do not fail a build,
  // and a rule that has never failed a build is a rule that protects nothing.
  "rules": {
    "common-pattern/no-utc-calendar-day": "error",
    "common-pattern/no-glued-timestamps": "error",
    "common-pattern/no-glued-timestamp-via-variable": "error",
    "common-pattern/no-double-assertion": "error",
    "common-pattern/no-suppressions": "error",
    "common-pattern/no-style-prop": "error"
  }
}
```

⚠️ **`jsPlugins` paths resolve relative to the config file, not the working
directory.** Worth knowing before you move the config or invoke oxlint from a
subdirectory.

### With ESLint

The same objects, loaded the ESLint way:

```js
// eslint.config.mjs
import commonPattern from "@common-pattern/lint/js";

export default [
  {
    plugins: { "common-pattern": commonPattern },
    rules: {
      "common-pattern/no-utc-calendar-day": "error",
      "common-pattern/no-glued-timestamps": "error",
      "common-pattern/no-glued-timestamp-via-variable": "error",
      "common-pattern/no-double-assertion": "error",
      "common-pattern/no-suppressions": "error",
      "common-pattern/no-style-prop": "error",
    },
  },
];
```

### With Biome

Reference the generated aggregate — one entry, all three GritQL rules:

```jsonc
// biome.json
{
  "plugins": ["./node_modules/@common-pattern/lint/biome/all.grit"],
  "linter": { "enabled": true }
}
```

Want only some of them? List the individual files instead
(`biome/no-utc-calendar-day.grit`, …).

⚠️ **`linter.enabled` must be `true`.** With the linter disabled, Biome
processes no files and plugins never run — and it reports this as "no files
were processed", not as a plugin error, which is a confusing way to find out.

**Why an aggregate file rather than an index that imports the others.** Biome
resolves each `plugins` entry as one explicit file path and loads it in
isolation. Measured against 2.5: globs (`biome/*.grit`), directories, and bare
package specifiers are all rejected, and a `.grit` file cannot reference a
pattern defined in another file — `import`, `include`, and a bare call to a
pattern defined elsewhere all fail to compile. (The standalone Grit CLI has a
module system; Biome does not implement it.) So `all.grit` is *generated*:
`scripts/build-all.mjs` wraps each plugin body in a named GritQL pattern and
composes them with `or`. The individual files stay the source of truth, and
`pnpm test` fails if the generated file is stale.

### Check where your linter actually runs

Worth doing before you pick a flavour, and it is a failure this repo has
watched happen. In a monorepo where each package's `lint` script is
`biome check`, an ESLint rule only runs in the packages that separately invoke
ESLint — which may be none of them. A repo-wide rule usually wants a single
root-level invocation over the whole tree, not a per-package one.

**A rule that is never executed looks exactly like a rule that always passes.**
After wiring anything up, plant a violation and watch the lint fail.

### Why this isn't on npm (yet)

Consume it as a pinned git dependency, as above. `pnpm` resolves that to a
codeload tarball at the exact SHA — no clone, no auth, no publish step, and
reproducible.

The trade is that there is no semver: upgrading means editing a 40-character
SHA in every consumer. Fine for one or two; annoying beyond that.

The obvious alternative — GitHub Packages (`npm.pkg.github.com`) — is worse
here: it requires an authentication token even to *read* public packages, so
every consumer's CI and every developer would need a PAT in their `.npmrc` in
order to install a lint plugin.

If the SHA-bumping becomes the annoying part, the answer is npmjs.com, which
needs no token to consume and supports trusted publishing over OIDC from GitHub
Actions (so no long-lived npm token either).

## Tests

```sh
pnpm install
pnpm test
```

Six fixtures, linted by whichever flavours can see them:

| fixture | asserts |
| --- | --- |
| `violations.ts` | 15 diagnostics, **from both flavours** — the parity check |
| `clean.ts` | 0 from both — the false-positive guard |
| `scope-violations.ts` | 9 from `js/`, 0 from `biome/` |
| `scope-clean.ts` | 0 — the name collisions that make the GritQL version impossible |
| `callsite-shape-gap.ts` | 4 from `js/`, 0 from `biome/` — the `` `${d}T${t}` `` shape |
| `suppression.ts` | 3 — the directives, not the 2 diagnostics they hide |

The clean halves matter more than the violation halves. A date rule that
produces false positives gets suppressed, and a suppressed rule protects
nothing.

The parity assertion on `violations.ts` is the other load-bearing one: two
implementations of one rule is how a rule set drifts, so both tools lint the
same file and must agree on the count. A change made to one flavour and not the
other fails here rather than in someone's diff six months later.

## Adding a rule

1. Write it in `js/rules/<name>.js` and register it in `js/index.js`. Put the
   reasoning at the top of the file and explain the *bug it prevents*, not just
   the pattern it matches — the comment is the part that survives contact with
   the next reader.
2. Add cases to `test/fixtures/violations.ts` **and** `test/fixtures/clean.ts`,
   and bump the counts in `test/run.sh`.
3. Decide whether it is expressible in GritQL. If it needs types, scope, or
   comments, it isn't — say so in the rule table above and stop here. If it is,
   add `biome/<name>.grit`, run `pnpm build` to regenerate `biome/all.grit`, and
   commit the result; the parity assertion then holds you to keeping both in
   step.
4. **Verify it actually fires** by planting a violation in a real consumer and
   watching the lint fail. A plugin that silently fails to compile, or that is
   registered where the linter never looks, is indistinguishable from one that
   passes.
