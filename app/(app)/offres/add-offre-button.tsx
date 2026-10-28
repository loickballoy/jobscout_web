"use client";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Link2, Plus, X, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { guessFromText, type ManualDraft } from "@/lib/offres/manual-text";

const EMPTY: ManualDraft = {
  url: "", title: "", company: "", location: "", country: "", contract_type: "", salary: "", posted_at: "", description_text: "", description_html: "",
};

type Mode = "url" | "text";

/** Ajout manuel d'une offre : un lien (page lue puis relue ici) ou le texte collé de l'annonce. */
export function AddOffreButton() {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [draft, setDraft] = useState<ManualDraft | null>(null);
  const [original, setOriginal] = useState<ManualDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  function reset() {
    setUrl(""); setPaste(""); setDraft(null); setOriginal(null); setError(null); setMode("url");
  }

  async function fetchUrl() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/offres/manual", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "fetch", url }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Lecture impossible.");
      setDraft(d.draft);
      setOriginal(d.draft);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : String(e)}`);
      // Le site bloque souvent les robots : on bascule sur le texte collé, lien gardé.
      setMode("text");
    } finally {
      setBusy(false);
    }
  }

  function readPaste() {
    setError(null);
    setDraft({ ...EMPTY, ...guessFromText(paste), url: url.trim(), description_text: paste.trim() });
    setOriginal(null);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/offres/manual", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", draft, original }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Enregistrement impossible.");
      setOpen(false);
      reset();
      router.push(`/offres/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof ManualDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Ajouter une offre
      </Button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm animate-fadeIn sm:items-center">
            <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90dvh] w-full max-w-[640px] overflow-y-auto rounded-t-xl border border-border bg-bg p-5 shadow-elevated animate-slideUp sm:m-4 sm:rounded-xl sm:p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 id={titleId} className="text-h3">Ajouter une offre</h2>
                  <p className="text-small text-textSecondary">Un lien vers l'annonce, ou son texte copié-collé. Tu relis avant d'enregistrer ; le score est calculé comme pour les autres.</p>
                </div>
                <button onClick={() => !busy && (setOpen(false), reset())} aria-label="Fermer" className="rounded-md p-1.5 text-textSecondary hover:bg-surface">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {!draft && (
                <>
                  <div className="mb-4 inline-flex rounded-md border border-border p-1">
                    {([["url", "Lien", Link2], ["text", "Texte collé", ClipboardPaste]] as const).map(([m, label, Icon]) => (
                      <button key={m} onClick={() => setMode(m)} className={cn("inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-small", mode === m ? "bg-surface font-semibold" : "text-textSecondary")}>
                        <Icon className="h-4 w-4" /> {label}
                      </button>
                    ))}
                  </div>
                  {mode === "url" ? (
                    <form onSubmit={(e) => { e.preventDefault(); fetchUrl(); }} className="flex gap-2">
                      <Input type="url" required placeholder="https://www.jobup.ch/fr/emplois/detail/…" value={url} onChange={(e) => setUrl(e.target.value)} />
                      <Button type="submit" disabled={busy || !url.trim()}>{busy ? <Spinner /> : "Lire"}</Button>
                    </form>
                  ) : (
                    <div className="space-y-2">
                      <Textarea rows={12} placeholder={"Colle ici l'annonce complète (intitulé en première ligne si possible)."} value={paste} onChange={(e) => setPaste(e.target.value)} />
                      <Input type="url" placeholder="Lien de l'annonce (facultatif, pour postuler depuis la fiche)" value={url} onChange={(e) => setUrl(e.target.value)} />
                      <div className="flex justify-end">
                        <Button onClick={readPaste} disabled={paste.trim().length < 80}>Continuer</Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {draft && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Intitulé *"><Input value={draft.title} onChange={set("title")} /></Field>
                    <Field label="Entreprise"><Input value={draft.company} onChange={set("company")} /></Field>
                    <Field label="Lieu"><Input value={draft.location} onChange={set("location")} placeholder="Lausanne" /></Field>
                    <Field label="Pays"><Input value={draft.country} onChange={set("country")} placeholder="Suisse" /></Field>
                    <Field label="Contrat"><Input value={draft.contract_type} onChange={set("contract_type")} placeholder="CDI" /></Field>
                    <Field label="Lien"><Input type="url" value={draft.url} onChange={set("url")} /></Field>
                  </div>
                  <Field label="Description *"><Textarea rows={10} value={draft.description_text} onChange={set("description_text")} /></Field>
                  <div className="flex justify-between gap-2">
                    <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Retour</Button>
                    <Button onClick={save} disabled={busy || !draft.title.trim() || draft.description_text.trim().length < 80}>
                      {busy ? <Spinner /> : "Enregistrer et voir le score"}
                    </Button>
                  </div>
                </div>
              )}

              {error && <p role="alert" className="mt-3 text-small text-danger">{error}</p>}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-caption font-medium text-textSecondary">{label}</span>
      {children}
    </label>
  );
}
