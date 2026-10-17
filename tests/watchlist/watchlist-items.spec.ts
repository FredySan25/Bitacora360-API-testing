import { expect, test, type WatchlistItemRow } from "../../support/fixtures";
import { RETURN_ROWS, expectError } from "../../support/supabase";

// Any day works: every test reads only the items it created
const DAY = "2026-01-15";

const MEDIA_TYPES = ["movie", "series", "book"] as const;

// Same columns as ITEM_COLUMNS in features/watchlist/api.ts
const ITEM_COLUMNS =
  "id, title, media_type, status, rating, finished_on, note, created_at, poster_url, release_year, catalog_source, catalog_id";

const TMDB_POSTER = "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg";

/** A movie linked to TMDB, with every catalog column. */
const TMDB_MOVIE = {
  media_type: "movie",
  poster_url: TMDB_POSTER,
  release_year: 1999,
  catalog_source: "tmdb",
  catalog_id: "603",
};

const CATALOG_ITEMS = [
  TMDB_MOVIE,
  {
    media_type: "series",
    poster_url: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
    release_year: 2008,
    catalog_source: "tmdb",
    catalog_id: "1396",
  },
  {
    media_type: "book",
    poster_url: "https://books.google.com/books/content?id=zyTCAlFPjgYC&printsec=frontcover&img=1",
    release_year: 1965,
    catalog_source: "google_books",
    catalog_id: "zyTCAlFPjgYC",
  },
  {
    media_type: "book",
    poster_url: "https://covers.openlibrary.org/b/id/8231856-L.jpg",
    release_year: 1937,
    catalog_source: "open_library",
    catalog_id: "OL27482W",
  },
] as const;

test.describe("watchlist_items", () => {
  for (const media_type of MEDIA_TYPES) {
    test(`creates a pending ${media_type} of the signed-in user with the required columns alone`, async ({
      userA,
      watchlistTitle,
    }) => {
      const response = await userA.request.post("watchlist_items", {
        headers: RETURN_ROWS,
        data: { title: watchlistTitle, media_type },
      });

      expect(response.status()).toBe(201);
      expect(await response.json()).toMatchObject([
        {
          title: watchlistTitle,
          media_type,
          status: "pending",
          rating: null,
          finished_on: null,
          note: null,
          poster_url: null,
          release_year: null,
          catalog_source: null,
          catalog_id: null,
          user_id: userA.id,
        },
      ]);
    });
  }

  for (const item of CATALOG_ITEMS) {
    test(`creates a ${item.media_type} linked to ${item.catalog_source} with every catalog column, and reads it`, async ({
      userA,
      watchlistTitle,
    }) => {
      const response = await userA.request.post("watchlist_items", {
        headers: RETURN_ROWS,
        data: { title: watchlistTitle, ...item },
      });
      expect(response.status()).toBe(201);
      const [created]: WatchlistItemRow[] = await response.json();

      const read = await userA.request.get("watchlist_items", {
        params: { id: `eq.${created.id}`, select: ITEM_COLUMNS },
      });
      expect(read.status()).toBe(200);
      expect(await read.json()).toEqual([
        {
          id: created.id,
          title: watchlistTitle,
          status: "pending",
          rating: null,
          finished_on: null,
          note: null,
          created_at: created.created_at,
          ...item,
        },
      ]);
    });
  }

  test("creates a finished item with its finish day, rating and note, and reads it", async ({
    userA,
    watchlistTitle,
  }) => {
    const finished = {
      title: watchlistTitle,
      media_type: "book",
      status: "done",
      finished_on: DAY,
      rating: 4,
      note: "A slow start, a great ending.",
    };

    const response = await userA.request.post("watchlist_items", {
      headers: RETURN_ROWS,
      data: finished,
    });
    expect(response.status()).toBe(201);
    const [created]: WatchlistItemRow[] = await response.json();

    const read = await userA.request.get("watchlist_items", {
      params: { id: `eq.${created.id}`, select: ITEM_COLUMNS },
    });
    expect(read.status()).toBe(200);
    expect(await read.json()).toMatchObject([{ id: created.id, ...finished }]);
  });

  // No unique index on purpose: a remake shares the title of the original
  test("accepts the same title twice for one user", async ({ userA, watchlistItem }) => {
    const response = await userA.request.post("watchlist_items", {
      data: { title: watchlistItem.title, media_type: watchlistItem.media_type },
    });
    expect(response.status()).toBe(201);

    const read = await userA.request.get("watchlist_items", {
      params: { title: `eq.${watchlistItem.title}` },
    });
    expect(await read.json()).toHaveLength(2);
  });

  test("lists the items newest first, as the app reads them", async ({ userA, watchlistTitle }) => {
    // One request each, so every item gets a created_at of its own
    for (const label of ["added first", "added second", "added last"]) {
      const response = await userA.request.post("watchlist_items", {
        data: { title: `${watchlistTitle} ${label}`, media_type: "series" },
      });
      expect(response.status()).toBe(201);
    }

    // Same request as listWatchlistItems in features/watchlist/api.ts, plus the
    // title to leave out the items of other tests
    const response = await userA.request.get("watchlist_items", {
      params: {
        select: ITEM_COLUMNS,
        order: "created_at.desc,id.asc",
        offset: "0",
        limit: "1000",
        title: `like.${watchlistTitle}*`,
      },
    });

    expect(response.status()).toBe(200);
    const listed: WatchlistItemRow[] = await response.json();
    expect(listed.map((item) => item.title)).toEqual([
      `${watchlistTitle} added last`,
      `${watchlistTitle} added second`,
      `${watchlistTitle} added first`,
    ]);
  });

  test("accepts a title of 120 characters", async ({ userA, watchlistTitle }) => {
    const response = await userA.request.post("watchlist_items", {
      data: { title: watchlistTitle.padEnd(120, "x"), media_type: "movie" },
    });

    expect(response.status()).toBe(201);
  });

  test("rejects a title of 121 characters", async ({ userA, watchlistTitle }) => {
    const response = await userA.request.post("watchlist_items", {
      data: { title: watchlistTitle.padEnd(121, "x"), media_type: "movie" },
    });

    await expectError(response, 400, "23514");
  });

  for (const [label, title] of [
    ["an empty title", ""],
    ["a title of only spaces", "   "],
  ]) {
    test(`rejects ${label}`, async ({ userA }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title, media_type: "movie" },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("rejects an item without a title", async ({ userA }) => {
    const response = await userA.request.post("watchlist_items", {
      data: { media_type: "movie" },
    });

    await expectError(response, 400, "23502");
  });

  test("rejects an item without a media type", async ({ userA, watchlistTitle }) => {
    const response = await userA.request.post("watchlist_items", {
      data: { title: watchlistTitle },
    });

    await expectError(response, 400, "23502");
  });

  // An explicit null skips the default, so the not null constraint answers
  test("rejects a null status", async ({ userA, watchlistTitle }) => {
    const response = await userA.request.post("watchlist_items", {
      data: { title: watchlistTitle, media_type: "movie", status: null },
    });

    await expectError(response, 400, "23502");
  });

  for (const [label, media_type] of [
    ["a media type that does not exist", "podcast"],
    ["a media type in another case", "Movie"],
  ]) {
    test(`rejects ${label}`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title: watchlistTitle, media_type },
      });

      await expectError(response, 400, "23514");
    });
  }

  for (const [label, status] of [
    ["a status that does not exist", "dropped"],
    ["a status in another case", "Pending"],
  ]) {
    test(`rejects ${label}`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title: watchlistTitle, media_type: "movie", status },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("accepts a note of 280 characters", async ({ userA, watchlistTitle }) => {
    const note = "x".repeat(280);

    const response = await userA.request.post("watchlist_items", {
      headers: RETURN_ROWS,
      data: { title: watchlistTitle, media_type: "movie", note },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ note }]);
  });

  test("rejects a note of 281 characters", async ({ userA, watchlistTitle }) => {
    const response = await userA.request.post("watchlist_items", {
      data: { title: watchlistTitle, media_type: "movie", note: "x".repeat(281) },
    });

    await expectError(response, 400, "23514");
  });

  // An item with no note sends null, as the app does (WatchlistItemForm trims it to null)
  for (const [label, note] of [
    ["an empty note", ""],
    ["a note of only spaces", "   "],
  ]) {
    test(`rejects ${label}`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title: watchlistTitle, media_type: "movie", note },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("accepts a null note", async ({ userA, watchlistTitle }) => {
    const response = await userA.request.post("watchlist_items", {
      headers: RETURN_ROWS,
      data: { title: watchlistTitle, media_type: "movie", note: null },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ note: null }]);
  });

  for (const rating of [1, 5]) {
    test(`accepts a rating of ${rating} on a finished item`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        headers: RETURN_ROWS,
        data: {
          title: watchlistTitle,
          media_type: "movie",
          status: "done",
          finished_on: DAY,
          rating,
        },
      });

      expect(response.status()).toBe(201);
      expect(await response.json()).toMatchObject([{ rating }]);
    });
  }

  for (const rating of [0, 6]) {
    test(`rejects a rating of ${rating} on a finished item`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        data: {
          title: watchlistTitle,
          media_type: "movie",
          status: "done",
          finished_on: DAY,
          rating,
        },
      });

      await expectError(response, 400, "23514");
    });
  }

  for (const [label, status] of [
    ["a pending item", "pending"],
    ["an item in progress", "in_progress"],
  ]) {
    test(`rejects a rating on ${label}`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title: watchlistTitle, media_type: "movie", status, rating: 3 },
      });

      await expectError(response, 400, "23514");
    });

    test(`rejects a finish day on ${label}`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title: watchlistTitle, media_type: "movie", status, finished_on: DAY },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("rejects a finished item without a finish day", async ({ userA, watchlistTitle }) => {
    const response = await userA.request.post("watchlist_items", {
      data: { title: watchlistTitle, media_type: "movie", status: "done" },
    });

    await expectError(response, 400, "23514");
  });

  test("does not rate an item that is not finished", async ({ userA, watchlistItem }) => {
    const response = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
      data: { rating: 3 },
    });
    await expectError(response, 400, "23514");

    const read = await userA.request.get("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
    });
    expect(await read.json()).toMatchObject([{ status: "pending", rating: null }]);
  });

  // The app moves an item with statusChange in features/watchlist/items.ts:
  // status, finish day and rating go together in one PATCH
  test("moves an item from pending to in progress to done, as the app does", async ({
    userA,
    watchlistItem,
  }) => {
    const started = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
      headers: RETURN_ROWS,
      data: { status: "in_progress", finished_on: null, rating: null },
    });
    expect(started.status()).toBe(200);
    expect(await started.json()).toMatchObject([
      { status: "in_progress", finished_on: null, rating: null },
    ]);

    const finished = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
      headers: RETURN_ROWS,
      data: { status: "done", finished_on: DAY, rating: null },
    });
    expect(finished.status()).toBe(200);
    expect(await finished.json()).toMatchObject([
      { status: "done", finished_on: DAY, rating: null },
    ]);
  });

  test("rates a finished item and removes the rating, as the app does", async ({
    userA,
    watchlistItem,
  }) => {
    const finished = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
      data: { status: "done", finished_on: DAY, rating: null },
    });
    expect(finished.status()).toBe(204);

    // onRate in WatchlistBoard sends the rating alone
    const rated = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
      headers: RETURN_ROWS,
      data: { rating: 5 },
    });
    expect(await rated.json()).toMatchObject([{ status: "done", finished_on: DAY, rating: 5 }]);

    const unrated = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
      headers: RETURN_ROWS,
      data: { rating: null },
    });
    expect(await unrated.json()).toMatchObject([
      { status: "done", finished_on: DAY, rating: null },
    ]);
  });

  test("moves a finished item back to pending, clearing its finish day and rating, as the app does", async ({
    userA,
    watchlistItem,
  }) => {
    const finished = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
      data: { status: "done", finished_on: DAY, rating: 4 },
    });
    expect(finished.status()).toBe(204);

    const reopened = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
      headers: RETURN_ROWS,
      data: { status: "pending", finished_on: null, rating: null },
    });

    expect(reopened.status()).toBe(200);
    expect(await reopened.json()).toMatchObject([
      { status: "pending", finished_on: null, rating: null },
    ]);
  });

  for (const [label, change] of [
    ["while it keeps its finish day and rating", { status: "pending" }],
    ["while it keeps its rating", { status: "pending", finished_on: null }],
    ["while it keeps its finish day", { status: "pending", rating: null }],
  ] as const) {
    test(`does not move a finished item back to pending ${label}`, async ({
      userA,
      watchlistItem,
    }) => {
      const finished = await userA.request.patch("watchlist_items", {
        params: { id: `eq.${watchlistItem.id}` },
        data: { status: "done", finished_on: DAY, rating: 4 },
      });
      expect(finished.status()).toBe(204);

      const response = await userA.request.patch("watchlist_items", {
        params: { id: `eq.${watchlistItem.id}` },
        data: change,
      });
      await expectError(response, 400, "23514");

      const read = await userA.request.get("watchlist_items", {
        params: { id: `eq.${watchlistItem.id}` },
      });
      expect(await read.json()).toMatchObject([{ status: "done", finished_on: DAY, rating: 4 }]);
    });
  }

  test("accepts a poster url of 500 characters", async ({ userA, watchlistTitle }) => {
    const poster_url = TMDB_POSTER.padEnd(500, "x");

    const response = await userA.request.post("watchlist_items", {
      headers: RETURN_ROWS,
      data: { title: watchlistTitle, ...TMDB_MOVIE, poster_url },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ poster_url }]);
  });

  for (const [label, poster_url] of [
    ["a poster url of 501 characters", TMDB_POSTER.padEnd(501, "x")],
    ["a poster url over http", "http://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg"],
    ["a poster url from another host", "https://example.com/a.jpg"],
    [
      "a poster url from a host that only starts like a catalog one",
      "https://image.tmdb.org.example.com/a.jpg",
    ],
  ]) {
    test(`rejects ${label}`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title: watchlistTitle, ...TMDB_MOVIE, poster_url },
      });

      await expectError(response, 400, "23514");
    });
  }

  for (const release_year of [1, 2100]) {
    test(`accepts a release year of ${release_year}`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        headers: RETURN_ROWS,
        data: { title: watchlistTitle, media_type: "movie", release_year },
      });

      expect(response.status()).toBe(201);
      expect(await response.json()).toMatchObject([{ release_year }]);
    });
  }

  for (const release_year of [0, 2101]) {
    test(`rejects a release year of ${release_year}`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title: watchlistTitle, media_type: "movie", release_year },
      });

      await expectError(response, 400, "23514");
    });
  }

  // On a book, a source other than tmdb passes the type check, so only the list of sources rejects it
  for (const [label, catalog_source] of [
    ["a catalog source that does not exist", "imdb"],
    ["a catalog source in another case", "Google_Books"],
  ]) {
    test(`rejects ${label}`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title: watchlistTitle, media_type: "book", catalog_source, catalog_id: "OL27482W" },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("accepts a catalog id of 64 characters", async ({ userA, watchlistTitle }) => {
    const catalog_id = "x".repeat(64);

    const response = await userA.request.post("watchlist_items", {
      headers: RETURN_ROWS,
      data: { title: watchlistTitle, media_type: "movie", catalog_source: "tmdb", catalog_id },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject([{ catalog_id }]);
  });

  for (const [label, catalog_id] of [
    ["an empty catalog id", ""],
    ["a catalog id of 65 characters", "x".repeat(65)],
  ]) {
    test(`rejects ${label}`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title: watchlistTitle, media_type: "movie", catalog_source: "tmdb", catalog_id },
      });

      await expectError(response, 400, "23514");
    });
  }

  for (const [label, link] of [
    ["a catalog source without a catalog id", { catalog_source: "tmdb" }],
    ["a catalog id without a catalog source", { catalog_id: "603" }],
  ] as const) {
    test(`rejects ${label}`, async ({ userA, watchlistTitle }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title: watchlistTitle, media_type: "movie", ...link },
      });

      await expectError(response, 400, "23514");
    });
  }

  for (const [media_type, catalog_source, catalog_id] of [
    ["book", "tmdb", "603"],
    ["movie", "google_books", "zyTCAlFPjgYC"],
    ["movie", "open_library", "OL27482W"],
    ["series", "google_books", "zyTCAlFPjgYC"],
    ["series", "open_library", "OL27482W"],
  ]) {
    test(`rejects a ${media_type} linked to ${catalog_source}`, async ({
      userA,
      watchlistTitle,
    }) => {
      const response = await userA.request.post("watchlist_items", {
        data: { title: watchlistTitle, media_type, catalog_source, catalog_id },
      });

      await expectError(response, 400, "23514");
    });
  }

  test("does not turn a movie linked to tmdb into a book while it keeps its link", async ({
    userA,
    watchlistTitle,
  }) => {
    const created = await userA.request.post("watchlist_items", {
      headers: RETURN_ROWS,
      data: { title: watchlistTitle, ...TMDB_MOVIE },
    });
    expect(created.status()).toBe(201);
    const [item]: WatchlistItemRow[] = await created.json();

    const response = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${item.id}` },
      data: { media_type: "book" },
    });
    await expectError(response, 400, "23514");

    const read = await userA.request.get("watchlist_items", {
      params: { id: `eq.${item.id}`, select: ITEM_COLUMNS },
    });
    expect(await read.json()).toMatchObject([TMDB_MOVIE]);
  });

  test("turns a movie linked to tmdb into a book when the link and poster are cleared", async ({
    userA,
    watchlistTitle,
  }) => {
    const created = await userA.request.post("watchlist_items", {
      headers: RETURN_ROWS,
      data: { title: watchlistTitle, ...TMDB_MOVIE },
    });
    expect(created.status()).toBe(201);
    const [item]: WatchlistItemRow[] = await created.json();

    const response = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${item.id}` },
      headers: RETURN_ROWS,
      data: { media_type: "book", poster_url: null, catalog_source: null, catalog_id: null },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([
      {
        media_type: "book",
        poster_url: null,
        release_year: TMDB_MOVIE.release_year,
        catalog_source: null,
        catalog_id: null,
      },
    ]);
  });

  test("rejects a poster url without a catalog link", async ({ userA, watchlistTitle }) => {
    const response = await userA.request.post("watchlist_items", {
      data: { title: watchlistTitle, media_type: "movie", poster_url: TMDB_POSTER },
    });

    await expectError(response, 400, "23514");
  });

  test("does not clear the catalog link of an item that keeps its poster", async ({
    userA,
    watchlistTitle,
  }) => {
    const created = await userA.request.post("watchlist_items", {
      headers: RETURN_ROWS,
      data: { title: watchlistTitle, ...TMDB_MOVIE },
    });
    expect(created.status()).toBe(201);
    const [item]: WatchlistItemRow[] = await created.json();

    const response = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${item.id}` },
      data: { catalog_source: null, catalog_id: null },
    });
    await expectError(response, 400, "23514");

    const read = await userA.request.get("watchlist_items", {
      params: { id: `eq.${item.id}`, select: ITEM_COLUMNS },
    });
    expect(await read.json()).toMatchObject([TMDB_MOVIE]);
  });

  // The edit form sends every column on every save
  test("updates every column, as the app does", async ({ userA, watchlistItem }) => {
    const edited = {
      title: `${watchlistItem.title} renamed`,
      media_type: "series",
      status: "done",
      finished_on: "2026-01-16",
      rating: 3,
      note: "Better than the first one.",
      poster_url: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
      release_year: 2008,
      catalog_source: "tmdb",
      catalog_id: "1396",
    };

    const response = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
      headers: RETURN_ROWS,
      data: edited,
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject([{ id: watchlistItem.id, ...edited }]);
  });

  test("deletes an item", async ({ userA, watchlistItem }) => {
    const response = await userA.request.delete("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
    });
    expect(response.status()).toBe(204);

    const read = await userA.request.get("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
    });
    expect(await read.json()).toEqual([]);
  });
});

test.describe("watchlist_items row level security", () => {
  test("does not list the items of another user", async ({ userB, watchlistItem }) => {
    const response = await userB.request.get("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("does not update the items of another user", async ({ userA, userB, watchlistItem }) => {
    const response = await userB.request.patch("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
      headers: RETURN_ROWS,
      data: { title: `${watchlistItem.title} taken over`, status: "in_progress" },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);

    const read = await userA.request.get("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
    });
    expect(await read.json()).toMatchObject([
      { title: watchlistItem.title, status: watchlistItem.status },
    ]);
  });

  test("does not delete the items of another user", async ({ userA, userB, watchlistItem }) => {
    const response = await userB.request.delete("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
    });
    expect(response.status()).toBe(204);

    const read = await userA.request.get("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
    });
    expect(await read.json()).toHaveLength(1);
  });

  test("does not create an item for another user", async ({ userA, userB, watchlistTitle }) => {
    const response = await userB.request.post("watchlist_items", {
      data: { title: watchlistTitle, media_type: "movie", user_id: userA.id },
    });

    await expectError(response, 403, "42501");
  });

  test("does not hand an item over to another user", async ({ userA, userB, watchlistItem }) => {
    const response = await userA.request.patch("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
      data: { user_id: userB.id },
    });
    await expectError(response, 403, "42501");

    const read = await userA.request.get("watchlist_items", {
      params: { id: `eq.${watchlistItem.id}` },
    });
    expect(await read.json()).toMatchObject([{ user_id: userA.id }]);
  });
});
