import { strict as assert } from "node:assert";
import { test } from "node:test";
import { crawlYears, monthIndex } from "./crawlYears.js";

const base = { fromYear: 2000, toYear: 2026, recentFromYear: 2024, backfill: 4 };

test("the recent window is crawled every run, newest first", () => {
  for (let rotation = 0; rotation < 12; rotation++) {
    const years = crawlYears({ ...base, rotation });
    assert.deepEqual(years.slice(0, 3), [2026, 2025, 2024], `rotation ${rotation}`);
    assert.equal(years.length, 3 + 4);
    assert.equal(new Set(years).size, years.length, "no year twice in one run");
  }
});

test("the rotation sweeps every historical year", () => {
  const history = 2023 - 2000 + 1; // 2000..2023
  const runs = Math.ceil(history / base.backfill);
  const seen = new Set<number>();
  for (let rotation = 0; rotation < runs; rotation++) {
    for (const y of crawlYears({ ...base, rotation })) seen.add(y);
  }
  for (let y = 2000; y <= 2026; y++) {
    assert.ok(seen.has(y), `year ${y} never crawled in ${runs} runs`);
  }
});

test("no backfill, or no history, leaves just the recent window", () => {
  assert.deepEqual(crawlYears({ ...base, backfill: 0, rotation: 0 }), [2026, 2025, 2024]);
  assert.deepEqual(
    crawlYears({ fromYear: 2024, toYear: 2026, recentFromYear: 2024, backfill: 4, rotation: 3 }),
    [2026, 2025, 2024],
  );
});

test("a backfill wider than the history does not repeat a year", () => {
  const years = crawlYears({
    fromYear: 2020,
    toYear: 2026,
    recentFromYear: 2024,
    backfill: 10,
    rotation: 5,
  });
  assert.equal(new Set(years).size, years.length);
  assert.equal(years.length, 3 + 4); // 2024-2026 recent, 2020-2023 history
});

test("the default rotation advances once a month", () => {
  const jan = monthIndex(new Date("2026-01-15T00:00:00Z"));
  assert.equal(monthIndex(new Date("2026-01-28T00:00:00Z")), jan);
  assert.equal(monthIndex(new Date("2026-02-01T00:00:00Z")), jan + 1);
  assert.equal(monthIndex(new Date("2027-01-01T00:00:00Z")), jan + 12);
});
