import "server-only";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import type { ScrapedOffre } from "@/lib/scrapers/base";
import { htmlToText } from "@/lib/scrapers/base";
import { BROWSER_HEADERS, extractJobPostingLd, firstMatchHtml, largestTextBlockHtml, parseDocument } from "@/lib/scrapers/dom";
import { normalizeCountryName, strictCountryName } from "@/lib/countries";
import { escapeHtml, decodeHtmlEntities } from "@/lib/text/entities";
import { detectVie } from "@/lib/vie";
import type { ManualDraft } from "./manual-text";

export { guessFromText, type ManualDraft } from "./manual-text";

/**
 * Ajout manuel d'une offre : à partir d'un lien (page récupérée, JobPosting
 * schema.org lu en priorité) ou d'un texte collé. Le lien sert de brouillon que
 * l'utilisateur relit avant d'enregistrer ; l'offre est rangée sous la source
 * « manuel » et notée comme les autres.
 */
export const MANUAL_SOURCE = "manuel";


const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 15_000;

/**
 * Lien public uniquement : http(s), nom d'hôte complet, aucune adresse IP privée
 * ni nom local. Le serveur tourne sur le homelab, à côté d'autres services : il
 * ne doit pas servir à interroger le réseau local.
 */
export function checkPublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("Lien invalide.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Seuls les liens http(s) sont acceptés.");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(host)) throw new Error("Lien vers une adresse IP refusé : utilise l'adresse du site.");
  if (!host.includes(".") || /\.(local|lan|internal|home|localhost|ts\.net)$/.test(host) || host === "localhost")
    throw new Error("Lien vers un réseau local refusé.");
  return u;
}

/** Pays déduit du domaine (« jobup.ch » → Suisse), faute de mieux. */
export function countryFromHost(host: string): string | null {
  const tld = host.split(".").pop()?.toUpperCase() ?? "";
  return tld.length === 2 ? strictCountryName(tld === "UK" ? "GB" : tld) : null;
}

/** Texte collé → HTML simple (paragraphes, lignes conservées), échappé. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** Lecture d'une page d'offre déjà téléchargée (testable sans réseau). */
export function draftFromHtml(html: string, url: URL): ManualDraft {
  const doc = parseDocument(html);
  const ld = extractJobPostingLd(doc);
  const meta = (name: string) =>
    doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content")?.trim() ?? "";
  const descHtml =
    ld?.description_html ??
    firstMatchHtml(doc, ['[itemprop="description"]', '[data-cy="vacancy-description"]', '[class*="description" i]', "article", "main"], 200) ??
    largestTextBlockHtml(doc, 200) ??
    "";
  const text = descHtml ? htmlToText(descHtml) : meta("og:description") || meta("description");
  const title = ld?.title || meta("og:title") || decodeHtmlEntities(doc.querySelector("title")?.textContent?.trim() ?? "");
  return {
    url: url.toString(),
    // Titre de page (« Ingénieur IA | jobup.ch ») : nom du site retiré.
    title: (ld?.title ? title : title.replace(/\s+\|\s+[^|]{1,40}$/, "")).trim(),
    company: ld?.company ?? "",
    location: ld?.locality ?? "",
    country: normalizeCountryName(ld?.country) ?? countryFromHost(url.hostname) ?? "",
    contract_type: ld?.contract_type ?? "",
    salary: ld?.salary ?? "",
    posted_at: ld?.posted_at ? String(ld.posted_at).slice(0, 10) : "",
    description_text: text,
    description_html: descHtml,
  };
}

export async function draftFromUrl(raw: string): Promise<ManualDraft> {
  const url = checkPublicUrl(raw);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // Redirections suivies à la main : chacune doit rester vers un site public.
    let current = url;
    let res: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(current, { headers: BROWSER_HEADERS, redirect: "manual", signal: ctrl.signal });
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!loc) break;
      current = checkPublicUrl(new URL(loc, current).toString());
      res = null;
    }
    if (!res) throw new Error("Trop de redirections.");
    if (!res.ok) throw new Error(`Le site a répondu ${res.status} : colle plutôt le texte de l'offre.`);
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) throw new Error("Ce lien n'est pas une page web : colle plutôt le texte de l'offre.");
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error("Page trop lourde : colle plutôt le texte de l'offre.");
    return draftFromHtml(new TextDecoder("utf-8").decode(buf), current);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Le site ne répond pas : colle plutôt le texte de l'offre.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Brouillon relu → offre à enregistrer. Identifiant stable : le lien, sinon le contenu. */
export function draftToOffre(d: ManualDraft, original?: Pick<ManualDraft, "description_text" | "description_html">): ScrapedOffre {
  const text = d.description_text.trim();
  const title = d.title.trim();
  if (!title) throw new Error("Intitulé manquant.");
  if (text.length < 80) throw new Error("Description trop courte : colle le texte complet de l'offre.");
  const url = d.url.trim();
  if (url) checkPublicUrl(url);
  // HTML d'origine gardé seulement si le texte n'a pas été retouché.
  const keepHtml = !!original?.description_html && original.description_text.trim() === text;
  const id = url
    ? `url:${url.replace(/[#?].*$/, "")}`
    : `txt:${createHash("sha1").update(`${title}\n${d.company}\n${text}`).digest("hex").slice(0, 16)}`;
  return {
    source_id: id,
    url,
    title,
    company: d.company.trim(),
    country: normalizeCountryName(d.country.trim()) ?? null,
    location: d.location.trim() || null,
    contract_type: d.contract_type.trim() || null,
    salary: d.salary.trim() || null,
    description_html: keepHtml ? original!.description_html : textToHtml(text),
    description_text: text,
    description_status: "ok",
    posted_at: /^\d{4}-\d{2}-\d{2}$/.test(d.posted_at.trim()) ? d.posted_at.trim() : new Date().toISOString().slice(0, 10),
    is_vie: detectVie({ source: MANUAL_SOURCE, title, description: text, url }),
    raw_payload: { manual: true },
  };
}
