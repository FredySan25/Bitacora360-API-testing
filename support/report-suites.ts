/**
 * Names of the sections of the Allure report, so that someone who does not
 * know the code can read it. Each spec gets the area of the app it belongs to
 * (first level) and the feature it covers (second level); the describe blocks
 * stay as the third level. The keys are the paths of the files under tests/.
 */
export const REPORT_SUITES: Partial<Record<string, { area: string; feature: string }>> = {
  "users.setup.ts": { area: "Setup", feature: "Test users sign-in" },

  "auth/sign-in.spec.ts": { area: "Account", feature: "Password sign-in" },
  "auth/visitor-access.spec.ts": { area: "Account", feature: "Data access without a session" },

  "habits/habits.spec.ts": { area: "Habits", feature: "Habits" },
  "habits/habit-completions.spec.ts": { area: "Habits", feature: "Habit check-offs" },
  "habits/exercises.spec.ts": { area: "Habits", feature: "Gym exercises" },
  "habits/workouts.spec.ts": { area: "Habits", feature: "Gym workouts" },
  "habits/workout-sets.spec.ts": { area: "Habits", feature: "Gym workout sets" },

  "finance/transactions.spec.ts": { area: "Finance", feature: "Transactions" },
  "finance/budgets.spec.ts": { area: "Finance", feature: "Budgets" },
  "finance/savings-goals.spec.ts": { area: "Finance", feature: "Savings goals" },
  "finance/savings-contributions.spec.ts": {
    area: "Finance",
    feature: "Savings goal contributions",
  },

  "watchlist/watchlist-items.spec.ts": { area: "Watchlist", feature: "Watchlist items" },
};
