/**
 * Chiffres du haut de la page Candidatures : entonnoir (envoyées → réponses →
 * entretiens → offres) et candidatures de la semaine. Sans dépendance serveur.
 */
export type TrackerRow = { status: string; applied_at: string | null; reached_interview?: number | boolean | null };

export type FunnelStep = { id: "sent" | "replies" | "interviews" | "offers"; label: string; count: number; rate: number | null };

const REPLIED = new Set(["refusee", "entretien", "acceptee"]);

export function funnel(rows: TrackerRow[]): FunnelStep[] {
  const sent = rows.filter((r) => r.status !== "en_cours");
  const interviews = sent.filter((r) => !!r.reached_interview || r.status === "entretien" || r.status === "acceptee");
  // Une candidature passée par un entretien a forcément reçu une réponse, même archivée depuis.
  const replies = sent.filter((r) => REPLIED.has(r.status) || !!r.reached_interview);
  const offers = sent.filter((r) => r.status === "acceptee");
  const rate = (n: number) => (sent.length ? n / sent.length : null);
  return [
    { id: "sent", label: "Envoyées", count: sent.length, rate: null },
    { id: "replies", label: "Réponses", count: replies.length, rate: rate(replies.length) },
    { id: "interviews", label: "Entretiens", count: interviews.length, rate: rate(interviews.length) },
    { id: "offers", label: "Offres", count: offers.length, rate: rate(offers.length) },
  ];
}

/** Prochaine étape à débloquer : la première étape vide après une étape non vide. */
export function nextStep(steps: FunnelStep[]): FunnelStep["id"] | null {
  for (let i = 1; i < steps.length; i++) if (steps[i].count === 0 && steps[i - 1].count > 0) return steps[i].id;
  return steps[0].count === 0 ? "sent" : null;
}

/** Lundi 00:00 (heure locale) de la semaine de `now`. */
export function weekStart(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - offset);
  return d;
}

/** Candidatures envoyées depuis lundi (la date de candidature fait foi). */
export function sentThisWeek(rows: TrackerRow[], now = new Date()): number {
  const start = weekStart(now);
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  return rows.filter((r) => r.status !== "en_cours" && !!r.applied_at && r.applied_at.slice(0, 10) >= startKey).length;
}
