"use client";
import Link from "next/link";
import { ArrowRight, Send, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Day, Item } from "@/lib/mission/today";
import { SECTOR_LABELS, isSector } from "@/lib/scoring/sector";
import { ItemRow } from "./item-row";
import { useMissionAction } from "./use-action";

export function toggleUrl(item: Item): string {
  return item.source === "habit" ? `/api/mission/habits/${encodeURIComponent(item.id)}` : `/api/mission/tasks/${encodeURIComponent(item.id)}`;
}

export function TodayTab({ day }: { day: Day }) {
  const { run, busy, error } = useMissionAction();
  const toggle = (item: Item, done: boolean) =>
    run(item.id, toggleUrl(item), { body: item.source === "habit" ? { date: day.date, done } : { done } });
  const checklist = day.items.filter((i) => i.source !== "relance");
  const ratio = day.budget ? Math.min(1, day.planned / day.budget) : 0;

  return (
    <div className="space-y-5">
      {day.notice && (
        <p role="status" className="rounded-md border border-border bg-surface px-4 py-3 text-small">{day.notice}</p>
      )}

      {day.oneThing && (
        <Card>
          <p className="eyebrow mb-2"><Target className="h-3.5 w-3.5" aria-hidden="true" /> Si tu ne fais qu'une chose</p>
          <p className="text-body font-semibold">{day.oneThing.title}</p>
          <p className="mt-1 text-caption text-textSecondary">{day.oneThing.minutes} min{day.oneThing.overdueDays ? ` · en retard de ${day.oneThing.overdueDays} j` : ""}</p>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-h3">Aujourd'hui</h2>
          <span className="text-small tabular-nums text-textSecondary">{day.planned} min prévues / {day.budget} min</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-label="Minutes prévues sur le budget du jour" aria-valuemin={0} aria-valuemax={day.budget} aria-valuenow={day.planned}>
          <div className={`h-full rounded-full ${day.planned > day.budget ? "bg-warning" : "bg-accent"}`} style={{ width: `${ratio * 100}%` }} />
        </div>
        {checklist.length === 0 ? (
          <p className="mt-4 text-small text-textSecondary">
            Aucune tâche aujourd'hui{day.overflow[0] ? ` : prends de l'avance sur « ${day.overflow[0].title} ».` : "."}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {checklist.map((item) => <ItemRow key={item.id} item={item} disabled={busy === item.id} onToggle={(done) => toggle(item, done)} />)}
          </ul>
        )}
        {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
      </Card>

      {day.relances.length > 0 && (
        <Card>
          <h2 className="text-h3">Relances dues</h2>
          <ul className="mt-2 divide-y divide-border">
            {day.relances.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <Link href="/candidatures" className="min-w-0 flex-1 text-small font-medium hover:text-accent">{r.title}</Link>
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run(r.id, `/api/mission/relance/${r.candidatureId}`)}>
                  <Send className="h-4 w-4" /> Relance faite
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {day.offers.length > 0 && (
        <Card>
          <h2 className="text-h3">Offres à traiter</h2>
          <ul className="mt-2 divide-y divide-border">
            {day.offers.map((o) => (
              <li key={o.id} className="py-3">
                <Link href={`/offres/${o.id}`} className="group flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-medium group-hover:text-accent">{o.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-textSecondary">
                      {o.company} · score {o.score}
                      {isSector(o.sector) && <Badge variant="info">{SECTOR_LABELS[o.sector]}</Badge>}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-textSecondary group-hover:text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {day.overflow.length > 0 && (
        <Card>
          <h2 className="text-h3">Si tu as du temps</h2>
          <ul className="mt-2 divide-y divide-border">
            {day.overflow.map((item) =>
              item.source === "relance" ? (
                <ItemRow key={item.id} item={item} />
              ) : (
                <ItemRow key={item.id} item={item} disabled={busy === item.id} onToggle={(done) => toggle(item, done)} />
              )
            )}
          </ul>
        </Card>
      )}

    </div>
  );
}
