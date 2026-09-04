// Every comment in this file is a violation, and they are all here to be
// counted rather than run.
const one = 1;

/* A block comment on its own line. */
const two = 2;

/**
 * A JSDoc block on an exported function.
 *
 * @param n a number
 */
export function three(n: number) {
  return n; // a trailing comment, after code on the same line
}

/** A JSDoc block on an exported interface. */
export interface Four {
  /** A doc comment on a single field. */
  id: string;
}

export const five = /* an inline block, mid-expression */ 5;

/** @type {number} A type tag in a TypeScript file is decoration over a real annotation. */
export const six: number = 6;

export function Seven() {
  return (
    <section>
      {/* A JSX comment. The whole expression container is the unit to remove;
          leaving `{}` behind would be a syntax change. */}
      <span>{one + two}</span>
    </section>
  );
}
