/**
 * Exigences d'une offre et couverture par le profil — base commune du score
 * (lib/scoring/local.ts) et de l'analyse (lib/scoring/analysis.ts), pour que
 * les deux disent toujours la même chose. Sans dépendance serveur.
 *
 * Exigences = termes techniques du dictionnaire (tech-terms.ts) cités par
 * l'annonce + compétences du profil qu'elle cite (« AVL PUMA », absent du
 * dictionnaire). Importance :
 *   clé (poids 3)        intitulé, citée au moins deux fois, ou « indispensable /
 *                        requis / maîtrise de / required / must »
 *   normale (poids 1)
 *   souhaitée (poids 0,5) seulement « un plus / apprécié / nice to have / bonus »
 */
import { CASE_SENSITIVE, TECH_TERMS, termVariants } from "./tech-terms";

export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsTerm(normText: string, term: string): boolean {
  const t = normalize(term).trim();
  if (t.length < 2) return false;
  return new RegExp(`(^|[^a-z0-9+#])${escapeRegex(t)}(?=$|[^a-z0-9+#])`).test(normText);
}

/**
 * Terme dans le texte. Les sigles qui sont aussi des mots courants (« CAN » / « can »,
 * « REST » / « rest ») sont cherchés tels quels dans le texte brut, casse comprise.
 */
export function hasTermIn(raw: string, norm: string, term: string): boolean {
  if (CASE_SENSITIVE.has(term.trim())) {
    return new RegExp(`(^|[^A-Za-z0-9+#])${escapeRegex(term.trim())}(?=$|[^A-Za-z0-9+#])`).test(raw);
  }
  return containsTerm(norm, term);
}

/**
 * Formes d'une compétence : « IA générative (Generative AI) » → « IA générative »,
 * « Generative AI » ; « IA explicable (XAI, LIME, SHAP) » → les quatre. Le nom
 * entier n'apparaît presque jamais tel quel dans une annonce.
 */
export function skillAliases(name: string): string[] {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name.trim());
  if (!m || !m[1].trim()) return [name.trim()];
  return [m[1].trim(), ...m[2].split(",").map((s) => s.trim())].filter((s) => s.length >= 2);
}

export type Importance = "key" | "normal" | "nice";
export const IMPORTANCE_WEIGHT: Record<Importance, number> = { key: 3, normal: 1, nice: 0.5 };

export type Requirement = { label: string; variants: string[]; importance: Importance; covered: boolean };

const OPTIONAL = /\b(un plus|serait un plus|est un plus|apprecie|appreciee|appreciees|apprecies|souhaite|souhaitee|souhaitable|idealement|bonus|nice to have|a plus|is a plus|preferred|appreciated|optionnel|optional)\b/;
const REQUIRED = /\b(indispensable|obligatoire|requis|requise|exige|exigee|imperati(f|ve)|maitrise de|maitrise du|maitrise des|maitriser|must|required|mandatory|strong (knowledge|experience|skills))\b/;

/** Positions (dans le texte normalisé) où apparaît l'une des variantes. */
function positions(raw: string, norm: string, variants: string[]): number[] {
  const out: number[] = [];
  for (const v of variants) {
    const cs = CASE_SENSITIVE.has(v.trim());
    const re = cs
      ? new RegExp(`(^|[^A-Za-z0-9+#])${escapeRegex(v.trim())}(?=$|[^A-Za-z0-9+#])`, "g")
      : new RegExp(`(^|[^a-z0-9+#])${escapeRegex(normalize(v).trim())}(?=$|[^a-z0-9+#])`, "g");
    if (!cs && normalize(v).trim().length < 2) continue;
    for (const m of (cs ? raw : norm).matchAll(re)) out.push((m.index ?? 0) + m[1].length);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Phrase autour d'une position (texte normalisé, même longueur que le brut). */
function sentenceAt(norm: string, pos: number): string {
  const start = Math.max(norm.lastIndexOf(".", pos), norm.lastIndexOf("\n", pos), norm.lastIndexOf(";", pos), 0);
  const ends = [".", "\n", ";"].map((c) => norm.indexOf(c, pos)).filter((i) => i !== -1);
  const end = ends.length ? Math.min(...ends) : norm.length;
  return norm.slice(start, end);
}

function importanceOf(title: string, text: string, variants: string[]): Importance | null {
  const titleN = normalize(title);
  const textN = normalize(text);
  const inTitle = variants.some((v) => hasTermIn(title, titleN, v));
  const pos = positions(text, textN, variants);
  if (!inTitle && !pos.length) return null;
  if (inTitle) return "key";
  const sentences = pos.map((p) => sentenceAt(textN, p));
  if (sentences.some((s) => REQUIRED.test(s))) return "key";
  if (sentences.every((s) => OPTIONAL.test(s))) return "nice";
  // Citée dans deux phrases distinctes : clé. Deux variantes dans la même phrase
  // (« pgvector (base vectorielle) ») restent une seule mention.
  return new Set(sentences).size >= 2 ? "key" : "normal";
}

/** Le profil couvre-t-il ce terme (« C++17 » couvre « C++ », « GCP (Cloud Run) » couvre « GCP ») ? */
export function profileCovers(aliases: string[], variants: string[]): boolean {
  return variants.some((v) => {
    const vn = normalize(v);
    return aliases.some((a) => {
      const an = normalize(a);
      return an === vn || hasTermIn(a, an, v) || (an.length >= 3 && hasTermIn(v, vn, a));
    });
  });
}

export type Coverage = {
  requirements: Requirement[];
  /** Part pondérée des exigences couvertes (0-1), null si l'offre ne cite aucune exigence repérable. */
  ratio: number | null;
  weightTotal: number;
  missingKey: Requirement[];
};

export function offerCoverage(skillNames: string[], title: string, text: string): Coverage {
  const aliases = skillNames.flatMap(skillAliases);
  const reqs: Requirement[] = [];
  const seen = new Set<string>();
  for (const entry of TECH_TERMS) {
    const variants = termVariants(entry);
    const importance = importanceOf(title, text, variants);
    if (!importance) continue;
    reqs.push({ label: entry[0], variants, importance, covered: profileCovers(aliases, variants) });
    for (const v of variants) seen.add(normalize(v));
  }
  // Compétences du profil citées par l'offre mais absentes du dictionnaire (« AVL PUMA »).
  for (const name of skillNames) {
    const forms = skillAliases(name);
    if (forms.some((f) => seen.has(normalize(f)))) continue;
    const importance = importanceOf(title, text, forms);
    if (!importance) continue;
    reqs.push({ label: forms[0], variants: forms, importance, covered: true });
    for (const f of forms) seen.add(normalize(f));
  }
  // « C++ » couvert par « C/C++ », « Linux » par « Linux embarqué » : on garde le plus précis.
  const requirements = reqs.filter(
    (r) => !reqs.some((o) => o !== r && o.label.length > r.label.length && normalize(o.label).includes(normalize(r.label)) && o.covered === r.covered)
  );
  const weightTotal = requirements.reduce((n, r) => n + IMPORTANCE_WEIGHT[r.importance], 0);
  const weightCovered = requirements.filter((r) => r.covered).reduce((n, r) => n + IMPORTANCE_WEIGHT[r.importance], 0);
  return {
    requirements,
    ratio: weightTotal > 0 ? weightCovered / weightTotal : null,
    weightTotal,
    missingKey: requirements.filter((r) => r.importance === "key" && !r.covered),
  };
}
