/**
 * The false-positive guard for `no-pinned-width`.
 *
 * This half matters more than the violations half. A width rule that fires on
 * `<img width={800}>`, on a responsive grid's reflow floor, or on the `width`
 * key of an ordinary object would be suppressed the week it landed — and the
 * codebase would be left with a rule that protects nothing while looking like
 * it does.
 *
 * Expected: 0 diagnostics.
 */

declare const Card: any;
declare const Grid: any;
declare const VStack: any;
declare const Center: any;
declare const Table: any;
declare const proportional: (share: number, opts?: { minWidth?: number }) => unknown;

/** An object with a `width` key. Not a JSX attribute — see SCOPE in the rule. */
const columnWidth = { width: 520, minWidth: 120 };

/** A local binding called `width`, and a function whose name contains it. */
const width = 240;
function widthFor(kind: string) {
  return kind === "row" ? width : columnWidth.width;
}

/** A type member called `maxWidth`. */
interface Options {
  maxWidth?: number;
  width?: string;
}

export function Clean({ options }: { options: Options }) {
  return (
    <VStack width="100%">
      {/* Relative to the container. */}
      <Card width="100%" />
      <Card maxWidth="50%" />

      {/* Relative to the viewport, in every family: physical, logical, and the
          small/large/dynamic variants that exist for mobile browser chrome. */}
      <Card maxWidth="90vw" />
      <Center minHeight="100vh" width="100dvw" />
      <Card maxWidth="80svi" />
      <Card width="60lvmax" />

      {/* Relative to the query container. */}
      <Card width="100cqw" />
      <Card maxWidth="75cqi" />

      {/* Intrinsic — a behaviour rather than a size. `none` REMOVES a cap, so
          it is the opposite of a pin. */}
      <Card width="auto" />
      <Card maxWidth="none" />
      <Card width="fit-content" />
      <Card minWidth="min-content" />
      <Card width="max-content" />
      <Card width="stretch" />
      <Card width="fit-content(60%)" />

      {/* Functions whose every term is responsive. The bare `3` is an
          arithmetic term inside a call, not a length. */}
      <Card width="calc(100% / 3)" />
      <Card maxWidth="min(90vw, 100%)" />
      <Card width="clamp(20%, 50vw, 90vw)" />
      <Card width="calc(100vw - 5%)" />

      {/* Zero needs no unit and pins nothing. */}
      <Card minWidth={0} />

      {/* A boolean shorthand is not a size. */}
      <Card width />

      {/* HOST ELEMENTS ARE EXEMPT. On an image this attribute is what lets the
          browser reserve the right box before the file arrives, so banning it
          would trade a layout pin for layout shift. */}
      <img src="/logo.png" alt="" width={800} height={200} />
      <svg width={24} height={24} viewBox="0 0 24 24" />
      <canvas width={640} height={480} />

      {/* A GRID'S REFLOW FLOOR IS NOT A PIN. `minWidth: 250` says "wrap to
          fewer columns below 250px each" — it causes reflow where a `maxWidth`
          prevents it, and it is an object property rather than an attribute. */}
      <Grid columns={{ minWidth: 250, repeat: "fit" }} gap={3} />
      <Grid columns={{ minWidth: 320, max: 4 }} gap={2} />

      {/* Table column config, same reasoning. */}
      <Table columns={[proportional(0.8, { minWidth: 96 })]} />

      <Card>
        {widthFor("row")}
        {options.maxWidth}
        {String(width)}
      </Card>
    </VStack>
  );
}
