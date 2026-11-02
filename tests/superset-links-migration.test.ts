// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(join(process.cwd(), "drizzle", "0047_superset_links.sql"), "utf8");

describe("0047 superset links migration", () => {
  it("drops the super/giant técnica and keeps the group links and other técnicas", async () => {
    const db = new PGlite();
    await db.exec(`
      create table workout_exercise (id int, technique text, group_id text);
      create table student_workout_version (id int, tree jsonb);
      insert into workout_exercise values (1, 'giant', 'g'), (2, 'superset', 'g'), (3, null, 'g'), (4, 'dropset', null);
    `);
    const tree = {
      sessions: [
        {
          name: "A",
          exercises: [
            { exerciseId: "x", technique: "giant", groupId: "g" },
            { exerciseId: "y", technique: "giant", groupId: "g" },
            { exerciseId: "z", technique: "dropset", groupId: "g" },
          ],
        },
        { name: "B", exercises: [{ exerciseId: "w", technique: "superset", groupId: null }] },
      ],
    };
    const untouched = { sessions: [{ name: "C", exercises: [{ exerciseId: "v", technique: "cluster" }] }] };
    await db.query("insert into student_workout_version values (1, $1), (2, $2)", [tree, untouched]);

    for (const statement of SQL.split("--> statement-breakpoint")) await db.exec(statement);

    const rows = await db.query<{ technique: string | null; group_id: string | null }>(
      "select technique, group_id from workout_exercise order by id",
    );
    expect(rows.rows).toEqual([
      { technique: null, group_id: "g" },
      { technique: null, group_id: "g" },
      { technique: null, group_id: "g" },
      { technique: "dropset", group_id: null },
    ]);
    const trees = await db.query<{ tree: typeof tree }>("select tree from student_workout_version order by id");
    expect(trees.rows[0].tree.sessions.map((s) => s.exercises.map((e) => [e.exerciseId, e.technique, e.groupId]))).toEqual([
      [
        ["x", null, "g"],
        ["y", null, "g"],
        ["z", "dropset", "g"],
      ],
      [["w", null, null]],
    ]);
    expect(trees.rows[0].tree.sessions.map((s) => s.name)).toEqual(["A", "B"]);
    expect(trees.rows[1].tree).toEqual(untouched);
  });
});
