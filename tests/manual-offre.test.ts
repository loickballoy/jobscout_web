import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPublicUrl, countryFromHost, draftFromHtml, draftToOffre, guessFromText, textToHtml, MANUAL_SOURCE } from "@/lib/offres/manual";
import { getOffre } from "@/lib/db/offres";
import { idsFromApi, idsFromSearchHtml, jobupScraper } from "@/lib/scrapers/jobup";
import { ZONES } from "@/lib/zones";
import type { ScrapedOffre } from "@/lib/scrapers/base";
import { profile } from "./fixtures";

vi.mock("@/lib/db/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/queries")>()),
  getProfile: () => profile,
}));

const LONG = "Au sein de l'équipe IA, tu conçois des pipelines RAG en Python et tu déploies des modèles sur Kubernetes. Expérience avec PyTorch appréciée.";

const LD_PAGE = `<!doctype html><html><head><title>Ingénieur IA | jobup.ch</title>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "JobPosting", title: "Ingénieur·e IA junior", datePosted: "2026-10-20T08:00:00Z",
  description: `<p>${LONG}</p>`, employmentType: "FULL_TIME",
  hiringOrganization: { "@type": "Organization", name: "Exemple SA" },
  jobLocation: { "@type": "Place", address: { addressLocality: "Lausanne", addressCountry: "CH" } },
})}</script></head><body><main><p>Menu</p></main></body></html>`;

afterEach(() => vi.unstubAllGlobals());

describe("ajout manuel — lien", () => {
  it("refuse les liens locaux ou non http", () => {
    for (const bad of ["ftp://exemple.org/x", "http://localhost:3000", "http://192.168.1.10/", "http://[::1]/", "http://nas.local/", "https://jobscout.xperiment.tail2dc953.ts.net/", "http://intranet/", "pas un lien"])
      expect(() => checkPublicUrl(bad), bad).toThrow();
    expect(checkPublicUrl("https://www.jobup.ch/fr/emplois/detail/x/").hostname).toBe("www.jobup.ch");
  });

  it("lit le JobPosting schema.org de la page", () => {
    const d = draftFromHtml(LD_PAGE, new URL("https://www.jobup.ch/fr/emplois/detail/abc/"));
    expect(d.title).toBe("Ingénieur·e IA junior");
    expect(d.company).toBe("Exemple SA");
    expect(d.location).toBe("Lausanne");
    expect(d.country).toBe("Suisse");
    expect(d.posted_at).toBe("2026-10-20");
    expect(d.description_text).toContain("pipelines RAG");
  });

  it("sans JobPosting : titre de la page (nom du site retiré) et bloc de texte principal, pays du domaine", () => {
    const html = `<html><head><title>Data Engineer junior | Exemple Jobs</title></head><body><nav>Accueil Offres</nav><article><h1>Data Engineer</h1><p>${LONG} ${LONG}</p></article></body></html>`;
    const d = draftFromHtml(html, new URL("https://jobs.exemple.be/offre/1"));
    expect(d.title).toBe("Data Engineer junior");
    expect(d.country).toBe("Belgique");
    expect(d.description_text).toContain("pipelines RAG");
    expect(countryFromHost("www.exemple.com")).toBeNull();
  });
});

describe("ajout manuel — texte collé", () => {
  it("première ligne = intitulé, champs « Entreprise : » repris", () => {
    const g = guessFromText(`\nIngénieur logiciel embarqué\nEntreprise : Exemple SA\nLieu : Genève\nContrat : CDI\n\n${LONG}`);
    expect(g).toEqual({ title: "Ingénieur logiciel embarqué", company: "Exemple SA", location: "Genève", contract_type: "CDI" });
  });

  it("HTML échappé, paragraphes conservés", () => {
    expect(textToHtml("a < b\nligne 2\n\nsuite")).toBe("<p>a &lt; b<br>ligne 2</p>\n<p>suite</p>");
  });

  it("identifiant stable : le lien sans paramètres, sinon le contenu", () => {
    const base = { url: "", title: "Poste", company: "X", location: "", country: "Suisse", contract_type: "", salary: "", posted_at: "", description_text: LONG, description_html: "" };
    expect(draftToOffre({ ...base, url: "https://exemple.org/o/1?utm=x" }).source_id).toBe("url:https://exemple.org/o/1");
    expect(draftToOffre(base).source_id).toBe(draftToOffre({ ...base }).source_id);
    expect(draftToOffre(base).source_id).toMatch(/^txt:/);
    expect(() => draftToOffre({ ...base, title: "" })).toThrow(/Intitulé/);
    expect(() => draftToOffre({ ...base, description_text: "court" })).toThrow(/courte/);
    expect(() => draftToOffre({ ...base, url: "http://localhost/x" })).toThrow();
  });

  it("enregistrée sous « manuel » et notée", async () => {
    const { POST } = await import("@/app/api/offres/manual/route");
    const draft = { url: "", title: "Ingénieur IA", company: "Exemple SA", location: "Lausanne", country: "Suisse", contract_type: "CDI", salary: "", posted_at: "", description_text: LONG };
    const res = await POST(new Request("http://x/api/offres/manual", { method: "POST", body: JSON.stringify({ action: "save", draft }) }) as never);
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const o = getOffre(id)!;
    expect(o.source).toBe(MANUAL_SOURCE);
    expect(o.title).toBe("Ingénieur IA");
    expect(o.score_breakdown).not.toBeNull();
    const bad = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action: "save", draft: { ...draft, description_text: "" } }) }) as never);
    expect(bad.status).toBe(422);
  });
});

describe("jobup.ch", () => {
  const A = "1b2c3d4e-0000-4000-8000-00000000000a";
  const B = "1b2c3d4e-0000-4000-8000-00000000000b";

  it("identifiants : liens de détail ou état embarqué, API", () => {
    const html = `<a href="/fr/emplois/detail/${A}/">x</a><a href="/fr/emplois/detail/${A}/?s=1">x</a><script>window.__INIT__={"job_id":"${B.toUpperCase()}"}</script>`;
    expect(idsFromSearchHtml(html)).toEqual([A, B]);
    expect(idsFromApi({ documents: [{ job_id: A }, { id: B }, { job_id: "nope" }] })).toEqual([A, B]);
    expect(idsFromApi({})).toEqual([]);
  });

  it("scan : villes des zones suisses, détail lu sur la page de l'offre", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/api/v1/public/search")) return new Response("{}", { status: 404 });
      if (url.includes("/fr/emplois/?")) return new Response(`<a href="/fr/emplois/detail/${A}/">a</a>`, { status: 200, headers: { "content-type": "text/html" } });
      return new Response(LD_PAGE, { status: 200, headers: { "content-type": "text/html" } });
    }));
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const out: ScrapedOffre[] = [];
    const it = jobupScraper.scrape({ sectors: ["IA"], countries: ["Suisse"], zones: [{ ...ZONES.romandie, talent: ["Lausanne"] }], maxOffres: 5 }, () => {});
    const run = (async () => { for await (const o of it) out.push(o); })();
    await vi.runAllTimersAsync();
    await run;
    vi.useRealTimers();
    expect(calls.some((c) => c.includes("location=Lausanne"))).toBe(true);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source_id: A, title: "Ingénieur·e IA junior", company: "Exemple SA", country: "Suisse", location: "Lausanne", description_status: "ok" });
  });

  it("aucune zone ni pays suisse : rien n'est interrogé", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for await (const _ of jobupScraper.scrape({ sectors: ["IA"], countries: ["France"] }, () => {})) void _;
    expect(f).not.toHaveBeenCalled();
  });
});
