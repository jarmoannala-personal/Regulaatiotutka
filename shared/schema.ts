/**
 * The single data contract shared by the build-time pipeline and the frontend.
 *
 * The future "data as a service" must serve the same {@link RegulationDataset}
 * shape; the only frontend change to switch sources is the URL in
 * `src/data/loadDataset.ts`. Keep this file dependency-free.
 */

export type Jurisdiction = "FI" | "EU";

export type Domain =
  | "corporate_governance"
  | "tax_duties"
  | "accounting_reporting"
  | "employment_labour"
  | "data_protection"
  | "financial_securities"
  | "competition"
  | "environment";

export type ImpactTier = "low" | "medium" | "high";

export type InstrumentType =
  | "act" // FI: a new statute (uusi laki)
  | "amendment" // FI: an amending statute (muutoslaki)
  | "regulation" // EU: directly applicable
  | "directive"; // EU: requires national transposition

export type DomainConfidence = "tagged" | "keyword";

export interface RegulationEvent {
  /** Stable id: `fi:${statuteNumber}` or `eu:${celex}`. */
  id: string;
  /** Finnish title preferred, English fallback. */
  title: string;
  jurisdiction: Jurisdiction;
  domain: Domain;
  impactTier: ImpactTier;
  /** ISO yyyy-mm-dd — issued/published date; drives the timeline. */
  dateAnnounced: string;
  /** ISO yyyy-mm-dd, or null when unknown. */
  dateInForce: string | null;
  /** Deep link to the official Finlex / EUR-Lex page. */
  sourceUrl: string;
  /** Plain-language summary, <= 280 chars. */
  summary: string;
  instrumentType: InstrumentType;
  eli?: string;
  celex?: string;
  /** FI only, e.g. "624/2006". */
  statuteNumber?: string;
  /** e.g. ["1:3", "5:2"] — feeds the impact heuristic. */
  amendedSections?: string[];
  /** EU items are EuroVoc-"tagged"; FI items are "keyword"-mapped. */
  domainConfidence: DomainConfidence;
}

export type EdgeType = "amends" | "repeals" | "based_on";

/** A directed legal relationship between two events (EU only, by id). */
export interface RegulationEdge {
  from: string;
  to: string;
  type: EdgeType;
}

/**
 * Entry-into-force dates arrive from two unreliable shapes: CELLAR uses
 * `1001-01-01` as its "no date" placeholder for
 * `resource_legal_date_entry-into-force`, and the Finnish commencement date is
 * parsed out of a statute's closing prose. A date far outside the corpus
 * therefore means *unknown*, not a real commencement.
 *
 * Shared so the pipeline drops it at the source **and** the frontend never
 * renders a year-1001 group from an already-published dataset — a build no
 * longer re-crawls, so old data outlives a pipeline fix by up to a month.
 */
export function plausibleDate(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const year = Number(iso.slice(0, 4));
  const thisYear = new Date().getUTCFullYear();
  return year >= 1900 && year <= thisYear + 20 ? iso : null;
}

export const SCHEMA_VERSION = "v1" as const;

export interface RegulationDataset {
  schemaVersion: typeof SCHEMA_VERSION;
  /** ISO timestamp of the pipeline run. */
  generatedAt: string;
  /** Provenance string, e.g. "finlex-rest-v1+eurlex-cellar+seed-2026-05". */
  sourceVersion: string;
  /** "seed-fallback" tells the UI to show an offline-data banner. */
  origin: "pipeline" | "seed-fallback";
  coverage: { fromYear: number; toYear: number };
  counts: { total: number; fi: number; eu: number };
  events: RegulationEvent[];
  /** EU legal relationships among the events (may be empty). */
  edges: RegulationEdge[];
}

export const DOMAINS: readonly Domain[] = [
  "corporate_governance",
  "tax_duties",
  "accounting_reporting",
  "employment_labour",
  "data_protection",
  "financial_securities",
  "competition",
  "environment",
] as const;

export const JURISDICTIONS: readonly Jurisdiction[] = ["FI", "EU"] as const;

export const IMPACT_TIERS: readonly ImpactTier[] = [
  "low",
  "medium",
  "high",
] as const;

/** Human-readable Finnish labels for UI (legend, switcher, panel). */
export const DOMAIN_LABELS: Record<Domain, string> = {
  corporate_governance: "Yhtiöoikeus & hallinto",
  tax_duties: "Verotus & maksut",
  accounting_reporting: "Kirjanpito & raportointi",
  employment_labour: "Työ & työsuhteet",
  data_protection: "Tietosuoja",
  financial_securities: "Rahoitus & arvopaperit",
  competition: "Kilpailu",
  environment: "Ympäristö",
};

export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  FI: "Suomi",
  EU: "EU",
};

export const IMPACT_LABELS: Record<ImpactTier, string> = {
  low: "Vähäinen",
  medium: "Kohtalainen",
  high: "Merkittävä",
};

export const INSTRUMENT_LABELS: Record<InstrumentType, string> = {
  act: "Laki",
  amendment: "Muutoslaki",
  regulation: "Asetus (EU)",
  directive: "Direktiivi (EU)",
};

/** Runtime guard: is `value` a member of {@link DOMAINS}? */
export function isDomain(value: unknown): value is Domain {
  return typeof value === "string" && (DOMAINS as readonly string[]).includes(value);
}

export function isJurisdiction(value: unknown): value is Jurisdiction {
  return value === "FI" || value === "EU";
}

export function isImpactTier(value: unknown): value is ImpactTier {
  return value === "low" || value === "medium" || value === "high";
}
