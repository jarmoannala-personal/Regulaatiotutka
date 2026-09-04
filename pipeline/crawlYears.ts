/**
 * Which years a Finlex crawl fetches on this run.
 *
 * With the archive in place a year fetched once stays in the dataset, so
 * re-crawling 2000→now every run spends a throttle-bound budget on data we
 * already have. Recent years are always fetched — they are where law is added
 * and amended — and the rest are covered by a rotating slice, so a monthly
 * schedule sweeps the whole history in `ceil(history / backfill)` runs while
 * every run still leaves the recent window fully covered.
 */
export interface CrawlYearOptions {
  fromYear: number;
  toYear: number;
  /** First year of the always-crawled recent window. */
  recentFromYear: number;
  /** How many older years to backfill per run. */
  backfill: number;
  /** Rotation counter; defaults to the current month, so the slice advances
   *  once a month and a monthly schedule never repeats itself. */
  rotation?: number;
}

/** Months since 2000-01 (UTC) — a stable, monotonic rotation counter. */
export function monthIndex(now: Date = new Date()): number {
  return (now.getUTCFullYear() - 2000) * 12 + now.getUTCMonth();
}

export function crawlYears(opts: CrawlYearOptions): number[] {
  const { fromYear, toYear, recentFromYear, backfill } = opts;
  const rotation = opts.rotation ?? monthIndex();

  const recent: number[] = [];
  for (let y = toYear; y >= Math.max(fromYear, recentFromYear); y--) {
    recent.push(y);
  }

  const older: number[] = [];
  for (let y = Math.min(toYear, recentFromYear - 1); y >= fromYear; y--) {
    older.push(y);
  }
  if (older.length === 0 || backfill <= 0) return recent;

  const take = Math.min(backfill, older.length);
  // Step a whole slice per rotation, not one year: consecutive runs must cover
  // *different* years, or a monthly schedule would crawl 2023, 2022, 2021,
  // 2020, then 2022, 2021, 2020, 2019 … and take four times as long to sweep.
  const start = (((rotation * take) % older.length) + older.length) % older.length;
  const slice: number[] = [];
  for (let i = 0; i < take; i++) slice.push(older[(start + i) % older.length]);
  return [...recent, ...slice];
}
