/**
 * Analyse d'une offre face au profil : points forts, points faibles et plan
 * d'action priorisé (HIGH / MEDIUM / LOW) pour combler les écarts. Calcul
 * local et déterministe, à partir du score, des compétences demandées par
 * l'annonce (lib/scoring/tech-terms.ts) et du modèle de CV maître. Les
 * données (profil, réglages, zones) sont passées par l'appelant.
 */
import type { ProfileFull } from "@/lib/cv/types";
import type { CvTemplate } from "@/lib/cvtemplate/types";
import { hasTermIn, scoreExperience, skillAliases } from "./local";
import { TECH_TERMS, termVariants } from "./tech-terms";

export type Priority = "HIGH" | "MEDIUM" | "LOW";
export type Advice = { priority: Priority; title: string; detail: string };
export type OfferAnalysis = { strengths: string[]; weaknesses: string[]; actions: Advice[] };

export type AnalysisInput = {
  profile: ProfileFull;
  offre: { title: string; description_text: string };
  /** Détail du score enregistré (les anciens scores n'ont pas tous les critères). */
  breakdown: { sector: number; language?: number; contract?: number } | null;
  experienceYears: number;
  template: CvTemplate | null;
  /** Cluster que choisirait le modèle de CV pour cette offre. */
  cluster: { id: string; name: string } | null;
  /** Emplacements non remplis du modèle (« [N] »). */
  placeholders: number;
  /** null : aucune zone configurée. */
  inZone: boolean | null;
  zoneLabels: string[];
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const list = (xs: string[], max = 6) => (xs.length > max ? `${xs.slice(0, max).join(", ")}…` : xs.join(", "));
const PRIORITY_ORDER: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

type Requested = { label: string; variants: string[]; key: boolean };

/** Compétences techniques citées par l'annonce ; « clé » si dans l'intitulé ou citée au moins deux fois. */
export function requestedTerms(title: string, text: string): Requested[] {
  const titleN = norm(title);
  const textN = norm(text);
  const out: Requested[] = [];
  for (const entry of TECH_TERMS) {
    const variants = termVariants(entry);
    const inTitle = variants.some((v) => hasTermIn(title, titleN, v));
    const inText = variants.some((v) => hasTermIn(text, textN, v));
    if (!inTitle && !inText) continue;
    // Variante la plus citée (pas la somme : « Spring Boot » compterait aussi pour « Spring »).
    const occurrences = Math.max(
      ...variants.map((v) => {
        const re = new RegExp(`(^|[^a-z0-9+#])${norm(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9+#])`, "g");
        return textN.match(re)?.length ?? 0;
      })
    );
    out.push({ label: entry[0], variants, key: inTitle || occurrences >= 2 });
  }
  // « C++ » couvert par « C/C++ », « Linux » par « Linux embarqué » : on garde le plus précis.
  return out.filter((r) => !out.some((o) => o !== r && o.label.length > r.label.length && norm(o.label).includes(norm(r.label)) && o.key >= r.key));
}

/** Le profil couvre-t-il ce terme (« C++17 » couvre « C++ », « GCP (Cloud Run) » couvre « GCP ») ? */
function profileHas(aliases: string[], variants: string[]): boolean {
  return variants.some((v) => {
    const vn = norm(v);
    return aliases.some((a) => {
      const an = norm(a);
      return an === vn || hasTermIn(a, an, v) || (an.length >= 3 && hasTermIn(v, vn, a));
    });
  });
}

/** Tout le texte du modèle de CV (puces, profils, compétences), normalisé. */
function templateText(t: CvTemplate | null): { raw: string; norm: string } {
  if (!t) return { raw: "", norm: "" };
  const parts: string[] = [];
  for (const c of t.clusters) {
    parts.push(c.profile.fr, c.profile.en ?? "");
    for (const l of [...c.skills.fr, ...c.skills.en]) parts.push(l.items);
  }
  for (const s of t.sections) for (const e of s.entries) for (const b of e.bullets) parts.push(b.text.fr, b.text.en ?? "");
  parts.push(...t.extra_keywords);
  const raw = parts.join("\n");
  return { raw, norm: norm(raw) };
}

export function analyzeOffer(input: AnalysisInput): OfferAnalysis {
  const { profile, offre, breakdown } = input;
  const aliases = profile.skills.flatMap((s) => skillAliases(s.name));
  const requested = requestedTerms(offre.title, offre.description_text);
  const had = requested.filter((r) => profileHas(aliases, r.variants));
  const missing = requested.filter((r) => !profileHas(aliases, r.variants));
  const tpl = templateText(input.template);
  const inTemplate = (r: Requested) => !!tpl.raw && r.variants.some((v) => hasTermIn(tpl.raw, tpl.norm, v));
  const missingKnown = missing.filter(inTemplate); // dans le CV maître, pas dans le profil
  const missingKey = missing.filter((r) => r.key && !inTemplate(r));
  const missingOther = missing.filter((r) => !r.key && !inTemplate(r));
  const exp = scoreExperience(offre.title, offre.description_text, input.experienceYears);

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const actions: Advice[] = [];

  // ---------------------------------------------------------- points forts
  if (had.length) {
    const keyHad = had.filter((r) => r.key).map((r) => r.label);
    strengths.push(
      `${had.length} compétence${had.length > 1 ? "s" : ""} demandée${had.length > 1 ? "s" : ""} sur ${requested.length} dans ton profil : ${list(had.map((r) => r.label))}` +
        (keyHad.length ? ` (dont les clés : ${list(keyHad, 4)})` : "")
    );
  }
  if (breakdown && breakdown.sector >= 70) strengths.push("Le poste correspond à tes secteurs cibles.");
  if (exp.junior) strengths.push("Poste ouvert aux débutants ou jeunes diplômés.");
  else if (exp.fit === 100 && exp.required !== null) strengths.push(`Expérience demandée (${exp.required} an${exp.required > 1 ? "s" : ""}) couverte.`);
  if (input.inZone) strengths.push(`Dans tes zones de recherche (${input.zoneLabels.join(", ")}).`);
  if ((breakdown?.language ?? 0) >= 100) strengths.push("Annonce dans une langue que tu maîtrises.");
  if ((breakdown?.contract ?? 0) >= 100) strengths.push("Type de contrat recherché.");

  // -------------------------------------------------------- points faibles
  if (missingKey.length) weaknesses.push(`Compétences clés absentes de ton profil : ${list(missingKey.map((r) => r.label))}.`);
  if (missingKnown.length) weaknesses.push(`Présentes dans ton CV maître mais pas dans ton profil : ${list(missingKnown.map((r) => r.label))}.`);
  if (missingOther.length) weaknesses.push(`Autres compétences demandées non couvertes : ${list(missingOther.map((r) => r.label))}.`);
  if (exp.required !== null && exp.fit !== null && exp.fit < 100)
    weaknesses.push(`${exp.required} an${exp.required > 1 ? "s" : ""} d'expérience demandé${exp.required > 1 ? "s" : ""}, tu en déclares ${input.experienceYears}.`);
  if ((breakdown?.language ?? 100) < 50) weaknesses.push("Langue de l'annonce peu ou pas maîtrisée d'après ton profil.");
  if (input.inZone === false) weaknesses.push("En dehors de tes zones de recherche.");
  if ((breakdown?.contract ?? 50) <= 20) weaknesses.push("Type de contrat hors de tes recherches.");
  if (breakdown && breakdown.sector === 0) weaknesses.push("Hors de tes secteurs cibles.");

  // ------------------------------------------------------- plan d'action
  if (input.placeholders > 0)
    actions.push({
      priority: "HIGH",
      title: "Remplir les emplacements du modèle CV",
      detail: `${input.placeholders} texte${input.placeholders > 1 ? "s" : ""} contien${input.placeholders > 1 ? "nent" : "t"} encore « [N] » ou « [mois] » : complète-les dans Modèle CV avant d'envoyer ce dossier.`,
    });
  if (missingKnown.length)
    actions.push({
      priority: "HIGH",
      title: `Ajouter à ton profil : ${list(missingKnown.map((r) => r.label), 4)}`,
      detail: "Tu les as déjà dans ton CV maître : ajoute-les aux compétences du profil (le score les comptera) et, s'il le faut, au bloc de compétences du cluster pour qu'elles apparaissent dans le CV.",
    });
  for (const r of missingKey.slice(0, 3))
    actions.push({
      priority: "HIGH",
      title: `Compétence clé demandée : ${r.label}`,
      detail: `Si tu l'as déjà pratiquée, ajoute-la au profil et au modèle CV avec un exemple concret. Sinon, prépare un exemple proche pour l'entretien${input.template ? " et un petit projet si ce type de poste revient souvent" : ""}.`,
    });
  if (exp.required !== null && exp.fit !== null && exp.fit < 100) {
    const gap = exp.required - input.experienceYears;
    actions.push(
      gap >= 3
        ? {
            priority: "HIGH",
            title: `Écart d'expérience important (${exp.required} ans demandés)`,
            detail: "Candidature ambitieuse : mets en avant tes réalisations mesurables (en production, adoptées par une équipe), contacte directement le recruteur ou l'équipe, et privilégie en parallèle les postes junior de la même entreprise.",
          }
        : {
            priority: "MEDIUM",
            title: `Écart d'expérience modéré (${exp.required} an${exp.required > 1 ? "s" : ""} demandé${exp.required > 1 ? "s" : ""})`,
            detail: "Postule : ce critère est souvent négociable. Chiffre tes résultats (temps gagné, utilisateurs, mise en production) dans le CV et la lettre.",
          }
    );
  }
  if (missingOther.length)
    actions.push({
      priority: "MEDIUM",
      title: `Compétences secondaires : ${list(missingOther.map((r) => r.label), 4)}`,
      detail: "Mentionne celles que tu as déjà utilisées (même en projet) ; pour les autres, une phrase sur ta capacité à les prendre en main suffit en entretien.",
    });
  if ((breakdown?.language ?? 100) < 50)
    actions.push({ priority: "MEDIUM", title: "Langue de l'annonce", detail: "Vérifie le niveau attendu ; si c'est l'anglais, mets ton niveau (et une certification) en évidence et prépare une partie de l'entretien dans cette langue." });
  if (input.inZone === false)
    actions.push({ priority: "LOW", title: "Lieu du poste", detail: "Hors de tes zones : vérifie le télétravail ou ta mobilité avant d'y consacrer du temps." });
  if ((breakdown?.contract ?? 50) <= 20)
    actions.push({ priority: "LOW", title: "Type de contrat", detail: "Contrat différent de ceux que tu vises : vérifie qu'il te convient avant de postuler." });
  if (had.length || input.cluster)
    actions.push({
      priority: "LOW",
      title: "Préparer le dossier",
      detail:
        (input.cluster ? `Génère le CV (cluster ${input.cluster.id} · ${input.cluster.name}). ` : "") +
        (had.length ? `Dans la lettre, appuie-toi sur : ${list(had.filter((r) => r.key).map((r) => r.label).concat(had.filter((r) => !r.key).map((r) => r.label)), 3).replace(/…$/, "")}.` : ""),
    });
  if (breakdown && breakdown.sector === 0)
    actions.push({ priority: "LOW", title: "Secteur", detail: "Offre hors de tes secteurs cibles : si elle t'intéresse vraiment, ajoute ce secteur au profil pour mieux classer les offres similaires." });

  actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  return { strengths, weaknesses, actions: actions.slice(0, 8) };
}
