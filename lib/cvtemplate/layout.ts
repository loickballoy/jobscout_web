/**
 * Mise en page commune au PDF et au DOCX du CV maître. Sans dépendance serveur.
 */

const DATE_HINT = /\b(19|20)\d{2}\b|\b(pr[ée]sent|present|aujourd'hui|en cours|today|now)\b|\[(mois|month)\]/i;

/**
 * « Lisbonne (Portugal) · oct. 2023 – févr. 2024 » → date à droite, le reste
 * (lieu, technologies) en ligne secondaire sous le titre. Sans date reconnue,
 * tout reste en ligne secondaire.
 */
export function splitMeta(meta: string | null | undefined): { date: string | null; extra: string | null } {
  if (!meta) return { date: null, extra: null };
  const parts = meta.split(/\s+·\s+/).map((p) => p.trim()).filter(Boolean);
  const i = parts.findIndex((p) => DATE_HINT.test(p));
  if (i === -1) return { date: null, extra: parts.join(" · ") || null };
  const rest = parts.filter((_, j) => j !== i);
  return { date: parts[i], extra: rest.length ? rest.join(" · ") : null };
}
