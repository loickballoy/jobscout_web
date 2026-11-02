import "server-only";
import { getDb, plainAll } from "@/lib/db";
import { archiveStaleCandidatures } from "@/lib/db/candidatures";
import { classifyContract } from "@/lib/contracts";
import { resolveOfferLocation } from "@/lib/geo";
import { inZones } from "@/lib/zones";
import { getSearchZones } from "@/lib/zones-store";
import { getTargetSectors } from "@/lib/sector-store";
import { getMissionPlan, habitChecksOn, listJournal, listMissionTasks } from "./store";
import { buildDay, type Day, type DayCandidature, type OfferItem } from "./today";

/** Date du jour (fuseau du serveur), au format AAAA-MM-JJ. */
export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Candidatures avec la date de leur dernière relance (événements « relance »). */
export function dayCandidatures(): DayCandidature[] {
  archiveStaleCandidatures();
  return plainAll(
    getDb()
      .prepare(
        `SELECT c.id, COALESCE(NULLIF(TRIM(o.company), ''), c.ext_company) AS company,
                COALESCE(NULLIF(TRIM(o.title), ''), c.ext_title) AS title,
                c.status, c.applied_at, c.relance_count,
                (SELECT max(e.at) FROM candidature_events e WHERE e.candidature_id = c.id AND e.status = 'relance') AS last_relance_at
         FROM candidatures c LEFT JOIN offres o ON o.id = c.offre_id`
      )
      .all() as DayCandidature[]
  );
}

/**
 * Offres à traiter : hors suivi, secteur visé (et pas « autre »), score ≥ 70, publiées depuis
 * 14 jours au plus, dans les zones de l'utilisateur ou V.I.E (sans zone choisie : toutes).
 */
export function offersToProcess(date: string, limit = 3): OfferItem[] {
  const sectors = getTargetSectors().filter((s) => s !== "autre");
  if (!sectors.length) return [];
  const zones = getSearchZones();
  const rows = getDb()
    .prepare(
      `SELECT o.id, o.title, o.company, o.score, o.sector, o.source, o.location, o.country, o.contract_type,
              substr(o.description_text, 1, 4000) AS description_text
       FROM offres o
       WHERE o.score >= 70 AND o.sector IN (${sectors.map(() => "?").join(", ")})
         AND o.posted_at IS NOT NULL AND julianday(?) - julianday(o.posted_at) <= 14
         AND NOT EXISTS (SELECT 1 FROM candidatures c WHERE c.offre_id = o.id)
       ORDER BY o.score DESC, o.posted_at DESC, o.id DESC
       LIMIT 200`
    )
    .all(...sectors, date) as (OfferItem & { source: string; location: string | null; country: string | null; contract_type: string | null; description_text: string })[];
  const out: OfferItem[] = [];
  for (const r of rows) {
    const vie = classifyContract({ contract_type: r.contract_type, title: r.title, description_text: r.description_text }) === "vie";
    if (zones.length && !vie) {
      const geo = resolveOfferLocation({ source: r.source, location: r.location, country: r.country });
      if (!inZones({ lat: geo.lat, lng: geo.lng, precision: geo.precision, code: geo.lat !== null ? geo.code ?? null : null }, zones)) continue;
    }
    out.push({ id: r.id, title: r.title, company: r.company, score: r.score, sector: r.sector });
    if (out.length >= limit) break;
  }
  return out;
}

/** Plan du jour à partir de la base. */
export function loadDay(date = todayIso()): Day {
  const mp = getMissionPlan();
  return buildDay({
    date,
    plan: mp?.plan ?? null,
    tasks: listMissionTasks(),
    habitChecks: habitChecksOn(date),
    candidatures: mp ? dayCandidatures() : [],
    offers: mp ? offersToProcess(date) : [],
    recentJournal: listJournal(2, date).map((j) => ({ date: j.date, done: j.done, energy: j.energy })),
  });
}
