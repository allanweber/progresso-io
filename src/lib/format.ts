/**
 * Pure PT-BR formatters, dependency-free on purpose.
 *
 * These live apart from `@/lib/billing` because that module imports **zod** for
 * its API schemas. Anything a client component pulls in comes with its whole
 * import graph, so importing a one-line formatter from `billing` would drag zod
 * into that component's bundle — and into every page that renders it when the
 * importer is something shared like the dashboard shell. Keep this module free
 * of imports so it stays cheap to pull into client code.
 *
 * `@/lib/billing` re-exports both, so existing callers are unaffected.
 */

/** BRL cents → "R$ 1.234,56". */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** ISO date (`YYYY-MM-DD`) → "DD/MM/YYYY". `null` → an em dash. */
export function formatDateBR(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * A count with a noun that agrees with it in PT-BR: `countPt(1, "conversa",
 * "conversas")` → "1 conversa", `countPt(0, …)` → "0 conversas".
 *
 * Written for the screen-reader text behind the dashboard's count badges. Those
 * strings were fixed plurals interpolated after a number, so at exactly one item
 * — the most common non-zero state on a queue screen — they read "1 conversas
 * aguardando resposta". Portuguese agrees on 1 and pluralises everything else,
 * including 0, which is why this is a two-form helper and not `Intl.PluralRules`
 * (whose pt-BR `one` category also covers 0 and would give "0 conversa").
 */
export function countPt(count: number, one: string, other: string): string {
  return `${count} ${count === 1 ? one : other}`;
}
