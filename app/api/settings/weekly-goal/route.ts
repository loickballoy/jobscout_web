import { NextRequest, NextResponse } from "next/server";
import { getWeeklyGoal, setWeeklyGoal } from "@/lib/db/candidatures";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ goal: getWeeklyGoal() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { goal?: unknown };
  const n = Number(body.goal);
  if (!Number.isFinite(n) || n < 1) return NextResponse.json({ error: "Objectif attendu : un nombre ≥ 1." }, { status: 400 });
  return NextResponse.json({ goal: setWeeklyGoal(n) });
}
