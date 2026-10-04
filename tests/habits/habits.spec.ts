import { expect, test } from "../../support/fixtures";
import { RETURN_ROWS, expectError } from "../../support/supabase";

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

test.describe("habits", () => {
  test("creates a habit of the signed-in user, scheduled for every day", async ({
    userA,
    habitName,
  }) => {
    const response = await userA.request.post("habits", {
      headers: RETURN_ROWS,
      data: { name: habitName },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([
      { name: habitName, user_id: userA.id, weekdays: EVERY_DAY, archived_at: null },
    ]);
  });

  test("creates a habit scheduled for some days", async ({ userA, habitName }) => {
    const response = await userA.request.post("habits", {
      headers: RETURN_ROWS,
      data: { name: habitName, weekdays: [1, 3, 5] },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ weekdays: [1, 3, 5] }]);
  });

  test("accepts a name of 80 characters", async ({ userA, habitName }) => {
    const response = await userA.request.post("habits", {
      data: { name: habitName.padEnd(80, "x") },
    });

    expect(response.status()).toBe(201);
  });

  test("rejects a name of 81 characters", async ({ userA, habitName }) => {
    const response = await userA.request.post("habits", {
      data: { name: habitName.padEnd(81, "x") },
    });

    await expectError(response, 400, "23514");
  });

  for (const [label, name] of [
    ["an empty name", ""],
    ["a name of only spaces", "   "],
  ]) {
    test(`rejects ${label}`, async ({ userA }) => {
      const response = await userA.request.post("habits", { data: { name } });

      await expectError(response, 400, "23514");
    });
  }

  for (const [label, weekdays] of [
    ["no days", []],
    ["a day after Saturday", [0, 7]],
    ["more than seven days", [0, 1, 2, 3, 4, 5, 6, 0]],
  ] as const) {
    test(`rejects a schedule with ${label}`, async ({ userA, habitName }) => {
      const response = await userA.request.post("habits", {
        data: { name: habitName, weekdays },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("updates the name and the schedule", async ({ userA, habit }) => {
    const response = await userA.request.patch("habits", {
      params: { id: `eq.${habit.id}` },
      headers: RETURN_ROWS,
      data: { name: `${habit.name} renamed`, weekdays: [6] },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([
      { id: habit.id, name: `${habit.name} renamed`, weekdays: [6] },
    ]);
  });

  test("archives and restores a habit", async ({ userA, habit }) => {
    const archived = await userA.request.patch("habits", {
      params: { id: `eq.${habit.id}` },
      headers: RETURN_ROWS,
      data: { archived_at: new Date().toISOString() },
    });
    expect(await archived.json()).toMatchObject([{ archived_at: expect.any(String) }]);

    const restored = await userA.request.patch("habits", {
      params: { id: `eq.${habit.id}` },
      headers: RETURN_ROWS,
      data: { archived_at: null },
    });
    expect(await restored.json()).toMatchObject([{ archived_at: null }]);
  });

  test("deletes a habit", async ({ userA, habit }) => {
    const response = await userA.request.delete("habits", { params: { id: `eq.${habit.id}` } });
    expect(response.status()).toBe(204);

    const read = await userA.request.get("habits", { params: { id: `eq.${habit.id}` } });
    expect(await read.json()).toEqual([]);
  });
});

// Row level security hides the rows of other users instead of answering with
// an error: reads come back empty and writes change nothing
test.describe("habits row level security", () => {
  test("does not list the habits of another user", async ({ userB, habit }) => {
    const response = await userB.request.get("habits", { params: { id: `eq.${habit.id}` } });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("does not update the habits of another user", async ({ userA, userB, habit }) => {
    const response = await userB.request.patch("habits", {
      params: { id: `eq.${habit.id}` },
      headers: RETURN_ROWS,
      data: { name: `${habit.name} taken over` },
    });
    expect(await response.json()).toEqual([]);

    const read = await userA.request.get("habits", { params: { id: `eq.${habit.id}` } });
    expect(await read.json()).toMatchObject([{ name: habit.name }]);
  });

  test("does not delete the habits of another user", async ({ userA, userB, habit }) => {
    await userB.request.delete("habits", { params: { id: `eq.${habit.id}` } });

    const read = await userA.request.get("habits", { params: { id: `eq.${habit.id}` } });
    expect(await read.json()).toHaveLength(1);
  });

  test("does not create a habit for another user", async ({ userA, userB, habitName }) => {
    const response = await userB.request.post("habits", {
      data: { name: habitName, user_id: userA.id },
    });

    await expectError(response, 403, "42501");
  });

  test("does not hand a habit over to another user", async ({ userA, userB, habit }) => {
    const response = await userA.request.patch("habits", {
      params: { id: `eq.${habit.id}` },
      data: { user_id: userB.id },
    });

    await expectError(response, 403, "42501");
  });
});
