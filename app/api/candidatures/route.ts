import { NextRequest, NextResponse } from "next/server";
import {
  listCandidatures,
  createCandidature,
  updateCandidature,
  deleteCandidature,
  STATUS,
} from "@/lib/db/candidatures";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ candidatures: listCandidatures() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body?.status != null && !STATUS.includes(body.status)) {
    return NextResponse.json({ error: "statut invalide" }, { status: 400 });
  }
  const id = createCandidature(body);
  return NextResponse.json({ id, ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...patch } = body;
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  if (patch.status && !STATUS.includes(patch.status)) {
    return NextResponse.json({ error: "statut invalide" }, { status: 400 });
  }
  if (patch.applied_at !== undefined) {
    // Date de candidature : AAAA-MM-JJ (champ date du navigateur), enregistrée à midi.
    if (typeof patch.applied_at !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(patch.applied_at)) {
      return NextResponse.json({ error: "date de candidature invalide (AAAA-MM-JJ)" }, { status: 400 });
    }
    patch.applied_at = `${patch.applied_at} 12:00:00`;
  }
  // Vitrine : date de début AAAA-MM-JJ (ou vide), salaire en texte libre borné.
  if (patch.offer_start != null && patch.offer_start !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(patch.offer_start))) {
    return NextResponse.json({ error: "date de début invalide (AAAA-MM-JJ)" }, { status: 400 });
  }
  if (patch.offer_salary != null) patch.offer_salary = String(patch.offer_salary).slice(0, 120);
  updateCandidature(Number(id), patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  deleteCandidature(id);
  return NextResponse.json({ ok: true });
}
