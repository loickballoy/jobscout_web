import { beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/db";
import { parseSheetDate, xlsxToCandidatures, candidaturesToXlsx } from "@/lib/excel/io";
import {
  archiveStaleCandidatures,
  createCandidature,
  importedCandidatureExists,
  listCandidatures,
  updateCandidature,
} from "@/lib/db/candidatures";

/** Tracker personnel fictif, même structure qu'un vrai : titre, 3 feuilles, cases à cocher. */
function trackerWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();
  const details = XLSX.utils.aoa_to_sheet([
    ["Job Details"],
    ["Company", "Position", "Link", "Email/Phone", "Location", "Type", "Mode", "Pay", "Sent"],
    ["Acme", "Junior ML Engineer", "https://example.org/acme", "jobs@acme.example", "Geneva, CH", "Full-time", "Hybrid", "CHF 90k", "Resume"],
    ["Globex", "Graduate Software Engineer", "https://example.org/globex", "N/A", "London, UK", "Full-time", "In-person", "", "Resume, Cover Letter"],
    ["Initech", "Embedded Engineer", "", "", "Lyon, FR", "Full-time", "Hybrid", "", "Resume"],
    ["Initech", "Embedded Engineer", "", "", "Paris, FR", "Full-time", "Hybrid", "", "Resume"],
  ]);
  const pre = XLSX.utils.aoa_to_sheet([
    ["Pre-Interview"],
    ["Company", "Position", "Email/Phone", "Date Applied", "Reply Received?", "Send Follow-up", "Other Files Requested", "Research Done", "Qualified for Interview?"],
    ["Acme", "Junior ML Engineer", "jobs@acme.example", "29/09/2026", true, false, "", false, false],
    ["Globex", "Graduate Software Engineer", "", "29/09/2026", true, false, "", false, true],
    ["Initech", "Embedded Engineer", "", "", false, false, "", false, false],
    ["Initech", "Embedded Engineer", "", "25/10/2026", false, false, "", false, false],
    ["", "", "", "", false, false, "", false, false],
  ]);
  // « 01/10/2026 » tapé pour le 1er octobre, converti par un Excel anglais en 10 janvier (format m/d).
  const serial = 46032; // 10/01/2026
  pre["D5"] = { t: "n", v: serial, z: "mm/dd/yyyy", w: "01/10/2026" };
  const interviews = XLSX.utils.aoa_to_sheet([
    ["Progress & Details", "", "", "", "Interview 1", "", "", "", ""],
    ["Status", "Company", "Position", "Email/Phone", "Date", "Mode", "Location/Platform", "Status", "Notes"],
    ["Interview 1", "Globex", "Graduate Software Engineer", "", "6/10/2026", "Online", "HackerRank", "", "Assessment"],
  ]);
  XLSX.utils.book_append_sheet(wb, details, "Job Details");
  XLSX.utils.book_append_sheet(wb, pre, "Pre-Interview");
  XLSX.utils.book_append_sheet(wb, interviews, "Interviews");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

beforeEach(() => {
  getDb().exec("DELETE FROM candidatures;");
});

describe("import d'un tracker Excel personnel", () => {
  it("fusionne les feuilles, déduit le statut, lit les dates jour d'abord", () => {
    const rows = xlsxToCandidatures(trackerWorkbook());
    expect(rows.map((r) => [r.ext_company, r.applied_at?.slice(0, 10), r.status])).toEqual([
      ["Acme", "2026-09-29", "refusee"], // réponse reçue, pas d'entretien
      ["Globex", "2026-09-29", "entretien"], // feuille Interviews
      ["Initech", "2026-10-01", "envoyee"], // date convertie à tort par Excel : 1er octobre
      ["Initech", "2026-10-25", "envoyee"], // même poste, deuxième candidature distincte
    ]);
    const acme = rows[0];
    expect(acme.contact).toBe("jobs@acme.example");
    expect(acme.ext_country).toBe("Geneva, CH");
    expect(acme.ext_url).toBe("https://example.org/acme");
    expect(acme.notes).toContain("Salaire : CHF 90k");
    expect(acme.notes).toContain("Réponse reçue, sans entretien");
    expect(rows[1].contact).toBeNull(); // « N/A »
    expect(rows[1].notes).toContain("Interview 1 : 2026-10-06 · Online · HackerRank · Assessment");
    expect(rows[1].notes).not.toContain("Réponse reçue");
  });

  it("relit l'export de JobScout (une feuille, colonne Statut)", () => {
    const id = createCandidature({ offre_id: null, ext_company: "Acme", ext_title: "Dev", applied_at: "2026-10-20 12:00:00", status: "entretien", notes: "n" });
    expect(id).toBeGreaterThan(0);
    const rows = xlsxToCandidatures(candidaturesToXlsx(listCandidatures()));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ext_company: "Acme", ext_title: "Dev", status: "entretien", applied_at: "2026-10-20 12:00:00" });
  });

  it("dates de cellule", () => {
    expect(parseSheetDate("29/09/2026")).toBe("2026-09-29 12:00:00");
    expect(parseSheetDate("6/10/2026")).toBe("2026-10-06 12:00:00");
    expect(parseSheetDate("2026-10-06")).toBe("2026-10-06 12:00:00");
    expect(parseSheetDate(46032)).toBe("2026-01-10 12:00:00");
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("31/13/2026")).toBeNull();
  });
});

describe("archivage automatique", () => {
  const now = new Date("2026-10-26T09:00:00Z");

  it("archive les « Envoyée » sans réponse après 14 jours, avec une note", () => {
    const old = createCandidature({ offre_id: null, ext_company: "A", applied_at: "2026-10-12 12:00:00", status: "envoyee", notes: "ma note" });
    const recent = createCandidature({ offre_id: null, ext_company: "B", applied_at: "2026-10-13 12:00:00", status: "envoyee" });
    const interview = createCandidature({ offre_id: null, ext_company: "C", applied_at: "2026-09-01 12:00:00", status: "entretien" });
    const prep = createCandidature({ offre_id: null, ext_company: "D", applied_at: "2026-09-01 12:00:00", status: "en_cours" });
    expect(archiveStaleCandidatures(14, now)).toBe(1);
    const byId = new Map(getDb().prepare("SELECT id, status, notes FROM candidatures").all().map((r: any) => [r.id, r]));
    expect((byId.get(old) as any).status).toBe("archivee");
    expect((byId.get(old) as any).notes).toBe("ma note\nArchivée automatiquement le 26/10/2026 : sans réponse 14 jours après la candidature.");
    expect((byId.get(recent) as any).status).toBe("envoyee");
    expect((byId.get(interview) as any).status).toBe("entretien");
    expect((byId.get(prep) as any).status).toBe("en_cours");
    expect(archiveStaleCandidatures(14, now)).toBe(0); // idempotent
  });

  it("envoyée après préparation : la date de candidature devient aujourd'hui", () => {
    const id = createCandidature({ offre_id: null, ext_company: "E", applied_at: "2026-09-01 12:00:00", status: "en_cours" });
    updateCandidature(id, { status: "envoyee" });
    const row = getDb().prepare("SELECT applied_at FROM candidatures WHERE id = ?").get(id) as { applied_at: string };
    expect(row.applied_at.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
    updateCandidature(id, { applied_at: "2026-10-02 12:00:00" });
    expect((getDb().prepare("SELECT applied_at FROM candidatures WHERE id = ?").get(id) as any).applied_at).toBe("2026-10-02 12:00:00");
  });

  it("doublons d'import repérés (entreprise, poste, date)", () => {
    createCandidature({ offre_id: null, ext_company: "Acme", ext_title: "Junior ML Engineer", applied_at: "2026-09-29 12:00:00" });
    expect(importedCandidatureExists("acme ", "Junior ML Engineer", "2026-09-29 12:00:00")).toBe(true);
    expect(importedCandidatureExists("Acme", "Junior ML Engineer", "2026-10-01 12:00:00")).toBe(false);
  });
});
