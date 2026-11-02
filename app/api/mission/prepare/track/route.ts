import { NextResponse } from "next/server";
import { z } from "zod";
import { trackPreparedOffer } from "@/lib/mission/prepare";
import { invalid, readJson } from "@/lib/mission/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    offreId: z.number().int().positive(),
    contact: z.object({ name: z.string().trim().max(120), role: z.string().trim().max(120).optional(), url: z.string().trim().max(300).optional() }).strict().optional(),
  })
  .strict();

/** « Ajouter au suivi » depuis le panneau Préparer la candidature. */
export async function POST(req: Request) {
  const body = Body.safeParse(await readJson(req));
  if (!body.success) return invalid(body.error);
  try {
    return NextResponse.json(trackPreparedOffer(body.data.offreId, body.data.contact ?? null));
  } catch (e) {
    return invalid(e instanceof Error ? e.message : String(e));
  }
}
