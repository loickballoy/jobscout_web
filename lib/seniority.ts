/**
 * Niveau d'expérience demandé par une offre, déduit localement de l'intitulé et
 * de la description (aucun appel IA) : « junior », « mid » (3-4 ans),
 * « senior » (5 ans et plus, ou intitulé senior), « unknown » (rien d'explicite,
 * cas le plus fréquent). Sans dépendance serveur.
 */
export type Seniority = "junior" | "mid" | "senior" | "unknown";

export type SeniorityResult = { level: Seniority; years: number | null };

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’`]/g, "'");
}

const SENIOR_TITLE =
  /\b(senior|sr\.?|lead|tech lead|team lead|principal|staff|head of|directeur|directrice|director|architecte|architect|expert|experte|confirme|confirmee|experimente|experimentee)\b/;
const JUNIOR_TITLE = /\b(junior|jr\.?|jeune diplome|jeune diplomee|debutant|debutante|graduate|entry[- ]level|early[- ]career|new grad)\b/;
const JUNIOR_TEXT =
  /\b(debutant(e)?s? accepte(e)?s?|jeunes? diplome(e)?s?|premiere experience|sorti(e)?s? d'ecole|entry[- ]level|early[- ]career|graduate program(me)?|new grads?|no (prior )?experience required|experience non exigee)\b/;

// « 5 ans d'expérience », « 3 à 5 ans d'expérience », « 2+ ans d'exp. », « 5 years of experience »,
// « expérience exigée de 3 an(s) », « at least 4 years », « minimum 5 ans ».
const YEARS_PATTERNS = [
  /(\d{1,2})\s*(?:\+|ans?\s+ou\s+plus|(?:a|-)\s*\d{1,2})?\s*ans?\s*(?:minimum\s*)?(?:d'|de\s+)?\s*(?:experience|exp\b)/g,
  /experience[^.\n]{0,40}?\b(\d{1,2})\s*(?:\+|(?:a|-)\s*\d{1,2})?\s*an/g,
  /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?\s+(?:of\s+)?(?:[a-z/+#-]+\s+){0,3}?experience/g,
  /(?:at least|minimum|min\.)\s*(\d{1,2})\s*(?:\+\s*)?(?:years?|ans?)/g,
];

/** Années d'expérience minimales exigées (la plus haute des exigences trouvées), ou null. */
export function requiredYears(text: string): number | null {
  const t = norm(text);
  let best: number | null = null;
  for (const re of YEARS_PATTERNS) {
    for (const m of t.matchAll(re)) {
      const n = Number(m[1]);
      // Au-delà de 15 ans, c'est l'histoire de l'entreprise (« fort de 20 ans d'expérience »), pas une exigence.
      if (Number.isFinite(n) && n <= 15) best = best === null ? n : Math.max(best, n);
    }
  }
  return best;
}

export function classifySeniority(title: string, text: string): SeniorityResult {
  const t = norm(title);
  const years = requiredYears(`${title}\n${text}`);
  if (SENIOR_TITLE.test(t)) return { level: "senior", years };
  if (JUNIOR_TITLE.test(t)) return { level: "junior", years };
  if (years !== null) return { level: years <= 2 ? "junior" : years <= 4 ? "mid" : "senior", years };
  if (JUNIOR_TEXT.test(norm(text))) return { level: "junior", years };
  return { level: "unknown", years };
}

/** Postes accessibles à un jeune diplômé : junior explicite, ou niveau non précisé. */
export function juniorFriendly(level: Seniority): boolean {
  return level === "junior" || level === "unknown";
}

export function seniorityLabel(r: SeniorityResult): string | null {
  if (r.level === "junior") return r.years !== null ? `Junior · ${r.years} an${r.years > 1 ? "s" : ""}` : "Junior";
  if (r.level === "mid") return `${r.years} ans d'exp.`;
  if (r.level === "senior") return r.years !== null ? `Senior · ${r.years} ans+` : "Senior";
  return null;
}
