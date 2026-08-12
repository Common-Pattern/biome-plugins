/**
 * The false-positive guard for `no-style-prop`.
 *
 * `style` is an extremely common identifier — a variable, an object key, a
 * function parameter, a type member. A rule that matched the *word* would fire
 * on all of it and be suppressed within a week. Only a JSX attribute named
 * `style` is a styling escape hatch; everything below is ordinary code.
 *
 * `className` is here deliberately: it is the seam a colocated CSS Module
 * needs, and the rule's own guidance recommends one, so it must stay silent.
 *
 * Expected: 0 diagnostics.
 */

declare const Text: any;
declare const Card: any;
declare const width: number;

/** A binding called `style`. Not a JSX attribute. */
const style = { minWidth: 1180 };

/** An object property called `style`. */
const config = { style, variant: "accent" as const };

/** A type whose member is called `style`. */
interface Options {
  style?: Record<string, string>;
  className?: string;
}

/** A parameter called `style`, and a property access on it. */
function applyStyle(style: Options["style"]) {
  return style?.color ?? "inherit";
}

/** A function whose NAME contains style. */
function styleFor(kind: string) {
  return kind === "row" ? style : config.style;
}

/** The string, in data rather than as an attribute. */
const KEYS = ["style", "className", "width"];

export function Clean({ options }: { options: Options }) {
  const computed = styleFor("row");
  return (
    <Card
      // The recommended alternative. Must not fire, or the rule bans its own
      // guidance.
      className="member-tabbar"
      // Real component props that happen to be layout-ish.
      width={width}
      maxWidth={640}
      padding={4}
      gap={2}
    >
      <Text color="secondary" size="sm">
        {applyStyle(options.style)}
        {KEYS.join(",")}
        {JSON.stringify(computed)}
      </Text>
    </Card>
  );
}
