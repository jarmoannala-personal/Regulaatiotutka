import type {
  Domain,
  ImpactTier,
  Jurisdiction,
  RegulationEvent,
} from "../../shared/schema";
import type { CategoryDimension } from "../state/appState";

const DOMAIN_COLORS: Record<Domain, string> = {
  corporate_governance: "#4e79a7",
  tax_duties: "#f28e2b",
  accounting_reporting: "#59a14f",
  employment_labour: "#e15759",
  data_protection: "#b07aa1",
  financial_securities: "#76b7b2",
  competition: "#edc948",
  environment: "#9c755f",
};

const JURISDICTION_COLORS: Record<Jurisdiction, string> = {
  FI: "#1f6fb2",
  EU: "#f4b400",
};

const IMPACT_COLORS: Record<ImpactTier, string> = {
  low: "#9aa7b1",
  medium: "#e08a2e",
  high: "#d6453d",
};

/** Category key on `event` for the active dimension. */
export function categoryValue(
  event: RegulationEvent,
  dim: CategoryDimension,
): string {
  switch (dim) {
    case "domain":
      return event.domain;
    case "jurisdiction":
      return event.jurisdiction;
    case "impact":
      return event.impactTier;
  }
}

export function colorForCategory(
  dim: CategoryDimension,
  value: string,
): string {
  switch (dim) {
    case "domain":
      return DOMAIN_COLORS[value as Domain] ?? "#888";
    case "jurisdiction":
      return JURISDICTION_COLORS[value as Jurisdiction] ?? "#888";
    case "impact":
      return IMPACT_COLORS[value as ImpactTier] ?? "#888";
  }
}

export function colorForEvent(
  event: RegulationEvent,
  dim: CategoryDimension,
): string {
  return colorForCategory(dim, categoryValue(event, dim));
}
