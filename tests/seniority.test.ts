import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { searchOffres, setOffreScore, upsertOffreFromSource, type ScrapedOffre } from "@/lib/db/offres";
import { classifySeniority, juniorFriendly, requiredYears, seniorityLabel } from "@/lib/seniority";
import { getJuniorOnly, setJuniorOnly } from "@/lib/seniority-store";
import { scoreOffreLocal } from "@/lib/scoring/local";
import { profile } from "./fixtures";

describe("niveau demandé par l'offre", () => {
  const cases: [string, string, string, number | null][] = [
    ["Senior Data Engineer", "", "senior", null],
    ["Lead Developer", "", "senior", null],
    ["Développeur Junior C++", "", "junior", null],
    ["Ingénieur IA (H/F)", "Vous justifiez de 5 ans d'expérience minimum en Python.", "senior", 5],
    ["Ingénieur IA", "Expérience : Expérience exigée de 3 An(s)", "mid", 3],
    ["Ingénieur IA", "Expérience : Débutant accepté", "junior", null],
    ["ML Engineer", "You have 3+ years of professional experience in ML.", "mid", 3],
    ["ML Engineer", "At least 5 years in software.", "senior", 5],
    ["Software Engineer", "Requirements: 2-4 years of experience with Python", "junior", 2],
    ["Développeur Python", "Jeune diplômé(e) d'une école d'ingénieur.", "junior", null],
    ["Ingénieur embarqué", "De 0 à 2 ans d'expérience.", "junior", 0],
    ["Ingénieur logiciel", "Notre groupe, fort de 30 ans d'expérience…", "unknown", null],
    ["Data Scientist", "Nous recherchons un profil curieux.", "unknown", null],
  ];
  for (const [title, text, level, years] of cases) {
    it(`${title} — ${text.slice(0, 40) || "(sans description)"}`, () => {
      expect(classifySeniority(title, text)).toEqual({ level, years });
    });
  }

  it("exigence la plus haute retenue, histoires d'entreprise ignorées", () => {
    expect(requiredYears("2 ans d'expérience en Python et 5 ans d'expérience en C++")).toBe(5);
    expect(requiredYears("depuis 40 ans d'expérience")).toBeNull();
  });

  it("accessible à un jeune diplômé : junior ou non précisé", () => {
    expect(["junior", "unknown", "mid", "senior"].map((l) => juniorFriendly(l as never))).toEqual([true, true, false, false]);
    expect(seniorityLabel({ level: "senior", years: 5 })).toBe("Senior · 5 ans+");
    expect(seniorityLabel({ level: "unknown", years: null })).toBeNull();
  });
});

describe("réglage « postes junior uniquement »", () => {
  beforeEach(() => {
    getDb().exec("DELETE FROM documents; DELETE FROM offres;");
    setJuniorOnly(false);
  });

  it("pénalise les postes seniors dans le score, seulement si activé", () => {
    const senior = { title: "Senior ML Engineer", company: "X", country: "France", description_text: "Python, machine learning. 7 years of experience." };
    const junior = { ...senior, title: "Junior ML Engineer", description_text: "Python, machine learning. Jeune diplômé." };
    const off = scoreOffreLocal(profile, senior, { juniorOnly: false });
    const on = scoreOffreLocal(profile, senior, { juniorOnly: true });
    expect(on.score).toBeLessThan(off.score);
    expect(on.reason).toMatch(/poste senior/);
    expect(scoreOffreLocal(profile, junior, { juniorOnly: true }).score).toBeGreaterThan(on.score);
    // Défaut : lu dans les réglages.
    setJuniorOnly(true);
    expect(getJuniorOnly()).toBe(true);
    expect(scoreOffreLocal(profile, senior).score).toBe(on.score);
  });

  it("filtre « Junior » de la liste des offres", () => {
    let seq = 0;
    const add = (title: string, text: string) => {
      seq++;
      const o: ScrapedOffre = {
        source_id: `s-${seq}`, url: `https://example.org/s/${seq}`, title, company: "Exemple", country: "France", location: "Lyon (69)",
        contract_type: "CDI", salary: null, description_html: `<p>${text}</p>`, description_text: text, description_status: "ok",
        posted_at: "2026-01-15", is_vie: false, raw_payload: {},
      };
      const id = upsertOffreFromSource("hellowork", o);
      setOffreScore(id, { score: 50, breakdown: { sector: 0, skills: 0, country: 0 }, reason: "r" });
      return id;
    };
    const junior = add("Développeur Junior", "Python.");
    const unknown = add("Développeur Python", "Python.");
    add("Développeur Senior", "Python.");
    add("Développeur Python", "5 ans d'expérience exigés.");
    const all = searchOffres({});
    expect(all.total).toBe(4);
    expect(all.facets.junior.count).toBe(2);
    expect(searchOffres({ juniorOnly: true }).offers.map((o) => o.id).sort()).toEqual([junior, unknown].sort());
    expect(all.offers.find((o) => o.id === junior)?.seniority).toBe("junior");
  });
});
