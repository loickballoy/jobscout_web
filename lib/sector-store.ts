import "server-only";
import { getDb, getSetting, parseJson, setSetting, transaction } from "@/lib/db";
import { SECTORS, SECTOR_VERSION, classifySector, isSector, type KnownCompany, type Sector, type SectorResult } from "@/lib/scoring/sector";

const TARGET_KEY = "target_sectors";

/** Secteurs d'employeur visés (Profil) : les trois par défaut, pour ne rien changer tant qu'on ne choisit pas. */
export function getTargetSectors(): Sector[] {
  const saved = parseJson<unknown[]>(getSetting(TARGET_KEY), [...SECTORS]);
  const clean = Array.isArray(saved) ? SECTORS.filter((s) => saved.includes(s)) : [...SECTORS];
  return clean.length ? clean : [...SECTORS];
}

export function setTargetSectors(values: unknown[]): Sector[] {
  const clean = SECTORS.filter((s) => values.some((v) => v === s));
  if (!clean.length) throw new Error("Choisissez au moins un secteur.");
  setSetting(TARGET_KEY, JSON.stringify(clean));
  return clean;
}

/** Entreprises cibles de la Mission (table mission_targets), qui priment sur toute autre règle. */
export function knownTargetCompanies(): KnownCompany[] {
  try {
    const rows = getDb().prepare("SELECT company_key AS key, sector FROM mission_targets").all() as { key: string; sector: string }[];
    return rows.filter((r) => r.key && (r.sector === "finance" || r.sector === "conseil")) as KnownCompany[];
  } catch {
    return [];
  }
}

export function sectorOfOffre(o: { company: string | null; title: string | null; description_text: string | null }, known = knownTargetCompanies()): SectorResult {
  return classifySector({ company: o.company, title: o.title, description: (o.description_text ?? "").slice(0, 4000) }, known);
}

export function writeOffreSector(id: number, o: { company: string | null; title: string | null; description_text: string | null }): void {
  const r = sectorOfOffre(o);
  getDb().prepare("UPDATE offres SET sector = ?, sector_reason = ? WHERE id = ?").run(r.sector, r.reason, id);
}

/** Reclasse toutes les offres, en une transaction. Renvoie le nombre d'offres. */
export function reclassifyAllOffres(): number {
  const db = getDb();
  const known = knownTargetCompanies();
  const rows = db.prepare("SELECT id, company, title, substr(description_text, 1, 4000) AS description_text FROM offres").all() as {
    id: number; company: string | null; title: string | null; description_text: string | null;
  }[];
  const write = db.prepare("UPDATE offres SET sector = ?, sector_reason = ? WHERE id = ? AND (sector IS NOT ? OR sector_reason IS NOT ?)");
  transaction(() => {
    for (const row of rows) {
      const r = sectorOfOffre(row, known);
      write.run(r.sector, r.reason, row.id, r.sector, r.reason);
    }
  });
  setSetting("sector_version", SECTOR_VERSION);
  return rows.length;
}

/** Au démarrage : règles changées depuis le dernier classement → tout est reclassé une fois. */
export function reclassifyIfOutdated(): void {
  if (getSetting("sector_version") === SECTOR_VERSION) return;
  const n = reclassifyAllOffres();
  console.log(`[secteur] règles v${SECTOR_VERSION} : ${n} offre(s) classée(s)`);
}

export { isSector };
