import { expect, monthAfter, test, type ApiUser, type BudgetRow } from "../../support/fixtures";
import { RETURN_ROWS, expectError } from "../../support/supabase";

// The expense keys of features/finance/constants.ts, which the migration repeats in a check
const EXPENSE_CATEGORIES = [
  "food",
  "transport",
  "housing",
  "utilities",
  "health",
  "education",
  "debt",
  "entertainment",
  "shopping",
  "subscriptions",
  "other",
];

/** The budgets of a user in the two months of a test, with the columns and order of listBudgets. */
function listBudgets(user: ApiUser, month: string) {
  return user.request.get("budgets", {
    params: {
      select: "id, category, effective_from, monthly_limit",
      effective_from: `in.(${month},${monthAfter(month)})`,
      order: "effective_from.asc",
    },
  });
}

test.describe("budgets", () => {
  test("creates a budget of the signed-in user", async ({ userA, budgetMonth }) => {
    const budget = { category: "transport", effective_from: budgetMonth, monthly_limit: 120.5 };

    const response = await userA.request.post("budgets", { headers: RETURN_ROWS, data: budget });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ ...budget, user_id: userA.id }]);
  });

  test("accepts every expense category", async ({ userA, budgetMonth }) => {
    const response = await userA.request.post("budgets", {
      headers: RETURN_ROWS,
      data: EXPENSE_CATEGORIES.map((category) => ({
        category,
        effective_from: budgetMonth,
        monthly_limit: 100,
      })),
    });

    expect(response.status()).toBe(201);
    const created: BudgetRow[] = await response.json();
    expect(created.map((budget) => budget.category)).toEqual(EXPENSE_CATEGORIES);
  });

  for (const [label, category] of [
    ["an income category", "salary"],
    ["a category that does not exist", "travel"],
    ["a category in another case", "Food"],
  ]) {
    test(`rejects ${label}`, async ({ userA, budgetMonth }) => {
      const response = await userA.request.post("budgets", {
        data: { category, effective_from: budgetMonth, monthly_limit: 100 },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("rejects a budget that does not start on the first day of a month", async ({
    userA,
    budgetMonth,
  }) => {
    const response = await userA.request.post("budgets", {
      data: {
        category: "food",
        effective_from: budgetMonth.replace(/01$/, "02"),
        monthly_limit: 100,
      },
    });

    await expectError(response, 400, "23514");
  });

  test("accepts a limit of 0.01", async ({ userA, budgetMonth }) => {
    const response = await userA.request.post("budgets", {
      headers: RETURN_ROWS,
      data: { category: "food", effective_from: budgetMonth, monthly_limit: 0.01 },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ monthly_limit: 0.01 }]);
  });

  for (const monthly_limit of [0, -100]) {
    test(`rejects a limit of ${monthly_limit}`, async ({ userA, budgetMonth }) => {
      const response = await userA.request.post("budgets", {
        data: { category: "food", effective_from: budgetMonth, monthly_limit },
      });

      await expectError(response, 400, "23514");
    });
  }

  for (const column of ["category", "effective_from", "monthly_limit"] as const) {
    test(`rejects a budget without ${column}`, async ({ userA, budgetMonth }) => {
      const response = await userA.request.post("budgets", {
        // An undefined value leaves the column out of the JSON body
        data: {
          category: "food",
          effective_from: budgetMonth,
          monthly_limit: 100,
          [column]: undefined,
        },
      });

      await expectError(response, 400, "23502");
    });
  }

  test("rejects a second budget of the same category in the same month", async ({
    userA,
    budget,
  }) => {
    const response = await userA.request.post("budgets", {
      data: {
        category: budget.category,
        effective_from: budget.effective_from,
        monthly_limit: 450,
      },
    });

    await expectError(response, 409, "23505");
  });

  test("accepts the same category in a later month, as a new version", async ({
    userA,
    budget,
  }) => {
    const later = monthAfter(budget.effective_from);

    const response = await userA.request.post("budgets", {
      data: { category: budget.category, effective_from: later, monthly_limit: 450 },
    });
    expect(response.status()).toBe(201);

    const read = await listBudgets(userA, budget.effective_from);
    expect(await read.json()).toMatchObject([
      { id: budget.id, effective_from: budget.effective_from, monthly_limit: 300 },
      { category: budget.category, effective_from: later, monthly_limit: 450 },
    ]);
  });

  test("lets two users budget the same category in the same month", async ({ userB, budget }) => {
    const response = await userB.request.post("budgets", {
      headers: RETURN_ROWS,
      data: {
        category: budget.category,
        effective_from: budget.effective_from,
        monthly_limit: 450,
      },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([
      { category: budget.category, effective_from: budget.effective_from, user_id: userB.id },
    ]);
  });

  // Same request as updateBudgetLimit in features/finance/api.ts
  test("updates the limit, as the app does", async ({ userA, budget }) => {
    const response = await userA.request.patch("budgets", {
      params: { id: `eq.${budget.id}`, select: "id, category, effective_from, monthly_limit" },
      headers: RETURN_ROWS,
      data: { monthly_limit: 450 },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: budget.id,
        category: budget.category,
        effective_from: budget.effective_from,
        monthly_limit: 450,
      },
    ]);
  });

  // deleteBudgets in features/finance/api.ts filters by the category alone, so this request
  // takes every "subscriptions" budget of user A: no other test reads one back
  test("deletes every version of a category, as the app does", async ({
    userA,
    budget,
    budgetMonth,
  }) => {
    for (const effective_from of [budgetMonth, monthAfter(budgetMonth)]) {
      const created = await userA.request.post("budgets", {
        data: { category: "subscriptions", effective_from, monthly_limit: 40 },
      });
      expect(created.status()).toBe(201);
    }

    const response = await userA.request.delete("budgets", {
      params: { category: "eq.subscriptions" },
    });
    expect(response.status()).toBe(204);

    const read = await listBudgets(userA, budgetMonth);
    expect(await read.json()).toMatchObject([{ id: budget.id, category: "food" }]);
  });
});

test.describe("budgets row level security", () => {
  test("does not list the budgets of another user", async ({ userB, budget }) => {
    const response = await userB.request.get("budgets", { params: { id: `eq.${budget.id}` } });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("does not update the budgets of another user", async ({ userA, userB, budget }) => {
    const response = await userB.request.patch("budgets", {
      params: { id: `eq.${budget.id}` },
      headers: RETURN_ROWS,
      data: { monthly_limit: 999 },
    });
    expect(await response.json()).toEqual([]);

    const read = await userA.request.get("budgets", { params: { id: `eq.${budget.id}` } });
    expect(await read.json()).toMatchObject([{ monthly_limit: budget.monthly_limit }]);
  });

  test("does not delete the budgets of another user", async ({ userA, userB, budget }) => {
    await userB.request.delete("budgets", { params: { id: `eq.${budget.id}` } });

    const read = await userA.request.get("budgets", { params: { id: `eq.${budget.id}` } });
    expect(await read.json()).toHaveLength(1);
  });

  test("does not create a budget for another user", async ({ userA, userB, budgetMonth }) => {
    const response = await userB.request.post("budgets", {
      data: {
        category: "food",
        effective_from: budgetMonth,
        monthly_limit: 100,
        user_id: userA.id,
      },
    });

    await expectError(response, 403, "42501");
  });

  test("does not hand a budget over to another user", async ({ userA, userB, budget }) => {
    const response = await userA.request.patch("budgets", {
      params: { id: `eq.${budget.id}` },
      data: { user_id: userB.id },
    });

    await expectError(response, 403, "42501");
  });
});
