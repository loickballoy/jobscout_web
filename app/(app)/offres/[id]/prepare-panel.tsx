"use client";
import { useState } from "react";
import { CheckCircle2, ClipboardCopy, MessageSquare, AlertTriangle, XCircle, UserPlus, BookmarkPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { Verdict, VerdictLevel } from "@/lib/mission/verdict";

const VERDICT_LABELS: Record<VerdictLevel, string> = { go: "Go", check: "À vérifier", nogo: "No-go" };

const ICON: Record<VerdictLevel, React.ReactNode> = {
  go: <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />,
  check: <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />,
  nogo: <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />,
};
const VARIANT: Record<VerdictLevel, "success" | "warning" | "danger"> = { go: "success", check: "warning", nogo: "danger" };

export type PrepareProps = {
  offreId: number;
  verdict: Verdict;
  /** Cluster du choix automatique et sa raison ; null sans modèle de CV. */
  autoCluster: { id: string; name: string; reason: string } | null;
  clusters: { id: string; name: string }[];
  initialContact: { name: string; role: string; url: string };
  initialTracked: boolean;
};

export function PreparePanel({ offreId, verdict, autoCluster, clusters, initialContact, initialTracked, cluster, onClusterChange }: PrepareProps & { cluster: string; onClusterChange: (id: string) => void }) {
  const [contact, setContact] = useState(initialContact);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [tracked, setTracked] = useState(initialTracked);
  const chosen = cluster ? clusters.find((c) => c.id === cluster) : null;

  async function call(key: string, url: string, body: unknown, ok: (d: any) => void) {
    setBusy(key);
    setStatus(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `Erreur (HTTP ${res.status}).`);
      ok(d);
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  }

  const contactBody = { name: contact.name, ...(contact.role ? { role: contact.role } : {}), ...(contact.url ? { url: contact.url } : {}) };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h3">Préparer la candidature</h2>
        <Badge variant={VARIANT[verdict.level]}>{VERDICT_LABELS[verdict.level]}</Badge>
      </div>
      <ul className="mt-3 space-y-1.5 text-small">
        {verdict.lines.map((l) => (
          <li key={l.id} className="flex items-start gap-2">
            {ICON[l.level]}
            <span><span className="font-semibold">{l.label}</span> · {l.detail}</span>
          </li>
        ))}
      </ul>

      {autoCluster && (
        <div className="mt-4 border-t border-border pt-4 text-small">
          <p className="font-semibold">CV</p>
          <p className="mt-1 text-textSecondary">
            {chosen ? <>Cluster <span className="font-semibold text-text">{chosen.id}</span> · {chosen.name} (choisi par vous)</>
              : <>Cluster <span className="font-semibold text-text">{autoCluster.id}</span> · {autoCluster.name} ({autoCluster.reason.toLowerCase()} ; l'IA peut l'ajuster à la génération)</>}
          </p>
          <label className="mt-2 block">
            <span className="sr-only">CV à utiliser</span>
            <select value={cluster} onChange={(e) => onClusterChange(e.target.value)} className="h-11 w-full rounded-md border border-border bg-bg px-3 text-small text-text focus:border-accent focus:outline-none">
              <option value="">Automatique (cluster {autoCluster.id})</option>
              {clusters.map((c) => <option key={c.id} value={c.id}>Cluster {c.id} · {c.name}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="mt-4 space-y-2 border-t border-border pt-4">
        <p className="text-small font-semibold">Contact</p>
        <Input aria-label="Nom du contact" placeholder="Nom" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
        <Input aria-label="Rôle du contact" placeholder="Rôle (ex. responsable d'équipe)" value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} />
        <Input aria-label="Lien du profil du contact" type="url" placeholder="Lien du profil (https://…)" value={contact.url} onChange={(e) => setContact({ ...contact, url: e.target.value })} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={!contact.name.trim() || !!busy}
            onClick={() => call("contact", "/api/mission/prepare/contact", { offreId, ...contactBody }, (d) => setStatus({ text: d.target ? "Contact enregistré dans vos cibles." : "Contact gardé pour cette offre (secteur hors cibles)." }))}>
            {busy === "contact" ? <Spinner size={16} /> : <UserPlus className="h-4 w-4" />} Enregistrer le contact
          </Button>
          <Button size="sm" variant="secondary" disabled={!contact.name.trim() || !!busy}
            onClick={() => call("msg", "/api/generate/msg", { offreId, mode: "contact", contact: { name: contact.name, role: contact.role }, ...(cluster ? { cluster } : {}) }, (d) => setMessage(d.text))}>
            {busy === "msg" ? <Spinner size={16} /> : <MessageSquare className="h-4 w-4" />} Message court
          </Button>
        </div>
      </div>

      {message && (
        <div className="mt-3 rounded-md border border-border bg-surface p-3 text-small">
          <p className="whitespace-pre-line">{message}</p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => navigator.clipboard?.writeText(message)}><ClipboardCopy className="h-4 w-4" /> Copier</Button>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <Button className="w-full" variant={tracked ? "secondary" : "primary"} disabled={tracked || !!busy}
          onClick={() => call("track", "/api/mission/prepare/track", { offreId, ...(contact.name.trim() ? { contact: contactBody } : {}) }, () => { setTracked(true); setStatus({ text: "Ajoutée au suivi : relance prévue dans 7 jours." }); })}>
          {busy === "track" ? <Spinner size={16} className="text-current" /> : <BookmarkPlus className="h-4 w-4" />} {tracked ? "Déjà dans le suivi" : "Ajouter au suivi"}
        </Button>
      </div>
      {status && <p role={status.error ? "alert" : "status"} className={`mt-3 text-small ${status.error ? "text-danger" : "text-success"}`}>{status.text}</p>}
    </Card>
  );
}
