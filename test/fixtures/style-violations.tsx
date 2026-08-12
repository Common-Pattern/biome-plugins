/**
 * Every spelling of the `style` prop `no-style-prop` has to catch.
 *
 * The identifier and member-expression forms are the point of the fixture. A
 * `style={{` text search finds only the first block below; in the codebase this
 * rule was written for, the hoisted forms were the majority AND the ones with
 * the most justification attached to them.
 *
 * Expected: 12 diagnostics.
 */

declare const Table: any;
declare const Text: any;
declare const cond: boolean;
declare const width: number;
declare const styles: { row: object; cell: object };
declare const theme: { get(k: string): object };

const COLUMN_WIDTH = { width: 120, maxWidth: "none" };

export function ObjectLiterals() {
  return (
    <Table>
      {/* 1 */}
      <Text style={{ minWidth: 1180 }} />
      {/* 2 — computed values, still a literal */}
      <Text style={{ width, maxWidth: "none" }} />
      {/* 3 — empty object is still the prop */}
      <Text style={{}} />
      {/* 4 — a CSS custom property is not an exemption */}
      <Text style={{ "--table-min-width": "1180px" }} />
    </Table>
  );
}

export function HoistedAndComputed() {
  return (
    <Table>
      {/* 5 — the form a `style={{` grep misses */}
      <Text style={COLUMN_WIDTH} />
      {/* 6 — member expression */}
      <Text style={styles.row} />
      {/* 7 — call expression */}
      <Text style={theme.get("row")} />
      {/* 8 — conditional */}
      <Text style={cond ? styles.row : styles.cell} />
      {/* 9 — spread INTO a literal is still a literal attribute */}
      <Text style={{ ...COLUMN_WIDTH, width: 200 }} />
      {/* 10 — logical */}
      <Text style={cond && styles.row} />
    </Table>
  );
}

export function HostElements() {
  return (
    <div>
      {/* 11 — a host element gets no exemption */}
      <input style={COLUMN_WIDTH} />
      {/* 12 — nor does an svg */}
      <svg style={{ width: 16 }} />
    </div>
  );
}
