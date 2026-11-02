import { z } from "zod";

/**
 * Pack de Mission (type « jobscout-mission-pack ») : brief, plan daté, tâches, cibles
 * et critères d'audit, importés par l'utilisateur depuis la page Mission. Schémas Zod
 * partagés par l'import, l'export, le moteur du jour et l'interface. Sans dépendance serveur.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue au format AAAA-MM-JJ")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "date inexistante");

/** Mot à saisir pour réinitialiser la Mission. */
export const RESET_WORD = "RÉINITIALISER";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABELS: Record<Weekday, string> = { mon: "lundi", tue: "mardi", wed: "mercredi", thu: "jeudi", fri: "vendredi", sat: "samedi", sun: "dimanche" };

/** Catégories connues ; toute autre chaîne est acceptée et affichée telle quelle. */
export const CATEGORY_LABELS: Record<string, string> = {
  candidature: "Candidature",
  cv: "CV",
  github: "GitHub",
  vitrine: "Vitrine",
  reseau: "Réseau",
  "projet-java": "Projet Java",
  orderbook: "Order book",
  entretien: "Entretien",
  domaine: "Domaine",
  admin: "Admin",
  outil: "Outil",
};
export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c;

export const TARGET_STATUSES = ["a_verifier", "a_contacter", "contacte", "candidature", "entretien", "refus", "offre", "ecartee"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];
export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  a_verifier: "À vérifier",
  a_contacter: "À contacter",
  contacte: "Contacté",
  candidature: "Candidature",
  entretien: "Entretien",
  refus: "Refus",
  offre: "Offre",
  ecartee: "Écartée",
};

const Category = z.string().trim().min(1).max(40);
const Priority = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const Minutes = z.number().int().min(0).max(24 * 60);

export const HabitSchema = z.object({
  id: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1),
  minutes: Minutes,
  days: z.array(z.enum(WEEKDAYS)).min(1),
  from: isoDate,
  to: isoDate,
  category: Category,
});
export type Habit = z.infer<typeof HabitSchema>;

export const PlanSchema = z.object({
  start: isoDate,
  offer_deadline: isoDate,
  start_target: isoDate.optional(),
  budget_minutes: z.object(Object.fromEntries(WEEKDAYS.map((d) => [d, Minutes])) as Record<Weekday, typeof Minutes>),
  freeze: z.object({ from: isoDate, to: isoDate, note: z.string().default("") }).nullable().optional(),
  phases: z.array(z.object({ id: z.string().trim().min(1), label: z.string().trim().min(1), from: isoDate, to: isoDate })).default([]),
  habits: z.array(HabitSchema).default([]),
  kpi_weekly: z
    .object({ candidatures_ciblees: z.number().int().min(0), messages_nommes: z.number().int().min(0), mock_interviews: z.number().int().min(0) })
    .default({ candidatures_ciblees: 10, messages_nommes: 0, mock_interviews: 0 }),
  diagnostic: z.object({ min_candidatures: z.number().int().min(1), min_response_rate: z.number().min(0).max(1) }).default({ min_candidatures: 40, min_response_rate: 0.1 }),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PackTaskSchema = z.object({
  id: z.string().trim().min(1).max(60),
  phase: z.string().trim().min(1),
  title: z.string().trim().min(1),
  detail: z.string().optional(),
  minutes: Minutes,
  window: z.tuple([isoDate, isoDate]),
  priority: Priority,
  category: Category,
  /** Présent dans un export : conservé à la création, jamais écrasé sur une tâche existante. */
  done_at: z.string().nullable().optional(),
});
export type PackTask = z.infer<typeof PackTaskSchema>;

export const PackTargetSchema = z.object({
  company: z.string().trim().min(1),
  city: z.string().optional().default(""),
  country: z.string().trim().regex(/^([A-Za-z]{2}|VIE)$/, "code pays ISO à 2 lettres, ou VIE").optional().or(z.literal("")).default(""),
  sector: z.enum(["finance", "conseil"]),
  type: z.string().optional().default(""),
  tier: z.string().optional().default(""),
  cv: z.string().optional().default(""),
  angle: z.string().optional().default(""),
  contact: z.string().optional().default(""),
  status: z.enum(TARGET_STATUSES).default("a_verifier"),
  next: z.string().optional().default(""),
  next_date: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});
export type PackTarget = z.infer<typeof PackTargetSchema>;

export const AuditConfigSchema = z.object({
  forbidden_terms: z.array(z.object({ cluster: z.string().trim().min(1), terms: z.array(z.string().trim().min(1)) })).default([]),
  manual: z.array(z.object({ id: z.string().trim().min(1), label: z.string().trim().min(1), done_at: z.string().nullable().optional() })).default([]),
});
export type AuditConfig = z.infer<typeof AuditConfigSchema>;

export const MissionPackSchema = z.object({
  type: z.literal("jobscout-mission-pack"),
  version: z.literal(1),
  brief: z.string().default(""),
  plan: PlanSchema,
  tasks: z.array(PackTaskSchema).default([]),
  targets: z.array(PackTargetSchema).default([]),
  audit: AuditConfigSchema.default({ forbidden_terms: [], manual: [] }),
});
export type MissionPack = z.infer<typeof MissionPackSchema>;

/** Validation lisible : chaque erreur porte son chemin (« tasks.3.window.1 : … »). */
export function parseMissionPack(raw: unknown): { ok: true; pack: MissionPack } | { ok: false; errors: string[] } {
  const r = MissionPackSchema.safeParse(raw);
  if (!r.success) return { ok: false, errors: r.error.issues.slice(0, 30).map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`) };
  const errors: string[] = [];
  const ids = new Set<string>();
  r.data.tasks.forEach((t, i) => {
    if (ids.has(t.id)) errors.push(`tasks.${i}.id : « ${t.id} » en double`);
    ids.add(t.id);
    if (t.window[0] > t.window[1]) errors.push(`tasks.${i}.window : début après la fin`);
  });
  const habitIds = new Set<string>();
  r.data.plan.habits.forEach((h, i) => {
    if (habitIds.has(h.id)) errors.push(`plan.habits.${i}.id : « ${h.id} » en double`);
    habitIds.add(h.id);
  });
  return errors.length ? { ok: false, errors } : { ok: true, pack: r.data };
}
