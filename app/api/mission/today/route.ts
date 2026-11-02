import { NextRequest, NextResponse } from "next/server";
import { loadDay, todayIso } from "@/lib/mission/load";
import { IsoDate, invalid } from "@/lib/mission/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("date");
  const date = raw ? IsoDate.safeParse(raw) : { success: true as const, data: todayIso() };
  if (!date.success) return invalid(date.error);
  return NextResponse.json(loadDay(date.data));
}
