import { CheckCircle2, AlertTriangle, Target } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { OfferAnalysis, Priority } from "@/lib/scoring/analysis";

const PRIORITY: Record<Priority, { variant: BadgeVariant; label: string }> = {
  HIGH: { variant: "danger", label: "HIGH" },
  MEDIUM: { variant: "warning", label: "MEDIUM" },
  LOW: { variant: "default", label: "LOW" },
};

/** Points forts, points faibles et plan d'action priorisé d'une offre (lib/scoring/analysis.ts). */
export function OfferAnalysisCard({ analysis }: { analysis: OfferAnalysis }) {
  const { strengths, weaknesses, actions } = analysis;
  if (!strengths.length && !weaknesses.length && !actions.length) return null;
  return (
    <section aria-labelledby="analysis-title" className="glass-panel mb-6 p-5 sm:p-7">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">Ta candidature</p>
      <h2 id="analysis-title" className="font-display text-h2">Analyse et plan d'action</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-small font-semibold text-success"><CheckCircle2 className="h-4 w-4" /> Points forts</h3>
          {strengths.length ? (
            <ul className="space-y-1.5 text-small text-text">{strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          ) : (
            <p className="text-small text-textSecondary">Peu de recouvrement avec ton profil.</p>
          )}
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-small font-semibold text-warning"><AlertTriangle className="h-4 w-4" /> Points faibles</h3>
          {weaknesses.length ? (
            <ul className="space-y-1.5 text-small text-text">{weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul>
          ) : (
            <p className="text-small text-textSecondary">Aucun écart notable repéré.</p>
          )}
        </div>
      </div>

      {actions.length > 0 && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-small font-semibold"><Target className="h-4 w-4 text-accent" /> Pour décrocher le poste</h3>
          <ol className="space-y-3">
            {actions.map((a, i) => (
              <li key={i} className="flex items-start gap-3">
                <Badge variant={PRIORITY[a.priority].variant} className="mt-0.5 shrink-0 tabular-nums">{PRIORITY[a.priority].label}</Badge>
                <div className="min-w-0">
                  <p className="text-small font-semibold text-text">{a.title}</p>
                  <p className="text-small text-textSecondary">{a.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="mt-5 text-caption text-textSecondary">Analyse automatique, à partir des termes techniques de l'annonce, de ton profil et de ton modèle de CV.</p>
    </section>
  );
}
