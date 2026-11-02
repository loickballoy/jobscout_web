"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TARGET_STATUSES, TARGET_STATUS_LABELS, type TargetStatus } from "@/lib/mission/pack";
import type { MissionTarget } from "@/lib/mission/store";
import { SECTOR_LABELS } from "@/lib/scoring/sector";
import { useMissionAction } from "./use-action";

const field = "h-9 w-full min-w-0 rounded-md border border-border bg-bg px-2 text-small text-text focus:border-accent focus:outline-none";
type SortKey = "company" | "country" | "tier" | "status" | "next_date";

export function TargetsTab({ targets }: { targets: MissionTarget[] }) {
  const { run, busy, error } = useMissionAction();
  const [filters, setFilters] = useState({ sector: "", country: "", tier: "", status: "" });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "tier", dir: 1 });
  const countries = [...new Set(targets.map((t) => t.country).filter(Boolean))].sort() as string[];
  const tiers = [...new Set(targets.map((t) => t.tier).filter(Boolean))].sort() as string[];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of targets) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [targets]);

  const shown = targets
    .filter((t) => (!filters.sector || t.sector === filters.sector) && (!filters.country || t.country === filters.country) && (!filters.tier || t.tier === filters.tier) && (!filters.status || t.status === filters.status))
    .sort((a, b) => {
      const va = sort.key === "status" ? TARGET_STATUSES.indexOf(a.status) : (a[sort.key] ?? "￿");
      const vb = sort.key === "status" ? TARGET_STATUSES.indexOf(b.status) : (b[sort.key] ?? "￿");
      return (va < vb ? -1 : va > vb ? 1 : a.company.localeCompare(b.company)) * sort.dir;
    });
  const update = (id: number, patch: Record<string, unknown>) => run(`t-${id}`, "/api/mission/targets", { method: "PUT", body: { id, ...patch } });
  const header = (key: SortKey, label: string) => (
    <th className="py-2 pr-3" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-text" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label} <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" aria-label="Cibles par statut">
        {TARGET_STATUSES.filter((s) => counts[s]).map((s) => <Badge key={s}>{TARGET_STATUS_LABELS[s]} · {counts[s]}</Badge>)}
        {!targets.length && <p className="text-small text-textSecondary">Aucune cible pour l'instant : importez un pack ou ajoutez-en une.</p>}
      </div>

      <Card>
        <div className="grid gap-2 sm:grid-cols-4">
          <select className={field} aria-label="Filtrer par secteur" value={filters.sector} onChange={(e) => setFilters((f) => ({ ...f, sector: e.target.value }))}>
            <option value="">Tous les secteurs</option><option value="finance">{SECTOR_LABELS.finance}</option><option value="conseil">{SECTOR_LABELS.conseil}</option>
          </select>
          <select className={field} aria-label="Filtrer par pays" value={filters.country} onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}>
            <option value="">Tous les pays</option>{countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={field} aria-label="Filtrer par rang" value={filters.tier} onChange={(e) => setFilters((f) => ({ ...f, tier: e.target.value }))}>
            <option value="">Tous les rangs</option>{tiers.map((c) => <option key={c} value={c}>Rang {c}</option>)}
          </select>
          <select className={field} aria-label="Filtrer par statut" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">Tous les statuts</option>{TARGET_STATUSES.map((s) => <option key={s} value={s}>{TARGET_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-small">
            <thead className="text-caption uppercase tracking-wide text-textSecondary">
              <tr>{header("company", "Entreprise")}{header("country", "Pays")}{header("tier", "Rang")}{header("status", "Statut")}<th className="py-2 pr-3">Contact</th><th className="py-2 pr-3">Prochaine action</th>{header("next_date", "Date")}<th className="py-2">Notes</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((t) => (
                <tr key={`${t.id}-${t.updated_at}`} className="align-top">
                  <td className="py-2.5 pr-3">
                    <span className="block font-medium">{t.company}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1 text-caption text-textSecondary">
                      <Badge variant="info">{SECTOR_LABELS[t.sector]}</Badge>{t.type}{t.cv_cluster ? ` · CV ${t.cv_cluster}` : ""}
                    </span>
                    <Link href={`/offres?entreprise=${encodeURIComponent(t.company)}&secteur=tous`} className="mt-1 inline-block text-caption text-accent hover:underline">Offres de cette entreprise</Link>
                  </td>
                  <td className="py-2.5 pr-3">{t.country}{t.city ? ` · ${t.city}` : ""}</td>
                  <td className="py-2.5 pr-3">{t.tier}</td>
                  <td className="py-2.5 pr-3">
                    <select className={field} aria-label={`Statut de ${t.company}`} value={t.status} disabled={busy === `t-${t.id}`} onChange={(e) => update(t.id, { status: e.target.value as TargetStatus })}>
                      {TARGET_STATUSES.map((s) => <option key={s} value={s}>{TARGET_STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 pr-3"><input className={field} aria-label={`Contact chez ${t.company}`} defaultValue={t.contact ?? ""} onBlur={(e) => e.target.value !== (t.contact ?? "") && update(t.id, { contact: e.target.value })} /></td>
                  <td className="py-2.5 pr-3"><input className={field} aria-label={`Prochaine action chez ${t.company}`} defaultValue={t.next_action ?? ""} onBlur={(e) => e.target.value !== (t.next_action ?? "") && update(t.id, { next_action: e.target.value })} /></td>
                  <td className="py-2.5 pr-3"><input type="date" className={field} aria-label={`Date de la prochaine action chez ${t.company}`} defaultValue={t.next_date ?? ""} onBlur={(e) => e.target.value !== (t.next_date ?? "") && update(t.id, { next_date: e.target.value })} /></td>
                  <td className="py-2.5"><input className={field} aria-label={`Notes sur ${t.company}`} defaultValue={t.notes ?? ""} onBlur={(e) => e.target.value !== (t.notes ?? "") && update(t.id, { notes: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <NewTarget />
    </div>
  );
}

function NewTarget() {
  const { run, busy, error } = useMissionAction();
  const [form, setForm] = useState({ company: "", sector: "finance", country: "", city: "", tier: "" });
  return (
    <Card>
      <h2 className="text-h3">Ajouter une cible</h2>
      <form className="mt-3 grid gap-3 sm:grid-cols-5" onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run("new", "/api/mission/targets", { body: { ...form, country: form.country.toUpperCase() } });
        if (ok) setForm({ company: "", sector: form.sector, country: "", city: "", tier: "" });
      }}>
        <label className="block text-small font-semibold sm:col-span-2">Entreprise<Input className="mt-1" required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
        <label className="block text-small font-semibold">Secteur
          <select className={`${field} mt-1 h-11`} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
            <option value="finance">{SECTOR_LABELS.finance}</option><option value="conseil">{SECTOR_LABELS.conseil}</option>
          </select>
        </label>
        <label className="block text-small font-semibold">Pays (code)<Input className="mt-1" maxLength={3} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="CH" /></label>
        <label className="block text-small font-semibold">Ville<Input className="mt-1" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <div className="flex items-center gap-3 sm:col-span-5">
          <Button type="submit" disabled={!!busy || !form.company.trim()}><Plus className="h-4 w-4" /> Ajouter</Button>
          {error && <p role="alert" className="text-small text-danger">{error}</p>}
        </div>
      </form>
    </Card>
  );
}
