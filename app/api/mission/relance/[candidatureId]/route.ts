import { NextResponse } from "next/server";
import { recordRelance } from "@/lib/mission/store";
import { invalid } from "@/lib/mission/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Relance faite : événement « relance » et compteur de la candidature. */
export async function POST(_req: Request, { params }: { params: Promise<{ candidatureId: string }> }) {
  const id = Number((await params).candidatureId);
  if (!Number.isInteger(id) || !recordRelance(id)) return invalid("Candidature introuvable.", 404);
  return NextResponse.json({ ok: true });
}
