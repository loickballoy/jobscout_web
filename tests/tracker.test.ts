import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { archiveStaleCandidatures, createCandidature, getWeeklyGoal, listCandidatures, setWeeklyGoal, updateCandidature } from "@/lib/db/candidatures";
import { funnel, nextStep, sentThisWeek, weekStart } from "@/lib/tracker-stats";

beforeEach(() => {
  getDb().exec("DELETE FROM candidature_events; DELETE FROM candidatures;");
});

describe("entonnoir et semaine", () => {
  const rows = [
    { status: "envoyee", applied_at: "2026-10-20 12:00:00" },
    { status: "refusee", applied_at: "2026-10-01 12:00:00" },
    { status: "refusee", applied_at: "2026-10-01 12:00:00", reached_interview: 1 }, // entretien puis refus
    { status: "entretien", applied_at: "2026-10-02 12:00:00" },
    { status: "archivee", applied_at: "2026-09-01 12:00:00" },
    { status: "en_cours", applied_at: "2026-10-26 12:00:00" }, // pas encore envoyée
  ];

  it("compte chaque étape, entretien conservé après un refus", () => {
    const steps = funnel(rows);
    expect(steps.map((s) => [s.id, s.count])).toEqual([["sent", 5], ["replies", 3], ["interviews", 2], ["offers", 0]]);
    expect(steps[2].rate).toBeCloseTo(0.4);
    expect(nextStep(steps)).toBe("offers");
    expect(nextStep(funnel([]))).toBe("sent");
  });

  it("semaine du lundi au dimanche, candidatures envoyées seulement", () => {
    const now = new Date(2026, 9, 26, 10); // lundi 26 octobre 2026
    expect(weekStart(new Date(2026, 9, 31)).getDate()).toBe(26); // samedi → lundi 26
    expect(weekStart(now).getDate()).toBe(26);
    const week = [
      { status: "envoyee", applied_at: "2026-10-26 09:00:00" },
      { status: "refusee", applied_at: "2026-10-27 09:00:00" },
      { status: "envoyee", applied_at: "2026-10-25 23:00:00" }, // dimanche précédent
      { status: "en_cours", applied_at: "2026-10-26 09:00:00" },
    ];
    expect(sentThisWeek(week, new Date(2026, 9, 28))).toBe(2);
  });
});

describe("historique des statuts", () => {
  it("entretien puis refus : toujours compté comme entretien ; date d'acceptation retenue", () => {
    const a = createCandidature({ offre_id: null, ext_company: "A", status: "envoyee" });
    updateCandidature(a, { status: "entretien" });
    updateCandidature(a, { status: "refusee" });
    const b = createCandidature({ offre_id: null, ext_company: "B", status: "envoyee" });
    updateCandidature(b, { status: "acceptee" });
    updateCandidature(b, { offer_salary: "48 k€", offer_start: "2027-02-01" });
    const c = createCandidature({ offre_id: null, ext_company: "C", status: "envoyee" });
    const byCompany = new Map(listCandidatures().map((r) => [r.ext_company, r]));
    expect(byCompany.get("A")!.reached_interview).toBe(1);
    expect(byCompany.get("A")!.accepted_at).toBeNull();
    expect(byCompany.get("B")!.accepted_at).not.toBeNull();
    expect(byCompany.get("B")!.offer_salary).toBe("48 k€");
    expect(byCompany.get("B")!.offer_start).toBe("2027-02-01");
    expect(byCompany.get("C")!.reached_interview).toBe(0);
    // Même statut renvoyé : pas d'événement en double.
    updateCandidature(c, { status: "envoyee" });
    const events = getDb().prepare("SELECT status FROM candidature_events WHERE candidature_id = ? ORDER BY id").all(c) as { status: string }[];
    expect(events.map((e) => e.status)).toEqual(["envoyee"]);
  });

  it("l'archivage automatique est tracé", () => {
    const id = createCandidature({ offre_id: null, ext_company: "Old", applied_at: "2026-01-01 12:00:00", status: "envoyee" });
    expect(archiveStaleCandidatures(14, new Date("2026-10-26T09:00:00Z"))).toBe(1);
    const events = getDb().prepare("SELECT status FROM candidature_events WHERE candidature_id = ? ORDER BY id").all(id) as { status: string }[];
    expect(events.map((e) => e.status)).toEqual(["envoyee", "archivee"]);
  });

  it("objectif hebdomadaire : 10 par défaut, borné", () => {
    getDb().exec("DELETE FROM settings WHERE key = 'weekly_goal'");
    expect(getWeeklyGoal()).toBe(10);
    expect(setWeeklyGoal(15)).toBe(15);
    expect(getWeeklyGoal()).toBe(15);
    expect(setWeeklyGoal(0)).toBe(1);
  });
});
