import "server-only";
import { getDb } from "@/lib/db";
import { createCandidature, updateCandidature } from "@/lib/db/candidatures";
import { getOffre } from "@/lib/db/offres";
import { listDocuments } from "@/lib/db/documents";
import { companyKey } from "@/lib/scoring/sector";
import { createMissionTarget, getTargetByCompany, updateMissionTarget, type MissionTarget } from "./store";
import { addDays } from "./today";
import { todayIso } from "./load";

export type ContactInput = { name: string; role?: string | null; url?: string | null };

/** « Nom — Rôle — lien », format du champ contact des cibles et des candidatures. */
export function formatContact(c: ContactInput): string {
  return [c.name, c.role, c.url].map((x) => (x ?? "").trim()).filter(Boolean).join(" — ");
}

export function parseContact(raw: string | null | undefined): ContactInput {
  const [name = "", role = "", url = ""] = (raw ?? "").split(" — ");
  return { name, role: role || null, url: url || null };
}

/**
 * Contact de l'offre : la cible de l'entreprise est créée (secteur de l'offre, statut
 * « à contacter ») si elle n'existe pas, sinon son contact est mis à jour. Une offre
 * hors banque et conseil n'a pas de cible : rien n'est créé (null).
 */
export function saveOfferContact(offreId: number, c: ContactInput): MissionTarget | null {
  const offre = getOffre(offreId);
  if (!offre) throw new Error("Offre introuvable");
  if (!companyKey(offre.company)) throw new Error("Entreprise non précisée dans l'offre.");
  const contact = formatContact(c);
  const existing = getTargetByCompany(offre.company);
  if (existing) return updateMissionTarget(existing.id, { contact });
  if (offre.sector !== "finance" && offre.sector !== "conseil") return null;
  return createMissionTarget({ company: offre.company, sector: offre.sector, contact, status: "a_contacter" });
}

/**
 * « Ajouter au suivi » : candidature envoyée, avec le contact et les derniers documents
 * de l'offre ; la cible passe au statut « candidature », prochaine action « Relance » à J+7.
 */
export function trackPreparedOffer(offreId: number, c: ContactInput | null, date = todayIso()): { candidatureId: number; target: MissionTarget | null } {
  const offre = getOffre(offreId);
  if (!offre) throw new Error("Offre introuvable");
  const docs = listDocuments({ offreId });
  // Comme « Postuler » : le DOCX s'il existe, sinon le PDF (documents les plus récents d'abord).
  const latest = (type: string) => (docs.find((d) => d.type === type && d.format === "docx") ?? docs.find((d) => d.type === type))?.id ?? null;
  const contact = c?.name ? formatContact(c) : null;
  const id = createCandidature({ offre_id: offreId, cv_doc_id: latest("cv"), lm_doc_id: latest("lm"), msg_doc_id: latest("msg"), status: "envoyee", contact });
  const row = getDb().prepare("SELECT status FROM candidatures WHERE id = ?").get(id) as { status: string };
  // Déjà « En cours » dans le suivi : elle part maintenant (la date de candidature devient aujourd'hui).
  if (row.status === "en_cours") updateCandidature(id, { status: "envoyee" });
  if (contact) updateCandidature(id, { contact });
  const target = getTargetByCompany(offre.company);
  const updated = target ? updateMissionTarget(target.id, { status: "candidature", next_action: "Relance", next_date: addDays(date, 7) }) : null;
  return { candidatureId: id, target: updated };
}
