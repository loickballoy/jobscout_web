import "server-only";
import { getDb } from "@/lib/db";
import { setResponseStage, updateCandidature, type ResponseStage, type Status } from "@/lib/db/candidatures";
import { loadDay } from "./load";
import { getJournalEntry, getMissionPlan, habitChecksBetween, listJournal, saveJournalEntry, setHabitCheck, updateMissionTask, type JournalEntry, type JournalResponse } from "./store";
import { addDays, weekdayOf, type Item } from "./today";

const OUTCOME_STATUS: Record<JournalResponse["outcome"], Status> = { refus: "refusee", suite: "entretien", offre: "acceptee" };

export type DebriefInput = Omit<JournalEntry, "date">;
export type DebriefResult = { entry: JournalEntry; tomorrow: Item[]; fact: string | null };

/**
 * Débrief du soir : coche les éléments du jour (tâches et habitudes), enregistre les
 * réponses reçues (statut via updateCandidature pour garder l'historique, étape de la
 * réponse), puis l'entrée du journal. Renvoie les trois priorités de demain et le fait
 * le plus solide du jour (calcul déterministe).
 */
export function saveDebrief(date: string, input: DebriefInput, now = new Date()): DebriefResult {
  const day = loadDay(date);
  const done = new Set(input.done);
  for (const item of [...day.items, ...day.overflow]) {
    const want = done.has(item.id);
    if (item.source === "habit" && want !== item.done) setHabitCheck(item.id, date, want);
    if (item.source === "task" && want !== item.done) updateMissionTask(item.id, { done: want }, now);
  }
  for (const r of input.responses) {
    updateCandidature(r.candidature_id, { status: OUTCOME_STATUS[r.outcome] });
    setResponseStage(r.candidature_id, r.stage as ResponseStage);
  }
  const entry = saveJournalEntry({ date, ...input });
  const next = loadDay(addDays(date, 1));
  const tomorrow = [...next.items.filter((i) => i.source !== "habit"), ...next.items.filter((i) => i.source === "habit")].slice(0, 3);
  return { entry, tomorrow, fact: solidFact(date) };
}

/** Première tâche de priorité 1 terminée ce jour, sinon une candidature envoyée, sinon une habitude tenue. */
export function solidFact(date: string): string | null {
  const db = getDb();
  const task = db
    .prepare("SELECT title FROM mission_tasks WHERE priority = 1 AND done_at IS NOT NULL AND substr(done_at, 1, 10) = ? ORDER BY done_at LIMIT 1")
    .get(date) as { title: string } | undefined;
  if (task) return `Tâche prioritaire terminée : ${task.title}`;
  const cand = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(o.company), ''), c.ext_company) AS company, COALESCE(NULLIF(TRIM(o.title), ''), c.ext_title) AS title
       FROM candidatures c LEFT JOIN offres o ON o.id = c.offre_id
       WHERE c.status != 'en_cours' AND date(c.applied_at) = ? ORDER BY c.applied_at LIMIT 1`
    )
    .get(date) as { company: string | null; title: string | null } | undefined;
  if (cand) return `Candidature envoyée : ${[cand.title, cand.company].filter(Boolean).join(" · ") || "sans intitulé"}`;
  const plan = getMissionPlan()?.plan;
  const habit = habitChecksBetween(date, date)[0];
  if (habit) return `Habitude tenue : ${plan?.habits.find((h) => h.id === habit.habit_id)?.title ?? habit.habit_id}`;
  return null;
}

export type WeekFigures = {
  from: string;
  to: string;
  candidatures: number;
  messages: number;
  mocks: number;
  kpi: { candidatures_ciblees: number; messages_nommes: number; mock_interviews: number } | null;
  refusalsByStage: Record<string, number>;
};

/**
 * Chiffres de la semaine (lundi → dimanche contenant `date`) comparés aux objectifs :
 * candidatures envoyées, messages à une personne nommée (candidatures avec un contact),
 * mock interviews (habitudes cochées dont l'id ou le titre contient « mock »),
 * refus par étape (réponses notées dans les débriefs de la semaine).
 */
export function weekFigures(date: string): WeekFigures {
  const offset = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(weekdayOf(date));
  const from = addDays(date, -offset);
  const to = addDays(from, 6);
  const db = getDb();
  const sent = db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(contact IS NOT NULL AND trim(contact) != ''), 0) AS m FROM candidatures WHERE status != 'en_cours' AND date(applied_at) BETWEEN ? AND ?")
    .get(from, to) as { n: number; m: number };
  const plan = getMissionPlan()?.plan ?? null;
  const mockIds = new Set((plan?.habits ?? []).filter((h) => /mock/i.test(`${h.id} ${h.title}`)).map((h) => h.id));
  const mocks = habitChecksBetween(from, to).filter((c) => mockIds.has(c.habit_id)).length;
  const refusalsByStage: Record<string, number> = {};
  for (const e of listJournal(14).filter((j) => j.date >= from && j.date <= to))
    for (const r of e.responses) if (r.outcome === "refus") refusalsByStage[r.stage] = (refusalsByStage[r.stage] ?? 0) + 1;
  return { from, to, candidatures: sent.n, messages: sent.m, mocks, kpi: plan?.kpi_weekly ?? null, refusalsByStage };
}

export { getJournalEntry };
