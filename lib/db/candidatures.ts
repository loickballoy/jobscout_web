import "server-only";
import { getDb, getSetting, plainAll, setSetting } from "./index";
import { ensureOffresRepaired } from "./repair-markup";

export type CandidatureRow = {
  id: number;
  offre_id: number | null;
  applied_at: string;
  status: string;
  notes: string | null;
  contact: string | null;
  deadline: string | null;
  cv_doc_id: number | null;
  lm_doc_id: number | null;
  msg_doc_id: number | null;
  ext_company: string | null;
  ext_title: string | null;
  ext_country: string | null;
  ext_url: string | null;
  ext_score: number | null;
  /** Offre acceptée : salaire et date de début (vitrine). */
  offer_salary: string | null;
  offer_start: string | null;
};

export type CandidatureWithOffre = CandidatureRow & {
  offre_company: string | null;
  offre_title: string | null;
  offre_country: string | null;
  offre_url: string | null;
  offre_score: number | null;
  /** 1 si la candidature a atteint « Entretien » (ou « Acceptée »), même refusée ensuite. */
  reached_interview: number;
  /** Date du passage à « Acceptée », si elle a eu lieu. */
  accepted_at: string | null;
};

/** Objectif de candidatures par semaine (réglage « weekly_goal », défaut 10). */
export function getWeeklyGoal(): number {
  const n = Number(getSetting("weekly_goal"));
  return Number.isInteger(n) && n > 0 ? n : 10;
}

export function setWeeklyGoal(n: number): number {
  const v = Math.max(1, Math.min(100, Math.round(n)));
  setSetting("weekly_goal", String(v));
  return v;
}

/** Trace un changement de statut (historique de l'entonnoir et de la vitrine). */
function recordStatus(id: number, status: string, at: string | null = null): void {
  getDb()
    .prepare("INSERT INTO candidature_events (candidature_id, status, at) VALUES (?, ?, COALESCE(?, datetime('now')))")
    .run(id, status, at);
}

export const STATUS = ["envoyee", "en_cours", "entretien", "refusee", "acceptee", "archivee"] as const;
export type Status = (typeof STATUS)[number];

/** Délai sans réponse après lequel une candidature « Envoyée » est archivée (JOBSCOUT_ARCHIVE_DAYS, défaut 14). */
export function archiveAfterDays(): number {
  const n = Number(process.env.JOBSCOUT_ARCHIVE_DAYS);
  return Number.isInteger(n) && n > 0 ? n : 14;
}

/**
 * Archive les candidatures restées « Envoyée » (aucune réponse enregistrée)
 * plus de `days` jours après la date de candidature, avec une note datée.
 * Appelé à chaque lecture du suivi et par le scan quotidien. Renvoie le nombre archivé.
 */
export function archiveStaleCandidatures(days = archiveAfterDays(), now = new Date()): number {
  const today = now.toISOString().slice(0, 10);
  const note = `Archivée automatiquement le ${today.split("-").reverse().join("/")} : sans réponse ${days} jours après la candidature.`;
  const stale = `status = 'envoyee' AND date(applied_at) IS NOT NULL AND date(applied_at) <= date(?, ?)`;
  getDb()
    .prepare(`INSERT INTO candidature_events (candidature_id, status) SELECT id, 'archivee' FROM candidatures WHERE ${stale}`)
    .run(today, `-${days} days`);
  const res = getDb()
    .prepare(
      `UPDATE candidatures
       SET status = 'archivee',
           notes = CASE WHEN notes IS NULL OR trim(notes) = '' THEN ? ELSE notes || char(10) || ? END
       WHERE ${stale}`
    )
    .run(note, note, today, `-${days} days`);
  return Number(res.changes);
}

/** Candidature importée déjà présente (même entreprise, même poste, même date de candidature) ? */
export function importedCandidatureExists(company: string | null, title: string | null, appliedAt: string | null): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 FROM candidatures
       WHERE offre_id IS NULL AND lower(trim(coalesce(ext_company, ''))) = lower(trim(?))
         AND lower(trim(coalesce(ext_title, ''))) = lower(trim(?))
         AND coalesce(date(applied_at), '') = coalesce(date(?), '')
       LIMIT 1`
    )
    .get(company ?? "", title ?? "", appliedAt);
  return Boolean(row);
}

export function listCandidatures(): CandidatureWithOffre[] {
  archiveStaleCandidatures();
  // Titres et entreprises lus dans offres sans passer par lib/db/offres.ts : réparations
  // uniques des offres d'abord (page Candidatures, export, API), sans coût ensuite.
  ensureOffresRepaired();
  const rows = getDb()
    .prepare(
      `SELECT c.*,
              o.company AS offre_company,
              o.title AS offre_title,
              o.country AS offre_country,
              o.url AS offre_url,
              o.score AS offre_score,
              (c.status IN ('entretien', 'acceptee') OR EXISTS (
                SELECT 1 FROM candidature_events e WHERE e.candidature_id = c.id AND e.status IN ('entretien', 'acceptee')
              )) AS reached_interview,
              (SELECT max(e.at) FROM candidature_events e WHERE e.candidature_id = c.id AND e.status = 'acceptee') AS accepted_at
       FROM candidatures c
       LEFT JOIN offres o ON o.id = c.offre_id
       ORDER BY c.applied_at DESC`
    )
    .all() as CandidatureWithOffre[];
  return plainAll(rows);
}

export function createCandidature(args: {
  offre_id: number | null;
  cv_doc_id?: number | null;
  lm_doc_id?: number | null;
  msg_doc_id?: number | null;
  status?: Status;
  ext_company?: string | null;
  ext_title?: string | null;
  ext_country?: string | null;
  ext_url?: string | null;
  ext_score?: number | null;
  applied_at?: string | null;
  deadline?: string | null;
  notes?: string | null;
  contact?: string | null;
}): number {
  const db = getDb();
  // De-dup: if a candidature already exists for this offre, return it
  if (args.offre_id) {
    const existing = db.prepare("SELECT id FROM candidatures WHERE offre_id = ?").get(args.offre_id) as
      | { id: number }
      | undefined;
    if (existing) {
      // Update doc references
      db.prepare(
        "UPDATE candidatures SET cv_doc_id = COALESCE(?, cv_doc_id), lm_doc_id = COALESCE(?, lm_doc_id), msg_doc_id = COALESCE(?, msg_doc_id) WHERE id = ?"
      ).run(args.cv_doc_id ?? null, args.lm_doc_id ?? null, args.msg_doc_id ?? null, existing.id);
      return existing.id;
    }
  }
  const res = db
    .prepare(
      `INSERT INTO candidatures (offre_id, applied_at, status, notes, contact, deadline, cv_doc_id, lm_doc_id, msg_doc_id, ext_company, ext_title, ext_country, ext_url, ext_score)
       VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.offre_id,
      args.applied_at ?? null,
      args.status ?? "envoyee",
      args.notes ?? null,
      args.contact ?? null,
      args.deadline ?? null,
      args.cv_doc_id ?? null,
      args.lm_doc_id ?? null,
      args.msg_doc_id ?? null,
      args.ext_company ?? null,
      args.ext_title ?? null,
      args.ext_country ?? null,
      args.ext_url ?? null,
      args.ext_score ?? null
    );
  const id = Number(res.lastInsertRowid);
  recordStatus(id, args.status ?? "envoyee", args.applied_at ?? null);
  return id;
}

// Seules ces colonnes sont modifiables via l'API — empêche le mass-assignment
// (injection de nom de colonne / écriture de champs non prévus).
const UPDATABLE_COLUMNS = ["status", "notes", "contact", "deadline", "applied_at", "offer_salary", "offer_start"] as const;

export function updateCandidature(
  id: number,
  patch: Partial<{ status: Status; notes: string; contact: string; deadline: string; applied_at: string; offer_salary: string; offer_start: string }>
) {
  const before = patch.status
    ? (getDb().prepare("SELECT status FROM candidatures WHERE id = ?").get(id) as { status: string } | undefined)?.status
    : undefined;
  // Préparée (« En cours ») puis envoyée : la date de candidature devient aujourd'hui,
  // sauf si l'appelant la fixe lui-même. C'est elle qui déclenche l'archivage à 14 jours.
  if (patch.status === "envoyee" && !Object.prototype.hasOwnProperty.call(patch, "applied_at")) {
    const current = getDb().prepare("SELECT status FROM candidatures WHERE id = ?").get(id) as { status: string } | undefined;
    if (current?.status === "en_cours") patch = { ...patch, applied_at: sqlNow() };
  }
  const fields: string[] = [];
  const params: any[] = [];
  for (const col of UPDATABLE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(patch, col)) {
      fields.push(`${col} = ?`);
      params.push((patch as Record<string, unknown>)[col] ?? null);
    }
  }
  if (!fields.length) return;
  params.push(id);
  getDb().prepare(`UPDATE candidatures SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  if (patch.status && before !== undefined && before !== patch.status) recordStatus(id, patch.status);
}

function sqlNow(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function deleteCandidature(id: number) {
  getDb().prepare("DELETE FROM candidatures WHERE id = ?").run(id);
}

// Même règle pour le compteur « N échéances à venir » et la liste de l'accueil :
// une échéance illisible par SQLite (date(...) NULL) n'apparaît ni dans l'un ni dans l'autre.
const UPCOMING_WHERE = "c.deadline IS NOT NULL AND date(c.deadline) >= date('now')";

export function candidaturesCounts() {
  const db = getDb();
  const rows = db
    .prepare("SELECT status, COUNT(*) AS c FROM candidatures GROUP BY status")
    .all() as { status: string; c: number }[];
  const total = (db.prepare("SELECT COUNT(*) AS c FROM candidatures").get() as { c: number }).c;
  const upcoming = (
    db.prepare(`SELECT COUNT(*) AS c FROM candidatures c WHERE ${UPCOMING_WHERE}`).get() as { c: number }
  ).c;
  return { total, upcoming, byStatus: rows };
}

export type UpcomingDeadline = {
  id: number;
  offre_id: number | null;
  deadline: string;
  status: string;
  title: string | null;
  company: string | null;
};

/**
 * Prochaines échéances avec l'intitulé de la candidature (poste + entreprise).
 * Les chaînes vides comptent comme absentes : certaines sources n'ont pas d'entreprise.
 */
export function upcomingDeadlines(limit = 5): UpcomingDeadline[] {
  ensureOffresRepaired(); // comme listCandidatures
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.offre_id, c.deadline, c.status,
              COALESCE(NULLIF(TRIM(o.title), ''), NULLIF(TRIM(c.ext_title), '')) AS title,
              COALESCE(NULLIF(TRIM(o.company), ''), NULLIF(TRIM(c.ext_company), '')) AS company
       FROM candidatures c
       LEFT JOIN offres o ON o.id = c.offre_id
       WHERE ${UPCOMING_WHERE}
       ORDER BY date(c.deadline) ASC, c.id ASC
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(20, Math.trunc(limit)))) as UpcomingDeadline[];
  return plainAll(rows);
}
