"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WEEKDAY_LABELS, categoryLabel, type Plan } from "@/lib/mission/pack";
import type { MissionTask } from "@/lib/mission/store";
import { useMissionAction } from "./use-action";

const field = "h-9 rounded-md border border-border bg-bg px-2 text-small text-text focus:border-accent focus:outline-none";

export function PlanTab({ plan, tasks, today }: { plan: Plan; tasks: MissionTask[]; today: string }) {
  const { run, busy, error } = useMissionAction();
  const phases = [...plan.phases];
  const known = new Set(phases.map((p) => p.id));
  for (const t of tasks) if (!known.has(t.phase)) { known.add(t.phase); phases.push({ id: t.phase, label: "Autres tâches", from: t.window_start, to: t.window_end }); }
  const update = (id: string, patch: Record<string, unknown>) => run(id, `/api/mission/tasks/${encodeURIComponent(id)}`, { body: patch });

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      {phases.map((p) => {
        const list = tasks.filter((t) => t.phase === p.id).sort((a, b) => a.window_start.localeCompare(b.window_start) || a.priority - b.priority || a.position - b.position);
        const current = p.from <= today && today <= p.to;
        return (
          <details key={p.id} open={current} className="glass-panel group rounded-xl p-4 sm:p-5">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <span className="text-h3">{p.id} · {p.label}</span>
              <span className="text-caption text-textSecondary">{p.from} → {p.to} · {list.filter((t) => t.done_at).length}/{list.length} faites{current ? " · en cours" : ""}</span>
            </summary>
            <ul className="mt-3 divide-y divide-border">
              {list.map((t) => (
                <li key={t.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <input id={`t-${t.id}`} type="checkbox" checked={!!t.done_at} disabled={busy === t.id} onChange={(e) => update(t.id, { done: e.target.checked })}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-accent" />
                    <label htmlFor={`t-${t.id}`} className={`min-w-0 flex-1 text-small ${t.done_at ? "text-textSecondary line-through" : "font-medium"}`}>
                      <span className="mr-1.5 text-caption text-textSecondary">{t.id}</span>{t.title}
                    </label>
                    {t.origin === "user" && (
                      <Button variant="ghost" size="icon" aria-label={`Supprimer la tâche ${t.id}`} disabled={!!busy}
                        onClick={() => window.confirm("Supprimer cette tâche personnelle ?") && run(t.id, `/api/mission/tasks/${encodeURIComponent(t.id)}`, { method: "DELETE" })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-caption text-textSecondary">
                    <label className="inline-flex items-center gap-1">Du <input type="date" className={field} defaultValue={t.window_start} aria-label={`Début de la fenêtre de ${t.id}`} onBlur={(e) => e.target.value && e.target.value !== t.window_start && update(t.id, { window_start: e.target.value })} /></label>
                    <label className="inline-flex items-center gap-1">au <input type="date" className={field} defaultValue={t.window_end} aria-label={`Fin de la fenêtre de ${t.id}`} onBlur={(e) => e.target.value && e.target.value !== t.window_end && update(t.id, { window_end: e.target.value })} /></label>
                    <label className="inline-flex items-center gap-1"><input type="number" min={0} max={1440} className={`${field} w-20`} defaultValue={t.minutes} aria-label={`Minutes de ${t.id}`} onBlur={(e) => Number(e.target.value) !== t.minutes && update(t.id, { minutes: Number(e.target.value) })} /> min</label>
                    <select className={field} value={t.priority} aria-label={`Priorité de ${t.id}`} onChange={(e) => update(t.id, { priority: Number(e.target.value) })}>
                      {[1, 2, 3].map((n) => <option key={n} value={n}>Priorité {n}</option>)}
                    </select>
                    <Badge>{categoryLabel(t.category)}</Badge>
                    {t.origin === "user" && <Badge variant="info">Personnelle</Badge>}
                  </div>
                </li>
              ))}
              {!list.length && <li className="py-3 text-small text-textSecondary">Aucune tâche dans cette phase.</li>}
            </ul>
          </details>
        );
      })}

      <NewTask phases={phases.map((p) => ({ id: p.id, label: p.label }))} today={today} />

      <Card>
        <h2 className="text-h3">Habitudes</h2>
        <ul className="mt-2 divide-y divide-border">
          {plan.habits.map((h) => (
            <li key={h.id} className="py-3 text-small">
              <span className="font-medium">{h.title}</span>
              <span className="mt-1 block text-caption text-textSecondary">
                {h.minutes} min · {h.days.map((d) => WEEKDAY_LABELS[d]).join(", ")} · du {h.from} au {h.to} · {categoryLabel(h.category)}
              </span>
            </li>
          ))}
          {!plan.habits.length && <li className="py-3 text-small text-textSecondary">Aucune habitude dans le plan.</li>}
        </ul>
      </Card>
    </div>
  );
}

function NewTask({ phases, today }: { phases: { id: string; label: string }[]; today: string }) {
  const { run, busy, error } = useMissionAction();
  const [form, setForm] = useState({ title: "", phase: phases[0]?.id ?? "P", minutes: 30, window_start: today, window_end: today, priority: 2, category: "admin" });
  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Card>
      <h2 className="text-h3">Ajouter une tâche personnelle</h2>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run("new", "/api/mission/tasks", { body: form });
          if (ok) setForm((f) => ({ ...f, title: "" }));
        }}
      >
        <label className="block text-small font-semibold sm:col-span-2">Titre<Input className="mt-1" required value={form.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label className="block text-small font-semibold">Phase
          <select className={`${field} mt-1 h-11 w-full`} value={form.phase} onChange={(e) => set("phase", e.target.value)}>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.label}</option>)}
          </select>
        </label>
        <label className="block text-small font-semibold">Catégorie<Input className="mt-1" value={form.category} onChange={(e) => set("category", e.target.value)} /></label>
        <label className="block text-small font-semibold">Début<Input className="mt-1" type="date" required value={form.window_start} onChange={(e) => set("window_start", e.target.value)} /></label>
        <label className="block text-small font-semibold">Fin<Input className="mt-1" type="date" required value={form.window_end} onChange={(e) => set("window_end", e.target.value)} /></label>
        <label className="block text-small font-semibold">Minutes<Input className="mt-1" type="number" min={0} max={1440} value={form.minutes} onChange={(e) => set("minutes", Number(e.target.value))} /></label>
        <label className="block text-small font-semibold">Priorité
          <select className={`${field} mt-1 h-11 w-full`} value={form.priority} onChange={(e) => set("priority", Number(e.target.value))}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={!!busy || !form.title.trim()}><Plus className="h-4 w-4" /> Ajouter</Button>
          {error && <p role="alert" className="text-small text-danger">{error}</p>}
        </div>
      </form>
    </Card>
  );
}
