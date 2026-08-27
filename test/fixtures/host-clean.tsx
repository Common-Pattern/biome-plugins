/**
 * Zero diagnostics. Every carve-out `no-host-elements` claims is exercised
 * here, because a rule that reports any of these is a rule someone switches
 * off — and this one is switched on per-glob, so switching it off is one line.
 *
 * Configured for this fixture with `allow: ["html", "body"]`.
 */

import { createElement } from "react";

declare const Card: (props: { children?: unknown }) => unknown;
declare const Stack: (props: { children?: unknown; gap?: number }) => unknown;
declare const layout: { Row: (props: { children?: unknown }) => unknown };
declare const children: unknown;

// The allowlist. A root layout has nowhere else to get the document element.
export const RootLayout = () => (
  <html lang="en">
    <body>{children}</body>
  </html>
);

// Components, which is the entire point of the rule.
export const Composed = () => (
  <Card>
    <Stack gap={2}>
      <Card />
    </Stack>
  </Card>
);

// A member expression is a component reference to JSX whatever its casing:
// this compiles to `layout.Row`, never to the string "layout.Row".
export const Namespaced = () => (
  <layout.Row>
    <Card />
  </layout.Row>
);

// Fragments are not elements at all.
export const Fragmented = () => (
  <>
    <Card />
    <Card />
  </>
);

// HTML inside a string is a string. A grep for `<div` finds all three of
// these; the parser finds none of them.
export const asText = "<div class='row'>not JSX</div>";
export const asTemplate = `<section><p>${String(1)}</p></section>`;
// A comment mentioning <div> and <span> is still a comment.

// `React.createElement("div")` is a documented hole — the tag is a string
// argument, so this rule never sees it. Asserted here so the hole is a
// decision on record rather than an oversight discovered later.
export const ViaCreateElement = () => createElement("div", null, "escaped");

// A lowercase identifier that is not an element name.
const section = { title: "not an element" };
export const usesBinding = section.title;
