import { test } from "../../support/fixtures";
import { expectError } from "../../support/supabase";

// Every table the app stores data in. A new migration adds its tables here.
const TABLES = ["habits", "habit_completions", "exercises", "workouts", "workout_sets"];

// The tables are granted to signed-in users only, so the anon key alone opens nothing
test.describe("Data API without a session", () => {
  for (const table of TABLES) {
    test(`does not read ${table}`, async ({ visitor }) => {
      const response = await visitor.get(table);

      await expectError(response, 401, "42501");
    });
  }

  test("does not create a habit", async ({ visitor }) => {
    const response = await visitor.post("habits", { data: { name: "API habit of a visitor" } });

    await expectError(response, 401, "42501");
  });
});
