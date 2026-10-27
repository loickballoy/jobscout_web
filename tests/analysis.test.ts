import { describe, expect, it } from "vitest";
import { analyzeOffer, requestedTerms } from "@/lib/scoring/analysis";
import { profile } from "./fixtures";
import { fixtureTemplate } from "./cv-template-fixture";

const skill = (name: string, i: number) => ({ id: i, profile_id: 1, name, category: null, level: null, evidence_experience_ids: [] });
const me = { ...profile, skills: ["Python", "C++17", "GCP (Cloud Run)", "Docker"].map((n, i) => skill(n, i + 1)) };

describe("compétences demandées par l'annonce", () => {
  it("repère les termes, les marque « clés » (intitulé ou deux mentions), ignore « can » anglais", () => {
    const r = requestedTerms("Python Developer", "You can use Docker and Kubernetes. Kubernetes in production. Some SQL.");
    const byLabel = new Map(r.map((t) => [t.label, t.key]));
    expect(byLabel.get("Python")).toBe(true); // intitulé
    expect(byLabel.get("Kubernetes")).toBe(true); // deux mentions
    expect(byLabel.get("Docker")).toBe(false);
    expect(byLabel.get("SQL")).toBe(false);
    expect(byLabel.has("CAN")).toBe(false);
    expect(requestedTerms("Ingénieur embarqué", "Bus CAN et AUTOSAR.").map((t) => t.label)).toContain("CAN");
  });
});

describe("analyse d'une offre", () => {
  const base = {
    profile: me as never,
    breakdown: { sector: 80, language: 100, contract: 100 },
    experienceYears: 0,
    template: fixtureTemplate(),
    cluster: { id: "AI", name: "AI engineering" },
    placeholders: 0,
    inZone: true,
    zoneLabels: ["Lyon et agglomération"],
  };

  it("points forts, points faibles et plan d'action priorisé", () => {
    const a = analyzeOffer({
      ...base,
      offre: {
        title: "Ingénieur Rust (H/F)",
        description_text: "Rust, Docker, C++ et Python. Expérience de 5 ans exigée. Kafka apprécié.",
      },
    });
    expect(a.strengths.join(" ")).toMatch(/Python|C\+\+|Docker/);
    expect(a.strengths.join(" ")).toMatch(/Lyon et agglomération/);
    // « C++17 » du profil couvre « C++ » de l'annonce.
    expect(a.weaknesses.join(" ")).not.toMatch(/C\+\+/);
    expect(a.weaknesses.join(" ")).toMatch(/Compétences clés absentes de ton profil : Rust/);
    expect(a.weaknesses.join(" ")).toMatch(/5 ans d'expérience demandés/);
    const titles = a.actions.map((x) => `${x.priority} ${x.title}`);
    expect(titles).toContain("HIGH Compétence clé demandée : Rust");
    expect(titles).toContain("HIGH Écart d'expérience important (5 ans demandés)");
    expect(titles.some((t) => t.startsWith("MEDIUM Compétences secondaires : Kafka"))).toBe(true);
    // Toujours trié HIGH → MEDIUM → LOW.
    const order = a.actions.map((x) => x.priority);
    expect([...order].sort((x, y) => ["HIGH", "MEDIUM", "LOW"].indexOf(x) - ["HIGH", "MEDIUM", "LOW"].indexOf(y))).toEqual(order);
  });

  it("compétence présente dans le CV maître mais absente du profil : à ajouter (HIGH)", () => {
    // « Yocto » figure dans le bloc de compétences du cluster EMB du modèle fictif.
    const a = analyzeOffer({ ...base, offre: { title: "Ingénieur Yocto", description_text: "Linux, Yocto." } });
    expect(a.actions[0]).toMatchObject({ priority: "HIGH" });
    // « Linux » et « Yocto » figurent dans le modèle fictif (profil EMB, bloc de compétences).
    expect(a.actions.find((x) => x.title.startsWith("Ajouter à ton profil"))?.title).toMatch(/Yocto/);
  });

  it("emplacements non remplis et hors zone", () => {
    const a = analyzeOffer({ ...base, placeholders: 2, inZone: false, offre: { title: "Développeur Python", description_text: "Python." } });
    expect(a.actions[0].title).toBe("Remplir les emplacements du modèle CV");
    expect(a.weaknesses).toContain("En dehors de tes zones de recherche.");
    expect(a.actions.some((x) => x.priority === "LOW" && x.title === "Lieu du poste")).toBe(true);
  });
});

describe("comptage des mentions", () => {
  it("une variante incluse dans une autre ne double pas la mention", () => {
    const r = requestedTerms("Backend Engineer", "Spring Boot et pgvector (base vectorielle).");
    const byLabel = new Map(r.map((t) => [t.label, t.key]));
    expect(byLabel.get("Spring")).toBe(false);
    expect(byLabel.get("vector database")).toBe(false);
  });
});
