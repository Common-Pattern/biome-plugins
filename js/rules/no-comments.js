/**
 * Ban comments — every `//`, every `/* *\/`, every JSDoc block.
 *
 * This is a rule for a codebase that has decided its explanation belongs
 * somewhere with a version, a date and an owner — a plan document, a commit
 * message, an ADR — rather than beside the code. The argument is not that
 * explanation is worthless. It is that a comment is the one place to put it
 * where nothing checks it: the code around a comment moves, the comment does
 * not, and a stale comment is worse than no comment because it is read as
 * current. Every other artefact that explains the code carries the date it was
 * written, and the comment is the only one that pretends to be about the line
 * it sits on today.
 *
 * WHY THIS SHIPS OFF BY DEFAULT. Every other rule in this package encodes a
 * mistake that is a mistake everywhere — a zoneless date is wrong in any file.
 * This one, like `no-host-elements`, encodes a decision a *directory* has
 * taken. A comment in an ordinary codebase is correct code. So it has no useful
 * global setting: switch it on per-glob, for the tree that made the commitment,
 * and leave it off elsewhere.
 *
 * WHY A LINTER AND NOT A CODEMOD. Stripping the comments is the easy half and
 * it is done once; the convention is what has to survive the next six months of
 * pull requests, and a convention nothing enforces lasts about as long as the
 * people who read it. The strip is also not repeatable by hand — a regex over
 * source text eats a `//` inside a URL string, a `/*` inside a regex literal,
 * and the contents of a template literal — which is the second reason to have a
 * parser-shaped rule rather than a grep in CI.
 *
 * ── WHAT IS NOT A COMMENT, EVEN THOUGH IT IS SPELT LIKE ONE ─────────────────
 *
 * The rule's whole risk is here. A comment the toolchain *reads* is input, not
 * prose, and deleting it changes what the program does — silently, since the
 * tool that consumed it simply stops seeing it. Each exemption below is a case
 * where something other than a human is the audience:
 *
 *   - **A hashbang.** `#!/usr/bin/env node` is how the kernel picks the
 *     interpreter. Parsers hand it over as a comment; it is not one.
 *   - **Triple-slash directives.** `/// <reference … />` is TypeScript
 *     compiler input — it adds files to the program. Removing one is a build
 *     change with no diagnostic at the removal site.
 *   - **Bundler and runtime pragmas.** `@jsxImportSource` picks the JSX
 *     factory, `webpackChunkName` names a chunk, `@vite-ignore` suppresses
 *     analysis of a dynamic import, `@__PURE__` is what lets a minifier drop a
 *     call. All are read by a build step and none by a person.
 *   - **Test-runner environment pragmas.** `@vitest-environment jsdom` decides
 *     which environment the file runs in; removing it moves the test to the
 *     default and it may still pass, which is the failure mode to avoid.
 *   - **Legal headers.** `@license`, `@preserve` and the `/*!` banner form are
 *     preserved by minifiers on purpose, and a licence notice can be a
 *     condition of the licence rather than a style choice.
 *   - **JSDoc types in a JavaScript file.** In a `.js`/`.mjs`/`.cjs` file
 *     `/** @type {…} *\/` IS the type annotation — under `checkJs` it is
 *     checked, and deleting it deletes the check. In a `.ts` file the same tag
 *     is decoration over a real annotation, so it is reported there. The
 *     extension is the whole test, which is why this exemption needs
 *     `context.filename` and the others do not.
 *
 * `allow` is the escape hatch for a pragma this list does not know about. It
 * takes regex sources, matched against the comment body.
 *
 * SUPPRESSIONS ARE DELIBERATELY NOT EXEMPT. `// oxlint-disable`,
 * `// biome-ignore` and `// @ts-expect-error` are read by a tool, so they would
 * qualify under the reasoning above — but `no-suppressions` already bans them
 * outright, and exempting them here would make this rule the one place the ban
 * looks lifted. A file that trips both gets two diagnostics, which is correct:
 * they are two different objections.
 *
 * THE HOLE THIS RULE CANNOT CLOSE, same as `no-suppressions`: oxlint's own
 * disable directives silence custom JS-plugin rules, and there is no
 * `noInlineConfig`. `no-suppressions` is what keeps that from being a way out,
 * so the two rules are worth switching on together.
 */

/**
 * Comment bodies the toolchain reads. Matched against `comment.value` — the
 * text between the delimiters, so a block comment's body still carries the
 * leading `*` of `/**` and each continuation line's `*`.
 *
 * Anchored where anchoring is honest: a pragma sits at the start of its own
 * comment, and matching one loose in the middle of a paragraph would exempt
 * prose that merely mentions it.
 */
const TOOLCHAIN = [
  // TypeScript triple-slash directives. The parser reports `/// <reference/>`
  // as a Line comment whose body starts with the third slash.
  /^\/\s*<(?:reference|amd-module|amd-dependency)\b/,
  // JSX factory selection, and the runtime pragmas beside it.
  /@jsx(?:ImportSource|Runtime|Frag)?\s/,
  // Test-runner environments.
  /@(?:vitest|jest)-environment\b/,
  // Minifier hints and side-effect annotations.
  /[@#]__(?:PURE|NO_SIDE_EFFECTS)__/,
  // Webpack magic comments and the Vite equivalents.
  /\bwebpack(?:ChunkName|Mode|Prefetch|Preload|Include|Exclude|Ignore|Exports)\s*:/,
  /@vite-(?:ignore|preserve)\b/,
  // Legal notices a minifier is expected to keep.
  /@(?:license|preserve|copyright)\b/,
];

/** Type-carrying JSDoc tags, exempt only in a JavaScript file. */
const JS_TYPE_TAGS =
  /@(?:type|satisfies|typedef|template|import|callback|param|returns?|prop(?:erty)?|enum|extends|augments|implements|this|overload|ts-check)\b/;

const JS_FILE = /\.[cm]?jsx?$/;

export default {
  meta: {
    schema: [
      {
        type: "object",
        properties: {
          /** Extra comment bodies to permit, as regex sources. */
          allow: { type: "array", items: { type: "string" }, uniqueItems: true },
          /** Where the convention is written down, e.g. "web/CLAUDE.md". */
          docs: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const { allow = [], docs } = context.options[0] ?? {};
    const extra = allow.map((source) => new RegExp(source));
    const isJs = JS_FILE.test(context.filename ?? "");
    const suffix = docs ? ` See ${docs}.` : "";

    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          // A hashbang is handed over as a comment by every parser here and is
          // not one — it is how the kernel picks the interpreter.
          if (comment.type === "Shebang") continue;
          const body = comment.value;
          if (TOOLCHAIN.some((re) => re.test(body))) continue;
          if (isJs && JS_TYPE_TAGS.test(body)) continue;
          if (extra.some((re) => re.test(body))) continue;

          context.report({
            // `loc`, not `node`. A comment token is not an AST node, and
            // ESLint's report translator documents `node` as one — passing a
            // token happens to work under oxlint and is not guaranteed to
            // under ESLint.
            loc: comment.loc,
            message: `This directory carries no comments. Put the explanation where it is dated and owned — a plan, a commit message, an ADR — or make the code say it. A comment is the one artefact nothing checks: the code moves, the comment stays, and it is still read as current.${suffix}`,
          });
        }
      },
    };
  },
};
