import { expect, test } from "../../support/fixtures";
import { RETURN_ROWS, expectError } from "../../support/supabase";

test.describe("savings_goals", () => {
  test("creates a goal of the signed-in user, with no deadline", async ({ userA, goalName }) => {
    const response = await userA.request.post("savings_goals", {
      headers: RETURN_ROWS,
      data: { name: goalName, target_amount: 1500.5 },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([
      { name: goalName, target_amount: 1500.5, target_date: null, user_id: userA.id },
    ]);
  });

  test("creates a goal with a deadline", async ({ userA, goalName }) => {
    const response = await userA.request.post("savings_goals", {
      headers: RETURN_ROWS,
      data: { name: goalName, target_amount: 1500, target_date: "2027-06-30" },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ target_date: "2027-06-30" }]);
  });

  test("accepts a name of 60 characters", async ({ userA, goalName }) => {
    const response = await userA.request.post("savings_goals", {
      data: { name: goalName.padEnd(60, "x"), target_amount: 1500 },
    });

    expect(response.status()).toBe(201);
  });

  test("rejects a name of 61 characters", async ({ userA, goalName }) => {
    const response = await userA.request.post("savings_goals", {
      data: { name: goalName.padEnd(61, "x"), target_amount: 1500 },
    });

    await expectError(response, 400, "23514");
  });

  for (const [label, name] of [
    ["an empty name", ""],
    ["a name of only spaces", "   "],
  ]) {
    test(`rejects ${label}`, async ({ userA }) => {
      const response = await userA.request.post("savings_goals", {
        data: { name, target_amount: 1500 },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("rejects a goal without a name", async ({ userA }) => {
    const response = await userA.request.post("savings_goals", { data: { target_amount: 1500 } });

    await expectError(response, 400, "23502");
  });

  test("rejects a goal without a target amount", async ({ userA, goalName }) => {
    const response = await userA.request.post("savings_goals", { data: { name: goalName } });

    await expectError(response, 400, "23502");
  });

  test("accepts a target amount of 0.01", async ({ userA, goalName }) => {
    const response = await userA.request.post("savings_goals", {
      headers: RETURN_ROWS,
      data: { name: goalName, target_amount: 0.01 },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ target_amount: 0.01 }]);
  });

  for (const target_amount of [0, -1500]) {
    test(`rejects a target amount of ${target_amount}`, async ({ userA, goalName }) => {
      const response = await userA.request.post("savings_goals", {
        data: { name: goalName, target_amount },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("updates the name, the target amount and the deadline", async ({ userA, savingsGoal }) => {
    const edited = {
      name: `${savingsGoal.name} renamed`,
      target_amount: 2500,
      target_date: "2027-12-31",
    };

    const response = await userA.request.patch("savings_goals", {
      params: { id: `eq.${savingsGoal.id}` },
      headers: RETURN_ROWS,
      data: edited,
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([{ id: savingsGoal.id, ...edited }]);
  });

  test("sets a deadline and removes it", async ({ userA, savingsGoal }) => {
    const dated = await userA.request.patch("savings_goals", {
      params: { id: `eq.${savingsGoal.id}` },
      headers: RETURN_ROWS,
      data: { target_date: "2027-06-30" },
    });
    expect(await dated.json()).toMatchObject([{ target_date: "2027-06-30" }]);

    const open = await userA.request.patch("savings_goals", {
      params: { id: `eq.${savingsGoal.id}` },
      headers: RETURN_ROWS,
      data: { target_date: null },
    });
    expect(await open.json()).toMatchObject([{ target_date: null }]);
  });

  test("lists a goal with its contributions, newest first, as the app reads them", async ({
    userA,
    savingsGoal,
  }) => {
    // One request each, so the two of January 20 get a created_at of their own
    for (const [contributed_on, amount] of [
      ["2026-01-10", 10],
      ["2026-01-20", 20],
      ["2026-01-20", 30],
    ] as const) {
      const response = await userA.request.post("savings_contributions", {
        data: { goal_id: savingsGoal.id, amount, contributed_on },
      });
      expect(response.status()).toBe(201);
    }

    // Same embedded select and orders as listSavingsGoals in features/finance/api.ts
    const response = await userA.request.get("savings_goals", {
      params: {
        id: `eq.${savingsGoal.id}`,
        select:
          "id, name, target_amount, target_date, savings_contributions(id, goal_id, amount, contributed_on)",
        order: "created_at.asc",
        "savings_contributions.order": "contributed_on.desc,created_at.desc",
      },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([
      {
        id: savingsGoal.id,
        name: savingsGoal.name,
        target_amount: 1000,
        target_date: null,
        savings_contributions: [
          { goal_id: savingsGoal.id, amount: 30, contributed_on: "2026-01-20" },
          { goal_id: savingsGoal.id, amount: 20, contributed_on: "2026-01-20" },
          { goal_id: savingsGoal.id, amount: 10, contributed_on: "2026-01-10" },
        ],
      },
    ]);
  });

  test("deletes a goal", async ({ userA, savingsGoal }) => {
    const response = await userA.request.delete("savings_goals", {
      params: { id: `eq.${savingsGoal.id}` },
    });
    expect(response.status()).toBe(204);

    const read = await userA.request.get("savings_goals", {
      params: { id: `eq.${savingsGoal.id}` },
    });
    expect(await read.json()).toEqual([]);
  });
});

test.describe("savings_goals row level security", () => {
  test("does not list the goals of another user", async ({ userB, savingsGoal }) => {
    const response = await userB.request.get("savings_goals", {
      params: { id: `eq.${savingsGoal.id}` },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("does not update the goals of another user", async ({ userA, userB, savingsGoal }) => {
    const response = await userB.request.patch("savings_goals", {
      params: { id: `eq.${savingsGoal.id}` },
      headers: RETURN_ROWS,
      data: { name: `${savingsGoal.name} taken over` },
    });
    expect(await response.json()).toEqual([]);

    const read = await userA.request.get("savings_goals", {
      params: { id: `eq.${savingsGoal.id}` },
    });
    expect(await read.json()).toMatchObject([{ name: savingsGoal.name }]);
  });

  test("does not delete the goals of another user", async ({ userA, userB, savingsGoal }) => {
    await userB.request.delete("savings_goals", { params: { id: `eq.${savingsGoal.id}` } });

    const read = await userA.request.get("savings_goals", {
      params: { id: `eq.${savingsGoal.id}` },
    });
    expect(await read.json()).toHaveLength(1);
  });

  test("does not create a goal for another user", async ({ userA, userB, goalName }) => {
    const response = await userB.request.post("savings_goals", {
      data: { name: goalName, target_amount: 1500, user_id: userA.id },
    });

    await expectError(response, 403, "42501");
  });

  test("does not hand a goal over to another user", async ({ userA, userB, savingsGoal }) => {
    const response = await userA.request.patch("savings_goals", {
      params: { id: `eq.${savingsGoal.id}` },
      data: { user_id: userB.id },
    });

    await expectError(response, 403, "42501");
  });
});
