import { beforeEach, describe, expect, it } from "vitest";
import { computeAudit, diagnose, type AuditCandidature, type AuditInput } from "@/lib/mission/audit";
import { MissionPackSchema } from "@/lib/mission/pack";
import { parseCvTemplate } from "@/lib/cvtemplate/types";
import { getDb } from "@/lib/db";
import { createCandidature, listCandidatures } from "@/lib/db/candidatures";
import { importMissionPack, getJournalEntry, listMissionTasks, resetMission } from "@/lib/mission/store";
import { saveDebrief } from "@/lib/mission/debrief";
import { demoPack } from "./mission-fixture";

const plan = MissionPackSchema.parse(demoPack()).plan;
const TEMPLATE = (() => {
  const r = parseCvTemplate({
    version: 1,
    identity: { full_name: "Jean Test", contact: ["jean.test@example.com"], taglines: [] },
    clusters: ["E", "F"].map((id) => ({
      id, name: `Cluster ${id}`, headline: { fr: `Titre ${id}`, en: `Title ${id}` }, profile: { fr: `Profil ${id}`, en: `Profile ${id}` },
      order: ["experience"], skills: { fr: [{ label: "Outils", items: "Python" }], en: [{ label: "Tools", items: "Python" }] },
    })),
    sections: [{ id: "experience", title: { fr: "Expérience", en: "Experience" }, entries: [{ id: "x", heading: { fr: "ESN Démo", en: "ESN Démo" }, bullets: [
      { id: "B1", clusters: ["E"], text: { fr: "Chatbot IA générative", en: "GenAI chatbot" } },
      { id: "B2", clusters: ["F"], text: { fr: "Moteur d'appariement", en: "Matching engine" } },
    ] }] }],
  });
  if (!r.ok) throw new Error(r.errors.join(";"));
  return r.template;
})();

const cand = (over: Partial<AuditCandidature> = {}): AuditCandidature => ({
  applied_at: "2026-11-18", status: "envoyee", reached_interview: false, response_stage: null, offer_sector: "finance", has_offer: true, last_relance_at: null, ...over,
});

function input(over: Partial<AuditInput> = {}): AuditInput {
  return {
    date: "2026-11-20", template: TEMPLATE, placeholders: 0, missingEnglish: 0,
    config: { forbidden_terms: [{ cluster: "F", terms: ["IA générative", "chatbot"] }, { cluster: "Z", terms: ["x"] }], manual: [{ id: "li", label: "LinkedIn", done_at: null }] },
    plan, targetSectors: ["finance", "conseil"], candidatures: [], ...over,
  };
}
const item = (r: ReturnType<typeof computeAudit>, id: string) => r.items.find((i) => i.id === id)!;

describe("audit du dossier", () => {
  it("termes interdits : absent du cluster F (la puce E ne compte pas), présent, cluster inexistant", () => {
    const r = computeAudit(input());
    expect(item(r, "cv-forbidden-F").status).toBe("ok");
    expect(item(r, "cv-forbidden-Z").status).toBe("na");
    const t = structuredClone(TEMPLATE);
    t.sections[0].entries[0].bullets[0].clusters.push("F");
    const bad = computeAudit(input({ template: t }));
    expect(item(bad, "cv-forbidden-F")).toMatchObject({ status: "ko", detail: "Présent : IA générative, chatbot." });
  });

  it("règles du CV et score réussis / évalués", () => {
    const r = computeAudit(input({ placeholders: 3, missingEnglish: 0 }));
    expect(item(r, "cv-template").status).toBe("ok");
    expect(item(r, "cv-placeholders").status).toBe("ko");
    expect(item(r, "cv-english").status).toBe("ok");
    const noTpl = computeAudit(input({ template: null }));
    expect(item(noTpl, "cv-template").status).toBe("ko");
    expect(item(noTpl, "cv-placeholders").status).toBe("na");
    expect(r.total).toBe(r.items.filter((i) => i.status !== "na").length);
    expect(r.score).toBe(r.items.filter((i) => i.status === "ok").length);
  });

  it("seuils non évaluables : moins de 20 candidatures, aucune candidature liée, gel", () => {
    const r = computeAudit(input());
    expect(item(r, "tunnel-response").status).toBe("na");
    expect(item(r, "tunnel-interview").status).toBe("na");
    expect(item(r, "tunnel-sector").status).toBe("na");
    expect(item(r, "tunnel-volume").status).toBe("ko");
    expect(item(computeAudit(input({ date: "2026-12-24" })), "tunnel-volume").status).toBe("na");
  });

  it("tunnel : volume, secteur, taux de réponse, entretien, relances en retard", () => {
    const week = Array.from({ length: 5 }, () => cand());
    const old = Array.from({ length: 20 }, (_, i) => cand({ applied_at: "2026-10-01", status: i < 3 ? "refusee" : "archivee" }));
    const r = computeAudit(input({ candidatures: [...week, ...old, cand({ offer_sector: "autre" })] }));
    expect(item(r, "tunnel-volume").status).toBe("ok");
    expect(item(r, "tunnel-sector")).toMatchObject({ status: "ko", detail: "1 hors des secteurs visés." });
    expect(item(r, "tunnel-response").status).toBe("ok"); // 3 / 20 = 15 %
    expect(item(r, "tunnel-interview").status).toBe("ko");
    const late = computeAudit(input({ candidatures: [cand({ applied_at: "2026-11-05" })] }));
    expect(item(late, "tunnel-relances").status).toBe("ko"); // due le 12, 8 jours de retard
    const fresh = computeAudit(input({ candidatures: [cand({ applied_at: "2026-11-11" })] }));
    expect(item(fresh, "tunnel-relances").status).toBe("ok"); // due le 18, 2 jours
  });

  it("diagnostic selon le tunnel", () => {
    const n = (k: number, over: Partial<AuditCandidature> = {}) => Array.from({ length: k }, () => cand(over));
    expect(diagnose(n(5), plan)).toBe("Pas encore assez de candidatures pour conclure (5 / 10).");
    expect(diagnose(n(12), plan)).toBe("Le blocage est en amont : CV ou ciblage.");
    expect(diagnose([...n(9), ...n(3, { status: "refusee", reached_interview: true, response_stage: "recruteur" })], plan)).toBe("Le blocage est en entretien : préparation technique.");
    expect(diagnose([...n(9), ...n(3, { status: "refusee", reached_interview: true, response_stage: "final" })], plan)).toBe("Le blocage est au dernier tour : récit et motivation.");
    expect(diagnose([...n(9), ...n(2, { status: "refusee", response_stage: "final", reached_interview: true }), cand({ status: "acceptee", reached_interview: true })], plan)).toBe("Le tunnel fonctionne : continue au même rythme.");
  });
});

describe("débrief du soir", () => {
  beforeEach(() => {
    resetMission();
    getDb().exec("DELETE FROM candidature_events; DELETE FROM candidatures;");
  });

  it("coche les éléments, enregistre les réponses avec historique, renvoie demain et le fait du jour", () => {
    importMissionPack(demoPack());
    const id = createCandidature({ offre_id: null, ext_company: "Banque Exemple SA", ext_title: "Développeur", applied_at: "2026-11-02 08:00:00" });
    const r = saveDebrief("2026-11-02", { done: ["T-01", "H-SOIR"], responses: [{ candidature_id: id, stage: "technique", outcome: "suite" }], energy: 4, blocker: null, tomorrow: "T-03", notes: null, weekly_review: null }, new Date("2026-11-02T20:00:00Z"));
    expect(listMissionTasks().find((t) => t.id === "T-01")!.done_at).toBeTruthy();
    const c = listCandidatures().find((x) => x.id === id)!;
    expect(c).toMatchObject({ status: "entretien", response_stage: "technique", reached_interview: 1 });
    expect(r.fact).toBe("Tâche prioritaire terminée : Rendre public le projet démo");
    expect(r.tomorrow.map((i) => i.id)).toEqual(["T-02", "T-03", "H-SOIR"]);
    expect(getJournalEntry("2026-11-02")).toMatchObject({ energy: 4, done: ["T-01", "H-SOIR"] });
    // Réenregistrer en décochant : la tâche redevient à faire.
    saveDebrief("2026-11-02", { done: ["H-SOIR"], responses: [], energy: 4, blocker: null, tomorrow: null, notes: null, weekly_review: null }, new Date("2026-11-02T21:00:00Z"));
    expect(listMissionTasks().find((t) => t.id === "T-01")!.done_at).toBeNull();
  });
});
