import { randomBytes } from "node:crypto";
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
});
