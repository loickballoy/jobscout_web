import "server-only";
import * as XLSX from "xlsx";
import { STATUS, type CandidatureWithOffre, type Status } from "@/lib/db/candidatures";

const COLUMNS = [
  "Date",
  "Entreprise",
  "Poste",
  "Pays",
  "Score",
  "Deadline",
  "Statut",
  "Notes",
  "Contact",
  "URL",
];

export function candidaturesToXlsx(rows: CandidatureWithOffre[]): Buffer {
  const data = rows.map((r) => ({
    Date: r.applied_at?.split(" ")[0] ?? "",
    Entreprise: r.offre_company ?? r.ext_company ?? "",
    Poste: r.offre_title ?? r.ext_title ?? "",
    Pays: r.offre_country ?? r.ext_country ?? "",
    Score: r.offre_score ?? r.ext_score ?? "",
    Deadline: r.deadline ?? "",
    Statut: r.status,
    Notes: r.notes ?? "",
    Contact: r.contact ?? "",
    URL: r.offre_url ?? r.ext_url ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data, { header: COLUMNS });
  // column widths
  ws["!cols"] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 36 },
    { wch: 14 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 36 },
    { wch: 24 },
    { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidatures");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return buf;
}

/**
 * Ramène le libellé de statut du fichier importé vers la liste autorisée.
 * Tolère les variantes de casse/accents/espaces ("Envoyée", "En cours") issues d'une
 * édition manuelle dans Excel ; toute valeur inconnue renvoie null (statut déduit ailleurs).
 */
function coerceStatus(raw: string): Status | null {
  const v = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, "_");
  return STATUS.find((s) => s === v) ?? null;
}

export type ImportedCandidature = {
  applied_at: string | null;
  ext_company: string | null;
  ext_title: string | null;
  ext_country: string | null;
  ext_score: number | null;
  deadline: string | null;
  status: Status;
  notes: string | null;
  contact: string | null;
  ext_url: string | null;
};

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/** Date de cellule → « AAAA-MM-JJ 12:00:00 » : nombre Excel, « 29/09/2026 », « 6/10/2026 », « 2026-09-29 ». */
export function parseSheetDate(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")} 12:00:00`;
  }
  const t = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")} 12:00:00`;
  // Jour d'abord (usage français et britannique), année sur 2 ou 4 chiffres.
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) {
    const [day, month] = [Number(m[1]), Number(m[2])];
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} 12:00:00`;
  }
  return null;
}

function truthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  return ["true", "vrai", "oui", "yes", "x", "1"].includes(norm(v));
}

/** Valeur vide ou bouche-trou (« N/A », « - ») → null. */
function clean(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return !t || ["n/a", "na", "-", "—", "none"].includes(t.toLowerCase()) ? null : t;
}

type SheetTable = { name: string; header: string[]; groups: string[]; rows: unknown[][] };

/**
 * Feuille → table : ligne d'en-tête détectée dans les 6 premières lignes (un titre peut la précéder).
 * Les cellules sont lues TELLES QU'AFFICHÉES (raw: false) : un Excel réglé en anglais convertit
 * « 01/10/2026 » tapé pour le 1er octobre en date du 10 janvier, tout en laissant « 29/09/2026 »
 * en texte. Le texte affiché, lu jour d'abord, redonne ce que l'utilisateur a saisi.
 */
function readSheet(wb: XLSX.WorkBook, name: string): SheetTable | null {
  const all = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "" });
  const isHeader = (r: unknown[]) => r.some((c) => /^(company|entreprise|societe)$/.test(norm(c)));
  const h = all.slice(0, 6).findIndex(isHeader);
  if (h === -1) return null;
  // Ligne au-dessus de l'en-tête : libellés de groupes (« Interview 1 », « Interview 2 »…).
  const above = h > 0 ? all[h - 1].map((c) => String(c ?? "").trim()) : [];
  const groups: string[] = [];
  let current = "";
  for (let i = 0; i < all[h].length; i++) {
    if (above[i]) current = above[i];
    groups.push(current);
  }
  return { name, header: all[h].map((c) => norm(c)), groups, rows: all.slice(h + 1) };
}

function col(t: SheetTable, ...names: string[]): number {
  for (const n of names) {
    const i = t.header.findIndex((h) => h === n || h.startsWith(n));
    if (i !== -1) return i;
  }
  return -1;
}

const COMPANY = ["company", "entreprise", "societe"];
const TITLE = ["position", "poste", "titre", "title", "job", "intitule"];

function key(company: unknown, title: unknown): string {
  return `${norm(company)}|${norm(title)}`;
}

/**
 * Import Excel : export de JobScout (une feuille « Candidatures »), ou tracker
 * personnel sur plusieurs feuilles (« Job Details », « Pre-Interview »,
 * « Interviews »…) fusionnées par entreprise + poste. Statut, si aucune
 * colonne « Statut » ne le donne : entretien si la candidature figure dans une
 * feuille d'entretiens ou est cochée « qualifiée » ; refusée si une réponse a
 * été reçue sans entretien ; envoyée sinon.
 */
export function xlsxToCandidatures(buffer: Buffer): ImportedCandidature[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const tables = wb.SheetNames.map((n) => readSheet(wb, n)).filter((t): t is SheetTable => !!t && col(t, ...COMPANY) !== -1);
  if (!tables.length) return [];
  // « Interviews », « Entretiens » — mais pas « Pre-Interview » (le suivi avant entretien).
  const isInterview = (t: SheetTable) => /interview|entretien/.test(norm(t.name)) && !/^pre|avant/.test(norm(t.name));
  // Feuille principale : celle qui a un poste et le plus de lignes remplies, hors entretiens.
  const filled = (t: SheetTable) => t.rows.filter((r) => clean(r[col(t, ...COMPANY)])).length;
  const candidates = tables.filter((t) => !isInterview(t) && col(t, ...TITLE) !== -1);
  const main = (candidates.length ? candidates : tables).sort((a, b) => filled(b) - filled(a))[0];
  const others = tables.filter((t) => t !== main);

  // Lignes des autres feuilles, par entreprise + poste (dans l'ordre : deux candidatures au même poste restent distinctes).
  const pools = others.map((t) => {
    const map = new Map<string, unknown[][]>();
    const c = col(t, ...COMPANY);
    const p = col(t, ...TITLE);
    for (const r of t.rows) {
      if (!clean(r[c])) continue;
      const k = key(r[c], p === -1 ? "" : r[p]);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return { t, map, hasTitle: p !== -1 };
  });

  const out: ImportedCandidature[] = [];
  const m = main;
  const c = { company: col(m, ...COMPANY), title: col(m, ...TITLE) };
  for (const r of m.rows) {
    const company = clean(r[c.company]);
    const title = c.title === -1 ? null : clean(r[c.title]);
    if (!company && !title) continue;

    // Ligne principale + lignes correspondantes des autres feuilles.
    const linked: { t: SheetTable; row: unknown[] }[] = [{ t: m, row: r }];
    for (const pool of pools) {
      const k = key(company, pool.hasTitle ? title : "");
      const list = pool.map.get(k);
      if (list?.length) linked.push({ t: pool.t, row: list.shift()! });
    }
    const get = (...names: string[]): unknown => {
      // Les feuilles d'entretiens ont leurs propres « Status », « Mode », « Notes » : résumées à part.
      for (const { t, row } of linked) {
        if (isInterview(t)) continue;
        const i = col(t, ...names);
        if (i !== -1 && clean(row[i]) !== null) return row[i];
      }
      return null;
    };

    const notes: string[] = [];
    const add = (label: string, v: unknown) => {
      const t = clean(v);
      if (t) notes.push(`${label} : ${t}`);
    };
    add("Type", get("type"));
    add("Mode", get("mode"));
    add("Salaire", get("pay", "salaire", "salary", "remuneration"));
    add("Pièces envoyées", get("sent", "pieces", "documents"));
    add("Fichiers demandés", get("other files"));
    const plainNotes = clean(get("notes", "note"));
    if (plainNotes) notes.push(plainNotes);

    // Feuilles d'entretiens : un résumé par entretien (date, mode, lieu, notes).
    let interviewed = false;
    for (const { t, row } of linked) {
      if (!isInterview(t)) continue;
      interviewed = true;
      const byGroup = new Map<string, string[]>();
      t.header.forEach((h, i) => {
        const g = t.groups[i];
        if (!/interview|entretien/i.test(g)) return;
        const v = h.startsWith("date") ? (parseSheetDate(row[i])?.slice(0, 10) ?? clean(row[i])) : clean(row[i]);
        if (!v) return;
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g)!.push(v);
      });
      for (const [g, parts] of byGroup) notes.push(`${g} : ${parts.join(" · ")}`);
    }

    const explicit = coerceStatus(String(get("statut", "status") ?? ""));
    const qualified = truthy(get("qualified", "qualifie"));
    const replied = truthy(get("reply", "reponse"));
    const status: Status = explicit ?? (interviewed || qualified ? "entretien" : replied ? "refusee" : "envoyee");
    if (!explicit && replied && status === "refusee") notes.push("Réponse reçue, sans entretien (statut déduit à l'import).");

    const score = get("score");
    out.push({
      applied_at: parseSheetDate(get("date applied", "date de candidature", "applied", "date")),
      ext_company: company,
      ext_title: title,
      ext_country: clean(get("pays", "country", "location", "lieu", "localisation")),
      ext_score: score !== null && Number.isFinite(Number(score)) ? Number(score) : null,
      deadline: parseSheetDate(get("deadline", "echeance"))?.slice(0, 10) ?? null,
      status,
      notes: notes.length ? notes.join("\n") : null,
      contact: clean(get("email/phone", "contact", "email", "phone", "telephone")),
      ext_url: clean(get("link", "url", "lien")),
    });
  }
  return out;
}
