"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Eye, RotateCcw, Upload, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Preview = {
  ok: boolean;
  description: string;
  summary: string[];
  errors: string[];
  placeholders: { where: string; lang: string; placeholders: string[] }[];
  dryRun?: boolean;
};

/**
 * Correctif JSON du modèle (type « jobscout-cv-patch ») : aperçu, application si le
 * modèle obtenu est valide, puis restauration de la version précédente.
 */
export function PatchPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [backup, setBackup] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadBackup() {
    const d = await fetch("/api/cv-template/restore").then((r) => r.json()).catch(() => ({}));
    setBackup(d.backup ?? null);
  }
  useEffect(() => {
    void loadBackup();
  }, []);

  function parse(): unknown | undefined {
    try {
      return JSON.parse(text);
    } catch {
      setMessage({ text: "JSON illisible : vérifiez le correctif collé.", error: true });
      return undefined;
    }
  }

  async function run(dryRun: boolean) {
    const patch = parse();
    if (patch === undefined) return;
    setBusy(dryRun ? "preview" : "apply");
    setMessage(null);
    try {
      const res = await fetch("/api/cv-template/patch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patch, dryRun }) });
      const d = (await res.json().catch(() => ({ ok: false, errors: [`Erreur (HTTP ${res.status}).`] }))) as Preview & { error?: string };
      if (d.error) d.errors = [d.error];
      setPreview({ ok: !!d.ok, description: d.description ?? "", summary: d.summary ?? [], errors: d.errors ?? [], placeholders: d.placeholders ?? [], dryRun: d.dryRun });
      if (!dryRun && res.ok) {
        setMessage({ text: "Correctif appliqué. La version précédente est sauvegardée." });
        setText("");
        await onChanged();
        await loadBackup();
      }
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (!window.confirm("Restaurer la version du modèle d'avant le dernier correctif ?")) return;
    setBusy("restore");
    setMessage(null);
    try {
      const res = await fetch("/api/cv-template/restore", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Restauration impossible.");
      setMessage({ text: "Version précédente restaurée." });
      setPreview(null);
      await onChanged();
      await loadBackup();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-h3">Correctifs du modèle</h2>
          <p className="mt-1 text-small text-textSecondary">
            Un correctif JSON ajoute, remplace ou retire des clusters, entrées et puces. Il n'est appliqué que si le modèle obtenu reste valide.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {backup && (
            <Button variant="ghost" onClick={restore} disabled={!!busy}>
              {busy === "restore" ? <Spinner size={16} /> : <RotateCcw className="h-4 w-4" />} Restaurer la version précédente
            </Button>
          )}
          <Button variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Wand2 className="h-4 w-4" /> Appliquer un correctif
          </Button>
        </div>
      </div>
      {backup && <p className="mt-2 text-caption text-textSecondary">Version précédente sauvegardée le {new Date(backup).toLocaleString("fr-FR")}.</p>}

      {open && (
        <div className="mt-4 space-y-3">
          <Textarea
            aria-label="Correctif JSON"
            className="min-h-[220px] font-mono text-caption"
            value={text}
            onChange={(e) => { setText(e.target.value); setPreview(null); }}
            placeholder={'{ "type": "jobscout-cv-patch", "version": 1, "operations": [ … ] }'}
            spellCheck={false}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) { setText(await f.text()); setPreview(null); }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload className="h-4 w-4" /> Charger un fichier .json</Button>
            <Button variant="secondary" onClick={() => run(true)} disabled={!!busy || !text.trim()}>
              {busy === "preview" ? <Spinner size={16} /> : <Eye className="h-4 w-4" />} Prévisualiser
            </Button>
            <Button onClick={() => run(false)} disabled={!!busy || !preview?.ok || !preview.dryRun}>
              {busy === "apply" ? <Spinner size={16} className="text-onAccent" /> : <Check className="h-4 w-4" />} Appliquer
            </Button>
          </div>

          {preview && (
            <div role={preview.ok ? "status" : "alert"} className={`rounded-md border bg-surface p-3 text-small ${preview.ok ? "border-border" : "border-danger"}`}>
              {preview.description && <p className="font-semibold">{preview.description}</p>}
              {preview.summary.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5">{preview.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
              )}
              {preview.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-danger">
                  {preview.errors.map((e, i) => <li key={i} className="flex gap-1.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{e}</li>)}
                </ul>
              )}
              {preview.ok && (
                <p className="mt-2 text-textSecondary">
                  {preview.placeholders.length
                    ? `Crochets restants après application : ${preview.placeholders.length} texte${preview.placeholders.length > 1 ? "s" : ""} (${[...new Set(preview.placeholders.flatMap((p) => p.placeholders))].join(", ")}).`
                    : "Aucun crochet restant après application."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-3 inline-flex items-center gap-1.5 text-small ${message.error ? "text-danger" : "text-success"}`}>
          {!message.error && <Check className="h-4 w-4" />} {message.text}
        </p>
      )}
    </Card>
  );
}
