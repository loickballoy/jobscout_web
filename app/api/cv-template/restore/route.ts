import { NextResponse } from "next/server";
import { getCvTemplateBackup, restoreCvTemplateBackup } from "@/lib/cvtemplate/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Date de la version précédente disponible, ou null. */
export async function GET() {
  return NextResponse.json({ backup: getCvTemplateBackup()?.saved_at ?? null });
}

/** Restaure la version d'avant le dernier correctif appliqué. */
export async function POST() {
  const r = restoreCvTemplateBackup();
  if (!r.ok) return NextResponse.json({ error: r.errors.join(" ; ") }, { status: 400 });
  return NextResponse.json({ ok: true });
}
