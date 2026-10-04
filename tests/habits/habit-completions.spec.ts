import { expect, test, type ApiUser, type HabitRow } from "../../support/fixtures";
import { RETURN_ROWS, expectError } from "../../support/supabase";

// Any day works: every test completes a habit of its own
const DAY = "2026-01-15";

function listCompletions(user: ApiUser, habit: HabitRow) {
  return user.request.get("habit_completions", { params: { habit_id: `eq.${habit.id}` } });
}

test.describe("habit_completions", () => {
  test("marks a habit as done on a day", async ({ userA, habit }) => {
    const response = await userA.request.post("habit_completions", {
      headers: RETURN_ROWS,
      data: { habit_id: habit.id, completed_on: DAY },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([
      { habit_id: habit.id, user_id: userA.id, completed_on: DAY },
    ]);
  });

  test("rejects a second completion of the same habit on the same day", async ({
    userA,
    habit,
  }) => {
    const completion = { habit_id: habit.id, completed_on: DAY };
    await userA.request.post("habit_completions", { data: completion });

    const response = await userA.request.post("habit_completions", { data: completion });

    await expectError(response, 409, "23505");
  });

  // The app marks a day with an upsert that ignores duplicates (setCompletion in features/habits/api.ts)
  test("marking the same day twice as the app does keeps one completion", async ({
    userA,
    habit,
  }) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await userA.request.post("habit_completions", {
        params: { on_conflict: "habit_id,completed_on" },
        headers: { Prefer: "resolution=ignore-duplicates" },
        data: { habit_id: habit.id, completed_on: DAY },
      });
      expect(response).toBeOK();
    }

    expect(await (await listCompletions(userA, habit)).json()).toHaveLength(1);
  });

  test("marks several days in one request", async ({ userA, habit }) => {
    const response = await userA.request.post("habit_completions", {
      headers: RETURN_ROWS,
      data: [
        { habit_id: habit.id, completed_on: "2026-01-15" },
        { habit_id: habit.id, completed_on: "2026-01-16" },
      ],
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toHaveLength(2);
  });

  test("unmarks a day", async ({ userA, habit }) => {
    await userA.request.post("habit_completions", {
      data: { habit_id: habit.id, completed_on: DAY },
    });

    const response = await userA.request.delete("habit_completions", {
      params: { habit_id: `eq.${habit.id}`, completed_on: `eq.${DAY}` },
    });

    expect(response.status()).toBe(204);
    expect(await (await listCompletions(userA, habit)).json()).toEqual([]);
  });

  test("rejects a completion of a habit that does not exist", async ({ userA, habit }) => {
    await userA.request.delete("habits", { params: { id: `eq.${habit.id}` } });

    const response = await userA.request.post("habit_completions", {
      data: { habit_id: habit.id, completed_on: DAY },
    });

    // The policy only lets a user complete a habit it owns, and it runs before the foreign key
    await expectError(response, 403, "42501");
  });

  test("deleting the habit deletes its completions", async ({ userA, habit }) => {
    await userA.request.post("habit_completions", {
      data: { habit_id: habit.id, completed_on: DAY },
    });

    await userA.request.delete("habits", { params: { id: `eq.${habit.id}` } });

    expect(await (await listCompletions(userA, habit)).json()).toEqual([]);
  });
});

test.describe("habit_completions row level security", () => {
  test.beforeEach(async ({ userA, habit }) => {
    const response = await userA.request.post("habit_completions", {
      data: { habit_id: habit.id, completed_on: DAY },
    });
    expect(response.status()).toBe(201);
  });

  test("does not list the completions of another user", async ({ userB, habit }) => {
    const response = await listCompletions(userB, habit);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("does not delete the completions of another user", async ({ userA, userB, habit }) => {
    await userB.request.delete("habit_completions", { params: { habit_id: `eq.${habit.id}` } });

    expect(await (await listCompletions(userA, habit)).json()).toHaveLength(1);
  });

  test("does not complete a habit of another user", async ({ userB, habit }) => {
    const response = await userB.request.post("habit_completions", {
      data: { habit_id: habit.id, completed_on: "2026-01-16" },
    });

    await expectError(response, 403, "42501");
  });
});
