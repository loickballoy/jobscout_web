import { NextResponse } from "next/server";
import { z } from "zod";
import { createMissionTarget, listMissionTargets, updateMissionTarget } from "@/lib/mission/store";
import { TARGET_STATUSES } from "@/lib/mission/pack";
import { invalid, readJson } from "@/lib/mission/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Opt = z.string().max(2000).nullable().optional().transform((v) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null));
const Editable = {
  status: z.enum(TARGET_STATUSES).optional(),
  contact: Opt,
  next_action: Opt,
  next_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "date AAAA-MM-JJ attendue").nullable().optional().transform((v) => (v === undefined ? undefined : v || null)),
  notes: Opt,
  city: Opt,
  country: Opt,
  type: Opt,
  tier: Opt,
  cv_cluster: Opt,
  angle: Opt,
};
const Create = z.object({ company: z.string().trim().min(1).max(200), sector: z.enum(["finance", "conseil"]), ...Editable }).strict();
const Update = z.object({ id: z.number().int().positive(), sector: z.enum(["finance", "conseil"]).optional(), ...Editable }).strict();

const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export async function GET() {
  return NextResponse.json({ targets: listMissionTargets() });
}

/** Ajout d'une cible. */
export async function POST(req: Request) {
  const body = Create.safeParse(await readJson(req));
  if (!body.success) return invalid(body.error);
  try {
    const { company, sector, ...rest } = body.data;
    return NextResponse.json({ target: createMissionTarget({ company, sector, ...clean(rest) }) });
  } catch (e) {
    return invalid(e instanceof Error ? e.message : String(e));
  }
}

/** Modification en ligne (liste blanche des colonnes). */
export async function PUT(req: Request) {
  const body = Update.safeParse(await readJson(req));
  if (!body.success) return invalid(body.error);
  const { id, ...patch } = body.data;
  const target = updateMissionTarget(id, clean(patch));
  if (!target) return invalid("Cible introuvable.", 404);
  return NextResponse.json({ target });
}
