/**
 * Verdict « Go / À vérifier / No-go » d'une offre pour la campagne (panneau
 * « Préparer la candidature »). Fonction pure : secteur, lieu, niveau, langue, contrat.
 */
import type { Language } from "@/lib/cv/types";
import { CONTRACT_LABELS, type ContractCategory } from "@/lib/contracts";
import type { SeniorityResult } from "@/lib/seniority";
import { SECTOR_LABELS, isSector } from "@/lib/scoring/sector";
import { OPTIONAL, REQUIRED, normalize } from "@/lib/scoring/requirements";
import { detectOfferLanguage, userMastersLanguage } from "@/lib/scoring/local";

export type VerdictLevel = "go" | "check" | "nogo";
export type VerdictLine = { id: "secteur" | "lieu" | "niveau" | "langue" | "contrat"; label: string; level: VerdictLevel; detail: string };
export type Verdict = { level: VerdictLevel; lines: VerdictLine[] };

export type VerdictInput = {
  title: string;
  description: string;
  sector: string | null;
  targetSectors: string[];
  /** null : aucune zone choisie. */
  inZone: boolean | null;
  contract: ContractCategory;
  preferredContracts: string[];
  seniority: SeniorityResult;
  profileLanguages: Language[];
};

/** Langues autres que le français et l'anglais repérées dans une annonce. */
const OTHER_LANGUAGES: { iso: string; label: string; re: RegExp }[] = [
  { iso: "de", label: "Allemand", re: /\b(allemand|german|deutsch|deutschkenntnisse)\b/ },
  { iso: "nl", label: "Néerlandais", re: /\b(neerlandais|dutch|nederlands)\b/ },
];
const FLUENCY = /\b(courant|couramment|fluent|fluency|bilingue|bilingual|native|natif|c1|c2|b2|business level)\b/;

/** Langue exigée : obligatoire (« required », « courant »…) ou souhaitée (« un plus ») ; annonce rédigée dans cette langue = obligatoire. */
export function requiredLanguages(title: string, description: string): { iso: string; label: string; mandatory: boolean }[] {
  const text = normalize(`${title}\n${description}`);
  const offerLang = detectOfferLanguage(title, description);
  const out: { iso: string; label: string; mandatory: boolean }[] = [];
  for (const l of OTHER_LANGUAGES) {
    if (offerLang === l.iso) {
      out.push({ iso: l.iso, label: l.label, mandatory: true });
      continue;
    }
    const re = new RegExp(l.re.source, "g");
    let mandatory: boolean | null = null;
    for (const m of text.matchAll(re)) {
      const start = Math.max(text.lastIndexOf(".", m.index!), text.lastIndexOf("\n", m.index!), 0);
      const ends = [".", "\n"].map((c) => text.indexOf(c, m.index!)).filter((i) => i >= 0);
      const sentence = text.slice(start, ends.length ? Math.min(...ends) : text.length);
      const optional = OPTIONAL.test(sentence);
      const req = !optional && (REQUIRED.test(sentence) || FLUENCY.test(sentence));
      mandatory = mandatory === true ? true : req ? true : optional ? false : mandatory ?? false;
    }
    if (mandatory !== null) out.push({ iso: l.iso, label: l.label, mandatory });
  }
  return out;
}

const worst = (levels: VerdictLevel[]): VerdictLevel => (levels.includes("nogo") ? "nogo" : levels.includes("check") ? "check" : "go");

export function offerVerdict(v: VerdictInput): Verdict {
  const lines: VerdictLine[] = [];

  // Secteur
  if (!isSector(v.sector)) lines.push({ id: "secteur", label: "Secteur", level: "check", detail: "Secteur pas encore classé." });
  else if (v.sector !== "autre" && v.targetSectors.includes(v.sector)) lines.push({ id: "secteur", label: "Secteur", level: "go", detail: SECTOR_LABELS[v.sector] });
  else lines.push({ id: "secteur", label: "Secteur", level: "nogo", detail: `${SECTOR_LABELS[v.sector]} : hors des secteurs visés.` });

  // Lieu
  if (v.contract === "vie") lines.push({ id: "lieu", label: "Lieu", level: "go", detail: "V.I.E" });
  else if (v.inZone === true) lines.push({ id: "lieu", label: "Lieu", level: "go", detail: "Dans vos zones." });
  else lines.push({ id: "lieu", label: "Lieu", level: "check", detail: v.inZone === null ? "Aucune zone choisie dans le Profil." : "Hors de vos zones." });

  // Niveau
  const years = v.seniority.years;
  if (v.contract === "vie" || v.contract === "stage") lines.push({ id: "niveau", label: "Niveau", level: "go", detail: v.contract === "vie" ? "V.I.E" : "Stage" });
  else if (years !== null && years >= 5) lines.push({ id: "niveau", label: "Niveau", level: "nogo", detail: `${years} ans d'expérience demandés.` });
  else if (years !== null && years >= 3) lines.push({ id: "niveau", label: "Niveau", level: "check", detail: `${years} ans d'expérience demandés.` });
  else if (v.seniority.level === "senior") lines.push({ id: "niveau", label: "Niveau", level: "nogo", detail: "Poste senior." });
  else if (years !== null) lines.push({ id: "niveau", label: "Niveau", level: "go", detail: `${years} an${years > 1 ? "s" : ""} demandé${years > 1 ? "s" : ""}.` });
  else lines.push({ id: "niveau", label: "Niveau", level: "go", detail: v.seniority.level === "junior" ? "Junior ou jeune diplômé." : "Niveau non précisé." });

  // Langue
  const langs = requiredLanguages(v.title, v.description).filter((l) => !userMastersLanguage(v.profileLanguages, l.iso));
  if (langs.some((l) => l.mandatory)) lines.push({ id: "langue", label: "Langue", level: "nogo", detail: `${langs.filter((l) => l.mandatory).map((l) => l.label).join(", ")} exigé.` });
  else if (langs.length) lines.push({ id: "langue", label: "Langue", level: "check", detail: `${langs.map((l) => l.label).join(", ")} souhaité.` });
  else lines.push({ id: "langue", label: "Langue", level: "go", detail: "Français ou anglais." });

  // Contrat
  if (v.contract !== "autre" && v.preferredContracts.includes(v.contract)) lines.push({ id: "contrat", label: "Contrat", level: "go", detail: CONTRACT_LABELS[v.contract] });
  else lines.push({ id: "contrat", label: "Contrat", level: "check", detail: v.contract === "autre" ? "Contrat non précisé." : "Hors de vos contrats recherchés." });

  return { level: worst(lines.map((l) => l.level)), lines };
}
