import { beforeEach, describe, expect, it } from "vitest";
import { getDb, getSetting } from "@/lib/db";
import { getOffre, searchOffres, upsertOffreFromSource, type ScrapedOffre } from "@/lib/db/offres";
import { getTargetSectors, reclassifyAllOffres, reclassifyIfOutdated, setTargetSectors } from "@/lib/sector-store";
import { SECTOR_VERSION, sectorsForFilter } from "@/lib/scoring/sector";

let seq = 0;
function add(company: string, title: string, description = "Poste en CDI à pourvoir rapidement."): number {
  seq++;
  const offre: ScrapedOffre = {
    source_id: `s-${seq}`, url: `https://example.org/s/${seq}`, title, company, country: "France", location: "Paris",
    contract_type: "CDI", salary: null, description_html: `<p>${description}</p>`, description_text: description,
    description_status: "ok", posted_at: "2026-10-15", is_vie: false, raw_payload: {},
  };
  return upsertOffreFromSource("hellowork", offre);
}

beforeEach(() => {
  getDb().exec("DELETE FROM documents; DELETE FROM offres; DELETE FROM settings WHERE key IN ('target_sectors', 'sector_version');");
});

describe("secteur en base", () => {
  it("classé à l'écriture, visible sur la fiche", () => {
    const id = add("Banque Exemple SA", "Développeur Java", "Banque privée genevoise, gestion de fortune.");
    expect(getOffre(id)).toMatchObject({ sector: "finance" });
    expect(getOffre(id)!.sector_reason).toMatch(/Mots-clés/);
  });

  it("réglage : les trois secteurs par défaut, au moins un, valeurs inconnues ignorées", () => {
    expect(getTargetSectors()).toEqual(["finance", "conseil", "autre"]);
    expect(setTargetSectors(["conseil", "nope", "finance"])).toEqual(["finance", "conseil"]);
    expect(getTargetSectors()).toEqual(["finance", "conseil"]);
    expect(() => setTargetSectors([])).toThrow();
  });

  it("filtre et comptes croisés avec les autres filtres", () => {
    add("Banque Exemple SA", "Développeur Java", "Banque d'investissement, salle des marchés.");
    add("Capgemini", "Développeur Python");
    add("Constructeur Démo", "Ingénieur embarqué");
    add("Constructeur Démo", "Ingénieur Python");
    const all = searchOffres({ targetSectors: ["finance", "conseil"] });
    expect(all.total).toBe(4);
    expect(all.facets.sectors.counts).toEqual({ finance: 1, conseil: 1, autre: 2 });
    const vises = searchOffres({ sectors: sectorsForFilter("vises", ["finance", "conseil"]) });
    expect(vises.offers.map((o) => o.sector).sort()).toEqual(["conseil", "finance"]);
    // Comptes croisés avec la recherche plein texte.
    expect(searchOffres({ query: "python" }).facets.sectors.counts).toEqual({ finance: 0, conseil: 1, autre: 1 });
    // Tous les secteurs visés : aucun filtre, comportement d'avant.
    expect(sectorsForFilter("vises", ["finance", "conseil", "autre"])).toBeNull();
    expect(sectorsForFilter("tous", ["finance"])).toBeNull();
  });

  it("reclassement au démarrage quand la version change, une seule fois", () => {
    const id = add("Capgemini", "Développeur");
    getDb().prepare("UPDATE offres SET sector = NULL, sector_reason = NULL WHERE id = ?").run(id);
    reclassifyIfOutdated();
    expect(getSetting("sector_version")).toBe(SECTOR_VERSION);
    expect(getOffre(id)!.sector).toBe("conseil");
    getDb().prepare("UPDATE offres SET sector = NULL WHERE id = ?").run(id);
    reclassifyIfOutdated(); // version à jour : rien
    expect(getOffre(id)!.sector).toBeNull();
    expect(reclassifyAllOffres()).toBe(1);
    expect(getOffre(id)!.sector).toBe("conseil");
  });
});
