import { beforeEach, describe, expect, it } from "vitest";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { saveProfile } from "@/lib/db/queries";
import { getOffre, setOffreScore, upsertOffreFromSource, type ScrapedOffre } from "@/lib/db/offres";
import { rescoreAllOffres, rescoreIfOutdated } from "@/lib/scoring/rescore";
import { SCORING_VERSION } from "@/lib/scoring/local";
import { profile } from "./fixtures";

function addOffer(): number {
  const o: ScrapedOffre = {
    source_id: "r-1", url: "https://example.org/r/1", title: "Développeur Python", company: "X", country: "France", location: "Lyon",
    contract_type: "CDI", salary: null, description_html: "<p>Python, Docker</p>", description_text: "Python, Docker, SQL.",
    description_status: "ok", posted_at: "2026-10-01", is_vie: false, raw_payload: {},
  };
  const id = upsertOffreFromSource("hellowork", o);
  setOffreScore(id, { score: 1, breakdown: { sector: 0, skills: 0, country: 0 } as never, reason: "ancien" });
  return id;
}

beforeEach(() => {
  getDb().exec("DELETE FROM documents; DELETE FROM offres; DELETE FROM profile;");
  getDb().prepare("DELETE FROM settings WHERE key = 'scoring_version'").run();
});

describe("recalcul des scores", () => {
  it("sans profil : rien", () => {
    addOffer();
    expect(rescoreAllOffres()).toBeNull();
  });

  it("toutes les offres en base sont recalculées et la version est notée", () => {
    const id = addOffer();
    saveProfile({ ...profile, skills: [{ name: "Python", category: null, level: null, evidence_experience_ids: [] }] } as never);
    expect(rescoreAllOffres()).toBe(1);
    expect(getOffre(id)!.score).toBeGreaterThan(1);
    expect(getSetting("scoring_version")).toBe(SCORING_VERSION);
  });

  it("au démarrage : une seule fois par version de formule", () => {
    const id = addOffer();
    saveProfile({ ...profile } as never);
    rescoreIfOutdated();
    const after = getOffre(id)!.score;
    expect(after).not.toBe(1);
    setOffreScore(id, { score: 1, breakdown: { sector: 0, skills: 0, country: 0 } as never, reason: "x" });
    rescoreIfOutdated(); // version déjà à jour : pas de recalcul
    expect(getOffre(id)!.score).toBe(1);
    setSetting("scoring_version", "0");
    rescoreIfOutdated();
    expect(getOffre(id)!.score).toBe(after);
  });
});
