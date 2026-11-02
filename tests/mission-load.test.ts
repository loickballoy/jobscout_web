import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { importMissionPack, recordRelance, resetMission } from "@/lib/mission/store";
import { loadDay, offersToProcess } from "@/lib/mission/load";
import { createCandidature } from "@/lib/db/candidatures";
import { setOffreScore, upsertOffreFromSource } from "@/lib/db/offres";
import { setTargetSectors } from "@/lib/sector-store";
import { demoPack } from "./mission-fixture";

function offer(company: string, title: string, posted: string, score = 80): number {
  const id = upsertOffreFromSource("hellowork", {
    source_id: `${company}-${title}-${posted}`, url: `https://example.org/${encodeURIComponent(title)}`, title, company, country: "France", location: "Paris",
    contract_type: "CDI", salary: null, description_html: "<p>Poste.</p>", description_text: "Poste en CDI.", description_status: "ok",
    posted_at: posted, is_vie: false, raw_payload: {},
  });
  setOffreScore(id, { score, breakdown: { sector: 0, skills: 0, country: 0 }, reason: "r" });
  return id;
}

beforeEach(() => {
  resetMission();
  getDb().exec("DELETE FROM candidature_events; DELETE FROM candidatures; DELETE FROM documents; DELETE FROM offres; DELETE FROM settings WHERE key IN ('target_sectors', 'search_zones');");
});

describe("chargement du plan du jour", () => {
  it("sans pack : plan vide", () => {
    expect(loadDay("2026-11-16")).toMatchObject({ items: [], budget: 0 });
  });

  it("relances lues dans le suivi, dernière relance comprise", () => {
    importMissionPack(demoPack());
    const id = createCandidature({ offre_id: null, ext_company: "ESN Démo", ext_title: "Développeur", applied_at: "2026-11-05 09:00:00" });
    // Archivage automatique à 14 jours : la date du test reste avant.
    process.env.JOBSCOUT_ARCHIVE_DAYS = "60";
    expect(loadDay("2026-11-16").relances.map((r) => r.candidatureId)).toEqual([id]);
    recordRelance(id);
    expect(loadDay(new Date().toISOString().slice(0, 10)).relances).toEqual([]);
    delete process.env.JOBSCOUT_ARCHIVE_DAYS;
  });

  it("offres à traiter : secteur visé, score, fraîcheur, hors suivi", () => {
    const bank = offer("Banque Exemple SA", "Développeur Java", "2026-11-10");
    offer("Banque Exemple SA", "Développeur ancien", "2026-10-01");
    offer("Constructeur Démo", "Ingénieur embarqué", "2026-11-10");
    offer("Capgemini", "Développeur Python", "2026-11-12", 60);
    const tracked = offer("ESN Démo", "Consultant", "2026-11-11");
    createCandidature({ offre_id: tracked });
    setTargetSectors(["finance", "conseil"]);
    expect(offersToProcess("2026-11-16").map((o) => o.id)).toEqual([bank]);
  });
});
