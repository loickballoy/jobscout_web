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
