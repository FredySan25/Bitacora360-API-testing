import { expect, test } from "../../support/fixtures";
import { RETURN_ROWS, expectError } from "../../support/supabase";

test.describe("exercises", () => {
  test("creates an exercise of the signed-in user", async ({ userA, exerciseName }) => {
    const response = await userA.request.post("exercises", {
      headers: RETURN_ROWS,
      data: { name: exerciseName },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ name: exerciseName, user_id: userA.id }]);
  });

  test("accepts a name of 60 characters", async ({ userA, exerciseName }) => {
    const response = await userA.request.post("exercises", {
      data: { name: exerciseName.padEnd(60, "x") },
    });

    expect(response.status()).toBe(201);
  });

  test("rejects a name of 61 characters", async ({ userA, exerciseName }) => {
    const response = await userA.request.post("exercises", {
      data: { name: exerciseName.padEnd(61, "x") },
    });

    await expectError(response, 400, "23514");
  });

  for (const [label, name] of [
    ["an empty name", ""],
    ["a name of only spaces", "   "],
  ]) {
    test(`rejects ${label}`, async ({ userA }) => {
      const response = await userA.request.post("exercises", { data: { name } });

      await expectError(response, 400, "23514");
    });
  }

  test("rejects an exercise without a name", async ({ userA }) => {
    const response = await userA.request.post("exercises", { data: {} });

    await expectError(response, 400, "23502");
  });

  test("rejects a name the user already has", async ({ userA, exercise }) => {
    const response = await userA.request.post("exercises", { data: { name: exercise.name } });

    await expectError(response, 409, "23505");
  });

  test("rejects a name the user already has in another case", async ({ userA, exercise }) => {
    const response = await userA.request.post("exercises", {
      data: { name: exercise.name.toUpperCase() },
    });

    await expectError(response, 409, "23505");
  });

  test("lets two users have an exercise with the same name", async ({ userB, exercise }) => {
    const response = await userB.request.post("exercises", {
      headers: RETURN_ROWS,
      data: { name: exercise.name },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ name: exercise.name, user_id: userB.id }]);
  });

  test("renames an exercise", async ({ userA, exercise }) => {
    const response = await userA.request.patch("exercises", {
      params: { id: `eq.${exercise.id}` },
      headers: RETURN_ROWS,
      data: { name: `${exercise.name} renamed` },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([
      { id: exercise.id, name: `${exercise.name} renamed` },
    ]);
  });

  test("deletes an exercise that has no sets", async ({ userA, exercise }) => {
    const response = await userA.request.delete("exercises", {
      params: { id: `eq.${exercise.id}` },
    });
    expect(response.status()).toBe(204);

    const read = await userA.request.get("exercises", { params: { id: `eq.${exercise.id}` } });
    expect(await read.json()).toEqual([]);
  });
});

test.describe("exercises row level security", () => {
  test("does not list the exercises of another user", async ({ userB, exercise }) => {
    const response = await userB.request.get("exercises", {
      params: { id: `eq.${exercise.id}` },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("does not update the exercises of another user", async ({ userA, userB, exercise }) => {
    const response = await userB.request.patch("exercises", {
      params: { id: `eq.${exercise.id}` },
      headers: RETURN_ROWS,
      data: { name: `${exercise.name} taken over` },
    });
    expect(await response.json()).toEqual([]);

    const read = await userA.request.get("exercises", { params: { id: `eq.${exercise.id}` } });
    expect(await read.json()).toMatchObject([{ name: exercise.name }]);
  });

  test("does not delete the exercises of another user", async ({ userA, userB, exercise }) => {
    await userB.request.delete("exercises", { params: { id: `eq.${exercise.id}` } });

    const read = await userA.request.get("exercises", { params: { id: `eq.${exercise.id}` } });
    expect(await read.json()).toHaveLength(1);
  });

  test("does not create an exercise for another user", async ({ userA, userB, exerciseName }) => {
    const response = await userB.request.post("exercises", {
      data: { name: exerciseName, user_id: userA.id },
    });

    await expectError(response, 403, "42501");
  });

  test("does not hand an exercise over to another user", async ({ userA, userB, exercise }) => {
    const response = await userA.request.patch("exercises", {
      params: { id: `eq.${exercise.id}` },
      data: { user_id: userB.id },
    });

    await expectError(response, 403, "42501");
  });
});
