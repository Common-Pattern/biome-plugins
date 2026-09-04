#!/usr/bin/env bash
# Verify every rule fires on its violations fixture and stays silent on its
# clean one.
#
# The clean halves matter more than the violation halves: a rule that produces
# false positives gets suppressed, and a suppressed rule protects nothing.
# `scope-clean.ts` is why the scope rule is writable at all — it is built out of
# the exact name collisions that would sink a name-matching version — and
# `locale-clean.ts` is why the locale rule is writable at all, since it shares a
# method name with number formatting, which is everywhere.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EXPECTED_VIOLATIONS=15
EXPECTED_SCOPE_VIOLATIONS=9
EXPECTED_CALLSITE_GAP=4
EXPECTED_SUPPRESSIONS=3
EXPECTED_RESPONSE_VIOLATIONS=20
EXPECTED_LOCALE_VIOLATIONS=15
EXPECTED_STYLE_VIOLATIONS=12
EXPECTED_WIDTH_VIOLATIONS=16
EXPECTED_HOST_VIOLATIONS=16
EXPECTED_COMMENT_VIOLATIONS=10
EXPECTED_COMMENT_JS_VIOLATIONS=3

fail() { echo "FAIL: $1" >&2; exit 1; }

# Prefer the locally installed binary (`pnpm install` first). `OXLINT_BIN` lets
# CI or a different package manager point at its own.
if [ -n "${OXLINT_BIN:-}" ]; then
  read -ra OXLINT <<<"$OXLINT_BIN"
elif [ -x "./node_modules/.bin/oxlint" ]; then
  OXLINT=(./node_modules/.bin/oxlint)
else
  echo "No oxlint found. Run 'pnpm install' (or set OXLINT_BIN)." >&2
  exit 1
fi

# oxlint exits non-zero when it reports anything, which is the whole point of
# it — `|| true` keeps `set -e` from ending the run at the first fixture that
# works correctly.
ox_count() { "${OXLINT[@]}" "$1" 2>&1 | grep -c 'common-pattern(' || true; }

expect() {
  local label="$1" actual="$2" want="$3"
  echo "    $label: got $actual, want $want"
  [ "$actual" -eq "$want" ] || fail "$label"
}

echo "==> the shared corpus"
expect "violations.ts" "$(ox_count test/fixtures/violations.ts)" "$EXPECTED_VIOLATIONS"

echo "==> the false-positive guard"
expect "clean.ts     " "$(ox_count test/fixtures/clean.ts)" 0

echo "==> no-glued-timestamp-via-variable: needs scope resolution"
expect "scope-violations.ts" "$(ox_count test/fixtures/scope-violations.ts)" "$EXPECTED_SCOPE_VIOLATIONS"

echo "==> ...and does NOT fire on same-named bindings in sibling scopes"
expect "scope-clean.ts     " "$(ox_count test/fixtures/scope-clean.ts)" 0

echo "==> call-site shapes a source-text regex cannot express"
expect "callsite-shape-gap.ts" "$(ox_count test/fixtures/callsite-shape-gap.ts)" "$EXPECTED_CALLSITE_GAP"

# Oxlint's disable directives DO silence custom JS-plugin rules — the two date
# diagnostics in this fixture are suppressed, and reappear if you delete the
# directives. `no-suppressions` is what keeps the build red anyway, by reporting
# the three directives themselves. Without it every rule here would quietly be
# opt-out.
echo "==> disable directives silence custom rules, and no-suppressions catches them"
expect "suppression.ts (the 3 directives, not the 2 dates they hide)" \
  "$(ox_count test/fixtures/suppression.ts)" "$EXPECTED_SUPPRESSIONS"

echo "==> no-error-message-to-response: every shape that puts a caught error in a response body, plus the configured sinks"
expect "response-violations.ts" "$(ox_count test/fixtures/response-violations.ts)" "$EXPECTED_RESPONSE_VIOLATIONS"

echo '==> ...and does NOT fire on logging, on a rethrow, on a value routed through any helper, or on an unnamed function taking the same object'
expect "response-clean.ts     " "$(ox_count test/fixtures/response-clean.ts)" 0

echo "==> no-zoneless-locale-format"
expect "locale-violations.ts" "$(ox_count test/fixtures/locale-violations.ts)" "$EXPECTED_LOCALE_VIOLATIONS"

echo "==> ...and does NOT fire on number formatting, or on options it cannot see"
expect "locale-clean.ts     " "$(ox_count test/fixtures/locale-clean.ts)" 0

echo "==> no-style-prop: every spelling, including the hoisted ones a grep misses"
expect "style-violations.tsx" "$(ox_count test/fixtures/style-violations.tsx)" "$EXPECTED_STYLE_VIOLATIONS"

echo '==> ...and does NOT fire on `style` as a binding, key, param, or on className'
expect "style-clean.tsx     " "$(ox_count test/fixtures/style-clean.tsx)" 0

echo "==> no-pinned-width: pixels, absolute units, font-relative units, and the hoisted constants a grep misses"
expect "width-violations.tsx" "$(ox_count test/fixtures/width-violations.tsx)" "$EXPECTED_WIDTH_VIOLATIONS"

echo '==> ...and does NOT fire on relative units, intrinsic keywords, host elements, or a grid reflow floor'
expect "width-clean.tsx     " "$(ox_count test/fixtures/width-clean.tsx)" 0

# The only rule here that is "off" at the top level and switched on by an
# `overrides` entry — it encodes a decision a directory took, not a mistake that
# is always a mistake, so it has no useful global setting. That override is also
# what exercises the options path: it is the one rule in this package that takes
# any, and a `library`/`docs`/`allow` that failed to reach the rule would leave
# it reporting a generic message rather than reporting nothing, which is the
# harder failure to notice.
echo "==> no-host-elements: every host element, including tags newer than most raw-HTML bans"
expect "host-violations.tsx" "$(ox_count test/fixtures/host-violations.tsx)" "$EXPECTED_HOST_VIOLATIONS"

echo '==> ...and does NOT fire on the allowlist, components, member expressions, fragments, or HTML in a string'
expect "host-clean.tsx     " "$(ox_count test/fixtures/host-clean.tsx)" 0

# Off at the top level like `no-host-elements`, and for the same reason — it
# encodes a decision a directory took. Every other fixture in this suite is
# written in comments, so a global setting would bury their counts under this
# rule's.
echo "==> no-comments: every shape, including the JSX container and a JSDoc type tag in TypeScript"
expect "comments-violations.tsx" "$(ox_count test/fixtures/comments-violations.tsx)" "$EXPECTED_COMMENT_VIOLATIONS"

echo "==> ...and prose in a JavaScript file, where only type-carrying tags are exempt"
expect "comments-violations.mjs" "$(ox_count test/fixtures/comments-violations.mjs)" "$EXPECTED_COMMENT_JS_VIOLATIONS"

echo '==> ...and does NOT fire on directives, pragmas, licence banners, or a comment inside a string, template or regex'
expect "comments-clean.tsx     " "$(ox_count test/fixtures/comments-clean.tsx)" 0

echo '==> ...nor on a hashbang, nor on the JSDoc that IS the type annotation in a .mjs'
expect "comments-clean.mjs     " "$(ox_count test/fixtures/comments-clean.mjs)" 0

echo "OK"
