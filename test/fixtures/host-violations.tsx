/**
 * Every diagnostic in this file is intentional. Configured for this fixture
 * with `allow: ["html", "body"]`, so those two are in `host-clean.tsx`.
 *
 * Layout props here are written responsively and no `style` prop appears, so
 * `no-style-prop` and `no-pinned-width` stay silent and the count belongs to
 * `no-host-elements` alone.
 */

declare const Card: (props: { children?: unknown }) => unknown;
declare const Text: (props: { children?: unknown }) => unknown;
declare const items: string[];
declare const expanded: boolean;

// The plain ones a grep would also find. 3
export const Plain = () => (
  <Card>
    <div>
      <span>one</span>
      <p>two</p>
    </div>
  </Card>
);

// Attributes push the tag off its own line, which is where a line-oriented
// grep for `<section` starts missing things. 2
export const Wrapped = () => (
  <section
    id="summary"
    aria-label="summary"
  >
    <header>head</header>
  </section>
);

// Tags that postdate most "we banned raw HTML" commits. A denylist written
// before 2022 lets both of these through in silence; an allowlist bans them
// the day they ship. 2
export const Recent = () => (
  <dialog open>
    <search>find</search>
  </dialog>
);

// Inside a callback and a conditional — positions where the element is not a
// direct child of anything the author is looking at. 3
export const Dynamic = () => (
  <Card>
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
    {expanded ? <footer>more</footer> : <br />}
  </Card>
);

// A component held in a lowercase binding. JSX compiles this to the string
// "card", so it renders <card> to the DOM — the rule agrees with the runtime,
// not with the intent. 1
const card = Card;
export const Miscased = () => <card />;

// Self-closing and void elements are elements. 2
export const Void = () => (
  <Card>
    <img alt="" src="/a.png" />
    <hr />
  </Card>
);

// Nesting a component inside host elements does not launder them. 3
export const Mixed = () => (
  <main>
    <ul>
      <Text>only this line is fine</Text>
    </ul>
    <a href="/next">next</a>
  </main>
);
