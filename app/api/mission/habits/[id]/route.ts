import { NextResponse } from "next/server";
import { z } from "zod";
import { getMissionPlan, setHabitCheck } from "@/lib/mission/store";
import { IsoDate, invalid, readJson } from "@/lib/mission/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ date: IsoDate, done: z.boolean() }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = Body.safeParse(await readJson(req));
  if (!body.success) return invalid(body.error);
  if (!getMissionPlan()?.plan.habits.some((h) => h.id === id)) return invalid("Habitude introuvable.", 404);
  setHabitCheck(id, body.data.date, body.data.done);
  return NextResponse.json({ ok: true });
}
