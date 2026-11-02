import { describe, expect, it } from "vitest";
import { buildDay, daysBetween, relanceDue, weekdayOf, type DayCandidature, type DayInput, type DayTask } from "@/lib/mission/today";
import { MissionPackSchema } from "@/lib/mission/pack";
import { demoPack } from "./mission-fixture";

const pack = MissionPackSchema.parse(demoPack());
const tasks: DayTask[] = pack.tasks.map((t, position) => ({
  id: t.id, title: t.title, minutes: t.minutes, window_start: t.window[0], window_end: t.window[1], priority: t.priority, category: t.category, done_at: null, position,
}));

function input(date: string, over: Partial<DayInput> = {}): DayInput {
  return { date, plan: pack.plan, tasks, habitChecks: [], candidatures: [], offers: [], recentJournal: [], ...over };
}

const offers = [1, 2, 3, 4].map((id) => ({ id, title: `Offre ${id}`, company: "Banque Exemple SA", score: 80, sector: "finance" }));

describe("plan du jour", () => {
  it("jour de semaine nominal : habitudes, tâches de la fenêtre, budget", () => {
    const d = buildDay(input("2026-11-02", { offers }));
    expect(d.weekday).toBe("mon");
    expect(d.phase).toEqual({ id: "P1", label: "Vitrine" });
    expect(d.daysToOfferDeadline).toBe(90);
    expect(d.budget).toBe(180);
    expect(d.items.map((i) => i.id)).toEqual(["H-SOIR", "T-01", "T-02"]);
    expect(d.planned).toBe(85);
    expect(d.oneThing?.id).toBe("T-01");
    // Aucune habitude « candidature » avant le 9 novembre : pas d'offres à traiter.
    expect(d.offers).toEqual([]);
  });

  it("samedi : budget du samedi, habitudes du samedi, offres à traiter seulement avec une habitude candidature", () => {
    const d = buildDay(input("2026-11-14", { offers }));
    expect(d.weekday).toBe("sat");
    expect(d.budget).toBe(480);
    expect(d.items.filter((i) => i.source === "habit").map((i) => i.id)).toEqual(["H-ALGO", "H-SOIR"]);
    expect(d.offers).toEqual([]);
    const monday = buildDay(input("2026-11-16", { offers }));
    expect(monday.offers.map((o) => o.id)).toEqual([1, 2, 3]);
  });

  it("tâche en retard : en tête des tâches, avec le nombre de jours, même au-delà du budget", () => {
    const d = buildDay(input("2026-11-05"));
    const late = d.items.find((i) => i.id === "T-01")!;
    expect(late.overdueDays).toBe(2);
    expect(d.items.map((i) => i.id)).toEqual(["H-SOIR", "T-01", "T-02", "T-03"]);
    const tight = buildDay(input("2026-11-05", { plan: { ...pack.plan, budget_minutes: { ...pack.plan.budget_minutes, thu: 30 } } }));
    expect(tight.items.map((i) => i.id)).toContain("T-01");
    expect(tight.overflow.map((i) => i.id)).toEqual(["T-02", "T-03"]);
  });

  it("dépassement du budget : le reste va dans « Si tu as du temps »", () => {
    const doneEarlier = tasks.map((t) => (t.id === "T-01" || t.id === "T-03" ? { ...t, done_at: "2026-11-03T20:00:00.000Z" } : t));
    const d = buildDay(input("2026-11-06", { tasks: doneEarlier, plan: { ...pack.plan, budget_minutes: { ...pack.plan.budget_minutes, fri: 60 } } }));
    expect(d.items.map((i) => i.id)).toEqual(["H-SOIR", "T-02"]);
    expect(d.overflow.map((i) => i.id)).toEqual(["T-04"]);
    expect(d.planned).toBeLessThanOrEqual(60);
  });

  it("jour de gel : pas de candidature, pas de relance, pas d'offre, note affichée", () => {
    const cands: DayCandidature[] = [{ id: 1, company: "ESN Démo", title: "Dev", status: "envoyee", applied_at: "2026-12-01 10:00:00", last_relance_at: null, relance_count: 0 }];
    const allDone = tasks.map((t) => ({ ...t, done_at: "2026-12-01T20:00:00.000Z" }));
    const d = buildDay(input("2026-12-21", { tasks: allDone, candidatures: cands, offers }));
    expect(d.inFreeze).toBe(true);
    expect(d.freezeNote).toBe("Recrutement à l'arrêt : préparation uniquement.");
    expect(d.items.map((i) => i.id)).toEqual(["H-ALGO", "H-SOIR"]);
    expect(d.relances).toEqual([]);
    expect(d.offers).toEqual([]);
  });

  it("dimanche : budget du dimanche, sans habitude de candidature", () => {
    const d = buildDay(input("2026-11-15", { offers }));
    expect(d.weekday).toBe("sun");
    expect(d.budget).toBe(300);
    expect(d.items.filter((i) => i.source === "habit").map((i) => i.id)).toEqual(["H-SOIR"]);
    expect(d.offers).toEqual([]);
  });

  it("mode allégé : rien coché la veille", () => {
    const d = buildDay(input("2026-11-03", { recentJournal: [{ date: "2026-11-02", done: [], energy: 4 }] }));
    expect(d.notice).toBe("Hier, rien n'a été coché : la journée se limite à l'essentiel.");
    expect(d.items.every((i) => i.source === "habit" || i.priority === 1)).toBe(true);
    expect(d.overflow.map((i) => i.id)).toContain("T-03");
  });

  it("mode allégé : énergie basse deux soirs de suite", () => {
    const d = buildDay(input("2026-11-04", { recentJournal: [
      { date: "2026-11-03", done: ["T-02"], energy: 2 },
      { date: "2026-11-02", done: ["T-01"], energy: 1 },
    ] }));
    expect(d.notice).toBe("Énergie basse deux soirs de suite : journée allégée.");
    const normal = buildDay(input("2026-11-04", { recentJournal: [
      { date: "2026-11-03", done: ["T-02"], energy: 3 },
      { date: "2026-11-02", done: ["T-01"], energy: 1 },
    ] }));
    expect(normal.notice).toBeUndefined();
  });

  it("relances : cas limites à 6, 7 et 8 jours, dernière relance, au plus 5", () => {
    const c = (id: number, applied: string, last: string | null = null, status = "envoyee"): DayCandidature => ({ id, company: "Banque Exemple SA", title: "Dev", status, applied_at: applied, last_relance_at: last, relance_count: last ? 1 : 0 });
    const date = "2026-11-20";
    expect(relanceDue(c(1, "2026-11-14 18:00:00"), date)).toBe(false); // 6 jours
    expect(relanceDue(c(2, "2026-11-13 08:00:00"), date)).toBe(true); // 7 jours
    expect(relanceDue(c(3, "2026-11-12"), date)).toBe(true); // 8 jours
    expect(relanceDue(c(4, "2026-11-01", "2026-11-14 09:00:00"), date)).toBe(false); // relancée il y a 6 jours
    expect(relanceDue(c(5, "2026-11-01", "2026-11-13"), date)).toBe(true); // relancée il y a 7 jours
    expect(relanceDue(c(6, "2026-11-01", null, "entretien"), date)).toBe(false);
    const many = Array.from({ length: 8 }, (_, i) => c(10 + i, `2026-11-0${i + 1}`));
    const d = buildDay(input(date, { candidatures: many }));
    expect(d.relances).toHaveLength(5);
    expect(d.relances[0]).toMatchObject({ source: "relance", candidatureId: 10, minutes: 10 });
    expect(d.items.filter((i) => i.source === "relance")).toHaveLength(5);
  });

  it("aucun plan : sortie vide, sans erreur", () => {
    const d = buildDay({ date: "2026-11-02", plan: null, tasks: [], habitChecks: [], candidatures: [], offers: [], recentJournal: [] });
    expect(d).toMatchObject({ budget: 0, planned: 0, items: [], overflow: [], relances: [], offers: [], phase: null });
    expect(d.oneThing).toBeUndefined();
  });

  it("cases cochées : habitude et tâche du jour restent visibles, cochées", () => {
    const done = tasks.map((t) => (t.id === "T-01" ? { ...t, done_at: "2026-11-02T19:00:00.000Z" } : t.id === "T-02" ? { ...t, done_at: "2026-11-01T10:00:00.000Z" } : t));
    const d = buildDay(input("2026-11-02", { tasks: done, habitChecks: ["H-SOIR"] }));
    expect(d.items.find((i) => i.id === "H-SOIR")!.done).toBe(true);
    expect(d.items.find((i) => i.id === "T-01")!.done).toBe(true);
    expect(d.items.map((i) => i.id)).not.toContain("T-02");
  });

  it("outils de dates", () => {
    expect(weekdayOf("2026-11-02")).toBe("mon");
    expect(weekdayOf("2026-11-08")).toBe("sun");
    expect(daysBetween("2026-11-02", "2027-01-31")).toBe(90);
  });
});
