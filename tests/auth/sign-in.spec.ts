import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getTestUsers, hasTestUsers } from "../../support/env";
import { expectError, signIn } from "../../support/supabase";

test.describe("Password sign-in", () => {
  test("answers with an access token for the user", async ({ request }) => {
    test.skip(!hasTestUsers(), "Needs the API_USER_* credentials in .env");
    const { userA } = getTestUsers();

    const response = await signIn(request, userA);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      token_type: "bearer",
      user: { email: userA.email.toLowerCase() },
    });
    expect(body.access_token).toEqual(expect.any(String));
    expect(body.refresh_token).toEqual(expect.any(String));
  });

  test("rejects a wrong password", async ({ request }) => {
    test.skip(!hasTestUsers(), "Needs the API_USER_* credentials in .env");
    const { userA } = getTestUsers();

    const response = await signIn(request, {
      email: userA.email,
      password: `${userA.password}-wrong`,
    });

    await expectError(response, 400, "invalid_credentials");
  });

  test("rejects an email that is not registered", async ({ request }) => {
    const email = `b360-api-${randomBytes(4).toString("hex")}@example.com`;

    const response = await signIn(request, { email, password: "not-a-real-password" });

    // Same answer as a wrong password, so it does not reveal which emails exist
    await expectError(response, 400, "invalid_credentials");
  });
});
