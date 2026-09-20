/**
 * placeholder-syntax.ts — translates better-sqlite3-style `?` positional
 * placeholders (the convention every shared query string uses) into sqlx's
 * `$1`/`$2`/... positional syntax, which is what tauri-plugin-sql's sqlite
 * driver actually expects (confirmed against its README: "sqlite and
 * postgres use the '$#' syntax when substituting query data" — unlike
 * better-sqlite3, which uses bare `?`).
 *
 * Skips `?` characters inside single- or double-quoted SQL string/identifier
 * literals so a literal `?` in quoted text (rare in this codebase's queries,
 * but possible) isn't mistaken for a placeholder.
 */
export function toDollarPlaceholders(sql: string): string {
  let out = '';
  let quote: '\'' | '"' | null = null;
  let n = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\'' || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '?') {
      n += 1;
      out += `$${n}`;
      continue;
    }
    out += ch;
  }
  return out;
}
