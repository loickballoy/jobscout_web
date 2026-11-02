/**
 * Secteur de l'employeur d'une offre : banque et finance, ESN et conseil, ou autre.
 * Fonction pure, sans dépendance serveur. Ordre de décision :
 *   1. entreprise cible de la Mission (nom égal, ou nom de cible contenu dans celui de l'offre) ;
 *   2. nom connu (lib/scoring/sector-data.ts) ;
 *   3. mots-clés pondérés de l'intitulé (poids doublé) et de la description ;
 *   4. sinon « autre ».
 * Une ESN dont la mission se déroule dans une banque reste « conseil » : son nom ou
 * ses mots-clés l'emportent sur le vocabulaire bancaire de la mission. L'assurance
 * seule n'est pas de la finance.
 */
import { CONSEIL_COMPANIES, CONSEIL_KEYWORDS, FINANCE_COMPANIES, FINANCE_KEYWORDS } from "./sector-data";

export const SECTORS = ["finance", "conseil", "autre"] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_LABELS: Record<Sector, string> = {
  finance: "Banque & finance",
  conseil: "ESN & conseil",
  autre: "Autre secteur",
};

/** Change dès que les règles ou les listes changent : toutes les offres sont reclassées au démarrage. */
export const SECTOR_VERSION = "1";

export function isSector(v: unknown): v is Sector {
  return typeof v === "string" && (SECTORS as readonly string[]).includes(v);
}

const LEGAL_FORMS = new Set(["sa", "sas", "sasu", "sarl", "ag", "gmbh", "nv", "bv", "srl", "ltd", "plc", "inc", "group", "groupe", "holding"]);

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Nom d'entreprise normalisé : minuscules, sans accents ni ponctuation, sans forme
 * juridique, espaces compactés. « Banque Exemple S.A. » → « banque exemple ».
 */
export function companyKey(name: string | null | undefined): string {
  if (!name) return "";
  const tokens = fold(name)
    .replace(/\./g, "") // « S.A. » → « sa », « J.P. Morgan » → « jp morgan »
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t && !LEGAL_FORMS.has(t));
  return tokens.join(" ");
}

/** `inner` (clé) est-il une suite de mots entiers de `outer` (clé) ? */
function containsKey(outer: string, inner: string): boolean {
  return !!inner && ` ${outer} `.includes(` ${inner} `);
}

export type KnownCompany = { key: string; sector: Exclude<Sector, "autre"> };
export type SectorInput = { company: string | null; title: string | null; description: string | null };
export type SectorResult = { sector: Sector; reason: string };

let knownIndex: KnownCompany[] | null = null;
function builtinCompanies(): KnownCompany[] {
  if (!knownIndex) {
    knownIndex = [
      ...FINANCE_COMPANIES.map((n) => ({ key: companyKey(n), sector: "finance" as const })),
      ...CONSEIL_COMPANIES.map((n) => ({ key: companyKey(n), sector: "conseil" as const })),
    ]
      .filter((c) => c.key)
      // Le nom le plus long d'abord : « Sopra Banking Software » avant un nom plus court.
      .sort((a, b) => b.key.length - a.key.length);
  }
  return knownIndex;
}

function matchCompany(key: string, list: KnownCompany[]): KnownCompany | null {
  if (!key) return null;
  return list.find((c) => c.key === key) ?? list.find((c) => containsKey(key, c.key)) ?? null;
}

function textForKeywords(s: string | null): string {
  return fold(s ?? "").replace(/[’`]/g, "'");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const regexCache = new Map<string, RegExp>();
function termRegex(term: string): RegExp {
  let re = regexCache.get(term);
  if (!re) {
    // Pluriel toléré ; tiret ou espace indifférents (« back-office », « back office »).
    const body = escapeRegex(term).replace(/\\-|\s+/g, "[-\\s]");
    re = new RegExp(`(^|[^a-z0-9])${body}s?(?=$|[^a-z0-9])`);
    regexCache.set(term, re);
  }
  return re;
}

type KeywordScore = { score: number; strong: boolean; hits: string[] };

function keywordScore(title: string, text: string, keywords: [string, number][]): KeywordScore {
  let score = 0;
  let strong = false;
  const hits: { term: string; points: number }[] = [];
  for (const [term, weight] of keywords) {
    const re = termRegex(term);
    const points = re.test(title) ? weight * 2 : re.test(text) ? weight : 0;
    if (!points) continue;
    score += points;
    if (weight >= 3) strong = true;
    hits.push({ term, points });
  }
  hits.sort((a, b) => b.points - a.points);
  return { score, strong, hits: hits.map((h) => h.term) };
}

/** Seuil calibré sur les cas de tests/sector.test.ts : un marqueur net, ou deux indices. */
const THRESHOLD = 3;

export function classifySector(input: SectorInput, knownCompanies: KnownCompany[] = []): SectorResult {
  const key = companyKey(input.company);
  const target = matchCompany(key, [...knownCompanies].filter((c) => c.key).sort((a, b) => b.key.length - a.key.length));
  if (target) return { sector: target.sector, reason: "Entreprise cible" };
  const known = matchCompany(key, builtinCompanies());
  if (known) return { sector: known.sector, reason: `Nom connu : ${known.sector === "finance" ? "banque ou finance" : "ESN ou conseil"}` };

  const title = textForKeywords(input.title);
  const text = textForKeywords((input.description ?? "").slice(0, 4000));
  const fin = keywordScore(title, text, FINANCE_KEYWORDS);
  const con = keywordScore(title, text, CONSEIL_KEYWORDS);
  const reason = (s: KeywordScore) => `Mots-clés : ${s.hits.slice(0, 3).join(", ")}`;
  // ESN en mission bancaire : un marqueur net d'ESN l'emporte sur le vocabulaire de la mission.
  if (con.score >= THRESHOLD && (con.strong || con.score >= fin.score)) return { sector: "conseil", reason: reason(con) };
  if (fin.score >= THRESHOLD) return { sector: "finance", reason: reason(fin) };
  return { sector: "autre", reason: fin.hits.length || con.hits.length ? "Indices insuffisants" : "Aucun indice de banque ou de conseil" };
}

/** Options du filtre « Secteur » de la page Offres (paramètre d'URL `secteur`). */
export const SECTOR_FILTERS = ["vises", "finance", "conseil", "autre", "tous"] as const;
export type SectorFilter = (typeof SECTOR_FILTERS)[number];

export const SECTOR_FILTER_LABELS: Record<SectorFilter, string> = {
  vises: "Secteurs visés",
  finance: SECTOR_LABELS.finance,
  conseil: SECTOR_LABELS.conseil,
  autre: SECTOR_LABELS.autre,
  tous: "Tous les secteurs",
};

export function parseSectorFilter(raw: string | null | undefined): SectorFilter {
  return (SECTOR_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as SectorFilter) : "vises";
}

/** Secteurs gardés par une option du filtre ; null = aucun filtre (tous les secteurs). */
export function sectorsForFilter(filter: SectorFilter, targets: Sector[]): Sector[] | null {
  if (filter === "tous") return null;
  if (filter === "vises") return targets.length === SECTORS.length ? null : targets;
  return [filter];
}
