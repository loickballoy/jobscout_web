import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getSetting, setSetting } from "@/lib/db";
import { userDataDir } from "@/lib/paths";
import { parseCvTemplate, type CvTemplate } from "./types";

const SETTING_KEY = "cv_template";
const DELETED = "none";
/** Fichier déposé dans le dossier de données (volume Docker) : importé au premier accès s'il n'y a pas encore de modèle. */
export const TEMPLATE_SEED_FILE = "cv-template.json";

export function seedFilePath(): string {
  return path.join(userDataDir(), TEMPLATE_SEED_FILE);
}

/** Modèle enregistré, ou null. Un modèle stocké devenu invalide est ignoré (et signalé dans le journal). */
export function getCvTemplate(): CvTemplate | null {
  const raw = getSetting(SETTING_KEY);
  // Supprimé volontairement : le fichier de départ n'est pas réimporté.
  if (raw === DELETED) return null;
  if (raw) {
    try {
      const parsed = parseCvTemplate(JSON.parse(raw));
      if (parsed.ok) return parsed.template;
      console.log(`[cv-template] modèle enregistré invalide : ${parsed.errors.join(" ; ")}`);
    } catch {
      console.log("[cv-template] modèle enregistré illisible (JSON)");
    }
    return null;
  }
  return importSeedFile();
}

function importSeedFile(): CvTemplate | null {
  const file = seedFilePath();
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = parseCvTemplate(JSON.parse(fs.readFileSync(file, "utf-8")));
    if (!parsed.ok) {
      console.log(`[cv-template] ${file} invalide : ${parsed.errors.join(" ; ")}`);
      return null;
    }
    setSetting(SETTING_KEY, JSON.stringify(parsed.template));
    console.log(`[cv-template] modèle importé depuis ${file}`);
    return parsed.template;
  } catch (e) {
    console.log(`[cv-template] lecture de ${file} impossible : ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function saveCvTemplate(raw: unknown): { ok: true; template: CvTemplate } | { ok: false; errors: string[] } {
  const parsed = parseCvTemplate(raw);
  if (parsed.ok) setSetting(SETTING_KEY, JSON.stringify(parsed.template));
  return parsed;
}

/** Supprime le modèle : la génération revient au CV rédigé par l'IA depuis le profil. */
export function deleteCvTemplate(): void {
  setSetting(SETTING_KEY, DELETED);
}

const BACKUP_KEY = "cv_template_backup";

export type CvTemplateBackup = { saved_at: string; template: unknown };

/** Sauvegarde prise avant le dernier correctif appliqué, ou null. */
export function getCvTemplateBackup(): CvTemplateBackup | null {
  const raw = getSetting(BACKUP_KEY);
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as CvTemplateBackup;
    return b && typeof b.saved_at === "string" && b.template ? b : null;
  } catch {
    return null;
  }
}

/** Enregistre un modèle corrigé après avoir sauvegardé le modèle courant (avec la date). */
export function saveCvTemplateWithBackup(next: CvTemplate, now = new Date()): void {
  const current = getSetting(SETTING_KEY);
  if (current && current !== DELETED)
    setSetting(BACKUP_KEY, JSON.stringify({ saved_at: now.toISOString(), template: JSON.parse(current) }));
  setSetting(SETTING_KEY, JSON.stringify(next));
}

/** Restaure la sauvegarde ; elle devient elle-même le modèle courant (la sauvegarde est consommée). */
export function restoreCvTemplateBackup(): { ok: true; template: CvTemplate } | { ok: false; errors: string[] } {
  const backup = getCvTemplateBackup();
  if (!backup) return { ok: false, errors: ["Aucune version précédente à restaurer."] };
  const parsed = parseCvTemplate(backup.template);
  if (!parsed.ok) return parsed;
  setSetting(SETTING_KEY, JSON.stringify(parsed.template));
  setSetting(BACKUP_KEY, "");
  return parsed;
}
