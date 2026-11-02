import { NextResponse } from "next/server";
import { z } from "zod";
import { getJournalEntry } from "@/lib/mission/store";
import { saveDebrief } from "@/lib/mission/debrief";
import { IsoDate, invalid, readJson } from "@/lib/mission/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Text = z.string().max(4000).nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null));
const Body = z
  .object({
    done: z.array(z.string().max(80)).max(200).default([]),
    responses: z
      .array(z.object({ candidature_id: z.number().int().positive(), stage: z.enum(["filtre_auto", "recruteur", "technique", "final"]), outcome: z.enum(["refus", "suite", "offre"]) }).strict())
      .max(50)
      .default([]),
    energy: z.number().int().min(1).max(5).nullable().optional().transform((v) => v ?? null),
    blocker: Text,
    tomorrow: Text,
    notes: Text,
    weekly_review: Text,
  })
  .strict();

export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const date = IsoDate.safeParse((await params).date);
  if (!date.success) return invalid(date.error);
  return NextResponse.json({ entry: getJournalEntry(date.data) });
}

/** Débrief du soir (une entrée par jour, modifiable). */
export async function PUT(req: Request, { params }: { params: Promise<{ date: string }> }) {
  const date = IsoDate.safeParse((await params).date);
  if (!date.success) return invalid(date.error);
  const body = Body.safeParse(await readJson(req));
  if (!body.success) return invalid(body.error);
  return NextResponse.json(saveDebrief(date.data, body.data));
}
