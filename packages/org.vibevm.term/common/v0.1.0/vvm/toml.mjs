/**
 * term-common vvm — a tiny TOML reader/writer for the version-manager's
 * fixed schemas (`state.toml`, `.vvm-manifest.toml`).
 *
 * NOT a general TOML implementation. It serialises and parses only the
 * shapes this port produces: top-level scalar keys, an integer counter,
 * and an array of tables whose fields are strings / integers / an optional
 * string. Adding a general TOML dependency for two fixed schemas would
 * pull a transitive graph into a product that today has zero runtime deps
 * (the arg/keymap/packaging helpers); this keeps that property.
 *
 * Round-trips the host's `state.toml` shape (PROP-019 §2.4) byte-for-byte
 * in layout — the products-repo twin.
 */

/**
 * @typedef {string | number | boolean | null} Scalar
 * @typedef {Record<string, Scalar>} Row
 */

/**
 * Escape a string for a TOML basic (double-quoted) string literal.
 *
 * @param {string} s
 * @returns {string}
 */
function quoteString(s) {
  // TOML basic strings: escape backslash, quote, and the C0 control chars
  // that would otherwise break a line. Forward-slash and non-ASCII pass
  // through verbatim (paths stay readable on Windows).
  let out = '"';
  for (const ch of s) {
    const c = /** @type {number} */ (ch.codePointAt(0));
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\r') out += '\\r';
    else if (c < 0x20) {
      out += '\\u' + c.toString(16).padStart(4, '0');
    } else {
      out += ch;
    }
  }
  return out + '"';
}

/**
 * Serialise a single scalar value.
 *
 * @param {Scalar} v
 * @returns {string}
 */
function serialiseScalar(v) {
  if (typeof v === 'string') return quoteString(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === null || v === undefined) return '""'; // absent string → empty
  throw new Error(`toml: unsupported scalar type ${typeof v}`);
}

/**
 * Serialise a `{ key = scalar }` table followed by an array-of-tables.
 *
 * @param {object} schema
 * @param {Array<[string, Scalar]>} schema.scalars  top-level scalar key/value pairs (order preserved)
 * @param {{ name: string, rows: Row[] }[]} [schema.tables]  arrays-of-tables, in output order
 * @returns {string}
 */
export function tomlSerialise({ scalars, tables = [] }) {
  let out = '';
  for (const [k, v] of scalars) {
    out += `${k} = ${serialiseScalar(v)}\n`;
  }
  for (const t of tables) {
    for (const row of t.rows) {
      out += `\n[[${t.name}]]\n`;
      for (const [k, v] of Object.entries(row)) {
        if (v === null || v === undefined) continue; // skip_serializing_if = "Option::is_none"
        out += `${k} = ${serialiseScalar(/** @type {Scalar} */ (v))}\n`;
      }
    }
  }
  return out;
}

/**
 * Parse a TOML document of the shape [`tomlSerialise`] produces, plus the
 * common extensions the host's hand-written files carry (blank lines,
 * `#` comments, single-line arrays used as future-proofing).
 *
 * Returns a plain object: top-level scalar keys map to their typed values
 * (string / number / boolean); each `[[table]]` array becomes a `Row[]`
 * under the same name. Unknown constructs throw — this is a schema-bound
 * parser, not a general one.
 *
 * @param {string} text
 * @returns {{ scalars: Record<string, Scalar>, tables: Record<string, Row[]> }}
 */
export function tomlParse(text) {
  /** @type {Record<string, Scalar>} */
  const scalars = {};
  /** @type {Record<string, Row[]>} */
  const tables = {};
  /** @type {Row | null} */
  let cur = null;
  /** @type {string | null} */
  let curName = null;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    // [[table.name]] — start an array-of-tables row.
    const arr = /^\[\[(.+)\]\]\s*$/.exec(line);
    if (arr) {
      curName = arr[1].trim();
      cur = {};
      (tables[curName] ??= []).push(cur);
      continue;
    }
    // [table.name] — a single (non-array) table header. We model it the
    // same way (a one-row array) so callers see a uniform shape; this
    // branch is reachable only if a future schema adds a `[meta]` block.
    const single = /^\[(.+)\]\s*$/.exec(line);
    if (single) {
      curName = single[1].trim();
      cur = {};
      (tables[curName] ??= []).push(cur);
      continue;
    }

    // key = value
    const m = /^([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (!m) {
      throw new Error(`toml: cannot parse line ${i + 1}: \`${raw}\``);
    }
    const key = m[1];
    const val = parseScalar(m[2], i + 1);
    if (cur) {
      cur[key] = val;
    } else {
      scalars[key] = val;
    }
  }
  return { scalars, tables };
}

/**
 * Parse one scalar value from its TOML literal form.
 *
 * @param {string} lit
 * @param {number} lineNo  for error messages
 * @returns {Scalar}
 */
function parseScalar(lit, lineNo) {
  // Basic double-quoted string with the escapes [`quoteString`] emits.
  if (lit.startsWith('"')) {
    if (!lit.endsWith('"') || lit.length < 2) {
      throw new Error(`toml: unterminated string on line ${lineNo}`);
    }
    return parseQuoted(lit.slice(1, -1), lineNo);
  }
  // Single-quoted (literal) string — no escapes; rare, supported for free.
  if (lit.startsWith("'")) {
    if (!lit.endsWith("'") || lit.length < 2) {
      throw new Error(`toml: unterminated literal string on line ${lineNo}`);
    }
    return lit.slice(1, -1);
  }
  // Boolean.
  if (lit === 'true') return true;
  if (lit === 'false') return false;
  // Integer (the only numeric type the vvm schemas use).
  if (/^[+-]?\d+$/.test(lit)) {
    const n = Number(lit);
    if (!Number.isSafeInteger(n)) {
      throw new Error(`toml: integer overflow on line ${lineNo}: \`${lit}\``);
    }
    return n;
  }
  throw new Error(`toml: unsupported scalar on line ${lineNo}: \`${lit}\``);
}

/**
 * @param {string} body
 * @param {number} lineNo
 * @returns {string}
 */
function parseQuoted(body, lineNo) {
  let out = '';
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '\\') {
      const next = body[i + 1];
      switch (next) {
        case '\\': out += '\\'; break;
        case '"': out += '"'; break;
        case 'b': out += '\b'; break;
        case 't': out += '\t'; break;
        case 'n': out += '\n'; break;
        case 'f': out += '\f'; break;
        case 'r': out += '\r'; break;
        case 'u': {
          const hex = body.slice(i + 2, i + 6);
          out += String.fromCodePoint(parseInt(hex, 16));
          i += 6;
          continue;
        }
        default:
          throw new Error(`toml: bad escape \\${next} on line ${lineNo}`);
      }
      i += 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}
