import { NextRequest, NextResponse } from "next/server";
import { importMissionPack } from "@/lib/mission/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Import d'un pack de Mission : { pack, dryRun } ; résumé de ce qui est créé, mis à jour ou inchangé. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { pack?: unknown; dryRun?: unknown } | null;
  if (!body || body.pack === undefined) return NextResponse.json({ ok: false, errors: ["Pack manquant."] }, { status: 400 });
  const r = importMissionPack(body.pack, { dryRun: body.dryRun === true });
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
