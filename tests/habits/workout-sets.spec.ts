import {
  expect,
  test,
  type ApiUser,
  type ExerciseRow,
  type WorkoutRow,
  type WorkoutSetRow,
} from "../../support/fixtures";
import { RETURN_ROWS, expectError } from "../../support/supabase";

const DAY = "2026-01-15";

function listSets(user: ApiUser, workout: WorkoutRow) {
  return user.request.get("workout_sets", { params: { workout_id: `eq.${workout.id}` } });
}

/** Logs a set of 10 reps at 50 kg and answers with the saved row. */
async function logSet(
  user: ApiUser,
  workout: WorkoutRow,
  exercise: ExerciseRow,
): Promise<WorkoutSetRow> {
  const response = await user.request.post("workout_sets", {
    headers: RETURN_ROWS,
    data: { workout_id: workout.id, exercise_id: exercise.id, reps: 10, weight_kg: 50 },
  });
  expect(response.status()).toBe(201);

  const [set] = await response.json();
  return set;
}

test.describe("workout_sets", () => {
  test("logs a set of the signed-in user", async ({ userA, workout, exercise }) => {
    const response = await userA.request.post("workout_sets", {
      headers: RETURN_ROWS,
      data: { workout_id: workout.id, exercise_id: exercise.id, reps: 10, weight_kg: 62.5 },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([
      {
        workout_id: workout.id,
        exercise_id: exercise.id,
        user_id: userA.id,
        reps: 10,
        weight_kg: 62.5,
      },
    ]);
  });

  test("a set without a weight is a bodyweight set", async ({ userA, workout, exercise }) => {
    const response = await userA.request.post("workout_sets", {
      headers: RETURN_ROWS,
      data: { workout_id: workout.id, exercise_id: exercise.id, reps: 12 },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ reps: 12, weight_kg: 0 }]);
  });

  for (const reps of [1, 1000]) {
    test(`accepts a set of ${reps} reps`, async ({ userA, workout, exercise }) => {
      const response = await userA.request.post("workout_sets", {
        data: { workout_id: workout.id, exercise_id: exercise.id, reps },
      });

      expect(response.status()).toBe(201);
    });
  }

  for (const reps of [0, 1001]) {
    test(`rejects a set of ${reps} reps`, async ({ userA, workout, exercise }) => {
      const response = await userA.request.post("workout_sets", {
        data: { workout_id: workout.id, exercise_id: exercise.id, reps },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("rejects a set without reps", async ({ userA, workout, exercise }) => {
    const response = await userA.request.post("workout_sets", {
      data: { workout_id: workout.id, exercise_id: exercise.id },
    });

    await expectError(response, 400, "23502");
  });

  test("rejects a negative weight", async ({ userA, workout, exercise }) => {
    const response = await userA.request.post("workout_sets", {
      data: { workout_id: workout.id, exercise_id: exercise.id, reps: 10, weight_kg: -0.25 },
    });

    await expectError(response, 400, "23514");
  });

  test("accepts the heaviest weight the column holds", async ({ userA, workout, exercise }) => {
    const response = await userA.request.post("workout_sets", {
      headers: RETURN_ROWS,
      data: { workout_id: workout.id, exercise_id: exercise.id, reps: 1, weight_kg: 9999.99 },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ weight_kg: 9999.99 }]);
  });

  test("rejects a weight the column cannot hold", async ({ userA, workout, exercise }) => {
    const response = await userA.request.post("workout_sets", {
      data: { workout_id: workout.id, exercise_id: exercise.id, reps: 1, weight_kg: 10000 },
    });

    // numeric(6, 2) overflows before any check constraint runs
    await expectError(response, 400, "22003");
  });

  test("updates the reps and the weight", async ({ userA, workout, exercise }) => {
    const set = await logSet(userA, workout, exercise);

    const response = await userA.request.patch("workout_sets", {
      params: { id: `eq.${set.id}` },
      headers: RETURN_ROWS,
      data: { reps: 8, weight_kg: 55 },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([{ id: set.id, reps: 8, weight_kg: 55 }]);
  });

  test("deletes a set", async ({ userA, workout, exercise }) => {
    const set = await logSet(userA, workout, exercise);

    const response = await userA.request.delete("workout_sets", { params: { id: `eq.${set.id}` } });

    expect(response.status()).toBe(204);
    expect(await (await listSets(userA, workout)).json()).toEqual([]);
  });

  test("deleting the workout deletes its sets", async ({ userA, workout, exercise }) => {
    const set = await logSet(userA, workout, exercise);

    await userA.request.delete("workouts", { params: { id: `eq.${workout.id}` } });

    const read = await userA.request.get("workout_sets", { params: { id: `eq.${set.id}` } });
    expect(await read.json()).toEqual([]);
  });

  test("does not delete an exercise that has sets", async ({ userA, workout, exercise }) => {
    await logSet(userA, workout, exercise);

    const response = await userA.request.delete("exercises", {
      params: { id: `eq.${exercise.id}` },
    });

    await expectError(response, 409, "23503");
    expect(await (await listSets(userA, workout)).json()).toHaveLength(1);
  });

  test("rejects a set of a workout that does not exist", async ({ userA, workout, exercise }) => {
    await userA.request.delete("workouts", { params: { id: `eq.${workout.id}` } });

    const response = await userA.request.post("workout_sets", {
      data: { workout_id: workout.id, exercise_id: exercise.id, reps: 10 },
    });

    // The policy only lets a user log sets in a workout it owns, and it runs before the foreign key
    await expectError(response, 403, "42501");
  });
});

test.describe("workout_sets row level security", () => {
  let set: WorkoutSetRow;

  test.beforeEach(async ({ userA, workout, exercise }) => {
    set = await logSet(userA, workout, exercise);
  });

  test("does not list the sets of another user", async ({ userB, workout }) => {
    const response = await listSets(userB, workout);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("does not update the sets of another user", async ({ userA, userB, workout }) => {
    const response = await userB.request.patch("workout_sets", {
      params: { id: `eq.${set.id}` },
      headers: RETURN_ROWS,
      data: { reps: 999 },
    });
    expect(await response.json()).toEqual([]);

    expect(await (await listSets(userA, workout)).json()).toMatchObject([{ reps: 10 }]);
  });

  test("does not delete the sets of another user", async ({ userA, userB, workout }) => {
    await userB.request.delete("workout_sets", { params: { id: `eq.${set.id}` } });

    expect(await (await listSets(userA, workout)).json()).toHaveLength(1);
  });

  test("does not log a set in a workout of another user", async ({
    userB,
    workout,
    exerciseName,
  }) => {
    const ownExercise = await userB.request.post("exercises", {
      headers: RETURN_ROWS,
      data: { name: `${exerciseName} of user B` },
    });
    const [{ id: exerciseId }] = await ownExercise.json();

    const response = await userB.request.post("workout_sets", {
      data: { workout_id: workout.id, exercise_id: exerciseId, reps: 10 },
    });

    await expectError(response, 403, "42501");
  });

  test("does not log a set of an exercise of another user", async ({
    userB,
    exercise,
    workoutTitle,
  }) => {
    const ownWorkout = await userB.request.post("workouts", {
      headers: RETURN_ROWS,
      data: { performed_on: DAY, title: `${workoutTitle} of user B` },
    });
    const [{ id: workoutId }] = await ownWorkout.json();

    const response = await userB.request.post("workout_sets", {
      data: { workout_id: workoutId, exercise_id: exercise.id, reps: 10 },
    });

    await expectError(response, 403, "42501");
  });

  test("does not log a set for another user", async ({ userA, userB, workout, exercise }) => {
    const response = await userA.request.post("workout_sets", {
      data: { workout_id: workout.id, exercise_id: exercise.id, reps: 10, user_id: userB.id },
    });

    await expectError(response, 403, "42501");
  });

  test("does not hand a set over to another user", async ({ userA, userB }) => {
    const response = await userA.request.patch("workout_sets", {
      params: { id: `eq.${set.id}` },
      data: { user_id: userB.id },
    });

    await expectError(response, 403, "42501");
  });
});
