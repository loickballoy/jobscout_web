import "server-only";
import type { ProfileFull, Language } from "@/lib/cv/types";
import { classifyContract, type ContractCategory } from "@/lib/contracts";
import { classifySeniority } from "@/lib/seniority";
import { getExperienceYears } from "@/lib/seniority-store";
import { nameToCode, strictCountryName } from "@/lib/countries";
import { containsTerm, hasTermIn, normalize, offerCoverage, skillAliases, type Coverage } from "./requirements";

export { hasTermIn, skillAliases };

/** Version de la formule : changée, toutes les offres sont recalculées au démarrage (lib/scoring/rescore.ts). */
export const SCORING_VERSION = "4";

export type ScoreResult = {
  score: number;
  breakdown: {
    sector: number;
    skills: number;
    country: number;
    language: number;
    duration: number;
    contract: number;
    /** Adéquation entre l'expérience demandée et la vôtre (0-100), absente si l'offre n'en dit rien. */
    experience?: number;
  };
  reason: string;
};

const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "à", "au", "aux", "en",
  "the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "with",
]);

function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Secteur / métier : une offre relève d'un secteur, pas de tous. 100 si
 * l'intitulé correspond à l'un de vos secteurs, 60 si seule la description en
 * parle, 0 sinon (plus de moyenne sur tous les secteurs, qui pénalisait les
 * profils à plusieurs cibles).
 */
function scoreSector(
  sectors: string[],
  title: string,
  description: string
): { score: number; matched: string[] } {
  if (!sectors.length) return { score: 50, matched: [] };
  const titleNorm = normalize(title);
  const descNorm = normalize(description);
  const inTitle = sectors.filter((s) => {
    const tokens = tokenize(s);
    return tokens.length > 0 && tokens.some((t) => containsTerm(titleNorm, t));
  });
  if (inTitle.length) return { score: 100, matched: inTitle };
  const inDesc = sectors.filter((s) => {
    const tokens = tokenize(s);
    return tokens.length > 0 && tokens.some((t) => containsTerm(descNorm, t));
  });
  return { score: inDesc.length ? 60 : 0, matched: inDesc };
}

/**
 * Compétences : part pondérée des exigences de l'offre que le profil couvre
 * (lib/scoring/requirements.ts). Exigences clés ×3, normales ×1, souhaitées ×0,5.
 * Une offre qui ne cite (presque) aucune compétence repérable ne peut pas
 * afficher un bon score de compétences : rien ne permet de l'affirmer.
 */
function scoreSkills(profile: ProfileFull, description: string, title: string): { score: number; coverage: Coverage } {
  const coverage = offerCoverage(profile.skills.map((s) => s.name), title, description);
  if (coverage.ratio === null) return { score: 40, coverage };
  let score = Math.round(coverage.ratio * 100);
  if (coverage.weightTotal < 3) score = Math.min(score, 70);
  return { score, coverage };
}

/** Pays comparés par code ISO : « Suisse », « Switzerland » et « CH » sont le même pays. */
function countryKey(raw: string): string {
  return nameToCode(strictCountryName(raw)) ?? normalize(raw).trim();
}

function scoreCountry(targetCountries: string[], offreCountry: string | null): number {
  if (!targetCountries.length) return 50;
  if (!offreCountry) return 50;
  const targetSet = new Set(targetCountries.map(countryKey));
  return targetSet.has(countryKey(offreCountry)) ? 100 : 0;
}

// ----------------------------------------------------------------------------
// Language bonus
// ----------------------------------------------------------------------------
//
// Idea : if the offer is mostly written in a language the user masters at a
// usable professional level (B2+), award up to +8 pts. This avoids penalizing
// a French-German profile reading a German-language offer that would
// otherwise score low on keyword density.

const LANG_KEYWORDS: Record<string, RegExp> = {
  fr: /\b(?:le|la|les|et|de|du|des|pour|avec|votre|mission|profil|exp[ée]rience|comp[ée]tences|formation|entreprise)\b/gi,
  en: /\b(?:the|and|of|for|with|your|will|experience|skills|team|company|role|responsibilities)\b/gi,
  es: /\b(?:el|la|los|las|y|de|del|para|con|tu|experiencia|formaci[oó]n|empresa|misi[oó]n|equipo)\b/gi,
  de: /\b(?:der|die|das|und|für|mit|sie|erfahrung|kenntnisse|team|unternehmen|aufgaben)\b/gi,
  it: /\b(?:il|la|gli|le|e|di|del|per|con|tua|esperienza|competenze|azienda|team)\b/gi,
  pt: /\b(?:o|a|os|as|e|de|do|para|com|sua|experi[eê]ncia|empresa|equipe)\b/gi,
};

const LANG_PROFILE_ALIASES: Record<string, string[]> = {
  fr: ["français", "francais", "french"],
  en: ["anglais", "english", "ingles"],
  es: ["espagnol", "spanish", "espanol", "español"],
  de: ["allemand", "german", "deutsch"],
  it: ["italien", "italian", "italiano"],
  pt: ["portugais", "portuguese", "portugues", "português"],
};

const PROFICIENT_LEVELS = /\b(c2|c1|b2|courant|fluent|bilingue|bilingual|natif|native|maternelle|mother)\b/i;

function detectOfferLanguage(title: string, description: string): string {
  const text = `${title}\n${description}`;
  let bestLang = "fr";
  let bestCount = 0;
  for (const [lang, re] of Object.entries(LANG_KEYWORDS)) {
    const m = text.match(re);
    const count = m ? m.length : 0;
    if (count > bestCount) {
      bestCount = count;
      bestLang = lang;
    }
  }
  return bestLang;
}

function userMastersLanguage(profileLanguages: Language[], iso: string): boolean {
  const aliases = LANG_PROFILE_ALIASES[iso] ?? [];
  for (const l of profileLanguages) {
    const name = normalize(l.name ?? "");
    if (!aliases.some((a) => name.includes(normalize(a)))) continue;
    // Default to "the user listed it = they speak it" if no level is given.
    if (!l.level) return true;
    return PROFICIENT_LEVELS.test(l.level);
  }
  return false;
}

function scoreLanguage(
  profileLanguages: Language[],
  title: string,
  description: string
): { score: number; offerLang: string; matched: boolean } {
  const offerLang = detectOfferLanguage(title, description);
  const matched = userMastersLanguage(profileLanguages, offerLang);
  // Full bonus if matched, half if user has English as fallback for non-EN offers
  if (matched) return { score: 100, offerLang, matched: true };
  const hasEnglish = userMastersLanguage(profileLanguages, "en");
  if (hasEnglish && offerLang !== "en")
    return { score: 30, offerLang, matched: false };
  return { score: 0, offerLang, matched: false };
}

// ----------------------------------------------------------------------------
// NEW : Duration bonus — V.I.E specific
// ----------------------------------------------------------------------------
//
// V.I.E missions last 6 to 24 months. The "sweet spot" recognized by Business
// France is 12-24 months. Award +5 pts if the offer's stated duration falls
// in that range, +3 pts for 6-11 months, 0 otherwise. Only triggers for V.I.E.

function extractDurationMonths(description: string): number | null {
  const re = /\b(\d{1,2})\s*(?:mois|months?|m[oô]?is)\b/i;
  const m = description.match(re);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 36) return null;
  return n;
}

function scoreDuration(
  contractCategory: ContractCategory,
  description: string
): { score: number; months: number | null } {
  // Ne s'applique qu'aux V.I.E — on réutilise la classification stricte
  // (detectVie) au lieu d'une regex locale : "\bvie\b" matchait le mot
  // français « vie » dans n'importe quelle description.
  if (contractCategory !== "vie") return { score: 0, months: null };
  const months = extractDurationMonths(description);
  if (months === null) return { score: 30, months: null }; // neutral
  if (months >= 12 && months <= 24) return { score: 100, months };
  if (months >= 6 && months < 12) return { score: 60, months };
  return { score: 20, months };
}

// ----------------------------------------------------------------------------
// Contrat — préférence PAR PROFIL (preferred_contracts)
// ----------------------------------------------------------------------------
//
// Chaque profil déclare les types de contrat recherchés (ex. ["cdi","cdd"] pour
// un diplômé, ["alternance"] pour un étudiant). Barème :
//   catégorie recherchée → 100 (bonus +10)
//   catégorie « autre » / inconnue → 50 (neutre)
//   catégorie identifiée mais non recherchée → 20 (malus −6)

function scoreContract(
  preferred: string[] | undefined,
  offre: ScoringInput
): { score: number; category: ContractCategory } {
  const category = classifyContract({
    contract_type: offre.contract_type ?? null,
    title: offre.title,
    description_text: offre.description_text,
  });
  const prefs = preferred?.length ? preferred : ["cdi", "cdd"];
  if (category === "autre") return { score: 50, category };
  if (prefs.includes(category)) return { score: 100, category };
  return { score: 20, category };
}

// ----------------------------------------------------------------------------
// Final scoring : weighted base, penalties only, capped by missing key requirements
// ----------------------------------------------------------------------------

export type ScoringInput = {
  title: string;
  company: string;
  country: string | null;
  description_text: string;
  contract_type?: string | null;
};

/**
 * Expérience : années demandées (« 5 ans d'expérience », intitulé « Senior » = 5)
 * comparées à celles du candidat. Rien d'explicite : neutre.
 * Écart d'1 an −6, 2 ans −12, 3 ans −20, 4 et plus −28. Aucun bonus : une
 * expérience suffisante est la norme, pas un mérite.
 */
export function scoreExperience(title: string, text: string, candidateYears: number): { fit: number | null; delta: number; required: number | null; junior: boolean } {
  const s = classifySeniority(title, text);
  const required = s.years ?? (s.level === "senior" ? 5 : s.level === "mid" ? 3 : null);
  if (s.level === "junior" && (required === null || required <= candidateYears)) return { fit: 100, delta: 0, required, junior: true };
  if (required === null) return { fit: null, delta: 0, required: null, junior: false };
  const gap = required - candidateYears;
  if (gap <= 0) return { fit: 100, delta: 0, required, junior: false };
  const steps = [[1, 70, -6], [2, 45, -12], [3, 25, -20]] as const;
  const hit = steps.find(([g]) => gap <= g);
  return hit ? { fit: hit[1], delta: hit[2], required, junior: false } : { fit: 10, delta: -28, required, junior: false };
}

export function scoreOffreLocal(
  profile: ProfileFull,
  offre: ScoringInput,
  // Lu dans les réglages par défaut : les appelants (scan, re-score, profils) n'ont rien à passer.
  opts: { experienceYears?: number } = { experienceYears: getExperienceYears() }
): ScoreResult {
  const sector = scoreSector(profile.sectors, offre.title, offre.description_text);
  const skills = scoreSkills(profile, offre.description_text, offre.title);
  const country = scoreCountry(profile.target_countries, offre.country);
  const language = scoreLanguage(profile.languages, offre.title, offre.description_text);
  const contract = scoreContract(profile.preferred_contracts, offre);
  const duration = scoreDuration(contract.category, offre.description_text);

  // Base : compétences (couverture des exigences) 55 %, secteur/métier 25 %, pays 20 %.
  const base = skills.score * 0.55 + sector.score * 0.25 + country * 0.2;

  // Ajustements : uniquement des retraits. Ce qui est normal (bonne langue, bon
  // contrat, expérience suffisante) ne rapporte rien ; ce qui coince retire.
  const experience = scoreExperience(offre.title, offre.description_text, opts.experienceYears ?? 0);
  const contractPenalty = contract.score <= 20 ? -10 : 0;
  const languagePenalty = language.score === 0 ? -10 : language.score < 100 ? -5 : 0;
  // V.I.E : durée hors de la fourchette 12-24 mois légèrement pénalisée.
  const durationPenalty = contract.category === "vie" && duration.months !== null && duration.score < 60 ? -3 : 0;

  // Plafonds : une exigence clé non couverte empêche un score élevé, quel que soit le reste.
  const missingKey = skills.coverage.missingKey.length;
  let cap = missingKey ? Math.max(40, 100 - 12 * missingKey) : 100;
  if (experience.required !== null && experience.required - (opts.experienceYears ?? 0) >= 3) cap = Math.min(cap, 55);

  const finalScore = Math.round(
    Math.max(0, Math.min(cap, base + experience.delta + contractPenalty + languagePenalty + durationPenalty))
  );

  // Build human-readable reason
  const parts: string[] = [];
  if (sector.matched.length) parts.push(`secteur ${sector.matched.slice(0, 2).join("/")}`);
  const reqs = skills.coverage.requirements;
  if (reqs.length) {
    parts.push(`couvre ${reqs.filter((r) => r.covered).length}/${reqs.length} exigences`);
    if (missingKey) parts.push(`clé${missingKey > 1 ? "s" : ""} manquante${missingKey > 1 ? "s" : ""} : ${skills.coverage.missingKey.slice(0, 3).map((r) => r.label).join(", ")}`);
  } else parts.push("aucune compétence technique repérée dans l'annonce");
  if (country === 100) parts.push("pays OK");
  else if (country === 0) parts.push("hors pays cibles");
  if (language.matched) parts.push(`langue ${language.offerLang.toUpperCase()} OK`);
  if (duration.months && duration.score >= 60)
    parts.push(`durée ${duration.months} mois`);
  if (contract.score === 100)
    parts.push(`${contract.category.toUpperCase()} recherché`);
  else if (contract.score === 20)
    parts.push(`${contract.category} (non ciblé)`);
  if (experience.junior) parts.push("poste junior");
  else if (experience.required !== null && experience.fit !== null && experience.fit < 100)
    parts.push(`${experience.required} an${experience.required > 1 ? "s" : ""} d'expérience demandé${experience.required > 1 ? "s" : ""}`);
  const reason = parts.length ? parts.join(" · ") : "Faible recouvrement avec votre profil";

  return {
    score: finalScore,
    breakdown: {
      sector: sector.score,
      skills: skills.score,
      country,
      language: language.score,
      duration: duration.score,
      contract: contract.score,
      ...(experience.fit !== null ? { experience: experience.fit } : {}),
    },
    reason,
  };
}

export function scoreOffresLocal(
  profile: ProfileFull,
  offres: ScoringInput[]
): ScoreResult[] {
  const opts = { experienceYears: getExperienceYears() };
  return offres.map((o) => scoreOffreLocal(profile, o, opts));
}
