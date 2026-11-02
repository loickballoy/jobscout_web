import { NextResponse } from "next/server";
import { runAudit } from "@/lib/mission/audit-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** « Lancer l'audit » : calcule et enregistre le résultat dans l'historique. */
export async function POST() {
  return NextResponse.json(runAudit());
}
