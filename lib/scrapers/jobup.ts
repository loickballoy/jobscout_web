import "server-only";
import type { Scraper, ScrapeCriteria, ProgressEvent, ScrapedOffre } from "./base";
import { BROWSER_HEADERS, sleep } from "./dom";
import { nameToCode } from "@/lib/countries";
import { draftFromHtml } from "@/lib/offres/manual";
import { detectVie } from "@/lib/vie";

const SOURCE = "jobup";
const HOST = "https://www.jobup.ch";

// jobup.ch (JobCloud), premier site d'emploi de Suisse romande. Deux façons de
// lister les offres, la seconde servant de repli :
// 1. l'API JSON publique du site (`/api/v1/public/search`) ;
// 2. la page de recherche (`/fr/emplois/?term=…&location=…`), dont on relève les
//    identifiants d'offres (liens `/fr/emplois/detail/<uuid>/` ou état embarqué).
// Le détail est lu sur la page de l'offre : JobPosting schema.org en priorité.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ID_IN_PAGE = new RegExp(`(?:/(?:emplois|jobs|stellenangebote)/detail/|"job_?id"\\s*:\\s*")(${UUID})`, "gi");

export const detailUrl = (id: string) => `${HOST}/fr/emplois/detail/${id}/`;

/** Identifiants d'offres d'une page de recherche (liens ou état JSON embarqué), dans l'ordre. */
export function idsFromSearchHtml(html: string): string[] {
  return [...new Set([...html.matchAll(ID_IN_PAGE)].map((m) => m[1].toLowerCase()))];
}

/** Identifiants d'une réponse de l'API de recherche. */
export function idsFromApi(json: unknown): string[] {
  const docs = (json as { documents?: unknown[] })?.documents;
  if (!Array.isArray(docs)) return [];
  return docs
    .map((d) => (d as Record<string, unknown>)?.job_id ?? (d as Record<string, unknown>)?.id)
    .filter((id): id is string => typeof id === "string" && new RegExp(`^${UUID}$`, "i").test(id))
    .map((id) => id.toLowerCase());
}

async function searchIds(term: string, location: string, page: number): Promise<string[]> {
  try {
    const p = new URLSearchParams({ query: term, location, page: String(page), rows: "20" });
    const res = await fetch(`${HOST}/api/v1/public/search?${p}`, { headers: { ...BROWSER_HEADERS, accept: "application/json" } });
    if (res.ok && /json/i.test(res.headers.get("content-type") ?? "")) {
      const ids = idsFromApi(await res.json());
      if (ids.length) return ids;
    }
  } catch {
    // API indisponible : page de recherche
  }
  const p = new URLSearchParams({ term, location });
  if (page > 1) p.set("page", String(page));
  const res = await fetch(`${HOST}/fr/emplois/?${p}`, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`jobup.ch HTTP ${res.status}`);
  return idsFromSearchHtml(await res.text());
}

export async function fetchDetail(id: string): Promise<ScrapedOffre> {
  const url = detailUrl(id);
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`jobup.ch HTTP ${res.status}`);
  const d = draftFromHtml(await res.text(), new URL(url));
  const ok = d.description_text.length >= 100 && !!d.title;
  return {
    source_id: id,
    url,
    title: d.title,
    company: d.company,
    country: "Suisse",
    location: d.location || null,
    contract_type: d.contract_type || null,
    salary: d.salary || null,
    description_html: d.description_html,
    description_text: d.description_text,
    description_status: ok ? "ok" : "failed",
    posted_at: d.posted_at || null,
    is_vie: detectVie({ source: SOURCE, title: d.title, description: d.description_text, url }),
    raw_payload: { id },
    scrape_errors: ok ? undefined : "description introuvable",
  };
}

export const jobupScraper: Scraper = {
  name: SOURCE,
  async *scrape(criteria: ScrapeCriteria, onEvent: (e: ProgressEvent) => void) {
    onEvent({ kind: "start", source: SOURCE });
    // Villes des zones suisses (Genève, Lausanne…), sinon toute la Suisse si elle est ciblée.
    const zones = (criteria.zones ?? []).filter((z) => z.country === "CH");
    const swiss = criteria.countries.some((c) => nameToCode(c) === "CH");
    const locations = zones.length ? zones.flatMap((z) => z.talent) : swiss || !criteria.countries.length ? [""] : [];
    const max = criteria.maxOffres ?? 80;
    const queries = criteria.sectors.length ? criteria.sectors : [""];
    const ids: string[] = [];
    let lastError: unknown = null;

    outer: for (const q of queries) {
      for (const location of locations) {
        for (let page = 1; page <= 2; page++) {
          try {
            const found = await searchIds(q, location, page);
            for (const id of found) if (!ids.includes(id)) ids.push(id);
            if (ids.length >= max) break outer;
            if (found.length < 15) break;
            await sleep(800);
          } catch (e) {
            lastError = e;
            break;
          }
        }
      }
    }
    // Rien trouvé et chaque recherche a échoué : erreur remontée dans le journal du scan.
    if (!ids.length && lastError) throw lastError;

    const list = ids.slice(0, max);
    onEvent({ kind: "list", source: SOURCE, total: list.length });
    let ok = 0;
    let failed = 0;
    let consecutiveFails = 0;
    for (let i = 0; i < list.length; i++) {
      let status: "ok" | "failed" = "failed";
      try {
        const offre = await fetchDetail(list[i]);
        yield offre;
        status = offre.description_status === "ok" ? "ok" : "failed";
      } catch {
        // détail indisponible
      }
      if (status === "ok") {
        ok++;
        consecutiveFails = 0;
      } else {
        failed++;
        consecutiveFails++;
      }
      onEvent({ kind: "offre", source: SOURCE, index: i + 1, total: list.length, status });
      if (consecutiveFails >= 10) break;
      await sleep(700 + Math.random() * 600);
    }
    onEvent({ kind: "done", source: SOURCE, seen: list.length, ok, failed });
  },
};
