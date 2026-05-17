import type { ImpactTier, InstrumentType } from "../../shared/schema.js";

/**
 * Origin/weight class of an item. EU acts are broadly impactful; a Finnish
 * "laki" (act) more so than a "valtioneuvoston asetus" (decree) or an
 * internal rules-of-procedure document.
 */
export type ImpactKind = "eu" | "fi-act" | "fi-decree" | "fi-other";

/** Flagship Finnish/EU acts that should always read as high impact. */
const FLAGSHIP =
  /osakeyhtiölaki|kirjanpitolaki|tilintarkastuslaki|työsopimuslaki|tietosuoja|arvopaperimarkkina|sijoituspalvelu|luottolaitos|kilpailulaki|ympäristönsuojelulaki|jätelaki|yhteistoimintalaki|rahanpesun|yleinen tietosuoja|GDPR|CSRD|DORA|MiFID|ATAD/i;

/**
 * Coarse impact heuristic. Reweighted in Phase 3 so the MAX_EVENTS cap keeps
 * substantive EU acts and Finnish laws rather than routine Finnish decrees:
 *
 *   EU regulation +3 · EU directive +2
 *   FI act +2 · FI decree +1 · FI other +0
 *   amendment baseline +1 (FI amending statute)
 *   +1 if >= 5 amended sections
 *   +2 if the title matches a flagship act
 *   => high if score >= 4, medium if 2–3, low if <= 1
 */
export function computeImpactTier(
  instrumentType: InstrumentType,
  amendedSections: string[] | undefined,
  title: string,
  kind: ImpactKind = "fi-other",
): ImpactTier {
  let score = 0;

  if (kind === "eu") {
    score += instrumentType === "regulation" ? 3 : 2;
  } else if (instrumentType === "amendment") {
    score += 1;
  } else if (kind === "fi-act") {
    score += 2;
  } else if (kind === "fi-decree") {
    score += 1;
  }

  if ((amendedSections?.length ?? 0) >= 5) score += 1;
  if (FLAGSHIP.test(title)) score += 2;

  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}
