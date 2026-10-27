import { NextRequest, NextResponse } from "next/server";
import { getExperienceYears, getJuniorOnly, setExperienceYears, setJuniorOnly } from "@/lib/seniority-store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ juniorOnly: getJuniorOnly(), experienceYears: getExperienceYears() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { juniorOnly?: unknown; experienceYears?: unknown };
  if (body.juniorOnly !== undefined && typeof body.juniorOnly !== "boolean")
    return NextResponse.json({ error: "juniorOnly : booléen attendu." }, { status: 400 });
  if (body.experienceYears !== undefined && (typeof body.experienceYears !== "number" || !Number.isFinite(body.experienceYears) || body.experienceYears < 0))
    return NextResponse.json({ error: "experienceYears : nombre ≥ 0 attendu." }, { status: 400 });
  if (typeof body.juniorOnly === "boolean") setJuniorOnly(body.juniorOnly);
  if (typeof body.experienceYears === "number") setExperienceYears(body.experienceYears);
  return NextResponse.json({ juniorOnly: getJuniorOnly(), experienceYears: getExperienceYears() });
}
