import { describe, expect, it } from "vitest";
import { scoreOffreLocal } from "@/lib/scoring/local";
import { offerCoverage } from "@/lib/scoring/requirements";
import { profile } from "./fixtures";

const skill = (name: string, i: number) => ({ id: i, profile_id: 1, name, category: null, level: null, evidence_experience_ids: [] });
const me = {
  ...profile,
  sectors: ["IA générative", "LLM"],
  target_countries: ["France", "Suisse"],
  preferred_contracts: ["cdi"],
  skills: ["Python", "FastAPI", "Docker", "GCP", "LLM", "IA générative"].map((n, i) => skill(n, i + 1)),
};
const score = (title: string, text: string, country = "France", years = 0) =>
  scoreOffreLocal(me as never, { title, company: "X", country, description_text: text, contract_type: "CDI" }, { experienceYears: years });

describe("score honnête", () => {
  it("tout couvert : score élevé", () => {
    const r = score("Ingénieur IA générative / LLM", "Python, FastAPI, Docker et GCP. Débutant accepté.");
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it("exigences clés manquantes : jamais 100, plafond par exigence clé manquante", () => {
    const text = "Python, FastAPI, Docker et GCP. Kubernetes indispensable. Maîtrise de LangChain. Débutant accepté.";
    const r = score("Ingénieur IA générative / LLM", text);
    expect(r.reason).toMatch(/clés manquantes : .*LangChain/);
    expect(r.reason).toMatch(/clés manquantes : .*Kubernetes/);
    expect(r.score).toBeLessThanOrEqual(76); // 2 exigences clés manquantes
    const full = score("Ingénieur IA générative / LLM", "Python, FastAPI, Docker et GCP. Débutant accepté.");
    expect(r.score).toBeLessThan(full.score);
  });

  it("« un plus » ne pèse presque rien, « indispensable » pèse lourd", () => {
    const nice = offerCoverage(["Python"], "Développeur", "Python. Kafka est un plus.");
    const must = offerCoverage(["Python"], "Développeur", "Python. Kafka indispensable.");
    expect(nice.requirements.find((r) => r.label === "Kafka")?.importance).toBe("nice");
    expect(must.requirements.find((r) => r.label === "Kafka")?.importance).toBe("key");
    expect(nice.ratio!).toBeGreaterThan(must.ratio!);
  });

  it("aucun bonus : bonne langue, bon contrat et poste junior ne font pas monter", () => {
    const a = score("Ingénieur IA générative", "Python, FastAPI, Docker, GCP.");
    const b = score("Ingénieur IA générative", "Python, FastAPI, Docker, GCP. Débutant accepté.");
    expect(b.score).toBe(a.score);
  });

  it("annonce sans compétence technique repérable : score de compétences prudent", () => {
    const r = score("Chargé de mission", "Vous accompagnez nos clients et animez des ateliers.");
    expect(r.breakdown.skills).toBe(40);
    expect(r.reason).toMatch(/aucune compétence technique repérée/);
  });

  it("écart d'expérience de 3 ans ou plus : plafond à 55", () => {
    const r = score("Ingénieur IA générative / LLM", "Python, FastAPI, Docker et GCP. 5 ans d'expérience minimum.");
    expect(r.score).toBeLessThanOrEqual(55);
  });

  it("pays en anglais reconnu (« Switzerland » = « Suisse »)", () => {
    expect(score("Ingénieur LLM", "Python.", "Switzerland").breakdown.country).toBe(100);
    expect(score("Ingénieur LLM", "Python.", "Germany").breakdown.country).toBe(0);
  });
});
