# @common-pattern/lint

Lint rules for conventions that are easy to state and easy to forget.

Writing a convention down helps for a while; a linter is the version that still
works in six months, and in code nobody remembers writing.

MIT licensed, and not specific to any one codebase — each rule encodes a
mistake that is general to JavaScript and TypeScript, with the reasoning in a
comment at the top of the file.

## One flavour, two hosts

The rules are plain **ESLint rule objects**. Oxlint's JS plugin host implements
the ESLint v9 rule API, so the same files run under **oxlint or ESLint**
unmodified — nothing in them imports from either.

That portability is the point, not a bonus. Oxlint's plugin API is alpha and has
no semver, so a rule set that could only ever run under oxlint would be trading
one lock-in for another. These move to ESLint by changing the config that loads
them, and nothing else.

> **Previously there was a GritQL flavour for Biome.** It was removed in 0.3.0.
> It could only ever carry three of the rules — GritQL has no scope resolution
> and cannot match comments at all — and keeping two implementations of one rule
> in step is how a rule set drifts. Consumers on `biome/all.grit` should move
> their `biome.json` `plugins` entry to an oxlint `jsPlugins` entry; see
> [With oxlint](#with-oxlint). Biome remains a fine formatter and linter
> alongside it — it simply no longer hosts these rules.

## Rules

| rule | bans |
| --- | --- |
| [`no-utc-calendar-day`](#no-utc-calendar-day) | deriving a calendar day from an instant by slicing its ISO string |
| [`no-glued-timestamps`](#no-glued-timestamps) | building a timestamp by interpolation, at the call site |
| [`no-glued-timestamp-via-variable`](#no-glued-timestamp-via-variable) | the same glue, reaching a date consumer through a variable |
| [`no-double-assertion`](#no-double-assertion) | `x as unknown as T` |
| [`no-error-message-to-response`](#no-error-message-to-response) | a caught error, or its `.message`, sent to the client |
| [`no-suppressions`](#no-suppressions) | every spelling of "ignore this diagnostic" |
| [`no-zoneless-locale-format`](#no-zoneless-locale-format) | rendering a date with no explicit `timeZone` |
| [`no-style-prop`](#no-style-prop) | the JSX `style` prop, in any spelling |
| [`no-pinned-width`](#no-pinned-width) | `width`/`maxWidth`/`minWidth` set to a fixed measure |
| [`no-host-elements`](#no-host-elements) | raw HTML in JSX — every lowercase element, minus an allowlist |
| [`no-comments`](#no-comments) | comments — every `//`, `/* */` and JSDoc block, minus what the toolchain reads |

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

> **How "glued" is decided, and why it matters.** The obvious implementation is
> a regex over the argument's *source text*, requiring literal digits after the
> `T`. That catches `` `${key}T00:00:00Z` `` and misses `` `${dateStr}T${time}` ``
> — the more dangerous of the two, because nothing about it is inspectable at
> the call site. (The retired GritQL flavour worked exactly that way, and the
> gap was not hypothetical.) This rule flattens the expression into a *shape*
> instead — every interpolation collapses to one sentinel character — so a
> template literal and the equivalent `+` chain cannot diverge, and the time
> half may be a variable.

### `no-glued-timestamp-via-variable`

Bans the same glued timestamp when it reaches a
timezone-sensitive consumer *through a variable*:

```ts
const startStr = `${dateStr}T${normalizedTime}`;
const startDate = fromZonedTime(startStr, timezone);   // reported here
```

This is the case `no-glued-timestamps` gives up on, and it needs scope
resolution to do safely. Without it, a pattern matching an interpolated
assignment plus a use of that name can only match **by name across the whole
file**: a `value`
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
scope it off for a glob with `overrides`. The better answer is usually to write
the one checked cast inside a helper whose parameter type is *derived from* the
target, so no `unknown` bridge is needed anywhere.

### `no-error-message-to-response`

Bans a caught error — or its `.message` — reaching a client-facing response:

```ts
} catch (err) {
  const msg = err instanceof Error ? err.message : "Failed to create member";
  throw new HttpError(422, [msg]);   // reported here
}
```

That reads as diligence, and what it actually sends is not the author's
choice. Since drizzle-orm 0.41 a failed query arrives as a `DrizzleQueryError`
whose `.message` is `Failed query: <the whole statement>` followed by
`params: <every bound value>`, so the branch meant to surface "email already
taken" surfaces the SQL, the schema and whatever values the request carried,
to whoever made the request. Most drivers do the same — `pg`, `mysql2`,
`ioredis`, the AWS SDK, `node-fetch` on a DNS failure. One codebase shipped
this in ~30 handlers before anyone read a 422 body closely.

It needs to be a rule rather than a review note because the fix is mechanical
and the mistake is not. `err.message` is the obvious thing to write, it is
right for the errors the author had in mind, and the leak is invisible to every
test that asserts on a status code — so it comes back, in a new handler, six
weeks after the pull-request comment that caught the last one.

**Flagged**, inside a `catch` block or a `.catch(cb)` / `.then(ok, cb)` handler,
where `E` is the caught binding:

| sink | shape |
| --- | --- |
| `new HttpError(<status>, X)` | any argument after the status |
| `c.json({ error: X })`, `{ errors: X }` | any `.json(…)` method call — Hono's `c.json` and Express's `res.json` alike |
| `new Response(X, …)` | the body argument |
| `return { …, message: X }` | an object literal **in return position** with a property named `message`, `error`, `errors` or `reason` — the Next.js Server Action shape |
| `recordFailure({ reason: X })` | an object literal argument, with one of those same four keys, to a function named in the `sinks` option — silent unless you configure it |

…where `X` is `E`, `E.message`, or the wrappings people reach for around them:
a conditional (`E instanceof Error ? E.message : "…"`), an array literal, a
template literal, `+` concatenation, `??`/`||` with a fallback, a nested
object, or a binding in scope written from any of those.

Return position is the whole test for that last one, and it is what makes it
usable. An object literal with a `message` key is not by itself a response; it
is also how a browser component holds what it is about to render. The version
that looked at *every* object literal was run over a real app and reported two
client components building `result = { status: "failed", message: … }` from a
failed action call — already on the client, nothing disclosed, and exactly the
finding that gets a rule switched off. What a function returns crosses a
boundary; what it assigns to a local does not. `const state = {…}; return
state;` is still caught, because the returned identifier resolves to the
binding.

**Not flagged, and each of these is load-bearing:**

- `console.error(err)`, `logger.error({ err })`, Sentry — any logging call. The
  server log is where the full error *belongs*; a rule that pushed people to
  redact it there would trade a disclosure bug for an undebuggable one.
- `throw err`, and `throw new Error(…, { cause: err })`. Rethrowing defers to
  the error handler, which is the layer that owns this decision.
- A bare `return err.message` from an ordinary function. That is a value being
  passed along, not a response body — it is how a sanitizer is written, and how
  a CLI wrapper hands a subprocess failure back to its own caller. Only the
  object shape counts in return position.
- `E.message` passed to **any** call expression other than the sinks above.
  This is the escape hatch and it is deliberately generous: a call is where a
  human made a decision about this value, and the rule cannot tell a good
  decision from a bad one. `clientMessage(err, "…")`,
  `userFacingMessage(err.message)`, `formStateFromError(err)`,
  `redact(String(err))` all pass. A rule with no cheap way to say "handled"
  gets suppressed wholesale, and a suppressed rule protects nothing.

**Deliberately not checked:** the error has to reach the response through a
plain binding. Passing it into a helper, storing it on an object that is later
spread, or pushing it through an array all escape the rule — following those
needs data-flow analysis rather than scope analysis, the same boundary
[`no-glued-timestamp-via-variable`](#no-glued-timestamp-via-variable) sits on
and for the same reason. In practice the binding hop is the shape that occurs,
because the `const msg = …` line exists precisely to hold the ternary.

The corollary is that **this is not a security boundary and must not be sold as
one.** It catches the spelling that shows up in review, on the day it is
written. The boundary is one error handler that decides what leaves the
process; the rule is what stops individual handlers routing around it.

**Options.** `sanitizers` names the helpers the diagnostic recommends
(default `["clientMessage", "userFacingMessage", "formStateFromError"]`), and
`docs` names where the convention is written down. Neither widens the escape
hatch — every call already is one — so the option changes the message and
nothing else. It earns its place because naming the wrong helper in a report is
how a rule teaches the wrong habit.

`sinks` is the third, and the only one that changes what is reported. It names
functions whose object-literal arguments are response bodies:

```jsonc
["error", { "sinks": ["recordPlatformActionFailure"], "docs": "CLAUDE.md" }]
```

```ts
} catch (err) {
  await recordPlatformActionFailure({
    orgId,
    reason: err instanceof Error ? err.message : String(err),   // reported here
  });
  throw err;
}
```

That call writes its `reason` into an `audit_events.data.reason` column, and a
serializer serves that column back out through three listing endpoints. There
is no response object at the call site at all — it is stored, and then served,
on some later request nobody was looking at. Six of these were in one codebase,
and the rule stepped past every one of them, because a call is the escape
hatch.

**It defaults to `[]`, and this is opt-in rather than a heuristic**, which is
the honest description of it rather than an apology for it.
`logger.error({ err, message: err.message })` has the identical shape and is an
explicit non-goal of this rule — the server log is where the full error
belongs. Nothing in the source text separates a persistence call from a logging
one, so **the author names the sinks or gets nothing**; the rule will not infer
it from the callee
name, and a denylist of logger-ish names would be the same guess with a longer
config. This is the shape [`no-host-elements`](#no-host-elements) takes for the
same reason: the list is the content, and the tool does not get to invent it.

What you are asserting when you add a name is something **the linter cannot
have**: that what goes into this function comes back out to someone. A rule can
see the write. It cannot see the round-trip — there is no edge in any syntax
tree from a column to the endpoint that serves it. `sinks` is where you supply
that edge, and it is worth only as much as the reading behind each name.

Only object-literal arguments are checked, in any position, and only for the
four response keys. A positional argument has no key to test, and the escape
hatch stands everywhere the config has not spoken — including inside a named
sink, so `recordPlatformActionFailure({ reason: clientMessage(err, "…") })` is
the fix and is silent.

### `no-suppressions`

Bans `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`,
`biome-ignore`, `eslint-disable*` and `oxlint-disable*`.

"Never suppress, fix the root cause" is a convention almost every codebase
states and almost none enforces, for a mechanical reason: the suppressions are
comments, and most linters give a rule no way to see them. So it has been
enforceable only by review, which lasts as long as the reviewer remembers.
`sourceCode.getAllComments()` makes it enforceable.

**This is not optional if you adopt these rules.** Oxlint's own disable
directives *do* silence custom JS-plugin rules — verified, and covered by
`test/fixtures/suppression.ts`. So adopting the rest without this one trades a
gap in the rules for a gap in the enforcement: every one of them silently
becomes opt-out.

Two honest limits. It **cannot protect itself** — `// oxlint-disable
common-pattern/no-suppressions` works, and oxlint has no `noInlineConfig` to
close that. And it reports its own source file, which mentions every directive
it bans; consumers never see this, because `node_modules` is ignored by default.

### `no-zoneless-locale-format`

Bans rendering a date through `toLocaleDateString` / `toLocaleTimeString` /
`toLocaleString`, or `Intl.DateTimeFormat`, without an explicit `timeZone`.

With no `timeZone`, these format in the **runtime's** zone. That is the
machine's zone — not the user's, not the tenant's — and on a server it is
whatever the container was built with, almost always UTC. So one stored instant
renders as two different wall clocks depending on where the code happens to run.

This is `no-utc-calendar-day`'s failure arriving by the opposite road. There the
zone is silently UTC; here it is silently *ambient*. Both produce code that is
correct in every context anyone inspects it in — a suite pinning `TZ=UTC` agrees
with a UTC container, and a developer sitting in the tenant's zone sees the right
answer all day — and wrong only in what the user is shown.

Instead, pass the zone, always as a named IANA zone (`"Asia/Kolkata"`), never
the offset it currently resolves to (`"+05:30"`):

```ts
date.toLocaleString("en-IN", { dateStyle: "medium", timeZone: TENANT_TZ })
new Intl.DateTimeFormat("en-IN", { timeZone: TENANT_TZ }).format(date)
formatInTimeZone(date, TENANT_TZ, "d MMM yyyy, HH:mm")   // date-fns-tz
```

If you genuinely want the viewer's own zone — a browser-only clock — that is
still worth writing down rather than inheriting. `timeZone:
Intl.DateTimeFormat().resolvedOptions().timeZone` says it out loud, and
satisfies the rule because the option is present. Reading the ambient zone that
way is **not** reported: `Intl.DateTimeFormat(…).resolvedOptions()` is
introspection, not rendering, and flagging it would condemn the fix this rule's
own message recommends.

**How the ambiguity is handled.** Only `Date` has `toLocaleDateString` and
`toLocaleTimeString`, so those two are flagged whenever `timeZone` is absent.
`toLocaleString` is the hard one — `Number`, `BigInt`, `Array` and `Date` all
have it, and `(1234.5).toLocaleString()` is perfectly good code. Telling them
apart needs the receiver's *type*, which a syntactic linter does not have. So
the rule does not guess: it flags `toLocaleString` only when the options object
it was handed is already, unmistakably, formatting a date — it carries a
date/time key (`dateStyle`, `timeStyle`, `year`, `month`, `day`, `hour`,
`minute`, `weekday`, …) and no `timeZone`.

Options behind a **computed key** (`{ [zoneKey]: "Asia/Kolkata", … }`) are not
followed either, and for the same reason as a spread: the key may well be
`timeZone`, and concluding it is absent would fire on correct code. An
explicitly-passed `undefined` or `null`, on the other hand, *is* treated as no
options at all — it renders identically to omitting the argument, and it is how
the zone goes missing when a wrapper forwards an options argument its caller
left out.

Not matched, deliberately: a bare `someDate.toLocaleString()` with no options —
a genuine instance the rule cannot see, and the price of never firing on number
formatting. Options behind a variable or a spread are not followed either; that
needs data flow, not syntax. A narrow rule that always means something beats a
broad one that gets suppressed.

### `no-style-prop`

Bans the JSX `style` prop.

This one is for a codebase that has committed to a component library, where
every spacing, colour and size is meant to come from the library's own
vocabulary. There, an inline `style` is not a small local override — it is a
second styling system with one member, and it grows.

**Why a rule and not a convention.** Because the convention demonstrably
failed. In the codebase this was written for, the project's own conventions file
asserted there was "no `style={{…}}` anywhere" in the app directory. There were
twenty. Nobody had been careless: each arrived with a paragraph of measured
justification, which is exactly why none of them looked like the thing the
convention was meant to stop.

**Why a grep is not enough, and this is the part that matters.** The obvious
search is `style={{`, and it is wrong. Half the real usages were
`style={columnWidth}` or `style={SEARCH_INPUT_STYLE}` — hoisted to a constant,
often *because* they were shared across call sites and therefore the most
entrenched. A text search finds the casual ones and misses the load-bearing
ones, which inverts the priority. Matching `JSXAttribute` by name catches every
spelling — object literal, identifier, member expression, call, conditional —
because the value is never inspected:

```jsx
<Table style={{ minWidth: 1180 }} />   // found by a grep
<Table style={COLUMN_WIDTH} />          // not found by a grep
<Table style={styles.row} />            // not found by a grep
<Table style={cond ? a : b} />          // not found by a grep
```

**What to use instead.** A prop the component already has — ask the library's
CLI or its `.d.ts` rather than recalling it, since layout, spacing and width are
usually among them. A token or variant, where the value is a design decision
rather than a measurement. Or, for the genuine residue that an inline style
could never express anyway — pseudo-classes, media queries, fixed positioning —
a colocated `Foo.module.css`, scoped and next to its component.

**Holes it leaves.** `<Foo {...{ style: x }} />` and `<Foo {...props} />` are not
caught; the rule reads attribute names, not data flow, and spreading a style to
evade a linter is a deliberate act rather than an accident. `className` is not
caught **deliberately** — it is the seam a CSS Module needs, so banning it would
ban the rule's own recommended alternative. And a prop named `style` on a
non-visual component matches too; that is the cost of a name-based rule, and
`overrides` can scope it off for such a directory.

### `no-pinned-width`

Bans `width`, `maxWidth` and `minWidth` props set to a pixel count, an absolute
unit, a font-relative unit, or a value the rule cannot read.

This one is for a codebase that has decided layout flows to the viewport by
default, and that any exception is a design decision somebody takes on purpose
rather than a number somebody reaches for while building a screen. It is the
width half of what a spacing scale already does for padding: `padding={6}` is a
token, `maxWidth={768}` is a measurement, and only one of them survives a
redesign.

**Why a rule and not a convention.** Same evidence as `no-style-prop`. In the
codebase this was written for, one afternoon's sweep removed ninety pinned
widths — `Dialog width={520}` twelve times over, `TextInput width={280}` on
every search box, a `maxWidth={768}` reading measure on the legal pages, a
`lib/measures.ts` of shell constants. None arrived carelessly; most had a
comment above them explaining the number, which is the problem. A justified pin
reads like a considered decision, so nobody removes it, and the next screen
copies it. The sweep is cheap. Staying swept is not.

**What counts as responsive.** Values that resolve against something that
changes: the viewport (`vw`/`vh`, plus the logical, small, large and dynamic
families), the container (`%`, the `cq*` units), and the intrinsic keywords
(`auto`, `min-content`, `max-content`, `fit-content()`, `stretch`, and `none`,
which removes a cap). `calc()`, `min()`, `max()` and `clamp()` pass when every
term inside them does — so `min(400px, 90vw)` is still a violation, because the
`px` term is the ceiling that binds on every desktop.

**Font-relative units are banned, and that is the judgement in it.** `rem`,
`em`, `ch` and `lh` respond to the reader's text size — a real accessibility
axis, and the reason they are right for typography. They do not respond to the
viewport. On a width prop, `maxWidth="65ch"` is a fixed measure wearing a
relative unit: it is the deleted reading measure, re-spelled, and it would sail
past a rule that only banned `px`. A repo that wants the classic reading measure
back should decide that once, for every run of text at the same time — which is
the decision this rule exists to force upward.

**Why a grep is not enough.** `width={520}` is the easy half:

```jsx
<Dialog width={520} />                     // found by a grep for a digit
<Card maxWidth="65ch" />                   // not found — no digit-plus-px
<Popover width="min(400px, 100vw)" />      // not found — looks responsive
<Card maxWidth={PROSE_WIDTH} />            // not found — and the most entrenched
```

The last shape is why a value the rule cannot read statically is reported too,
under its own message. Not because it is certainly a pin, but because a width
that cannot be checked is a width that is not checked, and a shared constant is
where these go to hide.

**Holes it leaves.** Heights are out of scope — a pinned height does not stop a
page reflowing horizontally, and the honest uses are common (a skeleton bar, a
scroll ceiling on a log viewer); the rule's prop list is the only thing to change
if a repo wants them. Object properties are not read, which is deliberate: a
grid's `columns={{ minWidth: 250 }}` is a **reflow threshold** — it says "wrap to
fewer columns below 250px each", so it *causes* reflow where a `maxWidth`
prevents it — and the same goes for table column config. That carve-out is also
this rule's real limit, so pair it with `no-style-prop` to close the inline-style
route. Host elements are exempt: `<img width={800}>` is an intrinsic dimension,
and on an image that attribute is what lets the browser reserve the right box
before the file arrives, so banning it would trade a layout pin for layout shift.

### `no-host-elements`

Bans raw HTML in JSX — every lowercase (host) element, minus a stated
allowlist.

This one is for a directory that has committed to a component library
*completely*: page chrome from the library's layout components, structure from
its stack and grid components, text from its text component, and nothing
hand-rolled out of `<div>`. There, a raw host element is a second layout system
with one member, and it grows. It is the markup half of the door `no-style-prop`
closes, and neither is much use alone — a `<div className="row">` needs no
`style` prop to reintroduce a parallel layout vocabulary.

**This rule ships off and takes options**, as `no-comments` does, and for the
same reason. Every other rule encodes a mistake that is a mistake everywhere: a
zoneless date is wrong in any file. This encodes a decision a *directory* took. A `<div>` in an ordinary React app is correct
code, so the rule has no useful global setting — switch it on per-glob for the
tree that made the commitment. And its message has to name the library the
reader should use instead, which this package cannot know.

```jsonc
{
  "rules": { "common-pattern/no-host-elements": "off" },
  "overrides": [
    {
      "files": ["web/app/**", "web/lib/**"],
      "rules": {
        "common-pattern/no-host-elements": ["error", {
          // Every entry is a claim that the library has no equivalent AND that
          // the host element is unavoidable. Read it as a document.
          "allow": ["html", "body", "form", "input", "meta"],
          "library": "@astryxdesign/core",
          "docs": "web/CLAUDE.md"
        }]
      }
    }
  ]
}
```

**Why an allowlist and not a list of banned tags.** This is the whole design,
and the reason the rule exists rather than a configured `react/forbid-elements`,
which takes an enumeration of tags to forbid. Enumerating the forbidden side
loses twice. HTML has well over a hundred elements and it gains more —
`<dialog>`, `<search>` and `<selectedcontent>` all postdate plenty of "we banned
raw HTML" commits — so a denylist is out-run by whatever tag the next person
reaches for, and it fails **open**: the unlisted tag is silently fine. The
permitted set is small, typically nought to five, and every member has a reason
somebody can state. Enumerate that side instead, and a new tag is banned the day
it ships with no edit to the rule.

**Why a grep is not enough.** `grep '<div'` matches `<divider>`, matches the
word in a comment, a string or a Markdown fixture, and misses `<div\n
className=…>` where the attributes push the tag onto the next line. More to the
point, it cannot answer the question the rule asks. That question is not "does
this text appear" but "is this element a host element or a component", and it is
syntactic: `<Card>` and `<card>` differ by one bit of casing and compile to
entirely different things, and so do `<foo.bar>` (a component reference, always)
and `<foo>` (the DOM, always). No pattern over source text decides that. The
parser already has.

**The allowlist is the rule's real content.** In the codebase this was written
for it is five entries, and the shape of the reasons is the standard a sixth has
to meet: `html`/`body` because a Next root layout must render the document
element and there is nowhere else to get it; `form` because a Server Action
submits through a native `<form action>` and the library's `FormLayout` is
layout, not a submitting form; `input` because `<input type="hidden">` is the
only way to carry a value into that submission, while every visible input still
uses the library's `TextInput`; `meta` because document metadata is not UI, so no
component library should have a component for it. An allowlist that grows
without reasons of that kind is the ban switched off one tag at a time — worse
than no rule, because the config still reads as though something is enforced.

**Holes it leaves.** `React.createElement("div")` is not caught: the tag is a
string argument, so this rule never sees it. `dangerouslySetInnerHTML` is not
caught either — its content is an opaque string, and banning the attribute is a
different rule with a different argument, about injection rather than layout
vocabulary. Member expressions are not caught whatever their casing, because
`<foo.bar />` compiles to `foo.bar` and never to the string `"foo.bar"`, so a
namespaced component object (`<layout.Row />`) is correct code. Namespaced names
(`<svg:circle />`) are not caught; React does not support them. Fragments are
not elements. And a component held in a lowercase binding **is** caught, which
is correct rather than a false positive: `const card = Card; <card />` renders
`<card>` to the DOM, so the rule agrees with the runtime rather than with the
author's intent.

### `no-comments`

Bans comments — every `//`, every `/* */`, every JSDoc block, minus the ones a
tool rather than a person reads.

This is for a codebase that has decided its explanation belongs somewhere with a
version, a date and an owner: a plan document, a commit message, an ADR. The
argument is not that explanation is worthless. It is that a comment is the one
place to put it where nothing checks it — the code around a comment moves, the
comment does not, and a stale comment is worse than none because it is still
read as current. Every other artefact that explains the code carries the date it
was written. The comment is the only one that pretends to be about the line it
sits on today.

Like `no-host-elements`, it ships **off** and is switched on per-glob. A comment
in an ordinary codebase is correct code, so there is no useful global setting.

```jsonc
{
  "rules": { "common-pattern/no-comments": "off" },
  "overrides": [
    {
      "files": ["web/app/**", "web/lib/**"],
      "rules": {
        "common-pattern/no-comments": ["error", {
          "docs": "web/CLAUDE.md",
          // Regex sources, matched against the comment body. For a pragma the
          // built-in list does not know about.
          "allow": ["^\\s*@custom-pragma\\b"]
        }]
      }
    }
  ]
}
```

**Why a linter and not a one-off codemod.** Stripping the comments is the easy
half and it happens once; the convention is what has to survive the next six
months of pull requests, and a convention nothing enforces lasts about as long
as the people who read it. The strip is also not repeatable by hand — a regex
over source text eats the `//` inside a URL string, the `/*` inside a regex
literal, and the contents of a template literal. That is the second reason to
want a parser here, in the codemod as well as in the rule.

**What is not a comment, even though it is spelt like one.** This is the rule's
whole risk: a comment the toolchain *reads* is input, and deleting it changes
what the program does with no diagnostic at the deletion site. Exempt, each
because its audience is a machine:

| exempt | why |
| --- | --- |
| `#!/usr/bin/env node` | the kernel picks the interpreter with it; parsers merely hand it over as a comment |
| `/// <reference … />` | TypeScript compiler input — it adds files to the program |
| `@jsxImportSource`, `@jsx`, `@jsxRuntime` | selects the JSX factory |
| `webpackChunkName:` and the other magic comments, `@vite-ignore` | read by the bundler |
| `@__PURE__`, `@__NO_SIDE_EFFECTS__` | what lets a minifier drop a call |
| `@vitest-environment`, `@jest-environment` | decides which environment a test file runs in |
| `@license`, `@preserve`, and the `/*!` banner | minifiers keep them on purpose, and a licence may require it |
| `/** @type {…} */` **in a `.js`/`.mjs`/`.cjs` file** | there the JSDoc *is* the type annotation; under `checkJs` deleting it deletes the check |

That last one is the only exemption that depends on the filename, and it is
scoped to type-carrying tags: prose in a JavaScript file is still prose and is
still reported. In a `.ts` file `@type` is decoration over a real annotation, so
it is reported there too.

**Suppressions are deliberately not exempt.** `// oxlint-disable`,
`// biome-ignore` and `// @ts-expect-error` are read by a tool and would qualify
under that reasoning, but `no-suppressions` bans them outright and exempting
them here would make this the one place the ban looks lifted. A file that trips
both gets two diagnostics, which is right — they are two different objections.

**The hole it cannot close** is `no-suppressions`' hole: oxlint's own disable
directives silence custom JS-plugin rules and there is no `noInlineConfig`. Switch
the two rules on together.

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
    "common-pattern/no-error-message-to-response": "error",
    "common-pattern/no-suppressions": "error",
    "common-pattern/no-zoneless-locale-format": "error",
    "common-pattern/no-style-prop": "error",
    "common-pattern/no-pinned-width": "error",

    // Off by default, and switched on per-glob in `overrides` — these are the
    // two rules here that encode a directory's decision rather than a mistake,
    // and the two that take options. See `no-host-elements` and `no-comments`.
    "common-pattern/no-host-elements": "off",
    "common-pattern/no-comments": "off"
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
      "common-pattern/no-error-message-to-response": "error",
      "common-pattern/no-suppressions": "error",
      "common-pattern/no-zoneless-locale-format": "error",
      "common-pattern/no-style-prop": "error",
      "common-pattern/no-pinned-width": "error",
    },
  },
];
```

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

Twenty fixtures:

| fixture | asserts |
| --- | --- |
| `violations.ts` | 15 diagnostics — the shared corpus |
| `clean.ts` | 0 — the false-positive guard |
| `scope-violations.ts` | 9 — glue reaching a consumer through a variable |
| `scope-clean.ts` | 0 — the name collisions a scope-blind rule would trip on |
| `callsite-shape-gap.ts` | 4 — the `` `${d}T${t}` `` shape, where the time half is itself interpolated |
| `suppression.ts` | 3 — the directives, not the 2 diagnostics they hide |
| `response-violations.ts` | 20 — every shape that puts a caught error in a response body, and four that put one into a configured `sinks` call |
| `response-clean.ts` | 0 — logging, rethrowing, a value routed through any helper, and the same object literal handed to a function `sinks` does not name |
| `locale-violations.ts` | 15 — zoneless date rendering |
| `locale-clean.ts` | 0 — number formatting, and options the rule cannot see |
| `style-violations.tsx` | 12 — every spelling of the `style` prop, including the hoisted ones |
| `style-clean.tsx` | 0 — `style` as a binding, key, param, and `className` |
| `width-violations.tsx` | 16 — pixels, absolute and font-relative units, and hoisted constants |
| `width-clean.tsx` | 0 — relative units, intrinsic keywords, host elements, grid reflow floors |
| `host-violations.tsx` | 16 — every host element, including tags newer than most raw-HTML bans |
| `host-clean.tsx` | 0 — the allowlist, components, member expressions, fragments, HTML in a string |
| `comments-violations.tsx` | 10 — every shape, including the JSX container and a JSDoc type tag in TypeScript |
| `comments-violations.mjs` | 3 — prose in a JavaScript file, where only type-carrying tags are exempt |
| `comments-clean.tsx` | 0 — directives, pragmas, licence banners, and comment-shaped text in a string, template or regex |
| `comments-clean.mjs` | 0 — a hashbang, and the JSDoc that IS the type annotation |

Every fixture has to be clean for every rule but its own, which is why
`style-clean.tsx` writes its layout props responsively.

The clean halves matter more than the violation halves. A rule that produces
false positives gets suppressed, and a suppressed rule protects nothing. Two of
them are load-bearing in particular: `scope-clean.ts` is why the scope rule is
writable at all, and `locale-clean.ts` is why the locale rule is — it shares a
method name with number formatting, which is everywhere. `response-clean.ts` is
the third: a rule that flagged `console.error(err)` would be asking people to
make their own logs useless, and would be turned off within a day. It carries
the pair the `sinks` option stands on — `logFailure({ orgId, reason })` and
`recordPlatformActionFailure({ orgId, reason })`, the same key holding the same
value, one of them named in the config and one not.

## Adding a rule

1. Write it in `js/rules/<name>.js` and register it in `js/index.js`. Put the
   reasoning at the top of the file and explain the *bug it prevents*, not just
   the pattern it matches — the comment is the part that survives contact with
   the next reader.
2. Add cases to a violations fixture **and** a clean one, and bump the counts in
   `test/run.sh`. If the rule can plausibly fire on something innocent, the
   clean fixture is the more important of the two.
3. Add it to the rule table above, to the config snippets in
   [Install](#install), and to `.oxlintrc.json` so this repo lints itself with
   it.
   **If the rule takes options, declare `meta.schema`.** Oxlint follows ESLint
   v9 here: without a schema it rejects any configured options outright
   (*"Rule 'x' does not accept options"*), and with one it validates against it
   and rejects an unknown property by name. That is the good failure — a
   mistyped option is a config error rather than a silently ignored setting, so
   there is no way to end up with a rule quietly running on its defaults.
4. **Verify it actually fires** by planting a violation in a real consumer and
   watching the lint fail. Oxlint prints *nothing at all* on a clean run, so
   silence is not evidence — a plugin that failed to load looks exactly like one
   that passed.
