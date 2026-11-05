// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "drizzle", "0048_superset_links_items.sql"),
  "utf8",
);

type Tree = {
  sessions: {
    name: string;
    items: { exerciseId: string; technique: string | null; groupId: string | null }[];
  }[];
};

describe("0048 superset links migration for stored items", () => {
  it("drops the super/giant técnica from stored trees and keeps the links and other técnicas", async () => {
    const db = new PGlite();
    await db.exec(`create table student_workout_version (id int, tree jsonb);`);
    const stale: Tree = {
      sessions: [
        {
          name: "A",
          items: [
            { exerciseId: "x", technique: "giant", groupId: "g" },
            { exerciseId: "y", technique: "giant", groupId: "g" },
            { exerciseId: "z", technique: "dropset", groupId: "g" },
          ],
        },
        { name: "B", items: [{ exerciseId: "w", technique: "superset", groupId: "s" }] },
      ],
    };
    const untouched: Tree = {
      sessions: [{ name: "C", items: [{ exerciseId: "v", technique: "cluster", groupId: null }] }],
    };
    await db.query("insert into student_workout_version values (1, $1), (2, $2)", [
      stale,
      untouched,
    ]);

    for (const statement of SQL.split("--> statement-breakpoint")) await db.exec(statement);

    const { rows } = await db.query<{ tree: Tree }>(
      "select tree from student_workout_version order by id",
    );
    expect(
      rows[0].tree.sessions.map((s) => s.items.map((i) => [i.exerciseId, i.technique, i.groupId])),
    ).toEqual([
      [
        ["x", null, "g"],
        ["y", null, "g"],
        ["z", "dropset", "g"],
      ],
      [["w", null, "s"]],
    ]);
    expect(rows[0].tree.sessions.map((s) => s.name)).toEqual(["A", "B"]);
    expect(rows[1].tree).toEqual(untouched);
  });
});
