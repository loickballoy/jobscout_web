import { NextResponse } from "next/server";
import { rescoreAllOffres } from "@/lib/scoring/rescore";

export const runtime = "nodejs";
export const maxDuration = 120;

// Re-score toutes les offres avec le profil actif.
// Utile après une mise à jour du profil (secteurs, pays, compétences) ou du
// moteur de scoring — le scoring est local et déterministe, donc gratuit.
export async function POST() {
  const rescored = rescoreAllOffres();
  if (rescored === null) return NextResponse.json({ error: "Aucun profil actif" }, { status: 400 });
  return NextResponse.json({ ok: true, rescored });
}
