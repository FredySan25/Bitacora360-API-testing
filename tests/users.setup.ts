import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test as setup, type APIRequestContext } from "@playwright/test";
import { SESSION_FILE, getTestUsers, type Credentials } from "../support/env";
import type { SavedSession, SavedUser } from "../support/fixtures";
import { signIn } from "../support/supabase";

async function signInUser(request: APIRequestContext, credentials: Credentials): Promise<SavedUser> {
  const response = await signIn(request, credentials);
  expect(response, `Sign-in of ${credentials.email}: ${await response.text()}`).toBeOK();

  const body = await response.json();
  return { id: body.user.id, accessToken: body.access_token };
}

// One sign-in per user and per run: the signed-in specs reuse these tokens
setup("sign in the two test users", async ({ request }) => {
  const users = getTestUsers();

  const session: SavedSession = {
    userA: await signInUser(request, users.userA),
    userB: await signInUser(request, users.userB),
  };

  // The row level security specs only prove something with two different accounts
  expect(session.userA.id, "API_USER_A and API_USER_B must be different users").not.toBe(
    session.userB.id,
  );

  mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(session));
});
