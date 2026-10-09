import { expect, test, type TransactionRow } from "../../support/fixtures";
import { RETURN_ROWS, expectError } from "../../support/supabase";

// Any day works: every test reads only the transactions it created
const DAY = "2026-01-15";

const EXPENSE = { type: "expense", category: "food", amount: 12.5, occurred_on: DAY };

// The keys of features/finance/constants.ts, which the migration repeats in a check
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
const INCOME_CATEGORIES = ["salary", "freelance", "gift", "other"];

test.describe("transactions", () => {
  test("creates an expense of the signed-in user", async ({ userA, transactionNote }) => {
    const response = await userA.request.post("transactions", {
      headers: RETURN_ROWS,
      data: { ...EXPENSE, note: transactionNote },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([
      { ...EXPENSE, note: transactionNote, user_id: userA.id },
    ]);
  });

  test("creates an income of the signed-in user", async ({ userA, transactionNote }) => {
    const income = { type: "income", category: "salary", amount: 1500, occurred_on: DAY };

    const response = await userA.request.post("transactions", {
      headers: RETURN_ROWS,
      data: { ...income, note: transactionNote },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([
      { ...income, note: transactionNote, user_id: userA.id },
    ]);
  });

  // The transaction fixture is inserted with nothing but these four columns
  test("a transaction needs only its type, category, amount and day", async ({
    userA,
    transaction,
  }) => {
    expect(transaction).toMatchObject({
      type: "expense",
      category: "food",
      amount: 25.5,
      occurred_on: DAY,
      note: null,
      user_id: userA.id,
    });
  });

  for (const [type, categories] of [
    ["expense", EXPENSE_CATEGORIES],
    ["income", INCOME_CATEGORIES],
  ] as const) {
    test(`accepts every ${type} category`, async ({ userA, transactionNote }) => {
      const response = await userA.request.post("transactions", {
        headers: RETURN_ROWS,
        data: categories.map((category) => ({
          type,
          category,
          amount: 10,
          occurred_on: DAY,
          note: transactionNote,
        })),
      });

      expect(response.status()).toBe(201);
      const created: TransactionRow[] = await response.json();
      expect(created.map((transaction) => transaction.category)).toEqual(categories);
    });
  }

  for (const [label, type, category] of [
    ["an expense with an income category", "expense", "salary"],
    ["an income with an expense category", "income", "food"],
    ["a category that does not exist", "expense", "travel"],
    ["a category in another case", "expense", "Food"],
    ["a type other than income or expense", "transfer", "other"],
  ]) {
    test(`rejects ${label}`, async ({ userA, transactionNote }) => {
      const response = await userA.request.post("transactions", {
        data: { type, category, amount: 10, occurred_on: DAY, note: transactionNote },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("does not turn an expense into an income while it keeps an expense category", async ({
    userA,
    transaction,
  }) => {
    const response = await userA.request.patch("transactions", {
      params: { id: `eq.${transaction.id}` },
      data: { type: "income" },
    });
    await expectError(response, 400, "23514");

    const read = await userA.request.get("transactions", {
      params: { id: `eq.${transaction.id}` },
    });
    expect(await read.json()).toMatchObject([{ type: "expense", category: "food" }]);
  });

  test("accepts an amount of 0.01", async ({ userA, transactionNote }) => {
    const response = await userA.request.post("transactions", {
      headers: RETURN_ROWS,
      data: { ...EXPENSE, amount: 0.01, note: transactionNote },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ amount: 0.01 }]);
  });

  for (const amount of [0, -5]) {
    test(`rejects an amount of ${amount}`, async ({ userA, transactionNote }) => {
      const response = await userA.request.post("transactions", {
        data: { ...EXPENSE, amount, note: transactionNote },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("accepts the largest amount the column holds", async ({ userA, transactionNote }) => {
    const response = await userA.request.post("transactions", {
      headers: RETURN_ROWS,
      data: { ...EXPENSE, amount: 9999999999.99, note: transactionNote },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ amount: 9999999999.99 }]);
  });

  test("rejects an amount the column cannot hold", async ({ userA, transactionNote }) => {
    const response = await userA.request.post("transactions", {
      data: { ...EXPENSE, amount: 10000000000, note: transactionNote },
    });

    // numeric(12, 2) overflows before any check constraint runs
    await expectError(response, 400, "22003");
  });

  test("accepts a note of 200 characters", async ({ userA, transactionNote }) => {
    const response = await userA.request.post("transactions", {
      data: { ...EXPENSE, note: transactionNote.padEnd(200, "x") },
    });

    expect(response.status()).toBe(201);
  });

  test("rejects a note of 201 characters", async ({ userA, transactionNote }) => {
    const response = await userA.request.post("transactions", {
      data: { ...EXPENSE, note: transactionNote.padEnd(201, "x") },
    });

    await expectError(response, 400, "23514");
  });

  // A transaction with no note sends null, as the app does (toTransactionRow in features/finance/api.ts)
  for (const [label, note] of [
    ["an empty note", ""],
    ["a note of only spaces", "   "],
  ]) {
    test(`rejects ${label}`, async ({ userA }) => {
      const response = await userA.request.post("transactions", { data: { ...EXPENSE, note } });

      await expectError(response, 400, "23514");
    });
  }

  test("adds a note and clears it", async ({ userA, transaction, transactionNote }) => {
    const noted = await userA.request.patch("transactions", {
      params: { id: `eq.${transaction.id}` },
      headers: RETURN_ROWS,
      data: { note: transactionNote },
    });
    expect(await noted.json()).toMatchObject([{ note: transactionNote }]);

    const cleared = await userA.request.patch("transactions", {
      params: { id: `eq.${transaction.id}` },
      headers: RETURN_ROWS,
      data: { note: null },
    });
    expect(await cleared.json()).toMatchObject([{ note: null }]);
  });

  for (const column of ["type", "category", "amount", "occurred_on"] as const) {
    test(`rejects a transaction without ${column}`, async ({ userA, transactionNote }) => {
      const response = await userA.request.post("transactions", {
        // An undefined value leaves the column out of the JSON body
        data: { ...EXPENSE, note: transactionNote, [column]: undefined },
      });

      await expectError(response, 400, "23502");
    });
  }

  // updateTransaction in features/finance/api.ts sends the five columns on every edit
  test("updates every column, as the app does", async ({ userA, transaction, transactionNote }) => {
    const edited = {
      type: "income",
      category: "freelance",
      amount: 480.75,
      occurred_on: "2026-01-16",
      note: transactionNote,
    };

    const response = await userA.request.patch("transactions", {
      params: { id: `eq.${transaction.id}` },
      headers: RETURN_ROWS,
      data: edited,
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([{ id: transaction.id, ...edited }]);
  });

  test("lists the transactions of a date range, newest first, as the app reads them", async ({
    userA,
    transactionNote,
  }) => {
    // One request each, so the two of March 15 get a created_at of their own
    for (const [occurred_on, label] of [
      ["2026-02-28", "day before"],
      ["2026-03-01", "first day"],
      ["2026-03-15", "registered first"],
      ["2026-03-15", "registered last"],
      ["2026-03-31", "last day"],
      ["2026-04-01", "day after"],
    ]) {
      const response = await userA.request.post("transactions", {
        data: { ...EXPENSE, occurred_on, note: `${transactionNote} ${label}` },
      });
      expect(response.status()).toBe(201);
    }

    // Same request as listTransactions in features/finance/api.ts, plus the note to leave out
    // the transactions of other tests. Two filters on one column need URLSearchParams.
    const params = new URLSearchParams({
      select: "id, type, category, amount, occurred_on, note, created_at",
      order: "occurred_on.desc,created_at.desc,id.asc",
      offset: "0",
      limit: "1000",
      note: `like.${transactionNote}*`,
    });
    params.append("occurred_on", "gte.2026-03-01");
    params.append("occurred_on", "lte.2026-03-31");
    const response = await userA.request.get("transactions", { params });

    expect(response.status()).toBe(200);
    const listed: TransactionRow[] = await response.json();
    expect(listed.map((transaction) => transaction.note)).toEqual([
      `${transactionNote} last day`,
      `${transactionNote} registered last`,
      `${transactionNote} registered first`,
      `${transactionNote} first day`,
    ]);
  });

  test("deletes a transaction", async ({ userA, transaction }) => {
    const response = await userA.request.delete("transactions", {
      params: { id: `eq.${transaction.id}` },
    });
    expect(response.status()).toBe(204);

    const read = await userA.request.get("transactions", {
      params: { id: `eq.${transaction.id}` },
    });
    expect(await read.json()).toEqual([]);
  });
});

test.describe("transactions row level security", () => {
  test("does not list the transactions of another user", async ({ userB, transaction }) => {
    const response = await userB.request.get("transactions", {
      params: { id: `eq.${transaction.id}` },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("does not update the transactions of another user", async ({
    userA,
    userB,
    transaction,
  }) => {
    const response = await userB.request.patch("transactions", {
      params: { id: `eq.${transaction.id}` },
      headers: RETURN_ROWS,
      data: { amount: 999 },
    });
    expect(await response.json()).toEqual([]);

    const read = await userA.request.get("transactions", {
      params: { id: `eq.${transaction.id}` },
    });
    expect(await read.json()).toMatchObject([{ amount: transaction.amount }]);
  });

  test("does not delete the transactions of another user", async ({
    userA,
    userB,
    transaction,
  }) => {
    await userB.request.delete("transactions", { params: { id: `eq.${transaction.id}` } });

    const read = await userA.request.get("transactions", {
      params: { id: `eq.${transaction.id}` },
    });
    expect(await read.json()).toHaveLength(1);
  });

  test("does not create a transaction for another user", async ({
    userA,
    userB,
    transactionNote,
  }) => {
    const response = await userB.request.post("transactions", {
      data: { ...EXPENSE, note: transactionNote, user_id: userA.id },
    });

    await expectError(response, 403, "42501");
  });

  test("does not hand a transaction over to another user", async ({
    userA,
    userB,
    transaction,
  }) => {
    const response = await userA.request.patch("transactions", {
      params: { id: `eq.${transaction.id}` },
      data: { user_id: userB.id },
    });

    await expectError(response, 403, "42501");
  });
});
