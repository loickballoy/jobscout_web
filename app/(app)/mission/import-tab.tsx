"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Download, Eye, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { RESET_WORD } from "@/lib/mission/pack";
import type { ImportSummary } from "@/lib/mission/store";
import { useMissionAction } from "./use-action";

type Preview = { ok: boolean; dryRun?: boolean; summary?: ImportSummary; errors?: string[] };

const COUNT_LABELS: [keyof ImportSummary, string][] = [["tasks", "Tâches"], ["targets", "Cibles"], ["audit", "Critères d'audit"]];

export function ImportTab({ hasMission }: { hasMission: boolean }) {
  const { run, busy, error, setError } = useMissionAction();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [sending, setSending] = useState(false);

  async function send(dryRun: boolean) {
    let pack: unknown;
    try {
      pack = JSON.parse(text);
    } catch {
      setError("JSON illisible : vérifiez le pack collé.");
      return;
    }
    setDone(null);
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/mission/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pack, dryRun }) });
      const data = (await res.json().catch(() => ({ ok: false, errors: [`Erreur (HTTP ${res.status}).`] }))) as Preview;
      setPreview(data);
      if (data.ok && !dryRun) {
        setDone("Pack importé.");
        setText("");
        router.refresh();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-h3">Importer un pack</h2>
        <p className="mt-1 text-small text-textSecondary">
          Le pack (type « jobscout-mission-pack ») apporte le brief, le plan, les tâches, les cibles et l'audit. L'import fusionne : vos cases
          cochées, statuts, contacts et notes sont conservés.
        </p>
        <Textarea aria-label="Pack JSON" className="mt-3 min-h-[220px] font-mono text-caption" value={text} spellCheck={false}
          onChange={(e) => { setText(e.target.value); setPreview(null); }} placeholder={'{ "type": "jobscout-mission-pack", "version": 1, … }'} />
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setText(await f.text()); setPreview(null); } }} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Charger un fichier .json</Button>
          <Button variant="secondary" disabled={!text.trim() || sending} onClick={() => send(true)}><Eye className="h-4 w-4" /> Prévisualiser</Button>
          <Button disabled={!preview?.ok || !preview.dryRun || sending} onClick={() => send(false)}>
            {sending ? <Spinner size={16} className="text-onAccent" /> : null} Importer
          </Button>
        </div>
        {preview && (
          <div role={preview.ok ? "status" : "alert"} className={`mt-3 rounded-md border bg-surface p-3 text-small ${preview.ok ? "border-border" : "border-danger"}`}>
            {preview.ok && preview.summary ? (
              <ul className="space-y-1">
                {COUNT_LABELS.map(([k, label]) => {
                  const c = preview.summary![k] as { created: string[]; updated: string[]; unchanged: string[] };
                  return <li key={k}><span className="font-semibold">{label}</span> : {c.created.length} créé(s), {c.updated.length} mis à jour, {c.unchanged.length} inchangé(s){c.created.length ? ` — nouveaux : ${c.created.slice(0, 8).join(", ")}${c.created.length > 8 ? "…" : ""}` : ""}</li>;
                })}
                <li><span className="font-semibold">Plan</span> : {preview.summary.plan}</li>
              </ul>
            ) : (
              <ul className="space-y-1 text-danger">{(preview.errors ?? []).map((e, i) => <li key={i} className="flex gap-1.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{e}</li>)}</ul>
            )}
          </div>
        )}
        {done && <p role="status" className="mt-3 text-small text-success">{done}</p>}
        {error && <p role="alert" className="mt-3 text-small text-danger">{error}</p>}
      </Card>

      {hasMission && (
        <>
          <Card>
            <h2 className="text-h3">Exporter l'état actuel</h2>
            <p className="mt-1 text-small text-textSecondary">Même format que le pack, avec les tâches cochées : sauvegarde ou transfert vers une autre installation.</p>
            <Button asChild variant="secondary" className="mt-3"><a href="/api/mission/export" download><Download className="h-4 w-4" /> Exporter</a></Button>
          </Card>
          <Card className="border-danger/40">
            <h2 className="text-h3 text-danger">Réinitialiser la mission</h2>
            <p className="mt-1 text-small text-textSecondary">Supprime le plan, les tâches, les cibles, le journal et les audits. Les offres et candidatures restent. Tapez {RESET_WORD} pour confirmer.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input aria-label={`Tapez ${RESET_WORD}`} className="max-w-xs" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              <Button variant="danger" disabled={confirm !== RESET_WORD || !!busy}
                onClick={async () => { if (await run("reset", "/api/mission/reset", { body: { confirm } })) { setConfirm(""); setDone("Mission réinitialisée."); } }}>
                Réinitialiser
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
