import {
  DOMAIN_LABELS,
  IMPACT_LABELS,
  JURISDICTION_LABELS,
} from "../../shared/schema";
import type { CategoryDimension } from "../state/appState";

const dateFmt = new Intl.DateTimeFormat("fi-FI", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** ISO yyyy-mm-dd -> "1. tammikuuta 2019" (parsed as UTC noon, TZ-safe). */
export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/**
 * Whether an event has text worth showing under its title.
 *
 * Since 2026-09-03 the pipeline says so itself: `summarySource` is `curated`
 * for the seed's hand-written prose and `excerpt` for a verbatim quote of the
 * statute's own opening provision, and an event with neither carries
 * `summary: ""`. The prefix comparison below is the fallback for a dataset
 * published before that — builds no longer re-crawl, so a live dataset can be
 * a month older than this code, and back then a crawled act's summary was its
 * title again (capped at 280 chars against the title's 200, so the echo can be
 * the longer string of the two).
 */
export function hasSummary(event: {
  title: string;
  summary: string;
  summarySource?: string;
}): boolean {
  if (event.summary.trim() === "") return false;
  if (event.summarySource) return true;
  const norm = (t: string) =>
    t.replace(/[…\s]+$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  const title = norm(event.title);
  const summary = norm(event.summary);
  return !title.startsWith(summary) && !summary.startsWith(title);
}

/**
 * Escape text for interpolation into an `innerHTML` template.
 *
 * Titles and curated summaries are Finlex/EUR-Lex metadata, but an excerpt is
 * raw statute prose — "<" and "&" occur in it — and both the detail panel and
 * the radar tooltip build their markup as strings.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Finnish label for a category value within a dimension. */
export function categoryLabel(
  dim: CategoryDimension,
  value: string,
): string {
  switch (dim) {
    case "domain":
      return DOMAIN_LABELS[value as keyof typeof DOMAIN_LABELS] ?? value;
    case "jurisdiction":
      return (
        JURISDICTION_LABELS[value as keyof typeof JURISDICTION_LABELS] ?? value
      );
    case "impact":
      return IMPACT_LABELS[value as keyof typeof IMPACT_LABELS] ?? value;
  }
}

/** Short single-word domain labels for the radar sector rims (no clipping). */
const DOMAIN_SHORT: Record<string, string> = {
  corporate_governance: "Yhtiöoikeus",
  tax_duties: "Verotus",
  accounting_reporting: "Kirjanpito",
  employment_labour: "Työ",
  data_protection: "Tietosuoja",
  financial_securities: "Rahoitus",
  competition: "Kilpailu",
  environment: "Ympäristö",
};

/** Compact label used on the radar rim; full label still used in the legend. */
export function shortCategoryLabel(
  dim: CategoryDimension,
  value: string,
): string {
  if (dim === "domain") return DOMAIN_SHORT[value] ?? value;
  return categoryLabel(dim, value);
}

export const DIMENSION_LABELS: Record<CategoryDimension, string> = {
  domain: "Oikeudenala",
  jurisdiction: "Suomi / EU",
  impact: "Vaikutus",
};
