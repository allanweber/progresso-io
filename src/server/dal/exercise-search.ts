import { sql, type SQL } from "drizzle-orm";

import { schema } from "@/db";

export function exerciseSearchConditions(term: string): SQL[] {
  return term
    .split(/\s+/)
    .map(
      (token) =>
        sql`${schema.exercise.searchText} like '%' || unaccent(lower(${token})) || '%'`,
    );
}

export function exerciseSearchRank(term: string): SQL {
  return sql`greatest(
    similarity(unaccent(lower(${schema.exercise.name})), unaccent(lower(${term}))),
    similarity(unaccent(lower(coalesce(${schema.exercise.nameEn}, ''))), unaccent(lower(${term})))
  )`;
}

export function exerciseSearchText(name: string, nameEn: string | null): SQL {
  return sql`unaccent(lower(concat_ws(' ', ${name}::text, ${nameEn}::text)))`;
}
