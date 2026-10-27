import "server-only";
import { getSetting, setSetting } from "@/lib/db";
import { getProfile } from "@/lib/db/queries";
import { listOffres, setOffreScore } from "@/lib/db/offres";
import { SCORING_VERSION, scoreOffreLocal } from "./local";

/** Recalcule le score de toutes les offres avec le profil actif. Renvoie le nombre d'offres, ou null sans profil. */
export function rescoreAllOffres(): number | null {
  const profile = getProfile();
  if (!profile) return null;
  let n = 0;
  for (const o of listOffres()) {
    setOffreScore(
      o.id,
      scoreOffreLocal(profile, {
        title: o.title,
        company: o.company,
        country: o.country,
        description_text: o.description_text,
        contract_type: o.contract_type,
      })
    );
    n++;
  }
  setSetting("scoring_version", SCORING_VERSION);
  return n;
}

/** Au démarrage : si la formule a changé depuis le dernier calcul, tout est recalculé une fois. */
export function rescoreIfOutdated(): void {
  if (getSetting("scoring_version") === SCORING_VERSION) return;
  const n = rescoreAllOffres();
  if (n !== null) console.log(`[scoring] formule v${SCORING_VERSION} : ${n} offre(s) recalculée(s)`);
}
