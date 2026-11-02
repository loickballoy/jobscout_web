import { NextResponse } from "next/server";
import { z } from "zod";
import { setManualAuditItem } from "@/lib/mission/store";
import { invalid, readJson } from "@/lib/mission/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ id: z.string().min(1).max(80), done: z.boolean() }).strict();

/** Coche ou décoche un critère manuel de l'audit. */
export async function POST(req: Request) {
  const body = Body.safeParse(await readJson(req));
  if (!body.success) return invalid(body.error);
  if (!setManualAuditItem(body.data.id, body.data.done)) return invalid("Critère introuvable.", 404);
  return NextResponse.json({ ok: true });
}
