import { randomBytes, randomInt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test as base, type APIRequestContext } from "@playwright/test";
import { SESSION_FILE } from "./env";
import { RETURN_ROWS, dataApiContext } from "./supabase";

export { expect } from "@playwright/test";

/** What the setup project saves for each test user. */
export type SavedUser = { id: string; accessToken: string };
export type SavedSession = { userA: SavedUser; userB: SavedUser };

/** A signed-in test user: its id in Supabase Auth and a Data API context that sends its token. */
export type ApiUser = { id: string; request: APIRequestContext };

export type HabitRow = {
  id: string;
  user_id: string;
  name: string;
  weekdays: number[];
  archived_at: string | null;
  created_at: string;
};

export type ExerciseRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type WorkoutRow = {
  id: string;
  user_id: string;
  performed_on: string;
  title: string | null;
  created_at: string;
};

export type WorkoutSetRow = {
  id: string;
  user_id: string;
  workout_id: string;
  exercise_id: string;
  reps: number;
  weight_kg: number;
  created_at: string;
};

export type TransactionRow = {
  id: string;
  user_id: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  occurred_on: string;
  note: string | null;
  created_at: string;
};

export type BudgetRow = {
  id: string;
  user_id: string;
  category: string;
  effective_from: string;
  monthly_limit: number;
  created_at: string;
};

export type SavingsGoalRow = {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  created_at: string;
};

export type SavingsContributionRow = {
  id: string;
  user_id: string;
  goal_id: string;
  amount: number;
  contributed_on: string;
  created_at: string;
};

export type WatchlistItemRow = {
  id: string;
  user_id: string;
  title: string;
  media_type: "movie" | "series" | "book";
  status: "pending" | "in_progress" | "done";
  rating: number | null;
  finished_on: string | null;
  note: string | null;
  created_at: string;
};

type TestFixtures = {
  /**
   * Unique name for the habits of one test. When the test ends, every habit of
   * either user whose name starts with it is deleted, so a test that creates
   * more than one habit names them `${habitName} ...`.
   */
  habitName: string;
  /** A habit of user A named `habitName`, created before the test. */
  habit: HabitRow;
  /**
   * Unique name for the exercises of one test. When the test ends, every
   * exercise of either user whose name starts with it is deleted, along with
   * the sets logged for it.
   */
  exerciseName: string;
  /** An exercise of user A named `exerciseName`, created before the test. */
  exercise: ExerciseRow;
  /**
   * Unique title for the workouts of one test. When the test ends, every
   * workout of either user whose title starts with it is deleted.
   */
  workoutTitle: string;
  /**
   * A workout of user A titled `workoutTitle`, created before the test. It is
   * deleted by id, so a test is free to change or clear its title.
   */
  workout: WorkoutRow;
  /**
   * Unique note for the transactions of one test. When the test ends, every
   * transaction of either user whose note starts with it is deleted.
   */
  transactionNote: string;
  /**
   * An expense of user A with the required columns alone, so it has no note,
   * created before the test. It is deleted by id.
   */
  transaction: TransactionRow;
  /**
   * First day of a month that belongs to one test, along with the month after
   * it (`monthAfter`). When the test ends, every budget of either user that
   * starts in those two months is deleted.
   */
  budgetMonth: string;
  /** A budget of user A for "food" that starts on `budgetMonth`, created before the test. */
  budget: BudgetRow;
  /**
   * Unique name for the savings goals of one test. When the test ends, every
   * goal of either user whose name starts with it is deleted, along with its
   * contributions.
   */
  goalName: string;
  /** A savings goal of user A named `goalName`, created before the test. */
  savingsGoal: SavingsGoalRow;
  /** A contribution of user A to `savingsGoal`, created before the test. It is deleted by id. */
  savingsContribution: SavingsContributionRow;
  /**
   * Unique title for the watchlist items of one test. When the test ends, every
   * item of either user whose title starts with it is deleted.
   */
  watchlistTitle: string;
  /**
   * A pending movie of user A titled `watchlistTitle`, created with the required
   * columns alone before the test.
   */
  watchlistItem: WatchlistItemRow;
};

type WorkerFixtures = {
  userA: ApiUser;
  userB: ApiUser;
  /** Data API context with the anon key only, as a visitor that never signed in. */
  visitor: APIRequestContext;
};

function readSavedUser(name: keyof SavedSession): SavedUser {
  if (!existsSync(SESSION_FILE)) {
    throw new Error(
      `Missing ${SESSION_FILE}. It is written by the "setup" project, so run the spec without --no-deps.`,
    );
  }

  const session: SavedSession = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
  return session[name];
}

async function useSavedUser(name: keyof SavedSession, use: (user: ApiUser) => Promise<void>) {
  const { id, accessToken } = readSavedUser(name);
  const context = await dataApiContext(accessToken);
  await use({ id, request: context });
  await context.dispose();
}

// No underscores: the cleanup filters with LIKE, where "_" matches any character
function uniqueName(kind: string): string {
  return `API ${kind} ${randomBytes(4).toString("hex")}`;
}

/** The first day of the month that follows the one `firstDay` starts. */
export function monthAfter(firstDay: string): string {
  const date = new Date(`${firstDay}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * A budget is unique per user, category and month, and the tests share two
 * users, so each test budgets a random month of its own, far in the future.
 * Only odd months are drawn: the month after each one stays free for the test
 * that needs a second version of a budget.
 */
function uniqueMonth(): string {
  const year = 2100 + randomInt(7800);
  const month = 1 + 2 * randomInt(6);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Inserts a row a fixture needs, and fails the test with Supabase's answer if it is rejected. */
async function insertRow<Row>(user: ApiUser, table: string, data: object): Promise<Row> {
  const response = await user.request.post(table, { headers: RETURN_ROWS, data });
  if (!response.ok()) {
    throw new Error(
      `Supabase answered ${response.status()} creating a row in ${table}: ${await response.text()}`,
    );
  }

  const [row] = await response.json();
  return row;
}

/** Deletes the rows a test left behind, and fails the test if Supabase rejects the cleanup. */
async function deleteRows(user: ApiUser, table: string, params: Record<string, string>) {
  const response = await user.request.delete(table, { params });
  if (!response.ok()) {
    throw new Error(
      `Supabase answered ${response.status()} cleaning up ${table}: ${await response.text()}`,
    );
  }
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  userA: [async ({}, use) => useSavedUser("userA", use), { scope: "worker" }],
  userB: [async ({}, use) => useSavedUser("userB", use), { scope: "worker" }],

  visitor: [
    async ({}, use) => {
      const context = await dataApiContext();
      await use(context);
      await context.dispose();
    },
    { scope: "worker" },
  ],

  habitName: async ({ userA, userB }, use) => {
    const name = uniqueName("habit");
    await use(name);

    for (const user of [userA, userB]) {
      await deleteRows(user, "habits", { name: `like.${name}*` });
    }
  },

  habit: async ({ userA, habitName }, use) => {
    await use(await insertRow<HabitRow>(userA, "habits", { name: habitName }));
  },

  exerciseName: async ({ userA, userB }, use) => {
    const name = uniqueName("exercise");
    await use(name);

    for (const user of [userA, userB]) {
      const response = await user.request.get("exercises", {
        params: { name: `like.${name}*`, select: "id" },
      });
      const ids = ((await response.json()) as { id: string }[]).map((exercise) => exercise.id);
      if (ids.length === 0) continue;

      // An exercise cannot be deleted while a set refers to it, so its sets go first
      const idList = `in.(${ids.join(",")})`;
      await deleteRows(user, "workout_sets", { exercise_id: idList });
      await deleteRows(user, "exercises", { id: idList });
    }
  },

  exercise: async ({ userA, exerciseName }, use) => {
    await use(await insertRow<ExerciseRow>(userA, "exercises", { name: exerciseName }));
  },

  workoutTitle: async ({ userA, userB }, use) => {
    const title = uniqueName("workout");
    await use(title);

    for (const user of [userA, userB]) {
      await deleteRows(user, "workouts", { title: `like.${title}*` });
    }
  },

  workout: async ({ userA, workoutTitle }, use) => {
    const workout = await insertRow<WorkoutRow>(userA, "workouts", {
      performed_on: "2026-01-15",
      title: workoutTitle,
    });
    await use(workout);

    await deleteRows(userA, "workouts", { id: `eq.${workout.id}` });
  },

  transactionNote: async ({ userA, userB }, use) => {
    const note = uniqueName("transaction");
    await use(note);

    for (const user of [userA, userB]) {
      await deleteRows(user, "transactions", { note: `like.${note}*` });
    }
  },

  transaction: async ({ userA, userB }, use) => {
    const transaction = await insertRow<TransactionRow>(userA, "transactions", {
      type: "expense",
      category: "food",
      amount: 25.5,
      occurred_on: "2026-01-15",
    });
    await use(transaction);

    // Both users: with no note to find it by, the id is all that reaches a row a test handed over
    for (const user of [userA, userB]) {
      await deleteRows(user, "transactions", { id: `eq.${transaction.id}` });
    }
  },

  budgetMonth: async ({ userA, userB }, use) => {
    const month = uniqueMonth();
    await use(month);

    const end = monthAfter(monthAfter(month));
    for (const user of [userA, userB]) {
      await deleteRows(user, "budgets", {
        and: `(effective_from.gte.${month},effective_from.lt.${end})`,
      });
    }
  },

  budget: async ({ userA, budgetMonth }, use) => {
    await use(
      await insertRow<BudgetRow>(userA, "budgets", {
        category: "food",
        effective_from: budgetMonth,
        monthly_limit: 300,
      }),
    );
  },

  goalName: async ({ userA, userB }, use) => {
    const name = uniqueName("goal");
    await use(name);

    for (const user of [userA, userB]) {
      await deleteRows(user, "savings_goals", { name: `like.${name}*` });
    }
  },

  savingsGoal: async ({ userA, goalName }, use) => {
    await use(
      await insertRow<SavingsGoalRow>(userA, "savings_goals", {
        name: goalName,
        target_amount: 1000,
      }),
    );
  },

  savingsContribution: async ({ userA, savingsGoal }, use) => {
    const contribution = await insertRow<SavingsContributionRow>(userA, "savings_contributions", {
      goal_id: savingsGoal.id,
      amount: 50,
      contributed_on: "2026-01-15",
    });
    await use(contribution);

    await deleteRows(userA, "savings_contributions", { id: `eq.${contribution.id}` });
  },

  watchlistTitle: async ({ userA, userB }, use) => {
    const title = uniqueName("watchlist");
    await use(title);

    for (const user of [userA, userB]) {
      await deleteRows(user, "watchlist_items", { title: `like.${title}*` });
    }
  },

  watchlistItem: async ({ userA, watchlistTitle }, use) => {
    await use(
      await insertRow<WatchlistItemRow>(userA, "watchlist_items", {
        title: watchlistTitle,
        media_type: "movie",
      }),
    );
  },
});
