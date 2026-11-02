import { NextResponse } from "next/server";
import { z } from "zod";
import { saveOfferContact } from "@/lib/mission/prepare";
import { invalid, readJson } from "@/lib/mission/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    offreId: z.number().int().positive(),
    name: z.string().trim().min(1).max(120),
    role: z.string().trim().max(120).optional(),
    url: z.string().trim().max(300).regex(/^(https?:\/\/\S+)?$/, "lien http(s) attendu").optional(),
  })
  .strict();

/** Contact de l'offre : crée ou met à jour la cible de l'entreprise. */
export async function POST(req: Request) {
  const body = Body.safeParse(await readJson(req));
  if (!body.success) return invalid(body.error);
  try {
    const { offreId, ...c } = body.data;
    return NextResponse.json({ target: saveOfferContact(offreId, c) });
  } catch (e) {
    return invalid(e instanceof Error ? e.message : String(e));
  }
}
