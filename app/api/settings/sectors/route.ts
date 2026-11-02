import { NextRequest, NextResponse } from "next/server";
import { getTargetSectors, setTargetSectors } from "@/lib/sector-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sectors: getTargetSectors() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { sectors?: unknown };
  if (!Array.isArray(body.sectors)) return NextResponse.json({ error: "sectors : liste attendue." }, { status: 400 });
  try {
    return NextResponse.json({ sectors: setTargetSectors(body.sectors) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
