import { expect, request, type APIRequestContext, type APIResponse } from "@playwright/test";
import { getSupabase, type Credentials } from "./env";

/** Asks the Data API to answer a write with the rows it wrote, instead of an empty body. */
export const RETURN_ROWS = { Prefer: "return=representation" };

/** Password sign-in against Supabase Auth. Answers 200 with `access_token` and `user`. */
export function signIn(context: APIRequestContext, credentials: Credentials): Promise<APIResponse> {
  const { url, anonKey } = getSupabase();

  return context.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey },
    data: credentials,
  });
}

/**
 * Request context for the Data API (`/rest/v1/`), so the specs name just the
 * table: `get("habits")`. With an access token the requests run as that user;
 * without one they run as a visitor with no session.
 */
export function dataApiContext(accessToken?: string): Promise<APIRequestContext> {
  const { url, anonKey } = getSupabase();

  return request.newContext({
    baseURL: `${url}/rest/v1/`,
    extraHTTPHeaders: {
      apikey: anonKey,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
}

/**
 * Checks a rejected request: the HTTP status and the error code in the body.
 * For the Data API that code is the Postgres one ("23514" is a failed check
 * constraint, "42501" is missing privileges or a row level security policy).
 * Supabase Auth sends its own in `error_code`, next to a `code` that repeats
 * the status.
 */
export async function expectError(response: APIResponse, status: number, code: string) {
  // A request that went through by mistake may answer with an empty body
  const body = await response.json().catch(() => ({}));

  expect({ status: response.status(), code: body.error_code ?? body.code }).toEqual({
    status,
    code,
  });
}
