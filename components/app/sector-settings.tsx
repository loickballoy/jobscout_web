"use client";
import { useEffect, useState } from "react";
import { Building2, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Spinner } from "@/components/ui/spinner";
import { SECTORS, SECTOR_LABELS, type Sector } from "@/lib/scoring/sector";

const CHOICE_LABELS: Record<Sector, string> = { ...SECTOR_LABELS, autre: "Autres secteurs" };

/** Secteurs d'employeur visés : option « Secteurs visés » de la page Offres, plan du jour et verdict des offres. */
export function SectorSettings() {
  const [selected, setSelected] = useState<Sector[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/settings/sectors")
      .then((r) => r.json())
      .then((d) => setSelected(d.sectors ?? [...SECTORS]))
      .catch(() => setStatus({ text: "Réglage indisponible.", error: true }));
  }, []);

  async function toggle(sector: Sector) {
    if (!selected || busy) return;
    const next = selected.includes(sector) ? selected.filter((s) => s !== sector) : [...selected, sector];
    if (!next.length) {
      setStatus({ text: "Gardez au moins un secteur.", error: true });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/sectors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sectors: next }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setSelected(d.sectors);
      setStatus({ text: "Enregistré" });
    } catch (e) {
      setStatus({ text: e instanceof Error && e.message ? e.message : "Enregistrement impossible.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface text-textSecondary"><Building2 className="h-5 w-5" /></div>
        <h2 className="text-h3">Secteurs d'employeur visés</h2>
      </div>
      <p className="mb-4 text-small text-textSecondary">
        La page Offres s'ouvre sur ces secteurs (option « Secteurs visés » du filtre Secteur). Chaque offre est classée d'après le nom
        de l'entreprise, vos entreprises cibles et les mots de l'annonce.
      </p>
      <div role="group" aria-label="Secteurs d'employeur visés" className="flex flex-wrap items-center gap-2">
        {SECTORS.map((s) => (
          <Chip key={s} active={!!selected?.includes(s)} onClick={() => toggle(s)}>
            {CHOICE_LABELS[s]}
          </Chip>
        ))}
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
