/**
 * Ban lint and typecheck suppressions outright.
 *
 * "Never suppress — fix the root cause" is a convention almost every codebase
 * states somewhere and almost none enforces, for a mechanical reason: the
 * suppressions are comments, and most linters give a rule no way to see them.
 * So the convention has only ever been enforceable by review, which means it
 * holds for as long as the reviewer remembers.
 *
 * An ESLint-shaped rule gets `sourceCode.getAllComments()`, so it is
 * enforceable here.
 *
 * This is not a nice-to-have alongside the other five. Oxlint's own disable
 * directives DO suppress custom JS-plugin rules — verified: a fixture with
 * `// oxlint-disable-next-line common-pattern/no-glued-timestamp-via-variable`
 * reports nothing, and reports two diagnostics with the directive removed. So
 * adopting these rules WITHOUT this one trades a gap in the rules for a gap in
 * the enforcement: every one of them silently becomes opt-out.
 *
 * `oxlint-disable`/`eslint-disable` are included for that reason. `@ts-ignore`
 * and `biome-ignore` are here too, even where another tool's own rule may
 * already cover them, so this rule is complete on its own wherever it runs.
 *
 * Two honest limits. It cannot protect itself — `// oxlint-disable
 * common-pattern/no-suppressions` works, and oxlint has no `noInlineConfig`.
 * And it reports its own source file, which names every directive it bans;
 * consumers never see that, because `node_modules` is ignored by default.
 */

const PATTERNS = [
  { re: /@ts-ignore\b/, what: "@ts-ignore" },
  { re: /@ts-expect-error\b/, what: "@ts-expect-error" },
  { re: /@ts-nocheck\b/, what: "@ts-nocheck" },
  { re: /\bbiome-ignore\b/, what: "biome-ignore" },
  { re: /\boxlint-disable(?:-next-line|-line)?\b/, what: "oxlint-disable" },
  { re: /\beslint-disable(?:-next-line|-line)?\b/, what: "eslint-disable" },
];

export default {
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          for (const { re, what } of PATTERNS) {
            if (!re.test(comment.value)) continue;
            // `loc`, not `node`. A comment token is not an AST node, and
            // ESLint's report translator documents `node` as one — passing a
            // token happens to work under oxlint and is not guaranteed to
            // under ESLint. Since running unmodified under both is the whole
            // premise of this package, the portable spelling is the correct
            // one even where the other currently works.
            context.report({
              loc: comment.loc,
              message: `\`${what}\` suppresses a check rather than satisfying it. Fix the root cause — a suppression is a claim that the tool is wrong, and it goes stale silently while the code around it changes.`,
            });
            break;
          }
        }
      },
    };
  },
};
