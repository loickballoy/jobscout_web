/**
 * Plan du jour de la Mission. Fonction pure : ni base ni `server-only` ; les données
 * sont chargées par lib/mission/load.ts. Ordre de remplissage du budget :
 *   1. habitudes actives (réservées d'abord ; pendant le gel, sans les candidatures) ;
 *   2. relances dues (hors gel) : envoyée depuis 7 jours, dernière relance il y a 7 jours ou plus ;
 *   3. tâches en retard (jamais repoussées en silence : toujours dans la liste) ;
 *   4. tâches dont la fenêtre contient la date.
 * Ce qui dépasse le budget va dans `overflow` (« Si tu as du temps »).
 */
import { WEEKDAYS, type Plan, type Weekday } from "./pack";

export type DayTask = {
  id: string;
  title: string;
  minutes: number;
  window_start: string;
  window_end: string;
  priority: number;
  category: string;
  done_at: string | null;
  position: number;
};

export type DayCandidature = {
  id: number;
  company: string | null;
  title: string | null;
  status: string;
  applied_at: string | null;
  last_relance_at: string | null;
  relance_count: number;
};

export type OfferItem = { id: number; title: string; company: string; score: number; sector: string | null };

export type DayJournal = { date: string; done: string[]; energy: number | null };

export type DayInput = {
  date: string;
  plan: Plan | null;
  tasks: DayTask[];
  habitChecks: string[];
  candidatures: DayCandidature[];
  offers: OfferItem[];
  recentJournal: DayJournal[];
};

export type Item = {
  source: "habit" | "task" | "relance";
  id: string;
  title: string;
  minutes: number;
  category: string;
  priority?: number;
  overdueDays?: number;
  done: boolean;
  /** Relance : candidature concernée. */
  candidatureId?: number;
};

export type Day = {
  date: string;
  weekday: Weekday;
  phase: { id: string; label: string } | null;
  daysToOfferDeadline: number | null;
  inFreeze: boolean;
  freezeNote: string | null;
  budget: number;
  planned: number;
  notice?: string;
  oneThing?: Item;
  items: Item[];
  overflow: Item[];
  relances: Item[];
  offers: OfferItem[];
};

export const RELANCE_AFTER_DAYS = 7;
export const RELANCE_MINUTES = 10;
export const MAX_RELANCES_PER_DAY = 5;

const DAY_MS = 86_400_000;
const utc = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

/** Jours entiers de `from` à `to` (dates AAAA-MM-JJ, heures ignorées). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

export function addDays(date: string, n: number): string {
  return new Date(utc(date) + n * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): Weekday {
  // getUTCDay : 0 = dimanche.
  return WEEKDAYS[(new Date(utc(date)).getUTCDay() + 6) % 7];
}

const inRange = (date: string, from: string, to: string) => from <= date && date <= to;

/** Relance due ce jour-là ? (statut « envoyée », 7 jours depuis l'envoi et depuis la dernière relance) */
export function relanceDue(c: DayCandidature, date: string): boolean {
  if (c.status !== "envoyee" || !c.applied_at) return false;
  if (daysBetween(c.applied_at, date) < RELANCE_AFTER_DAYS) return false;
  return !c.last_relance_at || daysBetween(c.last_relance_at, date) >= RELANCE_AFTER_DAYS;
}

function emptyDay(date: string): Day {
  return {
    date, weekday: weekdayOf(date), phase: null, daysToOfferDeadline: null, inFreeze: false, freezeNote: null,
    budget: 0, planned: 0, items: [], overflow: [], relances: [], offers: [],
  };
}

export function buildDay(input: DayInput): Day {
  const { date, plan } = input;
  if (!plan) return emptyDay(date);
  const weekday = weekdayOf(date);
  const phase = plan.phases.find((p) => inRange(date, p.from, p.to)) ?? null;
  const inFreeze = !!plan.freeze && inRange(date, plan.freeze.from, plan.freeze.to);
  const budget = plan.budget_minutes[weekday] ?? 0;
  const checks = new Set(input.habitChecks);

  // 1. Habitudes actives.
  const habits: Item[] = plan.habits
    .filter((h) => h.days.includes(weekday) && inRange(date, h.from, h.to) && !(inFreeze && h.category === "candidature"))
    .map((h) => ({ source: "habit", id: h.id, title: h.title, minutes: h.minutes, category: h.category, done: checks.has(h.id) }));

  // 2. Relances dues, les plus anciennes d'abord.
  const relances: Item[] = inFreeze
    ? []
    : input.candidatures
        .filter((c) => relanceDue(c, date))
        .sort((a, b) => (a.applied_at ?? "").localeCompare(b.applied_at ?? ""))
        .slice(0, MAX_RELANCES_PER_DAY)
        .map((c) => ({
          source: "relance",
          id: `relance-${c.id}`,
          title: `Relancer ${[c.company, c.title].filter(Boolean).join(" · ") || "la candidature"}`,
          minutes: RELANCE_MINUTES,
          category: "candidature",
          done: false,
          candidatureId: c.id,
        }));

  // Une tâche cochée aujourd'hui reste affichée (cochée) ; cochée avant, elle sort du plan.
  const doneToday = (t: DayTask) => !!t.done_at && t.done_at.slice(0, 10) === date;
  const open = (t: DayTask) => !t.done_at || doneToday(t);
  const toItem = (t: DayTask, overdueDays?: number): Item => ({
    source: "task", id: t.id, title: t.title, minutes: t.minutes, category: t.category, priority: t.priority,
    ...(overdueDays ? { overdueDays } : {}), done: !!t.done_at,
  });

  // 3. Tâches en retard : par priorité, puis la plus en retard d'abord.
  const overdue = input.tasks
    .filter((t) => !t.done_at && t.window_end < date)
    .sort((a, b) => a.priority - b.priority || a.window_end.localeCompare(b.window_end) || a.position - b.position)
    .map((t) => toItem(t, daysBetween(t.window_end, date)));

  // 4. Tâches de la fenêtre du jour : priorité, échéance, position.
  const current = input.tasks
    .filter((t) => open(t) && inRange(date, t.window_start, t.window_end))
    .sort((a, b) => a.priority - b.priority || a.window_end.localeCompare(b.window_end) || a.position - b.position)
    .map((t) => toItem(t));

  // Mode allégé : rien coché la veille, ou énergie basse deux soirs de suite.
  const previous = input.recentJournal.filter((j) => j.date < date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  const yesterday = previous.find((j) => j.date === addDays(date, -1));
  let notice: string | undefined;
  if (yesterday && yesterday.done.length === 0) notice = "Hier, rien n'a été coché : la journée se limite à l'essentiel.";
  else if (previous.length === 2 && previous.every((j) => j.energy !== null && j.energy <= 2)) notice = "Énergie basse deux soirs de suite : journée allégée.";

  const items: Item[] = [...habits];
  const overflow: Item[] = [];
  let planned = habits.reduce((n, i) => n + i.minutes, 0);
  const keep = (i: Item) => !notice || i.source === "habit" || (i.source === "task" && i.priority === 1);

  const fit = (i: Item) => {
    if (!keep(i) || planned + i.minutes > budget) overflow.push(i);
    else {
      items.push(i);
      planned += i.minutes;
    }
  };
  relances.forEach(fit);
  // Une tâche en retard n'est jamais repoussée : dans la liste même au-delà du budget (sauf mode allégé, où elle reste visible plus bas).
  for (const i of overdue) {
    if (!keep(i)) overflow.push(i);
    else {
      items.push(i);
      planned += i.minutes;
    }
  }
  current.forEach(fit);

  const candidatureHabit = habits.some((h) => h.category === "candidature");
  const offers = candidatureHabit && !inFreeze ? input.offers.slice(0, 3) : [];
  const firstP1 = [...overdue, ...current].find((i) => i.priority === 1 && !i.done) ?? [...overdue, ...current].find((i) => i.priority === 1);
  const oneThing = firstP1 ?? habits.find((h) => h.category === "candidature") ?? habits[0];

  return {
    date, weekday, phase: phase ? { id: phase.id, label: phase.label } : null,
    daysToOfferDeadline: daysBetween(date, plan.offer_deadline),
    inFreeze, freezeNote: inFreeze ? plan.freeze?.note ?? null : null,
    budget, planned,
    ...(notice ? { notice } : {}),
    ...(oneThing ? { oneThing } : {}),
    items, overflow, relances: notice ? [] : relances, offers,
  };
}
