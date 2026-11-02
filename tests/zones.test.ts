import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { searchOffres, setOffreScore, upsertOffreFromSource, type ScrapedOffre } from "@/lib/db/offres";
import { nameToCode } from "@/lib/countries";
import { ZONES, inZones, searchLocations } from "@/lib/zones";
import { getSearchZoneIds, getSearchZones, setSearchZoneIds } from "@/lib/zones-store";
import { departementChunks } from "@/lib/scrapers/francetravail";
import { talentScraper } from "@/lib/scrapers/talent";
import { jobupScraper } from "@/lib/scrapers/jobup";

let seq = 0;
function add(location: string, country = "France", source = "hellowork"): number {
  seq++;
  const offre: ScrapedOffre = {
    source_id: `z-${seq}`, url: `https://example.org/z/${seq}`, title: `Poste ${seq}`, company: "Exemple",
    country, location, contract_type: "CDI", salary: null, description_html: "<p>x</p>", description_text: "Poste en CDI.",
    description_status: "ok", posted_at: "2026-01-15", is_vie: false, raw_payload: {},
  };
  const id = upsertOffreFromSource(source, offre);
  setOffreScore(id, { score: 50, breakdown: { sector: 0, skills: 0, country: 0 }, reason: "r" });
  return id;
}

beforeEach(() => {
  getDb().exec("DELETE FROM documents; DELETE FROM offres;");
  setSearchZoneIds([]);
});

describe("zones", () => {
  it("appartenance : rayon autour des centres, département pour les offres peu précises", () => {
    const paris = [ZONES.paris];
    expect(inZones({ lat: 48.8049, lng: 2.1204, precision: "commune", code: "78646" }, paris)).toBe(true); // Versailles
    expect(inZones({ lat: 49.4432, lng: 1.0999, precision: "commune", code: "76540" }, paris)).toBe(false); // Rouen
    expect(inZones({ lat: 48.6, lng: 2.4, precision: "departement", code: "91" }, paris)).toBe(true);
    expect(inZones({ lat: 49.2, lng: 4.0, precision: "departement", code: "51" }, paris)).toBe(false);
    expect(inZones({ lat: 46.5197, lng: 6.6323, precision: "ville", code: "CH" }, [ZONES.romandie])).toBe(true); // Lausanne
    expect(inZones({ lat: 47.3769, lng: 8.5417, precision: "ville", code: "CH" }, [ZONES.romandie])).toBe(false); // Zurich
    expect(inZones({ lat: 50.8503, lng: 4.3517, precision: "ville", code: "BE" }, [ZONES.belgique])).toBe(true); // Bruxelles
    expect(inZones({ lat: 50.6326, lng: 5.5797, precision: "ville", code: "BE" }, [ZONES.belgique])).toBe(true); // Liège
    expect(inZones({ lat: 51.2194, lng: 4.4025, precision: "ville", code: "BE" }, [ZONES.belgique])).toBe(false); // Anvers
    expect(inZones({ lat: null, lng: null, precision: "inconnu", code: null }, paris)).toBe(false);
  });

  it("lieux de recherche : zones à la place de leur pays, autres pays inchangés", () => {
    const locs = searchLocations(["France", "Belgique"], [ZONES.lyon, ZONES.romandie], "linkedin", nameToCode).map((l) => l.location);
    expect(locs).toContain("Lyon, Auvergne-Rhône-Alpes, France");
    expect(locs).toContain("Geneva, Switzerland");
    expect(locs).toContain("Belgique");
    expect(locs).not.toContain("France");
    expect(searchLocations(["France"], [], "talent", nameToCode)).toEqual([{ location: "France", country: "FR" }]);
    expect(searchLocations([], [], "talent", nameToCode)).toEqual([{ location: "", country: null }]);
  });

  it("France Travail : départements des zones par paquets de 5", () => {
    expect(departementChunks({ sectors: [], countries: [] })).toEqual([null]);
    expect(departementChunks({ sectors: [], countries: [], zones: [ZONES.paris, ZONES.lyon, ZONES.romandie] })).toEqual([
      ["75", "92", "93", "94", "77"],
      ["78", "91", "95", "69"],
    ]);
  });

  it("réglage enregistré, identifiants inconnus ignorés", () => {
    expect(setSearchZoneIds(["lyon", "nope", "lyon", "romandie"])).toEqual(["lyon", "romandie"]);
    expect(getSearchZoneIds()).toEqual(["lyon", "romandie"]);
    expect(getSearchZones().map((z) => z.label)).toEqual(["Lyon et agglomération", "Suisse romande"]);
  });

  it("filtre « Mes zones » de la liste des offres", () => {
    const villeurbanne = add("Villeurbanne (69)");
    const geneve = add("Genève", "Suisse", "talent");
    add("Marseille (13)");
    add("Zurich", "Suisse", "talent");
    const zones = [ZONES.lyon, ZONES.romandie];
    const all = searchOffres({ zones });
    expect(all.total).toBe(4);
    expect(all.facets.zones.count).toBe(2);
    const only = searchOffres({ zones, zonesOnly: true });
    expect(only.offers.map((o) => o.id).sort()).toEqual([villeurbanne, geneve].sort());
    // Sans zone configurée : aucun filtre, même demandé.
    expect(searchOffres({ zonesOnly: true }).total).toBe(4);
  });

  it("nouvelles zones : Zurich et Zoug, Luxembourg, Pays-Bas (Randstad)", () => {
    const at = (lat: number, lng: number, code: string) => ({ lat, lng, precision: "ville", code });
    expect(inZones(at(47.3769, 8.5417, "CH"), [ZONES.zurich])).toBe(true); // Zurich
    expect(inZones(at(47.1662, 8.5155, "CH"), [ZONES.zurich])).toBe(true); // Zoug
    expect(inZones(at(46.948, 7.4474, "CH"), [ZONES.zurich])).toBe(false); // Berne
    expect(inZones(at(49.6116, 6.1319, "LU"), [ZONES.luxembourg])).toBe(true);
    expect(inZones(at(49.4958, 5.9806, "LU"), [ZONES.luxembourg])).toBe(true); // Esch-sur-Alzette
    expect(inZones(at(49.1193, 6.1757, "FR"), [ZONES.luxembourg])).toBe(false); // Metz
    for (const [lat, lng] of [[52.3676, 4.9041], [51.9244, 4.4777], [52.0907, 5.1214], [52.0705, 4.3007]])
      expect(inZones(at(lat, lng, "NL"), [ZONES.paysbas])).toBe(true);
    expect(inZones(at(51.4416, 5.4697, "NL"), [ZONES.paysbas])).toBe(false); // Eindhoven
    expect(ZONES.belgique.label).toBe("Belgique (Bruxelles et Wallonie)");
  });

  it("lieux interrogés : LinkedIn par ville, Talent.com sans liste pour les Pays-Bas", () => {
    const zones = [ZONES.zurich, ZONES.luxembourg, ZONES.paysbas];
    const li = searchLocations(["Pays-Bas", "Luxembourg", "Suisse"], zones, "linkedin", nameToCode).map((l) => l.location);
    expect(li).toEqual(expect.arrayContaining(["Zurich, Switzerland", "Zug, Switzerland", "Luxembourg", "Amsterdam, North Holland, Netherlands", "The Hague, South Holland, Netherlands"]));
    expect(li).not.toContain("Pays-Bas");
    const talent = searchLocations([], [ZONES.paysbas], "talent", nameToCode);
    expect(talent).toEqual([{ location: "", country: null }]);
  });

  it("nouvelles zones décochées par défaut", () => {
    expect(getSearchZoneIds()).toEqual([]);
    expect(setSearchZoneIds(["zurich", "luxembourg", "paysbas"])).toEqual(["zurich", "luxembourg", "paysbas"]);
  });
});

describe("zones et sources (sans réseau)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubFetch = () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      calls.push(String(input));
      return new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
    }));
    return calls;
  };

  it("Talent.com : lu.talent.com pour la zone Luxembourg, aucun appel pour les Pays-Bas seuls", async () => {
    let calls = stubFetch();
    for await (const _ of talentScraper.scrape({ sectors: ["finance"], countries: [], zones: [ZONES.luxembourg] }, () => {})) void _;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((u) => u.startsWith("https://lu.talent.com/jobs?"))).toBe(true);
    expect(calls[0]).toContain("l=Luxembourg");
    calls = stubFetch();
    for await (const _ of talentScraper.scrape({ sectors: ["finance"], countries: [], zones: [ZONES.paysbas] }, () => {})) void _;
    expect(calls).toEqual([]);
  });

  it("jobup.ch : villes de la zone Zurich et Zoug", async () => {
    const calls = stubFetch();
    for await (const _ of jobupScraper.scrape({ sectors: ["finance"], countries: [], zones: [ZONES.zurich] }, () => {})) void _;
    expect(calls.some((u) => u.includes("Z%C3%BCrich"))).toBe(true);
    expect(calls.some((u) => u.includes("Zug"))).toBe(true);
  });
});

