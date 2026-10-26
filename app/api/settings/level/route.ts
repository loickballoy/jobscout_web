import { NextRequest, NextResponse } from "next/server";
import { getJuniorOnly, setJuniorOnly } from "@/lib/seniority-store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ juniorOnly: getJuniorOnly() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { juniorOnly?: unknown };
  if (typeof body.juniorOnly !== "boolean") return NextResponse.json({ error: "Valeur attendue : juniorOnly (booléen)." }, { status: 400 });
  return NextResponse.json({ juniorOnly: setJuniorOnly(body.juniorOnly) });
}
