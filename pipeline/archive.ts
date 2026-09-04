/**
 * The **archive**: the previously published dataset, fed back into the run.
 *
 * Every run used to rebuild the dataset from scratch out of one crawl, so a
 * year the Finlex throttle did not reach that day simply vanished — FI 2000–
 * 2007 sat at 0–1 events a year and 2020 at none, and no later run could fix
 * it, because the next run started over too. Merging the last published
 * dataset back in makes coverage *cumulative*: a year crawled once stays, and
 * the crawl can spend its budget on recent law plus a rotating backfill slice
 * (see `crawlYears`).
 *
 * Live records still win outright — they are the current statute text under
 * the current rules — and `REBUILD=1` skips the archive entirely when the
 * point is to rebuild from sources alone.
 */
import type { Domain, RegulationEvent } from "../shared/schema.js";
import { domainFromTitle } from "./normalize/domainMap.js";
import { loadPublishedDataset } from "./published.js";

export interface ArchiveResult {
  events: RegulationEvent[];
  /** Where it came from: "local" or a mirror URL. */
  source: string;
  /** `generatedAt` of the dataset the events came from. */
  generatedAt: string;
  retagged: number;
  dropped: number;
}

/**
 * Re-derive keyword domains from the titles the archive already carries.
 *
 * An archived record was tagged by whatever `domainMap` said on the day it was
 * crawled, and the archive would otherwise freeze that judgement forever. The
 * title is stored, the mapping is pure, so the current rules can be applied
 * without touching the network: a record the rules now place elsewhere is
 * re-tagged, and one they no longer place at all is dropped.
 *
 * Only `keyword` records are re-derived — a `tagged` domain came from the
 * work's own EuroVoc concepts, which a title cannot second-guess — and never
 * the curated ones: the seed states its domains deliberately, and a keyword
 * rule has no business overruling (or dropping) a hand-picked landmark.
 */
export function refreshKeywordDomains(
  events: RegulationEvent[],
  curatedIds: ReadonlySet<string> = new Set(),
): {
  events: RegulationEvent[];
  retagged: number;
  dropped: number;
} {
  const out: RegulationEvent[] = [];
  let retagged = 0;
  let dropped = 0;
  for (const ev of events) {
    if (ev.domainConfidence !== "keyword" || curatedIds.has(ev.id)) {
      out.push(ev);
      continue;
    }
    const domain: Domain | null = domainFromTitle(ev.title);
    if (!domain) {
      dropped++;
      continue;
    }
    if (domain !== ev.domain) {
      retagged++;
      out.push({ ...ev, domain });
      continue;
    }
    out.push(ev);
  }
  return { events: out, retagged, dropped };
}

/** Load the last published dataset as archive input, or null if there is none. */
export async function loadArchive(
  curatedIds: ReadonlySet<string> = new Set(),
): Promise<ArchiveResult | null> {
  const found = await loadPublishedDataset("archive");
  if (!found) return null;
  const { events, retagged, dropped } = refreshKeywordDomains(
    found.dataset.events,
    curatedIds,
  );
  return {
    events,
    source: found.source,
    generatedAt: found.dataset.generatedAt,
    retagged,
    dropped,
  };
}
