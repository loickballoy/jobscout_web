"use client";
import { useState, type ComponentProps } from "react";
import { ActionsPanel } from "./actions";
import { PreparePanel, type PrepareProps } from "./prepare-panel";

/**
 * Colonne d'actions de la fiche : « Préparer la candidature » puis la génération des
 * documents, qui partagent le cluster choisi (« CV à utiliser »).
 */
export function OfferWorkspace({ prepare, actions }: { prepare: PrepareProps | null; actions: ComponentProps<typeof ActionsPanel> }) {
  const [cluster, setCluster] = useState("");
  if (!prepare) return <ActionsPanel {...actions} />;
  return (
    <>
      <PreparePanel {...prepare} cluster={cluster} onClusterChange={setCluster} />
      <ActionsPanel {...actions} cluster={cluster} onClusterChange={prepare.autoCluster ? setCluster : undefined} />
    </>
  );
}
