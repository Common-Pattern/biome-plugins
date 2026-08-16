/**
 * Every shape `no-pinned-width` has to catch.
 *
 * The first group is the obvious one a grep would also find. The rest are the
 * reason the rule exists: the same pin spelled as a string, wrapped in a
 * function, expressed in a unit that looks relative but is not, or hoisted to a
 * constant so no text search for a digit will ever see it.
 *
 * Expected: 16 diagnostics.
 */

declare const Card: any;
declare const Dialog: any;
declare const TextInput: any;
declare const VStack: any;
declare const Popover: any;
declare const Ui: { Panel: any };

/** The hoisted constants. This is the shape a grep for `width={` + a digit misses. */
const PROSE_WIDTH = 768;
const SHELL = { content: 880 };
const measured = () => 640;

export function Violations({ isWide }: { isWide: boolean }) {
  return (
    <VStack>
      {/* 1–3. A bare number is pixels in any `number | string` sizing prop. */}
      <Dialog width={520} />
      <VStack maxWidth={368} />
      <Card minWidth={240} />

      {/* 4–5. The same pin, as a string. */}
      <Card width="520px" />
      <Card maxWidth="48pc" />

      {/* 6. …and as a string inside the expression container, which is a
          different AST node and has caught rules out before. */}
      <Card width={"640px"} />

      {/* 7. …and as a template with no substitutions. */}
      <Card width={`600px`} />

      {/* 8–10. FONT-RELATIVE UNITS. These respond to the reader's text size but
          not to the viewport, so on a width they are a fixed measure in a
          relative unit — `65ch` is the reading measure this rule was written to
          stop coming back. */}
      <Card maxWidth="65ch" />
      <Card maxWidth="40rem" />
      <Card width="20em" />

      {/* 11–12. A function is only as responsive as its terms: the `px` half of
          a `min()` is the ceiling that binds on every desktop. */}
      <Popover width="min(400px, calc(100vw - 24px))" />
      <Card maxWidth="clamp(20rem, 50%, 60rem)" />

      {/* 13. An unknown function is a value nobody has thought about. `var()`
          is here specifically: a custom property can hold a pixel count. */}
      <Card width="var(--shell-measure)" />

      {/* 14–16. THE ENTRENCHED HALF. Unreadable statically, so unchecked —
          which is exactly why pins end up here. */}
      <Card maxWidth={PROSE_WIDTH} />
      <Card width={SHELL.content} />
      <Card width={isWide ? measured() : 320} />

      {/* Member-expression element names are components too. */}
      <Ui.Panel padding={4} />
      <TextInput label="Search" value="" />
    </VStack>
  );
}
