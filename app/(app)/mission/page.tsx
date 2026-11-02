import Link from "next/link";
import { CalendarDays, Snowflake } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listCandidatures } from "@/lib/db/candidatures";
import { loadDay, todayIso } from "@/lib/mission/load";
import { getJournalEntry, getMissionPlan, listJournal, listMissionTargets, listMissionTasks } from "@/lib/mission/store";
import { weekFigures } from "@/lib/mission/debrief";
import { addDays } from "@/lib/mission/today";
import { TodayTab } from "./today-tab";
import { DebriefTab } from "./debrief-tab";
import { PlanTab } from "./plan-tab";
import { TargetsTab } from "./targets-tab";
import { ImportTab } from "./import-tab";
import { BriefButton } from "./brief-button";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "aujourdhui", label: "Aujourd'hui" },
  { id: "debrief", label: "Débrief du soir" },
  { id: "plan", label: "Plan" },
  { id: "cibles", label: "Cibles" },
  { id: "journal", label: "Journal" },
  { id: "importer", label: "Importer / Exporter" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

export default async function MissionPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const { onglet } = await searchParams;
  const mission = getMissionPlan();
  const requested = (TABS.find((t) => t.id === onglet)?.id ?? "aujourdhui") as TabId;
  // Sans plan importé, seul l'onglet Importer a du sens.
  const tab: TabId = mission ? requested : "importer";
  const date = todayIso();
  const day = mission ? loadDay(date) : null;

  return (
    <>
      <PageHeader
        eyebrow={day ? longDate(date) : "Mission"}
        title="Mission"
        subtitle={day ? (day.phase ? `Phase ${day.phase.id} · ${day.phase.label}` : "Hors des phases du plan") : "Importez un pack de Mission pour obtenir votre plan du jour."}
        actions={mission ? <BriefButton brief={mission.brief} /> : undefined}
      />

      {day && day.daysToOfferDeadline !== null && (
        <Card className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-display text-[clamp(2.5rem,7vw,4rem)] font-semibold leading-none tabular-nums text-accent">J-{Math.max(0, day.daysToOfferDeadline)}</span>
          <span className="text-body text-textSecondary">avant le {shortDate(mission!.plan.offer_deadline)}</span>
        </Card>
      )}
      {day?.inFreeze && (
        <p role="note" className="mb-5 flex items-start gap-2 rounded-md border border-border bg-surface px-4 py-3 text-small">
          <Snowflake className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" /> {day.freezeNote || "Période de gel : aucune candidature."}
        </p>
      )}

      <nav aria-label="Onglets de la Mission" className="mb-5 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const disabled = !mission && t.id !== "importer";
          return disabled ? (
            <span key={t.id} aria-disabled="true" className="shrink-0 rounded-full px-3.5 py-2 text-small text-textSecondary opacity-50">{t.label}</span>
          ) : (
            <Link key={t.id} href={`/mission?onglet=${t.id}`} aria-current={tab === t.id ? "page" : undefined}
              className={cn("shrink-0 rounded-full px-3.5 py-2 text-small font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", tab === t.id ? "bg-accent text-onAccent" : "text-textSecondary hover:bg-surfaceHover hover:text-text")}>
              {t.label}
            </Link>
          );
        })}
      </nav>

      {!mission && (
        <Card className="mb-5">
          <h2 className="text-h3">Aucun plan pour l'instant</h2>
          <p className="mt-1 text-small text-textSecondary">La page Mission reste vide tant qu'aucun pack n'est importé. Collez ou chargez votre pack ci-dessous.</p>
        </Card>
      )}

      {tab === "aujourdhui" && day && <TodayTab day={day} />}
      {tab === "debrief" && day && <Debrief date={date} />}
      {tab === "plan" && mission && <PlanTab plan={mission.plan} tasks={listMissionTasks()} today={date} />}
      {tab === "cibles" && <TargetsTab targets={listMissionTargets()} />}
      {tab === "journal" && <Journal />}
      {tab === "importer" && <ImportTab hasMission={!!mission} />}
    </>
  );
}

function Debrief({ date }: { date: string }) {
  const day = loadDay(date);
  const tomorrow = loadDay(addDays(date, 1));
  const candidatures = listCandidatures()
    .filter((c) => c.status !== "en_cours")
    .map((c) => ({ id: c.id, label: [c.offre_title ?? c.ext_title, c.offre_company ?? c.ext_company].filter(Boolean).join(" · ") || `Candidature ${c.id}` }));
  return (
    <DebriefTab
      date={date}
      items={[...day.items, ...day.overflow]}
      entry={getJournalEntry(date)}
      candidatures={candidatures}
      tomorrowTasks={[...tomorrow.items, ...tomorrow.overflow].filter((i) => i.source === "task").map((i) => ({ id: i.id, title: i.title }))}
      week={day.weekday === "sun" ? weekFigures(date) : null}
    />
  );
}

const STAGE_LABEL: Record<string, string> = { filtre_auto: "filtre automatique", recruteur: "recruteur", technique: "technique", final: "final" };
const OUTCOME_LABEL: Record<string, string> = { refus: "refus", suite: "suite du processus", offre: "offre" };

function Journal() {
  const entries = listJournal(120);
  if (!entries.length) return <p className="text-small text-textSecondary">Aucune entrée : le débrief du soir en ajoute une par jour.</p>;
  return (
    <ol className="space-y-4">
      {entries.map((e) => (
        <li key={e.date}>
          <Card>
            <h2 className="flex items-center gap-2 text-body font-semibold"><CalendarDays className="h-4 w-4 text-textSecondary" aria-hidden="true" />{longDate(e.date)}</h2>
            <dl className="mt-2 grid gap-1 text-small sm:grid-cols-[10rem_1fr]">
              <dt className="text-textSecondary">Éléments cochés</dt><dd>{e.done.length}</dd>
              {e.energy !== null && <><dt className="text-textSecondary">Énergie</dt><dd>{e.energy} / 5</dd></>}
              {e.responses.length > 0 && <><dt className="text-textSecondary">Réponses</dt><dd>{e.responses.map((r) => `${OUTCOME_LABEL[r.outcome]} (${STAGE_LABEL[r.stage]})`).join(", ")}</dd></>}
              {e.blocker && <><dt className="text-textSecondary">Blocage</dt><dd>{e.blocker}</dd></>}
              {e.tomorrow && <><dt className="text-textSecondary">Priorité suivante</dt><dd>{e.tomorrow}</dd></>}
              {e.notes && <><dt className="text-textSecondary">Notes</dt><dd className="whitespace-pre-line">{e.notes}</dd></>}
            </dl>
            {e.weekly_review && (
              <div className="mt-3 rounded-md border border-border bg-surface p-3 text-small">
                <p className="font-semibold">Bilan de la semaine : ce que je change</p>
                <p className="mt-1 whitespace-pre-line">{e.weekly_review}</p>
              </div>
            )}
          </Card>
        </li>
      ))}
    </ol>
  );
}
