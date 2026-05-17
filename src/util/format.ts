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
