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
EXPECTED_LOCALE_VIOLATIONS=15
EXPECTED_STYLE_VIOLATIONS=12

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

echo "==> no-zoneless-locale-format"
expect "locale-violations.ts" "$(ox_count test/fixtures/locale-violations.ts)" "$EXPECTED_LOCALE_VIOLATIONS"

echo "==> ...and does NOT fire on number formatting, or on options it cannot see"
expect "locale-clean.ts     " "$(ox_count test/fixtures/locale-clean.ts)" 0

echo "==> no-style-prop: every spelling, including the hoisted ones a grep misses"
expect "style-violations.tsx" "$(ox_count test/fixtures/style-violations.tsx)" "$EXPECTED_STYLE_VIOLATIONS"

echo '==> ...and does NOT fire on `style` as a binding, key, param, or on className'
expect "style-clean.tsx     " "$(ox_count test/fixtures/style-clean.tsx)" 0

echo "OK"
