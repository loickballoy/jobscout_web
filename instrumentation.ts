/**
 * Point d'entrée exécuté une fois au démarrage du serveur Next.js : programme
 * le scan quotidien (lib/scan/daily.ts) quand JOBSCOUT_DAILY_SCAN est défini,
 * et recalcule les scores si la formule a changé (lib/scoring/rescore.ts).
 *
 * Le test NEXT_RUNTIME doit encadrer l'import tel quel : remplacé à la
 * compilation, il retire la base SQLite du paquet Edge, qui ne la supporte pas.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDailyScan } = await import("@/lib/scan/daily");
    startDailyScan();
    // Formule de score modifiée par une mise à jour : les offres en base sont recalculées une fois.
    const { rescoreIfOutdated } = await import("@/lib/scoring/rescore");
    try {
      rescoreIfOutdated();
    } catch (e) {
      console.log(`[scoring] recalcul au démarrage impossible : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
