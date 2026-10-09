import { randomUUID } from "node:crypto";
import { expect, test, type ApiUser, type SavingsGoalRow } from "../../support/fixtures";
import { RETURN_ROWS, expectError } from "../../support/supabase";

// Any day works: every test contributes to a goal of its own
const DAY = "2026-01-15";

function listContributions(user: ApiUser, goal: SavingsGoalRow) {
  return user.request.get("savings_contributions", { params: { goal_id: `eq.${goal.id}` } });
}

test.describe("savings_contributions", () => {
  test("adds a contribution of the signed-in user to a goal", async ({ userA, savingsGoal }) => {
    const contribution = { goal_id: savingsGoal.id, amount: 75.25, contributed_on: DAY };

    const response = await userA.request.post("savings_contributions", {
      headers: RETURN_ROWS,
      data: contribution,
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ ...contribution, user_id: userA.id }]);
  });

  test("accepts an amount of 0.01", async ({ userA, savingsGoal }) => {
    const response = await userA.request.post("savings_contributions", {
      headers: RETURN_ROWS,
      data: { goal_id: savingsGoal.id, amount: 0.01, contributed_on: DAY },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ amount: 0.01 }]);
  });

  for (const amount of [0, -50]) {
    test(`rejects an amount of ${amount}`, async ({ userA, savingsGoal }) => {
      const response = await userA.request.post("savings_contributions", {
        data: { goal_id: savingsGoal.id, amount, contributed_on: DAY },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("rejects a contribution without an amount", async ({ userA, savingsGoal }) => {
    const response = await userA.request.post("savings_contributions", {
      data: { goal_id: savingsGoal.id, contributed_on: DAY },
    });

    await expectError(response, 400, "23502");
  });

  test("rejects a contribution without a day", async ({ userA, savingsGoal }) => {
    const response = await userA.request.post("savings_contributions", {
      data: { goal_id: savingsGoal.id, amount: 50 },
    });

    await expectError(response, 400, "23502");
  });

  test("rejects a contribution without a goal", async ({ userA }) => {
    const response = await userA.request.post("savings_contributions", {
      data: { amount: 50, contributed_on: DAY },
    });

    // The policy looks for a goal the user owns, and it runs before the not-null constraint
    await expectError(response, 403, "42501");
  });

  test("rejects a contribution to a goal that does not exist", async ({ userA }) => {
    const response = await userA.request.post("savings_contributions", {
      data: { goal_id: randomUUID(), amount: 50, contributed_on: DAY },
    });

    // The policy only lets a user contribute to a goal it owns, and it runs before the foreign key
    await expectError(response, 403, "42501");
  });

  test("updates the amount and the day", async ({ userA, savingsContribution }) => {
    const response = await userA.request.patch("savings_contributions", {
      params: { id: `eq.${savingsContribution.id}` },
      headers: RETURN_ROWS,
      data: { amount: 80, contributed_on: "2026-01-16" },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([
      { id: savingsContribution.id, amount: 80, contributed_on: "2026-01-16" },
    ]);
  });

  test("deletes a contribution", async ({ userA, savingsGoal, savingsContribution }) => {
    const response = await userA.request.delete("savings_contributions", {
      params: { id: `eq.${savingsContribution.id}` },
    });

    expect(response.status()).toBe(204);
    expect(await (await listContributions(userA, savingsGoal)).json()).toEqual([]);
  });

  test("deleting the goal deletes its contributions", async ({
    userA,
    savingsGoal,
    savingsContribution,
  }) => {
    await userA.request.delete("savings_goals", { params: { id: `eq.${savingsGoal.id}` } });

    const read = await userA.request.get("savings_contributions", {
      params: { id: `eq.${savingsContribution.id}` },
    });
    expect(await read.json()).toEqual([]);
  });
});

test.describe("savings_contributions row level security", () => {
  test("does not list the contributions of another user", async ({
    userB,
    savingsContribution,
  }) => {
    const response = await userB.request.get("savings_contributions", {
      params: { id: `eq.${savingsContribution.id}` },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("does not update the contributions of another user", async ({
    userA,
    userB,
    savingsGoal,
    savingsContribution,
  }) => {
    const response = await userB.request.patch("savings_contributions", {
      params: { id: `eq.${savingsContribution.id}` },
      headers: RETURN_ROWS,
      data: { amount: 999 },
    });
    expect(await response.json()).toEqual([]);

    expect(await (await listContributions(userA, savingsGoal)).json()).toMatchObject([
      { id: savingsContribution.id, amount: savingsContribution.amount },
    ]);
  });

  test("does not delete the contributions of another user", async ({
    userA,
    userB,
    savingsGoal,
    savingsContribution,
  }) => {
    await userB.request.delete("savings_contributions", {
      params: { id: `eq.${savingsContribution.id}` },
    });

    expect(await (await listContributions(userA, savingsGoal)).json()).toHaveLength(1);
  });

  test("does not contribute to a goal of another user", async ({ userA, userB, savingsGoal }) => {
    const response = await userB.request.post("savings_contributions", {
      data: { goal_id: savingsGoal.id, amount: 50, contributed_on: DAY },
    });

    await expectError(response, 403, "42501");
    expect(await (await listContributions(userA, savingsGoal)).json()).toEqual([]);
  });

  test("does not move a contribution to a goal of another user", async ({
    userA,
    userB,
    goalName,
    savingsGoal,
    savingsContribution,
  }) => {
    const otherGoal = await userB.request.post("savings_goals", {
      headers: RETURN_ROWS,
      data: { name: `${goalName} of user B`, target_amount: 1000 },
    });
    const [{ id: otherGoalId }] = await otherGoal.json();

    const response = await userA.request.patch("savings_contributions", {
      params: { id: `eq.${savingsContribution.id}` },
      data: { goal_id: otherGoalId },
    });

    await expectError(response, 403, "42501");
    expect(await (await listContributions(userA, savingsGoal)).json()).toHaveLength(1);
  });

  test("does not add a contribution for another user", async ({ userA, userB, savingsGoal }) => {
    const response = await userA.request.post("savings_contributions", {
      data: { goal_id: savingsGoal.id, amount: 50, contributed_on: DAY, user_id: userB.id },
    });

    await expectError(response, 403, "42501");
  });

  test("does not hand a contribution over to another user", async ({
    userA,
    userB,
    savingsContribution,
  }) => {
    const response = await userA.request.patch("savings_contributions", {
      params: { id: `eq.${savingsContribution.id}` },
      data: { user_id: userB.id },
    });

    await expectError(response, 403, "42501");
  });
});
