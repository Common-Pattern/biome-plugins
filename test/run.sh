#!/usr/bin/env bash
# Verify every rule fires on its violations fixture and stays silent on its
# clean one, in both flavours, and that the three shared rules agree with each
# other diagnostic-for-diagnostic.
#
# The clean halves matter more than the violation halves: a date rule that
# produces false positives gets suppressed, and a suppressed rule protects
# nothing. `scope-clean.ts` in particular is why the scope rule is writable at
# all — it is built out of the exact name collisions that make the same rule
# impossible in GritQL.
#
# The parity assertions are the other load-bearing part. Two implementations of
# one rule is how a rule set drifts; `violations.ts` is linted by both tools and
# must produce the same count, so a change to one flavour that is not made to
# the other fails here rather than in someone's diff six months later.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The shared corpus: every rule that exists in both flavours, in both spellings.
EXPECTED_VIOLATIONS=15
# JS-only, because GritQL has no scope resolution.
EXPECTED_SCOPE_VIOLATIONS=9
# JS-only, because the GritQL rule matches a regex over source text that
# requires literal digits after the `T`.
EXPECTED_CALLSITE_GAP=4
# JS-only, because GritQL cannot match comments at all.
EXPECTED_SUPPRESSIONS=3
# JS-only: `biome/` is frozen at parity, so new rules land in `js/` alone.
EXPECTED_STYLE_VIOLATIONS=12

fail() { echo "FAIL: $1" >&2; exit 1; }

# Prefer the locally installed binaries (`pnpm install` first). `BIOME_BIN` /
# `OXLINT_BIN` let CI or a different package manager point at their own.
if [ -n "${BIOME_BIN:-}" ]; then
  read -ra BIOME <<<"$BIOME_BIN"
elif [ -x "./node_modules/.bin/biome" ]; then
  BIOME=(./node_modules/.bin/biome)
else
  echo "No Biome found. Run 'pnpm install' (or set BIOME_BIN)." >&2
  exit 1
fi

if [ -n "${OXLINT_BIN:-}" ]; then
  read -ra OXLINT <<<"$OXLINT_BIN"
elif [ -x "./node_modules/.bin/oxlint" ]; then
  OXLINT=(./node_modules/.bin/oxlint)
else
  echo "No oxlint found. Run 'pnpm install' (or set OXLINT_BIN)." >&2
  exit 1
fi

# Both linters exit non-zero when they report anything, which is the whole
# point of them — `|| true` keeps `set -e` from ending the run at the first
# fixture that works correctly.
biome_count() { "${BIOME[@]}" check --max-diagnostics=200 "$1" 2>&1 | grep -c 'plugin ━' || true; }
ox_count() { "${OXLINT[@]}" "$1" 2>&1 | grep -c 'common-pattern(' || true; }

expect() {
  local label="$1" actual="$2" want="$3"
  echo "    $label: got $actual, want $want"
  [ "$actual" -eq "$want" ] || fail "$label"
}

# Compare the committed artifact against a freshly generated one, rather than
# asking git whether the file is dirty. Same assertion on CI's clean checkout,
# but it also holds while you are mid-change: the git form reported "stale" for
# any edit that was correctly regenerated and simply not committed yet, so the
# documented `pnpm build && pnpm test` loop could not go green until after the
# commit it was supposed to gate.
echo "==> biome/all.grit is in sync with the individual GritQL plugins"
generated="$(mktemp)"
trap 'rm -f "$generated"' EXIT
ALL_GRIT_OUT="$generated" node scripts/build-all.mjs >/dev/null
if ! diff -q "$generated" biome/all.grit >/dev/null; then
  diff -u biome/all.grit "$generated" || true
  fail "biome/all.grit is stale — run 'pnpm build' and commit the result"
fi
echo "    ok"

echo "==> shared rules on the violations fixture (both flavours must agree)"
expect "biome  " "$(biome_count test/fixtures/violations.ts)" "$EXPECTED_VIOLATIONS"
expect "oxlint " "$(ox_count test/fixtures/violations.ts)" "$EXPECTED_VIOLATIONS"

echo "==> shared rules on the clean fixture (the false-positive guard)"
expect "biome  " "$(biome_count test/fixtures/clean.ts)" 0
expect "oxlint " "$(ox_count test/fixtures/clean.ts)" 0

echo "==> no-glued-timestamp-via-variable: needs scope resolution, so JS only"
expect "oxlint " "$(ox_count test/fixtures/scope-violations.ts)" "$EXPECTED_SCOPE_VIOLATIONS"
expect "biome (expected to miss every one)" "$(biome_count test/fixtures/scope-violations.ts)" 0

echo "==> no-glued-timestamp-via-variable does NOT fire on same-named bindings"
expect "oxlint " "$(ox_count test/fixtures/scope-clean.ts)" 0

echo "==> call-site shapes the GritQL source regex cannot express"
expect "oxlint " "$(ox_count test/fixtures/callsite-shape-gap.ts)" "$EXPECTED_CALLSITE_GAP"
expect "biome (expected to miss every one)" "$(biome_count test/fixtures/callsite-shape-gap.ts)" 0

# Oxlint's disable directives DO silence custom JS-plugin rules — the two date
# diagnostics in this fixture are suppressed, and reappear if you delete the
# directives. `no-suppressions` is what keeps the build red anyway, by reporting
# the three directives themselves. Without it every JS rule would quietly be
# opt-out. The GritQL flavour needs no equivalent: Biome cannot switch a plugin
# off for a line or a glob, so there is nothing to suppress it with.
echo "==> disable directives silence custom rules, and no-suppressions catches them"
expect "oxlint (the 3 directives, not the 2 dates they hide)" \
  "$(ox_count test/fixtures/suppression.ts)" "$EXPECTED_SUPPRESSIONS"

echo "==> no-style-prop: every spelling, including the hoisted ones a grep misses"
expect "oxlint " "$(ox_count test/fixtures/style-violations.tsx)" "$EXPECTED_STYLE_VIOLATIONS"

echo '==> ...and does NOT fire on `style` as a binding, key, param, or on className'
expect "oxlint " "$(ox_count test/fixtures/style-clean.tsx)" 0

echo "OK"
