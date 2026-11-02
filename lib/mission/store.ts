import "server-only";
import { getDb, getSetting, parseJson, plainAll, setSetting, transaction } from "@/lib/db";
import { companyKey } from "@/lib/scoring/sector";
import { reclassifyAllOffres } from "@/lib/sector-store";
import {
  AuditConfigSchema,
  PlanSchema,
  TARGET_STATUSES,
  parseMissionPack,
  type AuditConfig,
  type MissionPack,
  type PackTarget,
  type Plan,
  type TargetStatus,
} from "./pack";

// ------------------------------------------------------------------ réglages

const PLAN_KEY = "mission_plan";
const AUDIT_KEY = "mission_audit";

export type MissionPlan = { brief: string; plan: Plan };

/** Brief et plan importés, ou null tant qu'aucun pack ne l'a été. */
export function getMissionPlan(): MissionPlan | null {
  const raw = parseJson<{ brief?: unknown; plan?: unknown } | null>(getSetting(PLAN_KEY), null);
  if (!raw) return null;
  const plan = PlanSchema.safeParse(raw.plan);
  return plan.success ? { brief: typeof raw.brief === "string" ? raw.brief : "", plan: plan.data } : null;
}

export function getAuditConfig(): AuditConfig {
  const r = AuditConfigSchema.safeParse(parseJson(getSetting(AUDIT_KEY), {}));
  return r.success ? r.data : { forbidden_terms: [], manual: [] };
}

function setAuditConfig(c: AuditConfig): void {
  setSetting(AUDIT_KEY, JSON.stringify(c));
}

/** Coche ou décoche un critère manuel de l'audit (date de validation conservée). */
export function setManualAuditItem(id: string, done: boolean, now = new Date()): boolean {
  const c = getAuditConfig();
  const item = c.manual.find((m) => m.id === id);
  if (!item) return false;
  item.done_at = done ? now.toISOString() : null;
  setAuditConfig(c);
  return true;
}

// ------------------------------------------------------------------ tâches

export type MissionTask = {
  id: string;
  phase: string;
  title: string;
  detail: string | null;
  minutes: number;
  window_start: string;
  window_end: string;
  priority: number;
  category: string;
  done_at: string | null;
  origin: "pack" | "user";
  position: number;
};

export function listMissionTasks(): MissionTask[] {
  return plainAll(getDb().prepare("SELECT id, phase, title, detail, minutes, window_start, window_end, priority, category, done_at, origin, position FROM mission_tasks ORDER BY window_start, priority, position, id").all() as MissionTask[]);
}

// Colonnes modifiables d'une tâche depuis l'interface (liste blanche, comme les candidatures).
const TASK_UPDATABLE = ["window_start", "window_end", "priority", "minutes", "title", "phase", "category", "detail"] as const;
export type TaskPatch = Partial<Pick<MissionTask, (typeof TASK_UPDATABLE)[number]>> & { done?: boolean };

export function updateMissionTask(id: string, patch: TaskPatch, now = new Date()): MissionTask | null {
  const db = getDb();
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  for (const col of TASK_UPDATABLE) {
    if (Object.prototype.hasOwnProperty.call(patch, col)) {
      fields.push(`${col} = ?`);
      params.push((patch as Record<string, string | number | null>)[col] ?? null);
    }
  }
  if (typeof patch.done === "boolean") {
    fields.push("done_at = ?");
    params.push(patch.done ? now.toISOString() : null);
  }
  if (fields.length) db.prepare(`UPDATE mission_tasks SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...params, id);
  return (listMissionTasks().find((t) => t.id === id) ?? null) as MissionTask | null;
}

/** Tâche personnelle : identifiant U-<n>, supprimable. */
export function createUserTask(t: { phase: string; title: string; minutes: number; window_start: string; window_end: string; priority: number; category: string; detail?: string | null }): MissionTask {
  const db = getDb();
  const rows = db.prepare("SELECT id FROM mission_tasks WHERE origin = 'user'").all() as { id: string }[];
  const n = rows.reduce((max, r) => Math.max(max, Number(/^U-(\d+)$/.exec(r.id)?.[1] ?? 0)), 0) + 1;
  const id = `U-${n}`;
  const position = (db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM mission_tasks").get() as { p: number }).p;
  db.prepare(
    "INSERT INTO mission_tasks (id, phase, title, detail, minutes, window_start, window_end, priority, category, origin, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?)"
  ).run(id, t.phase, t.title, t.detail ?? null, t.minutes, t.window_start, t.window_end, t.priority, t.category, position);
  return listMissionTasks().find((x) => x.id === id)!;
}

/** Supprime une tâche personnelle ; les tâches du pack ne se suppriment pas. */
export function deleteUserTask(id: string): boolean {
  return Number(getDb().prepare("DELETE FROM mission_tasks WHERE id = ? AND origin = 'user'").run(id).changes) > 0;
}

// ------------------------------------------------------------------ habitudes

export function habitChecksOn(date: string): string[] {
  return (getDb().prepare("SELECT habit_id FROM mission_habit_checks WHERE date = ?").all(date) as { habit_id: string }[]).map((r) => r.habit_id);
}

export function setHabitCheck(habitId: string, date: string, done: boolean): void {
  if (done) getDb().prepare("INSERT OR IGNORE INTO mission_habit_checks (habit_id, date) VALUES (?, ?)").run(habitId, date);
  else getDb().prepare("DELETE FROM mission_habit_checks WHERE habit_id = ? AND date = ?").run(habitId, date);
}

export function habitChecksBetween(from: string, to: string): { habit_id: string; date: string }[] {
  return plainAll(getDb().prepare("SELECT habit_id, date FROM mission_habit_checks WHERE date BETWEEN ? AND ?").all(from, to) as { habit_id: string; date: string }[]);
}

// ------------------------------------------------------------------ cibles

export type MissionTarget = {
  id: number;
  company: string;
  company_key: string;
  city: string | null;
  country: string | null;
  sector: "finance" | "conseil";
  type: string | null;
  tier: string | null;
  cv_cluster: string | null;
  angle: string | null;
  contact: string | null;
  status: TargetStatus;
  next_action: string | null;
  next_date: string | null;
  notes: string | null;
  updated_at: string;
};

export function listMissionTargets(): MissionTarget[] {
  return plainAll(getDb().prepare("SELECT * FROM mission_targets ORDER BY tier, company").all() as MissionTarget[]);
}

export function getTargetByCompany(company: string): MissionTarget | null {
  const key = companyKey(company);
  if (!key) return null;
  return (getDb().prepare("SELECT * FROM mission_targets WHERE company_key = ?").get(key) as MissionTarget | undefined) ?? null;
}

const TARGET_UPDATABLE = ["status", "contact", "next_action", "next_date", "notes", "city", "country", "type", "tier", "cv_cluster", "angle", "sector"] as const;
export type TargetPatch = Partial<Pick<MissionTarget, (typeof TARGET_UPDATABLE)[number]>>;

export function updateMissionTarget(id: number, patch: TargetPatch): MissionTarget | null {
  const fields: string[] = [];
  const params: (string | null)[] = [];
  for (const col of TARGET_UPDATABLE) {
    if (Object.prototype.hasOwnProperty.call(patch, col)) {
      fields.push(`${col} = ?`);
      params.push((patch as Record<string, string | null>)[col] ?? null);
    }
  }
  if (!fields.length) return listMissionTargets().find((t) => t.id === id) ?? null;
  getDb().prepare(`UPDATE mission_targets SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...params, id);
  // Le secteur des cibles prime dans le classement des offres.
  if (patch.sector) reclassifyAllOffres();
  return listMissionTargets().find((t) => t.id === id) ?? null;
}

export function createMissionTarget(t: { company: string; sector: "finance" | "conseil" } & TargetPatch): MissionTarget {
  const key = companyKey(t.company);
  if (!key) throw new Error("Nom d'entreprise vide.");
  const existing = getDb().prepare("SELECT id FROM mission_targets WHERE company_key = ?").get(key) as { id: number } | undefined;
  if (existing) throw new Error("Cette entreprise est déjà dans vos cibles.");
  const res = getDb()
    .prepare(
      `INSERT INTO mission_targets (company, company_key, city, country, sector, type, tier, cv_cluster, angle, contact, status, next_action, next_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      t.company.trim(), key, t.city ?? null, t.country ?? null, t.sector, t.type ?? null, t.tier ?? null, t.cv_cluster ?? null,
      t.angle ?? null, t.contact ?? null, t.status ?? "a_verifier", t.next_action ?? null, t.next_date ?? null, t.notes ?? null
    );
  reclassifyAllOffres();
  return listMissionTargets().find((x) => x.id === Number(res.lastInsertRowid))!;
}

// ------------------------------------------------------------------ journal

export type JournalResponse = { candidature_id: number; stage: "filtre_auto" | "recruteur" | "technique" | "final"; outcome: "refus" | "suite" | "offre" };
export type JournalEntry = {
  date: string;
  done: string[];
  responses: JournalResponse[];
  energy: number | null;
  blocker: string | null;
  tomorrow: string | null;
  notes: string | null;
  weekly_review: string | null;
};

type JournalRow = Omit<JournalEntry, "done" | "responses"> & { done: string; responses: string };

function fromRow(r: JournalRow): JournalEntry {
  return { ...r, done: parseJson<string[]>(r.done, []), responses: parseJson<JournalResponse[]>(r.responses, []) };
}

export function getJournalEntry(date: string): JournalEntry | null {
  const r = getDb().prepare("SELECT date, done, responses, energy, blocker, tomorrow, notes, weekly_review FROM mission_journal WHERE date = ?").get(date) as JournalRow | undefined;
  return r ? fromRow({ ...r }) : null;
}

/** Entrées les plus récentes d'abord (au plus `limit`, avant `before` exclu s'il est donné). */
export function listJournal(limit = 60, before?: string): JournalEntry[] {
  const rows = (before
    ? getDb().prepare("SELECT date, done, responses, energy, blocker, tomorrow, notes, weekly_review FROM mission_journal WHERE date < ? ORDER BY date DESC LIMIT ?").all(before, limit)
    : getDb().prepare("SELECT date, done, responses, energy, blocker, tomorrow, notes, weekly_review FROM mission_journal ORDER BY date DESC LIMIT ?").all(limit)) as JournalRow[];
  return rows.map((r) => fromRow({ ...r }));
}

export function saveJournalEntry(e: JournalEntry): JournalEntry {
  getDb()
    .prepare(
      `INSERT INTO mission_journal (date, done, responses, energy, blocker, tomorrow, notes, weekly_review, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET done = excluded.done, responses = excluded.responses, energy = excluded.energy,
         blocker = excluded.blocker, tomorrow = excluded.tomorrow, notes = excluded.notes, weekly_review = excluded.weekly_review,
         updated_at = excluded.updated_at`
    )
    .run(e.date, JSON.stringify(e.done), JSON.stringify(e.responses), e.energy, e.blocker, e.tomorrow, e.notes, e.weekly_review);
  return getJournalEntry(e.date)!;
}

// ------------------------------------------------------------------ relances

/** Relance faite : événement « relance » dans l'historique et compteur incrémenté. */
export function recordRelance(candidatureId: number): boolean {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM candidatures WHERE id = ?").get(candidatureId);
  if (!exists) return false;
  transaction(() => {
    db.prepare("INSERT INTO candidature_events (candidature_id, status) VALUES (?, 'relance')").run(candidatureId);
    db.prepare("UPDATE candidatures SET relance_count = relance_count + 1 WHERE id = ?").run(candidatureId);
  });
  return true;
}

// ------------------------------------------------------------------ import, export, réinitialisation

export type ImportCounts = { created: string[]; updated: string[]; unchanged: string[] };
export type ImportSummary = { tasks: ImportCounts; targets: ImportCounts; audit: ImportCounts; plan: "créé" | "remplacé" };
export type ImportResult = { ok: true; dryRun: boolean; summary: ImportSummary } | { ok: false; errors: string[] };

const empty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const nz = (v: string | undefined | null) => (empty(v) ? null : (v as string).trim());

function targetFields(t: PackTarget) {
  return {
    city: nz(t.city), country: nz(t.country)?.toUpperCase() ?? null, type: nz(t.type), tier: nz(t.tier), cv_cluster: nz(t.cv),
    angle: nz(t.angle), contact: nz(t.contact), next_action: nz(t.next), next_date: nz(t.next_date), notes: nz(t.notes),
  };
}

/**
 * Import d'un pack, par fusion et sans perte :
 * - brief, plan et termes interdits remplacés ; critères manuels fusionnés par id (date de validation gardée) ;
 * - tâches par id : créées, ou mises à jour sauf `done_at` et `origin` ; une tâche absente du pack reste ;
 * - cibles par nom normalisé : créées, ou complétées sur les champs vides ; le statut n'est remplacé
 *   que s'il vaut encore « à vérifier ».
 * `dryRun` : même résumé, aucune écriture.
 */
export function importMissionPack(raw: unknown, opts: { dryRun?: boolean } = {}): ImportResult {
  const parsed = parseMissionPack(raw);
  if (!parsed.ok) return parsed;
  const pack = parsed.pack;
  const db = getDb();
  const dryRun = !!opts.dryRun;
  const summary: ImportSummary = {
    tasks: { created: [], updated: [], unchanged: [] },
    targets: { created: [], updated: [], unchanged: [] },
    audit: { created: [], updated: [], unchanged: [] },
    plan: getSetting(PLAN_KEY) ? "remplacé" : "créé",
  };
  const writes: (() => void)[] = [];

  // Tâches
  const existingTasks = new Map(listMissionTasks().map((t) => [t.id, t]));
  pack.tasks.forEach((t, position) => {
    const next = { phase: t.phase, title: t.title, detail: t.detail ?? null, minutes: t.minutes, window_start: t.window[0], window_end: t.window[1], priority: t.priority, category: t.category, position };
    const cur = existingTasks.get(t.id);
    if (!cur) {
      summary.tasks.created.push(t.id);
      writes.push(() =>
        db.prepare(
          "INSERT INTO mission_tasks (id, phase, title, detail, minutes, window_start, window_end, priority, category, done_at, origin, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pack', ?)"
        ).run(t.id, next.phase, next.title, next.detail, next.minutes, next.window_start, next.window_end, next.priority, next.category, t.done_at ?? null, position)
      );
      return;
    }
    const changed = (Object.keys(next) as (keyof typeof next)[]).some((k) => cur[k] !== next[k]);
    if (!changed) {
      summary.tasks.unchanged.push(t.id);
      return;
    }
    summary.tasks.updated.push(t.id);
    writes.push(() =>
      db.prepare(
        "UPDATE mission_tasks SET phase = ?, title = ?, detail = ?, minutes = ?, window_start = ?, window_end = ?, priority = ?, category = ?, position = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(next.phase, next.title, next.detail, next.minutes, next.window_start, next.window_end, next.priority, next.category, position, t.id)
    );
  });

  // Cibles
  const existingTargets = new Map(listMissionTargets().map((t) => [t.company_key, t]));
  const seenKeys = new Set<string>();
  for (const t of pack.targets) {
    const key = companyKey(t.company);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const fields = targetFields(t);
    const cur = existingTargets.get(key);
    if (!cur) {
      summary.targets.created.push(t.company);
      writes.push(() =>
        db.prepare(
          `INSERT INTO mission_targets (company, company_key, city, country, sector, type, tier, cv_cluster, angle, contact, status, next_action, next_date, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(t.company.trim(), key, fields.city, fields.country, t.sector, fields.type, fields.tier, fields.cv_cluster, fields.angle, fields.contact, t.status, fields.next_action, fields.next_date, fields.notes)
      );
      continue;
    }
    // Complément des champs vides seulement : rien de ce que l'utilisateur a saisi n'est écrasé.
    const fill: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) if (v !== null && empty(cur[k as keyof MissionTarget])) fill[k] = v;
    if (cur.status === "a_verifier" && t.status !== "a_verifier" && (TARGET_STATUSES as readonly string[]).includes(t.status)) fill.status = t.status;
    if (!Object.keys(fill).length) {
      summary.targets.unchanged.push(cur.company);
      continue;
    }
    summary.targets.updated.push(cur.company);
    writes.push(() =>
      db.prepare(`UPDATE mission_targets SET ${Object.keys(fill).map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...Object.values(fill), cur.id)
    );
  }

  // Audit : termes interdits remplacés, critères manuels fusionnés par id.
  const audit = getAuditConfig();
  const manual = [...audit.manual];
  for (const m of pack.audit.manual) {
    const cur = manual.find((x) => x.id === m.id);
    if (!cur) {
      summary.audit.created.push(m.id);
      manual.push({ id: m.id, label: m.label, done_at: m.done_at ?? null });
    } else if (cur.label !== m.label) {
      summary.audit.updated.push(m.id);
      cur.label = m.label;
    } else summary.audit.unchanged.push(m.id);
  }
  writes.push(() => setAuditConfig({ forbidden_terms: pack.audit.forbidden_terms, manual }));
  writes.push(() => setSetting(PLAN_KEY, JSON.stringify({ brief: pack.brief, plan: pack.plan })));

  if (!dryRun) {
    transaction(() => {
      for (const w of writes) w();
    });
    // Les cibles priment dans le classement des offres par secteur.
    reclassifyAllOffres();
  }
  return { ok: true, dryRun, summary };
}

/** État courant au format du pack (tâches avec `done_at`), pour sauvegarde ou transfert. */
export function exportMissionPack(): MissionPack | null {
  const mp = getMissionPlan();
  if (!mp) return null;
  const audit = getAuditConfig();
  return {
    type: "jobscout-mission-pack",
    version: 1,
    brief: mp.brief,
    plan: mp.plan,
    tasks: listMissionTasks()
      .sort((a, b) => a.position - b.position)
      .map((t) => ({
        id: t.id, phase: t.phase, title: t.title, ...(t.detail ? { detail: t.detail } : {}), minutes: t.minutes,
        window: [t.window_start, t.window_end] as [string, string], priority: (t.priority as 1 | 2 | 3), category: t.category, done_at: t.done_at,
      })),
    targets: listMissionTargets().map((t) => ({
      company: t.company, city: t.city ?? "", country: t.country ?? "", sector: t.sector, type: t.type ?? "", tier: t.tier ?? "",
      cv: t.cv_cluster ?? "", angle: t.angle ?? "", contact: t.contact ?? "", status: t.status, next: t.next_action ?? "",
      next_date: t.next_date ?? "", notes: t.notes ?? "",
    })),
    audit,
  };
}

/** Vide les tables et les réglages de la Mission. */
export function resetMission(): void {
  transaction(() => {
    getDb().exec("DELETE FROM mission_tasks; DELETE FROM mission_habit_checks; DELETE FROM mission_targets; DELETE FROM mission_journal; DELETE FROM mission_audits;");
    getDb().prepare("DELETE FROM settings WHERE key LIKE 'mission\\_%' ESCAPE '\\'").run();
  });
  reclassifyAllOffres();
}
