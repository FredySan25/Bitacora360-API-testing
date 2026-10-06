import path from "node:path";

/** Where the setup project saves the access tokens reused by the signed-in specs. */
export const SESSION_FILE = path.resolve(__dirname, "../.auth/users.json");

export type Credentials = { email: string; password: string };

/** URL and anon key of the Supabase project under test, read from `.env`. */
export function getSupabase(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing SUPABASE_URL and SUPABASE_ANON_KEY. Copy .env.example to .env and fill in the Supabase project.",
    );
  }

  return { url: url.replace(/\/+$/, ""), anonKey };
}

export function hasTestUsers(): boolean {
  return Boolean(
    process.env.API_USER_A_EMAIL &&
    process.env.API_USER_A_PASSWORD &&
    process.env.API_USER_B_EMAIL &&
    process.env.API_USER_B_PASSWORD,
  );
}

/** Credentials of the two dedicated test users, read from `.env`. */
export function getTestUsers(): { userA: Credentials; userB: Credentials } {
  if (!hasTestUsers()) {
    throw new Error(
      "Missing API_USER_A_* and API_USER_B_*. Copy .env.example to .env and fill in the credentials of the two test users.",
    );
  }

  return {
    userA: { email: process.env.API_USER_A_EMAIL!, password: process.env.API_USER_A_PASSWORD! },
    userB: { email: process.env.API_USER_B_EMAIL!, password: process.env.API_USER_B_PASSWORD! },
  };
}
