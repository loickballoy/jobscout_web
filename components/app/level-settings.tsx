"use client";
import { useEffect, useState } from "react";
import { GraduationCap, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Spinner } from "@/components/ui/spinner";

/** « Postes junior uniquement » : filtre de la page Offres, malus de score, filtre LinkedIn. */
export function LevelSettings() {
  const [juniorOnly, setJuniorOnly] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/settings/level")
      .then((r) => r.json())
      .then((d) => setJuniorOnly(!!d.juniorOnly))
      .catch(() => setStatus({ text: "Réglage indisponible.", error: true }));
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/level", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ juniorOnly: next }),
      });
      if (!res.ok) throw new Error();
      setJuniorOnly(next);
      // Le niveau entre dans le score : on recalcule toutes les offres.
      const rescore = await fetch("/api/offres/rescore", { method: "POST" });
      const data = await rescore.json().catch(() => ({}));
      setStatus({ text: rescore.ok ? `Enregistré · ${data.rescored ?? 0} offres recalculées` : "Enregistré (scores non recalculés)." });
    } catch {
      setStatus({ text: "Enregistrement impossible.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface text-textSecondary"><GraduationCap className="h-5 w-5" /></div>
        <h2 className="text-h3">Niveau de poste</h2>
      </div>
      <p className="mb-4 text-small text-textSecondary">
        Activé : la page Offres s'ouvre filtrée sur « Junior » (postes junior et postes qui ne précisent pas de niveau ;
        exclut les postes seniors et ceux qui exigent 3 ans d'expérience ou plus), le score pénalise les postes seniors,
        et LinkedIn est interrogé sur les niveaux « Entry level » et « Associate ».
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={juniorOnly === true} onClick={() => !busy && juniorOnly !== null && toggle(!juniorOnly)}>
          Postes junior uniquement
        </Chip>
        {busy && <Spinner size={16} />}
      </div>
      {status && (
        <p role={status.error ? "alert" : "status"} className={`mt-3 inline-flex items-center gap-1.5 text-small ${status.error ? "text-danger" : "text-success"}`}>
          {!status.error && <Check className="h-4 w-4" />} {status.text}
        </p>
      )}
    </Card>
  );
}
