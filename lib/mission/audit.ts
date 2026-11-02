/**
 * Audit du dossier de candidature (onglet Profil de la Mission). Fonction pure : les
 * données sont chargées par lib/mission/audit-run.ts. Chaque critère vaut un point :
 * réussi, à corriger, ou non évaluable (exclu du total). Le diagnostic porte sur le
 * dossier et le tunnel, jamais sur la personne.
 */
import type { CvTemplate } from "@/lib/cvtemplate/types";
import type { AuditConfig, Plan } from "./pack";
import { RELANCE_AFTER_DAYS, addDays, daysBetween } from "./today";

export type AuditStatus = "ok" | "ko" | "na";
export type AuditGroup = "cv" | "tunnel" | "vitrine";
export type AuditItem = { id: string; group: AuditGroup; label: string; status: AuditStatus; detail?: string; manual?: boolean; done_at?: string | null };
export type AuditResult = { score: number; total: number; items: AuditItem[]; diagnostic: string };

export const AUDIT_GROUP_LABELS: Record<AuditGroup, string> = { cv: "CV", tunnel: "Tunnel", vitrine: "Vitrine" };

export type AuditCandidature = {
  applied_at: string | null;
  status: string;
  reached_interview: boolean;
  response_stage: string | null;
  /** Secteur de l'offre liée, null sans offre liée. */
  offer_sector: string | null;
  has_offer: boolean;
  last_relance_at: string | null;
};

export type AuditInput = {
  date: string;
  template: CvTemplate | null;
  placeholders: number;
  missingEnglish: number;
  config: AuditConfig;
  plan: Plan | null;
  targetSectors: string[];
  candidatures: AuditCandidature[];
};

const fold = (s: string) => ` ${s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+#]+/g, " ").trim()} `;

/** Textes qu'un cluster peut rendre : titre, profil, compétences, puces qui le servent, entrées de ses sections, en-tête. */
export function clusterTexts(t: CvTemplate, clusterId: string): string[] | null {
  const c = t.clusters.find((x) => x.id === clusterId);
  if (!c) return null;
  const loc = (l?: { fr: string; en?: string }) => (l ? [l.fr, l.en ?? ""] : []);
  const out = [
    t.identity.full_name, ...t.identity.contact, ...t.identity.taglines.flatMap((g) => loc(g.text)),
    ...loc(c.headline), ...loc(c.profile),
    ...[...c.skills.fr, ...c.skills.en].flatMap((s) => [s.label, s.items]),
  ];
  for (const s of t.sections) {
    if (!c.order.includes(s.id)) continue;
    out.push(...loc(s.title));
    for (const e of s.entries) {
      out.push(...loc(e.heading), ...loc(e.meta), ...loc(e.sub));
      for (const b of e.bullets) if (b.clusters.includes("*") || b.clusters.includes(c.id)) out.push(...loc(b.text));
    }
  }
  return out.filter(Boolean);
}

const REPLIED = new Set(["refusee", "entretien", "acceptee"]);
const replied = (c: AuditCandidature) => REPLIED.has(c.status) || c.reached_interview;
const sent = (c: AuditCandidature) => c.status !== "en_cours" && !!c.applied_at;

export function computeAudit(input: AuditInput): AuditResult {
  const { date, template, plan, config } = input;
  const items: AuditItem[] = [];
  const add = (id: string, group: AuditGroup, label: string, status: AuditStatus, detail?: string) => items.push({ id, group, label, status, ...(detail ? { detail } : {}) });

  // ------------------------------------------------------------------ CV
  add("cv-template", "cv", "Un modèle de CV existe", template ? "ok" : "ko", template ? undefined : "Importez votre modèle dans Modèle CV.");
  add("cv-placeholders", "cv", "Aucun crochet restant dans le modèle", !template ? "na" : input.placeholders === 0 ? "ok" : "ko",
    template && input.placeholders ? `${input.placeholders} texte${input.placeholders > 1 ? "s" : ""} à compléter dans Modèle CV.` : undefined);
  add("cv-english", "cv", "Version anglaise complète", !template ? "na" : input.missingEnglish === 0 ? "ok" : "ko",
    template && input.missingEnglish ? `${input.missingEnglish} texte${input.missingEnglish > 1 ? "s" : ""} sans anglais.` : undefined);
  for (const rule of config.forbidden_terms) {
    const label = `Cluster ${rule.cluster} : aucun terme à éviter`;
    const texts = template ? clusterTexts(template, rule.cluster) : null;
    if (!texts) {
      add(`cv-forbidden-${rule.cluster}`, "cv", label, "na", template ? `Le cluster ${rule.cluster} n'existe pas dans le modèle.` : undefined);
      continue;
    }
    const hay = fold(texts.join(" \n "));
    const found = rule.terms.filter((term) => fold(term).trim() && hay.includes(fold(term)));
    add(`cv-forbidden-${rule.cluster}`, "cv", label, found.length ? "ko" : "ok", found.length ? `Présent : ${found.join(", ")}.` : undefined);
  }

  // ------------------------------------------------------------------ tunnel
  const inFreeze = !!plan?.freeze && plan.freeze.from <= date && date <= plan.freeze.to;
  const weekStart = addDays(date, -6);
  const lastWeek = input.candidatures.filter((c) => sent(c) && c.applied_at!.slice(0, 10) >= weekStart && c.applied_at!.slice(0, 10) <= date);
  const goal = plan?.kpi_weekly.candidatures_ciblees ?? 0;
  add("tunnel-volume", "tunnel", `Au moins ${goal} candidatures sur les 7 derniers jours`, inFreeze || !plan ? "na" : lastWeek.length >= goal ? "ok" : "ko",
    plan && !inFreeze ? `${lastWeek.length} sur 7 jours.` : inFreeze ? "Période de gel." : undefined);

  const linked = lastWeek.filter((c) => c.has_offer);
  const offTarget = linked.filter((c) => !c.offer_sector || c.offer_sector === "autre" || !input.targetSectors.includes(c.offer_sector));
  add("tunnel-sector", "tunnel", "Candidatures des 7 derniers jours dans un secteur visé", !linked.length ? "na" : offTarget.length ? "ko" : "ok",
    offTarget.length ? `${offTarget.length} hors des secteurs visés.` : undefined);

  const old = input.candidatures.filter((c) => sent(c) && daysBetween(c.applied_at!, date) > 14);
  const threshold = plan?.diagnostic.min_response_rate ?? 0.1;
  const rate = old.length ? old.filter(replied).length / old.length : 0;
  add("tunnel-response", "tunnel", `Taux de réponse d'au moins ${Math.round(threshold * 100)} % (candidatures de plus de 14 jours)`,
    old.length < 20 ? "na" : rate >= threshold ? "ok" : "ko", old.length < 20 ? `${old.length} / 20 candidatures nécessaires.` : `${Math.round(rate * 100)} %.`);

  const sentAll = input.candidatures.filter(sent).sort((a, b) => b.applied_at!.localeCompare(a.applied_at!));
  const last20 = sentAll.slice(0, 20);
  add("tunnel-interview", "tunnel", "Au moins un entretien parmi les 20 dernières candidatures", last20.length < 20 ? "na" : last20.some((c) => c.reached_interview) ? "ok" : "ko",
    last20.length < 20 ? `${last20.length} / 20 candidatures nécessaires.` : undefined);

  const lateRelances = input.candidatures.filter((c) => {
    if (c.status !== "envoyee" || !c.applied_at) return false;
    const due = [addDays(c.applied_at.slice(0, 10), RELANCE_AFTER_DAYS), c.last_relance_at ? addDays(c.last_relance_at.slice(0, 10), RELANCE_AFTER_DAYS) : ""].sort().pop()!;
    return daysBetween(due, date) > 3;
  });
  add("tunnel-relances", "tunnel", "Aucune relance due depuis plus de 3 jours", lateRelances.length ? "ko" : "ok",
    lateRelances.length ? `${lateRelances.length} relance${lateRelances.length > 1 ? "s" : ""} en attente.` : undefined);

  // ------------------------------------------------------------------ vitrine (manuel)
  for (const m of config.manual) items.push({ id: `manual-${m.id}`, group: "vitrine", label: m.label, status: m.done_at ? "ok" : "ko", manual: true, done_at: m.done_at ?? null });

  const evaluated = items.filter((i) => i.status !== "na");
  return { score: evaluated.filter((i) => i.status === "ok").length, total: evaluated.length, items, diagnostic: diagnose(sentAll, plan) };
}

/** Une phrase sur le tunnel, une fois assez de candidatures envoyées. */
export function diagnose(sentAll: AuditCandidature[], plan: Plan | null): string {
  const min = plan?.diagnostic.min_candidatures ?? 40;
  if (sentAll.length < min) return `Pas encore assez de candidatures pour conclure (${sentAll.length} / ${min}).`;
  const rate = sentAll.filter(replied).length / sentAll.length;
  if (rate < (plan?.diagnostic.min_response_rate ?? 0.1)) return "Le blocage est en amont : CV ou ciblage.";
  const interviews = sentAll.filter((c) => c.reached_interview);
  const advanced = sentAll.filter((c) => c.response_stage === "technique" || c.response_stage === "final");
  if (interviews.length && !advanced.length) return "Le blocage est en entretien : préparation technique.";
  const finals = sentAll.filter((c) => c.response_stage === "final");
  if (finals.length && !sentAll.some((c) => c.status === "acceptee")) return "Le blocage est au dernier tour : récit et motivation.";
  return "Le tunnel fonctionne : continue au même rythme.";
}
