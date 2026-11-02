"use client";
import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { Item } from "@/lib/mission/today";
import type { JournalEntry, JournalResponse } from "@/lib/mission/store";
import type { WeekFigures } from "@/lib/mission/debrief";
import { ItemRow } from "./item-row";
import { useMissionAction } from "./use-action";

const STAGES: [JournalResponse["stage"], string][] = [["filtre_auto", "Filtre automatique"], ["recruteur", "Recruteur"], ["technique", "Technique"], ["final", "Final"]];
const OUTCOMES: [JournalResponse["outcome"], string][] = [["refus", "Refus"], ["suite", "Suite du processus"], ["offre", "Offre"]];
const STAGE_LABEL = Object.fromEntries(STAGES) as Record<string, string>;

type CandidatureOption = { id: number; label: string };

export function DebriefTab({
  date,
  items,
  entry,
  candidatures,
  tomorrowTasks,
  week,
}: {
  date: string;
  items: Item[];
  entry: JournalEntry | null;
  candidatures: CandidatureOption[];
  /** Tâches de demain proposées comme priorité (« Priorité de demain »). */
  tomorrowTasks: { id: string; title: string }[];
  /** Bilan de la semaine : seulement le dimanche. */
  week: WeekFigures | null;
}) {
  const { run, busy, error } = useMissionAction();
  const [done, setDone] = useState<Set<string>>(() => new Set(entry ? entry.done : items.filter((i) => i.done).map((i) => i.id)));
  const [responses, setResponses] = useState<JournalResponse[]>(entry?.responses ?? []);
  const [energy, setEnergy] = useState<number | null>(entry?.energy ?? null);
  const [blocker, setBlocker] = useState(entry?.blocker ?? "");
  const [tomorrow, setTomorrow] = useState(entry?.tomorrow ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [weekly, setWeekly] = useState(entry?.weekly_review ?? "");
  const [result, setResult] = useState<{ tomorrow: Item[]; fact: string | null } | null>(null);

  const toggle = (id: string, on: boolean) => setDone((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  async function save() {
    const data = await run("save", `/api/mission/journal/${date}`, {
      method: "PUT",
      body: { done: [...done], responses, energy, blocker, tomorrow, notes, weekly_review: week ? weekly : entry?.weekly_review ?? null },
    });
    if (data) setResult({ tomorrow: data.tomorrow ?? [], fact: data.fact ?? null });
  }

  const checkable = items.filter((i) => i.source !== "relance");
  const kpi = week?.kpi;

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-h3">Ce qui a été fait</h2>
        {checkable.length === 0 ? (
          <p className="mt-2 text-small text-textSecondary">Rien n'était prévu aujourd'hui.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {checkable.map((item) => <ItemRow key={item.id} item={{ ...item, done: done.has(item.id) }} onToggle={(on) => toggle(item.id, on)} />)}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h3">Réponses reçues</h2>
          <Button size="sm" variant="secondary" disabled={!candidatures.length} onClick={() => setResponses((r) => [...r, { candidature_id: candidatures[0].id, stage: "recruteur", outcome: "refus" }])}>
            <Plus className="h-4 w-4" /> Ajouter une réponse
          </Button>
        </div>
        {!candidatures.length && <p className="mt-2 text-small text-textSecondary">Aucune candidature dans le suivi.</p>}
        <ul className="mt-3 space-y-3">
          {responses.map((r, i) => (
            <li key={i} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
              <label className="block text-caption font-semibold text-textSecondary">
                Candidature
                <select value={r.candidature_id} onChange={(e) => setResponses((all) => all.map((x, j) => (j === i ? { ...x, candidature_id: Number(e.target.value) } : x)))}
                  className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-2 text-small text-text focus:border-accent focus:outline-none">
                  {candidatures.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label className="block text-caption font-semibold text-textSecondary">
                Étape
                <select value={r.stage} onChange={(e) => setResponses((all) => all.map((x, j) => (j === i ? { ...x, stage: e.target.value as JournalResponse["stage"] } : x)))}
                  className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-2 text-small text-text focus:border-accent focus:outline-none">
                  {STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="block text-caption font-semibold text-textSecondary">
                Issue
                <select value={r.outcome} onChange={(e) => setResponses((all) => all.map((x, j) => (j === i ? { ...x, outcome: e.target.value as JournalResponse["outcome"] } : x)))}
                  className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-2 text-small text-text focus:border-accent focus:outline-none">
                  {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <Button variant="ghost" size="icon" aria-label="Retirer cette réponse" onClick={() => setResponses((all) => all.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <fieldset>
          <legend className="text-h3">Énergie</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={`inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border text-small font-semibold focus-within:ring-2 focus-within:ring-accent/40 ${energy === n ? "border-accent bg-accent text-onAccent" : "border-border"}`}>
                <input type="radio" name="energy" value={n} checked={energy === n} onChange={() => setEnergy(n)} className="sr-only" />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-5 block text-small font-semibold">
          Blocage
          <Input className="mt-1.5" value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder="Ce qui a freiné aujourd'hui (facultatif)" />
        </label>
        <label className="mt-4 block text-small font-semibold">
          Priorité de demain
          <Input className="mt-1.5" list="mission-tomorrow" value={tomorrow} onChange={(e) => setTomorrow(e.target.value)} placeholder="Une tâche de demain, ou votre propre priorité" />
          <datalist id="mission-tomorrow">{tomorrowTasks.map((t) => <option key={t.id} value={t.title} />)}</datalist>
        </label>
        <label className="mt-4 block text-small font-semibold">
          Notes
          <Textarea className="mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </Card>

      {week && (
        <Card>
          <h2 className="text-h3">Bilan de la semaine</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Figure label="Candidatures envoyées" value={week.candidatures} goal={kpi?.candidatures_ciblees} />
            <Figure label="Messages à une personne nommée" value={week.messages} goal={kpi?.messages_nommes} />
            <Figure label="Mock interviews" value={week.mocks} goal={kpi?.mock_interviews} />
          </dl>
          <p className="mt-4 text-small font-semibold">Refus par étape</p>
          <p className="mt-1 text-small text-textSecondary">
            {Object.keys(week.refusalsByStage).length
              ? Object.entries(week.refusalsByStage).map(([s, n]) => `${STAGE_LABEL[s] ?? s} : ${n}`).join(" · ")
              : "Aucun refus noté cette semaine."}
          </p>
          <label className="mt-4 block text-small font-semibold">
            Ce que je change
            <Textarea className="mt-1.5" value={weekly} onChange={(e) => setWeekly(e.target.value)} />
          </label>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!!busy}>
          {busy ? <Spinner size={16} className="text-onAccent" /> : <Check className="h-4 w-4" />} Enregistrer le débrief
        </Button>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
      </div>

      {result && (
        <Card>
          <p role="status" className="inline-flex items-center gap-1.5 text-small font-semibold text-success"><Check className="h-4 w-4" /> Débrief enregistré</p>
          {result.fact && <p className="mt-3 text-small"><span className="font-semibold">Fait le plus solide du jour : </span>{result.fact}</p>}
          <p className="mt-3 text-small font-semibold">Priorités de demain</p>
          {result.tomorrow.length ? (
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-small">{result.tomorrow.map((t) => <li key={t.id}>{t.title} <span className="text-textSecondary">({t.minutes} min)</span></li>)}</ol>
          ) : (
            <p className="mt-1 text-small text-textSecondary">Rien de prévu demain.</p>
          )}
        </Card>
      )}
    </div>
  );
}

function Figure({ label, value, goal }: { label: string; value: number; goal?: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-caption text-textSecondary">{label}</dt>
      <dd className="mt-1 text-h3 tabular-nums">{value}{goal !== undefined && <span className="text-small font-normal text-textSecondary"> / {goal}</span>}</dd>
    </div>
  );
}
