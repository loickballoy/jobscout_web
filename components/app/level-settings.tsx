"use client";
import { useEffect, useState } from "react";
import { GraduationCap, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";

/** Années d'expérience (entrent dans le score) et « Postes junior uniquement » (filtre Offres, LinkedIn). */
export function LevelSettings() {
  const [juniorOnly, setJuniorOnly] = useState<boolean | null>(null);
  const [years, setYears] = useState("");
  const [savedYears, setSavedYears] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/settings/level")
      .then((r) => r.json())
      .then((d) => {
        setJuniorOnly(!!d.juniorOnly);
        setYears(String(d.experienceYears ?? 0));
        setSavedYears(String(d.experienceYears ?? 0));
      })
      .catch(() => setStatus({ text: "Réglage indisponible.", error: true }));
  }, []);

  async function save(body: { juniorOnly?: boolean; experienceYears?: number }) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/level", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setJuniorOnly(!!d.juniorOnly);
      setYears(String(d.experienceYears));
      setSavedYears(String(d.experienceYears));
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
        Le score compare l'expérience demandée par l'offre à la vôtre : un écart d'un an coûte peu, trois ans ou plus beaucoup,
        un poste junior est favorisé. « Postes junior uniquement » ouvre aussi la page Offres sans les postes seniors (ni ceux qui
        exigent 3 ans et plus) et interroge LinkedIn sur les niveaux « Entry level » et « Associate ».
      </p>
      <label className="mb-4 block max-w-xs text-small font-semibold">
        Vos années d'expérience professionnelle (hors stages)
        <div className="mt-1.5 flex items-center gap-2">
          <Input type="number" min={0} max={40} step={0.5} value={years} onChange={(e) => setYears(e.target.value)} className="w-28" />
          <button type="button" disabled={busy || years === savedYears || !(Number(years) >= 0)} onClick={() => save({ experienceYears: Number(years) })}
            className="inline-flex h-11 items-center rounded-md border border-border px-3 text-small font-semibold disabled:opacity-40 hover:border-accent">
            Enregistrer
          </button>
        </div>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={juniorOnly === true} onClick={() => !busy && juniorOnly !== null && save({ juniorOnly: !juniorOnly })}>
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
