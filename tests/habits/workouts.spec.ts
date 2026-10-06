import { expect, test } from "../../support/fixtures";
import { RETURN_ROWS, expectError } from "../../support/supabase";

// Any day works: every test reads only the workouts it created
const DAY = "2026-01-15";

test.describe("workouts", () => {
  test("creates a workout of the signed-in user", async ({ userA, workoutTitle }) => {
    const response = await userA.request.post("workouts", {
      headers: RETURN_ROWS,
      data: { performed_on: DAY, title: workoutTitle },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([
      { performed_on: DAY, title: workoutTitle, user_id: userA.id },
    ]);
  });

  test("rejects a workout without a day", async ({ userA, workoutTitle }) => {
    const response = await userA.request.post("workouts", { data: { title: workoutTitle } });

    await expectError(response, 400, "23502");
  });

  test("accepts a title of 60 characters", async ({ userA, workoutTitle }) => {
    const response = await userA.request.post("workouts", {
      data: { performed_on: DAY, title: workoutTitle.padEnd(60, "x") },
    });

    expect(response.status()).toBe(201);
  });

  test("rejects a title of 61 characters", async ({ userA, workoutTitle }) => {
    const response = await userA.request.post("workouts", {
      data: { performed_on: DAY, title: workoutTitle.padEnd(61, "x") },
    });

    await expectError(response, 400, "23514");
  });

  // A workout with no title sends null, as the app does (NewWorkoutForm in GymLog.tsx)
  for (const [label, title] of [
    ["an empty title", ""],
    ["a title of only spaces", "   "],
  ]) {
    test(`rejects ${label}`, async ({ userA }) => {
      const response = await userA.request.post("workouts", {
        data: { performed_on: DAY, title },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("the title is optional", async ({ userA, workout }) => {
    const response = await userA.request.patch("workouts", {
      params: { id: `eq.${workout.id}` },
      headers: RETURN_ROWS,
      data: { title: null },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([{ id: workout.id, title: null }]);
  });

  test("updates the day and the title", async ({ userA, workout }) => {
    const response = await userA.request.patch("workouts", {
      params: { id: `eq.${workout.id}` },
      headers: RETURN_ROWS,
      data: { performed_on: "2026-01-16", title: `${workout.title} renamed` },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([
      { id: workout.id, performed_on: "2026-01-16", title: `${workout.title} renamed` },
    ]);
  });

  test("lists a workout with its sets, as the app reads them", async ({
    userA,
    workout,
    exercise,
  }) => {
    await userA.request.post("workout_sets", {
      data: { workout_id: workout.id, exercise_id: exercise.id, reps: 8, weight_kg: 40 },
    });

    // Same embedded select as listWorkouts in features/habits/api.ts
    const response = await userA.request.get("workouts", {
      params: {
        id: `eq.${workout.id}`,
        select:
          "id, performed_on, title, workout_sets(id, workout_id, exercise_id, reps, weight_kg)",
      },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([
      {
        id: workout.id,
        workout_sets: [
          { workout_id: workout.id, exercise_id: exercise.id, reps: 8, weight_kg: 40 },
        ],
      },
    ]);
  });

  test("deletes a workout", async ({ userA, workout }) => {
    const response = await userA.request.delete("workouts", {
      params: { id: `eq.${workout.id}` },
    });
    expect(response.status()).toBe(204);

    const read = await userA.request.get("workouts", { params: { id: `eq.${workout.id}` } });
    expect(await read.json()).toEqual([]);
  });
});

test.describe("workouts row level security", () => {
  test("does not list the workouts of another user", async ({ userB, workout }) => {
    const response = await userB.request.get("workouts", { params: { id: `eq.${workout.id}` } });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("does not update the workouts of another user", async ({ userA, userB, workout }) => {
    const response = await userB.request.patch("workouts", {
      params: { id: `eq.${workout.id}` },
      headers: RETURN_ROWS,
      data: { title: `${workout.title} taken over` },
    });
    expect(await response.json()).toEqual([]);

    const read = await userA.request.get("workouts", { params: { id: `eq.${workout.id}` } });
    expect(await read.json()).toMatchObject([{ title: workout.title }]);
  });

  test("does not delete the workouts of another user", async ({ userA, userB, workout }) => {
    await userB.request.delete("workouts", { params: { id: `eq.${workout.id}` } });

    const read = await userA.request.get("workouts", { params: { id: `eq.${workout.id}` } });
    expect(await read.json()).toHaveLength(1);
  });

  test("does not create a workout for another user", async ({ userA, userB, workoutTitle }) => {
    const response = await userB.request.post("workouts", {
      data: { performed_on: DAY, title: workoutTitle, user_id: userA.id },
    });

    await expectError(response, 403, "42501");
  });

  test("does not hand a workout over to another user", async ({ userA, userB, workout }) => {
    const response = await userA.request.patch("workouts", {
      params: { id: `eq.${workout.id}` },
      data: { user_id: userB.id },
    });

    await expectError(response, 403, "42501");
  });
});
