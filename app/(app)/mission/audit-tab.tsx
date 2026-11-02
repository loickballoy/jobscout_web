"use client";
import { CheckCircle2, CircleSlash, PlayCircle, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AUDIT_GROUP_LABELS, type AuditGroup, type AuditItem } from "@/lib/mission/audit";
import type { AuditHistoryRow } from "@/lib/mission/audit-run";
import { useMissionAction } from "./use-action";

const STATUS_ICON = {
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Réussi" />,
  ko: <XCircle className="h-4 w-4 shrink-0 text-danger" aria-label="À corriger" />,
  na: <CircleSlash className="h-4 w-4 shrink-0 text-textSecondary" aria-label="Non évaluable" />,
};
const fmt = (iso: string) => new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function AuditTab({ history, manual }: { history: AuditHistoryRow[]; manual: { id: string; label: string; done_at?: string | null }[] }) {
  const { run, busy, error } = useMissionAction();
  const latest = history[0] ?? null;
  const groups: AuditGroup[] = ["cv", "tunnel"];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-h3">Audit du dossier</h2>
            <p className="mt-1 text-small text-textSecondary">
              {latest ? `Dernier audit le ${fmt(latest.at)} : ${latest.score} / ${latest.total} critères réussis.` : "Aucun audit pour l'instant."}
            </p>
          </div>
          <Button onClick={() => run("audit", "/api/mission/audit")} disabled={!!busy}>
            {busy === "audit" ? <Spinner size={16} className="text-onAccent" /> : <PlayCircle className="h-4 w-4" />} Lancer l'audit
          </Button>
        </div>
        {latest && <p className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-small font-medium">{latest.diagnostic}</p>}
        {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
      </Card>

      {latest &&
        groups.map((g) => {
          const items = latest.items.filter((i) => i.group === g);
          if (!items.length) return null;
          return (
            <Card key={g}>
              <h2 className="text-h3">{AUDIT_GROUP_LABELS[g]}</h2>
              <ul className="mt-2 divide-y divide-border">{items.map((i) => <AuditRow key={i.id} item={i} />)}</ul>
            </Card>
          );
        })}

      <Card>
        <h2 className="text-h3">{AUDIT_GROUP_LABELS.vitrine}</h2>
        {!manual.length && <p className="mt-2 text-small text-textSecondary">Aucun critère manuel dans le pack.</p>}
        <ul className="mt-2 divide-y divide-border">
          {manual.map((m) => (
            <li key={`${m.id}-${m.done_at ?? ""}`} className="flex items-start gap-3 py-3">
              <input id={`manual-${m.id}`} type="checkbox" defaultChecked={!!m.done_at} disabled={busy === m.id}
                onChange={(e) => run(m.id, "/api/mission/audit/manual", { body: { id: m.id, done: e.target.checked } })}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-accent" />
              <label htmlFor={`manual-${m.id}`} className="min-w-0 flex-1 text-small">
                <span className="font-medium">{m.label}</span>
                {m.done_at && <span className="mt-0.5 block text-caption text-textSecondary">Validé le {fmt(m.done_at)}</span>}
              </label>
            </li>
          ))}
        </ul>
      </Card>

      {history.length > 1 && (
        <Card>
          <h2 className="text-h3">Historique</h2>
          <ul className="mt-2 divide-y divide-border text-small">
            {history.map((h) => <li key={h.id} className="flex justify-between gap-3 py-2"><span>{fmt(h.at)}</span><span className="tabular-nums font-semibold">{h.score} / {h.total}</span></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

function AuditRow({ item }: { item: AuditItem }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5">{STATUS_ICON[item.status]}</span>
      <span className="min-w-0 flex-1 text-small">
        <span className={item.status === "na" ? "text-textSecondary" : "font-medium"}>{item.label}</span>
        {item.detail && <span className="mt-0.5 block text-caption text-textSecondary">{item.detail}</span>}
      </span>
    </li>
  );
}
