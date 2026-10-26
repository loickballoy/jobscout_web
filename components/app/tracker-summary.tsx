"use client";
import { useState } from "react";
import { Award, Pencil, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { funnel, nextStep, sentThisWeek } from "@/lib/tracker-stats";
import type { CandidatureWithOffre } from "@/lib/db/candidatures";

type Row = CandidatureWithOffre;

const pct = (r: number | null) => (r === null ? "" : `${r < 0.1 && r > 0 ? (r * 100).toFixed(1).replace(".", ",") : Math.round(r * 100)} %`);

function shortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Anneau de l'objectif hebdomadaire. */
function GoalRing({ done, goal }: { done: number; goal: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, done / goal);
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-border" />
      {/* À zéro, pas d'arc : le bout arrondi laisserait un point. */}
      {p > 0 && <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className={done >= goal ? "stroke-success" : "stroke-accent"}
        strokeDasharray={`${c * p} ${c}`} style={{ transition: "stroke-dasharray 600ms cubic-bezier(.22,1,.36,1)" }} />}
    </svg>
  );
}

export function TrackerSummary({
  rows,
  goal,
  onGoal,
  highlightId,
  onOpen,
}: {
  rows: Row[];
  goal: number;
  onGoal: (goal: number) => Promise<void>;
  /** Offre tout juste acceptée : mise en valeur discrète de sa carte. */
  highlightId: number | null;
  onOpen: (row: Row) => void;
}) {
  const steps = funnel(rows);
  const next = nextStep(steps);
  const week = sentThisWeek(rows);
  const offers = rows
    .filter((r) => r.status === "acceptee")
    .sort((a, b) => (b.accepted_at ?? b.applied_at ?? "").localeCompare(a.accepted_at ?? a.applied_at ?? ""));
  const interviews = steps[2].count;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goal));

  async function saveGoal() {
    const n = Number(draft);
    if (Number.isFinite(n) && n >= 1) await onGoal(n);
    setEditing(false);
  }

  return (
    <section aria-label="Bilan de la recherche" className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      {/* Vitrine des offres */}
      <div className="glass-panel p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Award className="h-5 w-5 text-accent" aria-hidden="true" />
          <h2 className="text-h3">Vitrine des offres</h2>
          {offers.length > 0 && <span className="text-small text-textSecondary">· {offers.length}</span>}
        </div>
        {offers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-5 py-7 text-center">
            <p className="font-display text-h3">Ta première offre s'affichera ici</p>
            <p className="mx-auto mt-1.5 max-w-[48ch] text-small text-textSecondary">
              {interviews > 0
                ? `${interviews} entretien${interviews > 1 ? "s" : ""} obtenu${interviews > 1 ? "s" : ""} : tu as déjà franchi l'étape la plus sélective. La suivante, c'est l'offre.`
                : steps[0].count > 0
                  ? "Chaque candidature adaptée à l'offre rapproche la première réponse positive."
                  : "Commence par une offre de ta zone : le CV est prêt en un clic."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {offers.map((r) => (
              <button key={r.id} type="button" onClick={() => onOpen(r)}
                className={cn(
                  "rounded-lg border border-success/40 bg-success/[.06] p-4 text-left transition-shadow duration-700 hover:border-success",
                  highlightId === r.id && "ring-2 ring-success/60 shadow-[0_0_0_6px_rgb(var(--success-rgb)/0.12)]"
                )}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-success">Offre acceptée</p>
                <p className="mt-1 font-display text-h3">{r.offre_company || r.ext_company || "Entreprise"}</p>
                <p className="text-small text-text">{r.offre_title || r.ext_title}</p>
                <p className="mt-2 text-caption text-textSecondary">
                  {[r.offre_country || r.ext_country, r.offer_salary, r.offer_start ? `début le ${shortDate(r.offer_start)}` : null, shortDate(r.accepted_at) ? `acceptée le ${shortDate(r.accepted_at)}` : null].filter(Boolean).join(" · ")}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Entonnoir + objectif hebdomadaire */}
      <div className="glass-panel p-5 sm:p-6">
        <h2 className="mb-4 text-h3">Ton chemin</h2>
        <ol className="grid grid-cols-4 gap-2">
          {steps.map((s) => (
            <li key={s.id} className={cn("rounded-md border px-2.5 py-3 text-center", next === s.id ? "border-accent bg-accent/[.06]" : "border-border")}>
              <span className="block text-caption font-semibold text-textSecondary">{s.label}</span>
              <span className="mt-1 block font-display text-[26px] font-light leading-none tabular-nums">{s.count}</span>
              <span className="mt-1 block h-4 text-caption tabular-nums text-textSecondary">{pct(s.rate)}</span>
            </li>
          ))}
        </ol>
        {next && next !== "sent" && (
          <p className="mt-2 flex items-center gap-1.5 text-caption text-accent"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Prochaine étape : {steps.find((s) => s.id === next)?.label.toLowerCase()}</p>
        )}

        <div className="mt-5 flex items-center gap-4 border-t border-border pt-4">
          <GoalRing done={week} goal={goal} />
          <div className="min-w-0">
            <p className="font-display text-h3 tabular-nums">
              {week} / {editing ? (
                <input autoFocus type="number" min={1} max={100} value={draft} onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void saveGoal()} onKeyDown={(e) => { if (e.key === "Enter") void saveGoal(); if (e.key === "Escape") setEditing(false); }}
                  className="w-16 rounded-md border border-border bg-bg px-2 text-h3" aria-label="Objectif hebdomadaire" />
              ) : goal}
              <span className="ml-1 text-small font-normal text-textSecondary">cette semaine</span>
              {!editing && (
                <button type="button" onClick={() => { setDraft(String(goal)); setEditing(true); }} className="ml-2 inline-flex align-middle text-textSecondary hover:text-text" aria-label="Modifier l'objectif">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </p>
            <p className="text-small text-textSecondary">
              {week >= goal ? "Objectif atteint. Bien joué." : `Encore ${goal - week} candidature${goal - week > 1 ? "s" : ""} d'ici dimanche.`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
