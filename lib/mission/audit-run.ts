import "server-only";
import { getDb, parseJson, plainAll } from "@/lib/db";
import { getCvTemplate } from "@/lib/cvtemplate/store";
import { missingEnglish, templatePlaceholders } from "@/lib/cvtemplate/inspect";
import { getTargetSectors } from "@/lib/sector-store";
import { getAuditConfig, getMissionPlan } from "./store";
import { computeAudit, type AuditCandidature, type AuditItem, type AuditResult } from "./audit";
import { todayIso } from "./load";

function auditCandidatures(): AuditCandidature[] {
  const rows = getDb()
    .prepare(
      `SELECT c.applied_at, c.status, c.response_stage, o.sector AS offer_sector, (c.offre_id IS NOT NULL AND o.id IS NOT NULL) AS has_offer,
              (c.status IN ('entretien', 'acceptee') OR EXISTS (SELECT 1 FROM candidature_events e WHERE e.candidature_id = c.id AND e.status IN ('entretien', 'acceptee'))) AS reached_interview,
              (SELECT max(e.at) FROM candidature_events e WHERE e.candidature_id = c.id AND e.status = 'relance') AS last_relance_at
       FROM candidatures c LEFT JOIN offres o ON o.id = c.offre_id`
    )
    .all() as (Omit<AuditCandidature, "reached_interview" | "has_offer"> & { reached_interview: number; has_offer: number })[];
  return rows.map((r) => ({ ...r, reached_interview: !!r.reached_interview, has_offer: !!r.has_offer }));
}

/** Calcule l'audit à partir de la base (sans l'enregistrer). */
export function currentAudit(date = todayIso()): AuditResult {
  const template = getCvTemplate();
  return computeAudit({
    date,
    template,
    placeholders: template ? templatePlaceholders(template).length : 0,
    missingEnglish: template ? missingEnglish(template).length : 0,
    config: getAuditConfig(),
    plan: getMissionPlan()?.plan ?? null,
    targetSectors: getTargetSectors(),
    candidatures: auditCandidatures(),
  });
}

/** « Lancer l'audit » : calcule et ajoute le résultat à l'historique. */
export function runAudit(date = todayIso()): AuditResult & { id: number } {
  const r = currentAudit(date);
  const res = getDb().prepare("INSERT INTO mission_audits (score, total, items) VALUES (?, ?, ?)").run(r.score, r.total, JSON.stringify({ items: r.items, diagnostic: r.diagnostic }));
  return { ...r, id: Number(res.lastInsertRowid) };
}

export type AuditHistoryRow = { id: number; at: string; score: number; total: number; items: AuditItem[]; diagnostic: string };

export function auditHistory(limit = 20): AuditHistoryRow[] {
  const rows = plainAll(getDb().prepare("SELECT id, at, score, total, items FROM mission_audits ORDER BY id DESC LIMIT ?").all(limit) as { id: number; at: string; score: number; total: number; items: string }[]);
  return rows.map((r) => {
    const parsed = parseJson<{ items?: AuditItem[]; diagnostic?: string }>(r.items, {});
    return { id: r.id, at: r.at, score: r.score, total: r.total, items: parsed.items ?? [], diagnostic: parsed.diagnostic ?? "" };
  });
}
