import { NextResponse } from "next/server";
import { exportMissionPack } from "@/lib/mission/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** État courant de la Mission, au format du pack, téléchargé en mission-AAAA-MM-JJ.json. */
export async function GET() {
  const pack = exportMissionPack();
  if (!pack) return NextResponse.json({ error: "Aucune mission importée." }, { status: 404 });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(pack, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="mission-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
