import { offresCounts, parseMinScore, searchOffres } from "@/lib/db/offres";
import { getDistanceHome, suggestedDistanceHome } from "@/lib/distance/home";
import { PageHeader } from "@/components/app/page-header";
import { OffresList } from "./list";
import { ScanButton } from "./scan-button";
import { AddOffreButton } from "./add-offre-button";
import { getSearchZones } from "@/lib/zones-store";
import { getJuniorOnly } from "@/lib/seniority-store";

export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("fr-FR");

function plural(count: number, word: string): string {
  return `${numberFormat.format(count)} ${word}${count > 1 ? "s" : ""}`;
}

export default async function OffresPage({ searchParams }: { searchParams: Promise<{ vie?: string; score?: string }> }) {
  const { vie, score } = await searchParams;
  const vieOnly = vie === "1";
  // ?score=70 (carte « Offres à 70 et plus » de l'accueil) active la puce de score à ce seuil.
  const minScore = parseMinScore(score);
  // Même requête que celle de la liste côté navigateur : ?vie=1 coche la puce contrat « V.I.E ».
  const home = getDistanceHome();
  // Zones choisies (Profil › Recherche) : la liste démarre filtrée sur elles.
  const zones = getSearchZones();
  // « Postes junior uniquement » (Profil) : la liste démarre sans les postes seniors.
  const juniorOnly = getJuniorOnly();
  const initial = searchOffres({ contracts: vieOnly ? ["vie"] : [], minScore, home, zones, zonesOnly: zones.length > 0, juniorOnly });
  // Ville du profil proposée (jamais enregistrée d'office) ; le sélecteur la masque tant qu'une ville est choisie.
  const homeSuggestion = suggestedDistanceHome();
  // Total et V.I.E lus dans les facettes (sans le filtre de score, pour décrire la base) : mêmes chiffres que la liste et la puce « V.I.E ».
  const { total, contractCounts } = initial.facets;
  const subtitle = [
    plural(total, "offre"),
    `${numberFormat.format(offresCounts().today)} aujourd'hui`,
    ...(contractCounts.vie > 0 ? [`${numberFormat.format(contractCounts.vie)} V.I.E`] : []),
  ].join(" · ");

  return (
    <>
      <PageHeader
        eyebrow="Découvrir"
        title="Vos prochaines opportunités"
        subtitle={subtitle}
        actions={<div className="flex flex-wrap gap-2"><AddOffreButton /><ScanButton /></div>}
      />
      <OffresList initialResult={initial} initialVieOnly={vieOnly} initialMinScore={minScore} homeSuggestion={homeSuggestion} initialZonesOnly={zones.length > 0} initialJuniorOnly={juniorOnly} />
    </>
  );
}
