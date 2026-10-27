import "server-only";
import { getSetting, setSetting } from "@/lib/db";

const SETTING_KEY = "junior_only";

/**
 * « Postes junior uniquement » : la page Offres s'ouvre sans les postes seniors
 * (ni ceux qui exigent 3 ans et plus), le score les pénalise, et LinkedIn est
 * interrogé sur les niveaux « Entry level » et « Associate ».
 */
export function getJuniorOnly(): boolean {
  return getSetting(SETTING_KEY) === "1";
}

export function setJuniorOnly(value: boolean): boolean {
  setSetting(SETTING_KEY, value ? "1" : "0");
  return value;
}

/** Années d'expérience professionnelle du candidat (hors stages : 0 pour un jeune diplômé). */
export function getExperienceYears(): number {
  const n = Number(getSetting("experience_years"));
  return Number.isFinite(n) && n >= 0 ? Math.min(40, n) : 0;
}

export function setExperienceYears(n: number): number {
  const v = Math.max(0, Math.min(40, Math.round(n * 2) / 2));
  setSetting("experience_years", String(v));
  return v;
}
