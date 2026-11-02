import { NextResponse } from "next/server";
import { z } from "zod";
import { createUserTask } from "@/lib/mission/store";
import { IsoDate, invalid, readJson } from "@/lib/mission/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z
  .object({
    phase: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(300),
    detail: z.string().max(2000).optional(),
    minutes: z.number().int().min(0).max(1440),
    window_start: IsoDate,
    window_end: IsoDate,
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    category: z.string().trim().min(1).max(40),
  })
  .strict()
  .refine((t) => t.window_start <= t.window_end, { message: "fenêtre : début après la fin", path: ["window_end"] });

/** Tâche personnelle (id U-<n>, supprimable). */
export async function POST(req: Request) {
  const body = CreateSchema.safeParse(await readJson(req));
  if (!body.success) return invalid(body.error);
  return NextResponse.json({ task: createUserTask(body.data) });
}
