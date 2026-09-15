// Postgres' LIKE/ILIKE (which Prisma's `contains`/`startsWith`/`endsWith`
// compile to) treats "%", "_" and the escape character itself as pattern
// metacharacters. Without escaping them, a user searching for a literal "%"
// or "_" gets a wildcard match against every row instead of an exact
// substring match. Prefixing each with "\" (Postgres' default LIKE escape
// character) makes them literal again.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
