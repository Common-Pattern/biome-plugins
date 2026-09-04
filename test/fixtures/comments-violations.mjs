// Prose in a JavaScript file is still prose. The `.js` exemption is scoped to
// type-carrying tags, not to the extension.
export const one = 1;

/**
 * A JSDoc block carrying no tag at all — documentation, not an annotation.
 */
export function two() {
  return one + 1;
}
