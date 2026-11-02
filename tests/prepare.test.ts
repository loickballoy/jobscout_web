import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, setSetting } from "@/lib/db";
import { providerBaseUrlSetting, providerModelsSetting } from "@/lib/ai/client";
import { offerVerdict, requiredLanguages, type VerdictInput } from "@/lib/mission/verdict";
import { capSentences, generateMsgContact } from "@/lib/ai/generate-msg-contact";
import { getOffre, upsertOffreFromSource } from "@/lib/db/offres";
import { listCandidatures } from "@/lib/db/candidatures";
import { getTargetByCompany, resetMission } from "@/lib/mission/store";
import { saveOfferContact, trackPreparedOffer } from "@/lib/mission/prepare";
import { offre, profile } from "./fixtures";

vi.mock("@/lib/db/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/queries")>()),
  getProfile: () => profile,
}));

const base: VerdictInput = {
  title: "Développeur Java junior", description: "Rejoignez notre équipe à Genève.", sector: "finance", targetSectors: ["finance", "conseil"],
  inZone: true, contract: "cdi", preferredContracts: ["cdi", "vie", "stage"], seniority: { level: "junior", years: null },
  profileLanguages: [{ name: "Anglais", level: "C1" }, { name: "Français", level: "natif" }] as VerdictInput["profileLanguages"],
};
const line = (v: ReturnType<typeof offerVerdict>, id: string) => v.lines.find((l) => l.id === id)!;

describe("verdict de l'offre", () => {
  it("Go quand tout correspond", () => {
    expect(offerVerdict(base).level).toBe("go");
  });

  it("secteur hors cibles ou « autre » : No-go", () => {
    expect(offerVerdict({ ...base, sector: "autre" }).level).toBe("nogo");
    expect(line(offerVerdict({ ...base, sector: "conseil", targetSectors: ["finance"] }), "secteur").level).toBe("nogo");
  });

  it("lieu : hors zone à vérifier, V.I.E accepté", () => {
    expect(line(offerVerdict({ ...base, inZone: false }), "lieu").level).toBe("check");
    expect(line(offerVerdict({ ...base, inZone: false, contract: "vie" }), "lieu").level).toBe("go");
  });

  it("niveau : 2 ans OK, 3 à 4 ans à vérifier, 5 ans et plus No-go, stage OK", () => {
    expect(line(offerVerdict({ ...base, seniority: { level: "mid", years: 2 } }), "niveau").level).toBe("go");
    expect(line(offerVerdict({ ...base, seniority: { level: "mid", years: 3 } }), "niveau").level).toBe("check");
    expect(line(offerVerdict({ ...base, seniority: { level: "senior", years: 5 } }), "niveau").level).toBe("nogo");
    expect(line(offerVerdict({ ...base, seniority: { level: "senior", years: null } }), "niveau").level).toBe("nogo");
    expect(line(offerVerdict({ ...base, contract: "stage", seniority: { level: "mid", years: 4 } }), "niveau").level).toBe("go");
  });

  it("langue : allemand exigé No-go, souhaité à vérifier, maîtrisé OK", () => {
    const de = { ...base, description: "Mission en Suisse. Allemand courant indispensable." };
    expect(line(offerVerdict(de), "langue").level).toBe("nogo");
    expect(line(offerVerdict({ ...base, description: "Mission en Suisse. L'allemand est un plus." }), "langue").level).toBe("check");
    expect(line(offerVerdict({ ...de, profileLanguages: [...base.profileLanguages, { name: "Allemand", level: "C1" }] as VerdictInput["profileLanguages"] }), "langue").level).toBe("go");
    expect(requiredLanguages("Software Engineer", "Fluent Dutch is required.")).toEqual([{ iso: "nl", label: "Néerlandais", mandatory: true }]);
    expect(requiredLanguages("Software Engineer", "English is our working language.")).toEqual([]);
  });

  it("contrat hors recherches : à vérifier", () => {
    expect(line(offerVerdict({ ...base, contract: "cdd" }), "contrat").level).toBe("check");
  });
});

describe("contact et suivi", () => {
  beforeEach(() => {
    resetMission();
    getDb().exec("DELETE FROM candidature_events; DELETE FROM candidatures; DELETE FROM documents; DELETE FROM offres;");
  });
  const add = (company: string, description: string) =>
    upsertOffreFromSource("hellowork", {
      source_id: `p-${company}`, url: "https://example.org/p", title: "Développeur Java", company, country: "Suisse", location: "Genève",
      contract_type: "CDI", salary: null, description_html: `<p>${description}</p>`, description_text: description, description_status: "ok",
      posted_at: "2026-11-01", is_vie: false, raw_payload: {},
    });

  it("enregistrer le contact crée la cible (secteur de l'offre), puis la met à jour", () => {
    const id = add("Banque Exemple SA", "Banque privée, gestion de fortune.");
    expect(getOffre(id)!.sector).toBe("finance");
    const t = saveOfferContact(id, { name: "Jean Test", role: "Responsable d'équipe", url: "https://example.org/jean" })!;
    expect(t).toMatchObject({ company: "Banque Exemple SA", sector: "finance", status: "a_contacter", contact: "Jean Test — Responsable d'équipe — https://example.org/jean" });
    saveOfferContact(id, { name: "Jeanne Test" });
    expect(getTargetByCompany("Banque Exemple")!.contact).toBe("Jeanne Test");
    const other = add("Start-up Démo", "Plateforme de réservation.");
    expect(saveOfferContact(other, { name: "Jean Test" })).toBeNull();
  });

  it("ajouter au suivi : candidature envoyée avec contact, cible en « candidature », relance à J+7", () => {
    const id = add("Banque Exemple SA", "Banque privée, gestion de fortune.");
    saveOfferContact(id, { name: "Jean Test" });
    const r = trackPreparedOffer(id, { name: "Jean Test", role: "RH" }, "2026-11-10");
    const c = listCandidatures().find((x) => x.id === r.candidatureId)!;
    expect(c).toMatchObject({ offre_id: id, status: "envoyee", contact: "Jean Test — RH" });
    expect(r.target).toMatchObject({ status: "candidature", next_action: "Relance", next_date: "2026-11-17" });
  });
});

describe("message court à un contact (faux serveur compatible OpenAI)", () => {
  let server: http.Server;
  const seen: { tool: string; user: string }[] = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw) as { tools?: { function: { name: string } }[]; messages: { role: string; content: string }[] };
        const tool = body.tools?.[0]?.function.name ?? "?";
        const user = body.messages.find((m) => m.role === "user")?.content ?? "";
        seen.push({ tool, user });
        const args =
          tool === "build_msg_contact"
            ? { target: "Je vous écris pour le poste de chef de projet digital chez Entreprise Exemple.", proof: "Chez Studio Nova, j'ai piloté 3 refontes de sites e-commerce.", link: "", ask: "Auriez-vous 15 minutes pour un échange ? Merci beaucoup. Bonne journée." }
            : tool === "return_corrections"
            ? { items: user.split(/\n\n?\[\d+\] /).slice(1).map((p) => p.trim()), changes: [] }
            : {};
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ type: "function", function: { name: tool, arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    setSetting("llm:mode", "byok");
    setSetting("llm:provider", "custom");
    setSetting(providerBaseUrlSetting("custom"), `http://127.0.0.1:${port}/v1`);
    setSetting(providerModelsSetting("custom"), JSON.stringify({ writer: "modele-redaction", reviewer: "modele-relecture" }));
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("4 phrases au plus, faits autorisés transmis, relu", async () => {
    seen.length = 0;
    const text = await generateMsgContact(profile, offre, { name: "Jean Test", role: "Responsable d'équipe" }, { facts: "- Studio Nova : 3 refontes de sites e-commerce", lang: "fr" });
    expect(text).toBe("Je vous écris pour le poste de chef de projet digital chez Entreprise Exemple. Chez Studio Nova, j'ai piloté 3 refontes de sites e-commerce. Auriez-vous 15 minutes pour un échange ? Merci beaucoup.");
    const call = seen.find((s) => s.tool === "build_msg_contact")!;
    expect(call.user).toContain("3 refontes de sites e-commerce");
    expect(call.user).not.toContain("Jean Test");
    expect(seen.some((s) => s.tool === "return_corrections")).toBe(true);
    expect(capSentences(["Un. Deux.", "Trois.", "Quatre. Cinq."])).toBe("Un. Deux. Trois. Quatre.");
  });

  it("route msg : mode contact pour une offre non V.I.E ; mode V.I.E inchangé", async () => {
    getDb().exec("DELETE FROM documents; DELETE FROM offres;");
    getDb().exec("DELETE FROM settings WHERE key IN ('cv_template')");
    const id = upsertOffreFromSource("hellowork", {
      source_id: "msg-1", url: "https://example.org/m", title: "Chef de projet digital", company: "Entreprise Exemple", country: "France", location: "Lyon",
      contract_type: "CDI", salary: null, description_html: "<p>x</p>", description_text: offre.description_text, description_status: "ok", posted_at: "2026-11-01", is_vie: false, raw_payload: {},
    });
    const { POST } = await import("@/app/api/generate/msg/route");
    const post = (body: unknown) => POST(new Request("http://x/api/generate/msg", { method: "POST", body: JSON.stringify(body) }) as never);
    const ok = await post({ offreId: id, mode: "contact", contact: { name: "Jean Test", role: "RH" } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).text).toMatch(/^Je vous écris/);
    expect((await post({ offreId: id, mode: "contact", contact: { name: "" } })).status).toBe(400);
    expect((await post({ offreId: id })).status).toBe(400); // V.I.E seulement, comme avant
  });
});
