/// <reference types="node" />
/** @jsxImportSource @example/ui */

/*! @license MIT — minifiers keep this on purpose, and a licence may require it. */

// @vitest-environment jsdom

declare function makeThing(): number;

export function lazy() {
  return import(/* webpackChunkName: "lazy" */ /* @vite-ignore */ "./elsewhere.js");
}

export const pure = /* @__PURE__ */ makeThing();

export const url = "https://example.com//not-a-comment";
export const tpl = `a /* not a comment */ b`;
export const re = /\/\/ not a comment/;
export const raw = String.raw`C:\path // still not a comment`;

export function Eight() {
  return <p>ratio 1//2 — JSX text, not a comment</p>;
}
