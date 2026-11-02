import { NextRequest, NextResponse } from "next/server";
import { resetMission } from "@/lib/mission/store";
import { RESET_WORD } from "@/lib/mission/pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vide la Mission (tables et réglages), après saisie du mot de confirmation. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== RESET_WORD) return NextResponse.json({ error: `Tapez ${RESET_WORD} pour confirmer.` }, { status: 400 });
  resetMission();
  return NextResponse.json({ ok: true });
}
