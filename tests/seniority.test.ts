import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { searchOffres, setOffreScore, upsertOffreFromSource, type ScrapedOffre } from "@/lib/db/offres";
import { classifySeniority, juniorFriendly, requiredYears, seniorityLabel } from "@/lib/seniority";
import { getExperienceYears, setExperienceYears, setJuniorOnly } from "@/lib/seniority-store";
import { hasTermIn, scoreExperience, scoreOffreLocal } from "@/lib/scoring/local";
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

  it("l'expérience demandée face à la sienne joue sur le score", () => {
    const senior = { title: "Senior ML Engineer", company: "X", country: "France", description_text: "Python, machine learning. 7 years of experience." };
    const junior = { ...senior, title: "Junior ML Engineer", description_text: "Python, machine learning. Jeune diplômé." };
    const fresh = scoreOffreLocal(profile, senior, { experienceYears: 0 });
    const veteran = scoreOffreLocal(profile, senior, { experienceYears: 8 });
    expect(fresh.score).toBeLessThan(veteran.score);
    expect(fresh.reason).toMatch(/7 ans d'expérience demandés/);
    expect(fresh.breakdown.experience).toBe(10);
    expect(veteran.breakdown.experience).toBe(100);
    expect(scoreOffreLocal(profile, junior, { experienceYears: 0 }).score).toBeGreaterThan(fresh.score);
    // Rien d'explicite : neutre, pas de barre « Expérience ».
    const silent = scoreOffreLocal(profile, { ...senior, title: "ML Engineer", description_text: "Python." }, { experienceYears: 0 });
    expect(silent.breakdown.experience).toBeUndefined();
    // Défaut : lu dans les réglages.
    setExperienceYears(8);
    expect(getExperienceYears()).toBe(8);
    expect(scoreOffreLocal(profile, senior).score).toBe(veteran.score);
    setExperienceYears(0);
  });

  it("écart d'expérience gradué", () => {
    const fit = (text: string, years: number) => scoreExperience("Ingénieur", text, years);
    expect(fit("1 an d'expérience", 0)).toMatchObject({ fit: 70, delta: -6 });
    expect(fit("2 ans d'expérience", 0)).toMatchObject({ fit: 45, delta: -12 });
    expect(fit("3 ans d'expérience", 0)).toMatchObject({ fit: 25, delta: -20 });
    expect(fit("6 ans d'expérience", 0)).toMatchObject({ fit: 10, delta: -28 });
    // Expérience suffisante ou poste junior : aucun bonus, c'est la norme.
    expect(fit("3 ans d'expérience", 3)).toMatchObject({ fit: 100, delta: 0 });
    expect(fit("Débutant accepté", 0)).toMatchObject({ fit: 100, delta: 0, junior: true });
    expect(fit("Profil curieux", 0)).toMatchObject({ fit: null, delta: 0 });
  });

  it("sigles ambigus sensibles à la casse : « CAN » ne matche pas « can »", () => {
    expect(hasTermIn("You can work remotely.", "you can work remotely.", "CAN")).toBe(false);
    expect(hasTermIn("Bus CAN, AUTOSAR.", "bus can, autosar.", "CAN")).toBe(true);
    expect(hasTermIn("Take a rest.", "take a rest.", "REST")).toBe(false);
    expect(hasTermIn("Python et docker", "python et docker", "Docker")).toBe(true);
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

describe("compétences écrites avec parenthèses", () => {
  it("chaque forme compte : nom principal ou variantes entre parenthèses", async () => {
    const { skillAliases } = await import("@/lib/scoring/local");
    expect(skillAliases("IA générative (Generative AI)")).toEqual(["IA générative", "Generative AI"]);
    expect(skillAliases("IA explicable (XAI, LIME, SHAP)")).toEqual(["IA explicable", "XAI", "LIME", "SHAP"]);
    expect(skillAliases("C/C++")).toEqual(["C/C++"]);
    expect(skillAliases("Python")).toEqual(["Python"]);
    const withAlias = { ...profile, skills: [{ id: 1, profile_id: 1, name: "IA générative (Generative AI)", category: null, level: null, evidence_experience_ids: [] }] };
    const offer = { title: "AI Engineer", company: "X", country: "Suisse", description_text: "Experience with Generative AI products." };
    const plain = { ...withAlias, skills: [{ ...withAlias.skills[0], name: "Rust" }] };
    expect(scoreOffreLocal(withAlias as never, offer, { experienceYears: 0 }).breakdown.skills).toBeGreaterThan(
      scoreOffreLocal(plain as never, offer, { experienceYears: 0 }).breakdown.skills
    );
  });
});

describe("poids des compétences", () => {
  const skill = (name: string, i: number, anchored = false) => ({ id: i, profile_id: 1, name, category: null, level: null, evidence_experience_ids: anchored ? [1] : [] });
  const offer = { title: "ML Engineer", company: "X", country: "France", description_text: "Python, Docker, Terraform, GCP et SQL." };
  const skillsScore = (names: string[]) =>
    scoreOffreLocal({ ...profile, skills: names.map((n, i) => skill(n, i + 1)) } as never, offer, { experienceYears: 0 }).breakdown.skills;

  it("ne dépend pas de la taille du profil", () => {
    const five = ["Python", "Docker", "Terraform", "GCP", "SQL"];
    const padding = Array.from({ length: 50 }, (_, i) => `Outil${i}`);
    expect(skillsScore([...five, ...padding])).toBe(skillsScore(five));
  });

  it("courbe saturante : plus de compétences trouvées = score plus haut, sans dépasser 100", () => {
    const s1 = skillsScore(["Python"]);
    const s3 = skillsScore(["Python", "Docker", "SQL"]);
    const s5 = skillsScore(["Python", "Docker", "Terraform", "GCP", "SQL"]);
    expect(s1).toBeLessThan(s3);
    expect(s3).toBeLessThan(s5);
    expect(s3).toBeGreaterThanOrEqual(35);
    expect(s5).toBeLessThanOrEqual(100);
  });

  it("un terme trouvé compte une fois (doublons, parenthèses)", () => {
    expect(skillsScore(["GCP", "GCP (Cloud Run)", "gcp"])).toBe(skillsScore(["GCP"]));
  });

  it("couverture des exigences : une exigence clé manquante pèse lourd", () => {
    const keyOffer = { title: "Python Developer", company: "X", country: "France", description_text: "Python et Docker. Kafka est un plus." };
    const withKey = scoreOffreLocal({ ...profile, skills: [skill("Python", 1)] } as never, keyOffer, { experienceYears: 0 }).breakdown.skills;
    const withoutKey = scoreOffreLocal({ ...profile, skills: [skill("Docker", 1)] } as never, keyOffer, { experienceYears: 0 }).breakdown.skills;
    // Python (intitulé, ×3) + Docker (×1) + Kafka (souhaitée, ×0,5) = 4,5.
    expect(withKey).toBe(Math.round((3 / 4.5) * 100));
    expect(withoutKey).toBe(Math.round((1 / 4.5) * 100));
  });
});
