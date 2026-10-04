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

type TestFixtures = {
  /**
   * Unique name for the habits of one test. When the test ends, every habit of
   * either user whose name starts with it is deleted, so a test that creates
   * more than one habit names them `${habitName} ...`.
   */
  habitName: string;
  /** A habit of user A named `habitName`, created before the test. */
  habit: HabitRow;
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
    // No underscores: the cleanup filters with LIKE, where "_" matches any character
    const name = `API habit ${randomBytes(4).toString("hex")}`;
    await use(name);

    for (const user of [userA, userB]) {
      const response = await user.request.delete("habits", { params: { name: `like.${name}*` } });
      if (!response.ok()) {
        throw new Error(
          `Supabase answered ${response.status()} deleting the habits "${name}": ${await response.text()}`,
        );
      }
    }
  },

  habit: async ({ userA, habitName }, use) => {
    const response = await userA.request.post("habits", {
      headers: RETURN_ROWS,
      data: { name: habitName },
    });
    if (!response.ok()) {
      throw new Error(
        `Supabase answered ${response.status()} creating the habit "${habitName}": ${await response.text()}`,
      );
    }

    const [habit] = await response.json();
    await use(habit);
  },
});
