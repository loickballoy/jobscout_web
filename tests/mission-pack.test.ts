import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import {
  exportMissionPack, getAuditConfig, getMissionPlan, importMissionPack, listMissionTargets, listMissionTasks,
  recordRelance, resetMission, setManualAuditItem, updateMissionTarget, updateMissionTask,
} from "@/lib/mission/store";
import { createCandidature, listCandidatures } from "@/lib/db/candidatures";
import { funnel } from "@/lib/tracker-stats";
import { upsertOffreFromSource, getOffre } from "@/lib/db/offres";
import { demoPack } from "./mission-fixture";

function state() {
  return { tasks: listMissionTasks(), targets: listMissionTargets().map(({ updated_at: _u, ...t }) => t), plan: getMissionPlan(), audit: getAuditConfig() };
}

beforeEach(() => {
  resetMission();
  getDb().exec("DELETE FROM candidature_events; DELETE FROM candidatures; DELETE FROM documents; DELETE FROM offres;");
});

describe("pack de Mission", () => {
  it("import d'un pack fictif", () => {
    const r = importMissionPack(demoPack());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.tasks.created).toEqual(["T-01", "T-02", "T-03", "T-04", "T-05"]);
    expect(r.summary.targets.created).toEqual(["Banque Exemple SA", "ESN Démo"]);
    expect(r.summary.audit.created).toEqual(["linkedin"]);
    expect(r.summary.plan).toBe("créé");
    expect(getMissionPlan()?.plan.offer_deadline).toBe("2027-01-31");
    expect(listMissionTargets().find((t) => t.company === "Banque Exemple SA")).toMatchObject({ company_key: "banque exemple", sector: "finance", cv_cluster: "F" });
  });

  it("réimport idempotent : même état, tout inchangé", () => {
    importMissionPack(demoPack());
    const before = state();
    const r = importMissionPack(demoPack());
    expect(r.ok && r.summary.tasks.unchanged.length).toBe(5);
    expect(r.ok && r.summary.targets.unchanged.length).toBe(2);
    expect(r.ok && r.summary.plan).toBe("remplacé");
    expect(state()).toEqual(before);
  });

  it("conserve les cases cochées et ce que l'utilisateur a saisi", () => {
    importMissionPack(demoPack());
    updateMissionTask("T-01", { done: true });
    setManualAuditItem("linkedin", true);
    const bank = listMissionTargets().find((t) => t.company === "Banque Exemple SA")!;
    updateMissionTarget(bank.id, { status: "contacte", contact: "Jean Test", notes: "Appelé lundi" });
    const pack = demoPack();
    pack.tasks[0].title = "Rendre public le projet démo (README)";
    pack.targets[0] = { ...pack.targets[0], status: "a_contacter", contact: "Autre contact", next: "Relancer" };
    pack.audit.manual[0].label = "Profil LinkedIn relu";
    const r = importMissionPack(pack);
    expect(r.ok && r.summary.tasks.updated).toEqual(["T-01"]);
    const t1 = listMissionTasks().find((t) => t.id === "T-01")!;
    expect(t1.title).toBe("Rendre public le projet démo (README)");
    expect(t1.done_at).not.toBeNull();
    const after = listMissionTargets().find((t) => t.company === "Banque Exemple SA")!;
    expect(after).toMatchObject({ status: "contacte", contact: "Jean Test", notes: "Appelé lundi", next_action: "Relancer" });
    expect(getAuditConfig().manual[0]).toMatchObject({ label: "Profil LinkedIn relu" });
    expect(getAuditConfig().manual[0].done_at).toBeTruthy();
  });

  it("statut « à vérifier » remplacé par celui du pack ; tâche absente du pack conservée", () => {
    importMissionPack(demoPack());
    const pack = demoPack();
    pack.targets[0].status = "a_contacter";
    pack.tasks = pack.tasks.slice(1);
    importMissionPack(pack);
    expect(listMissionTargets().find((t) => t.company === "Banque Exemple SA")!.status).toBe("a_contacter");
    expect(listMissionTasks().map((t) => t.id)).toContain("T-01");
  });

  it("dryRun : résumé sans écriture", () => {
    const r = importMissionPack(demoPack(), { dryRun: true });
    expect(r.ok && r.dryRun).toBe(true);
    expect(r.ok && r.summary.tasks.created.length).toBe(5);
    expect(listMissionTasks()).toEqual([]);
    expect(getMissionPlan()).toBeNull();
  });

  it("pack invalide : erreurs lisibles (chemin et message), rien d'écrit", () => {
    const pack = demoPack() as Record<string, any>;
    pack.tasks[1].window = ["2026-11-31", "2026-11-02"];
    pack.tasks[2].priority = 7;
    pack.targets[0].sector = "assurance";
    const r = importMissionPack(pack);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.startsWith("tasks.1.window.0 : date inexistante"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("tasks.2.priority"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("targets.0.sector"))).toBe(true);
    expect(importMissionPack({ type: "autre" }).ok).toBe(false);
    expect(listMissionTasks()).toEqual([]);
  });

  it("export au format du pack : réimporté, il redonne le même état", () => {
    importMissionPack(demoPack());
    updateMissionTask("T-02", { done: true });
    const exported = exportMissionPack()!;
    expect(exported.tasks.find((t) => t.id === "T-02")!.done_at).toBeTruthy();
    const before = state();
    resetMission();
    expect(getMissionPlan()).toBeNull();
    expect(importMissionPack(JSON.parse(JSON.stringify(exported))).ok).toBe(true);
    expect(state().tasks).toEqual(before.tasks);
  });

  it("cibles importées : priment dans le classement des offres", () => {
    const id = upsertOffreFromSource("hellowork", {
      source_id: "m-1", url: "https://example.org/m/1", title: "Consultant", company: "ESN Démo SAS", country: "France", location: "Paris",
      contract_type: "CDI", salary: null, description_html: "<p>Salle des marchés, banque.</p>", description_text: "Salle des marchés, banque.",
      description_status: "ok", posted_at: "2026-10-15", is_vie: false, raw_payload: {},
    });
    expect(getOffre(id)!.sector_reason).toMatch(/^Mots-clés/);
    importMissionPack(demoPack());
    expect(getOffre(id)).toMatchObject({ sector: "conseil", sector_reason: "Entreprise cible" });
  });
});

describe("relances", () => {
  it("événement « relance » et compteur ; l'entonnoir l'ignore", () => {
    const id = createCandidature({ offre_id: null, ext_company: "Banque Exemple SA", ext_title: "Développeur", applied_at: "2026-10-20 09:00:00" });
    expect(recordRelance(id)).toBe(true);
    expect(recordRelance(id)).toBe(true);
    expect(recordRelance(99999)).toBe(false);
    const row = getDb().prepare("SELECT relance_count FROM candidatures WHERE id = ?").get(id) as { relance_count: number };
    expect(row.relance_count).toBe(2);
    const c = listCandidatures().find((x) => x.id === id)!;
    expect(c.status === "envoyee" || c.status === "archivee").toBe(true);
    expect(c.reached_interview).toBe(0);
    const steps = funnel([{ status: c.status, applied_at: c.applied_at, reached_interview: c.reached_interview }]);
    expect(steps.map((s) => s.count)).toEqual([1, 0, 0, 0]);
  });
});
