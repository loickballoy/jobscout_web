import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteUserTask, listMissionTasks, updateMissionTask } from "@/lib/mission/store";
import { IsoDate, invalid, readJson } from "@/lib/mission/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Champs modifiables uniquement (anti mass-assignment) : .strict() refuse le reste.
const PatchSchema = z
  .object({
    done: z.boolean().optional(),
    window_start: IsoDate.optional(),
    window_end: IsoDate.optional(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    minutes: z.number().int().min(0).max(1440).optional(),
  })
  .strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = PatchSchema.safeParse(await readJson(req));
  if (!body.success) return invalid(body.error);
  const current = listMissionTasks().find((t) => t.id === id);
  if (!current) return invalid("Tâche introuvable.", 404);
  const start = body.data.window_start ?? current.window_start;
  const end = body.data.window_end ?? current.window_end;
  if (start > end) return invalid("fenêtre : début après la fin");
  return NextResponse.json({ task: updateMissionTask(id, body.data) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!deleteUserTask(id)) return invalid("Seules vos tâches personnelles peuvent être supprimées.", 400);
  return NextResponse.json({ ok: true });
}
