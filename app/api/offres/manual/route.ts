import { NextRequest, NextResponse } from "next/server";
import { upsertOffreFromSource, setOffreScore } from "@/lib/db/offres";
import { getProfile } from "@/lib/db/queries";
import { sanitizeScrapedOffre } from "@/lib/offres/clean-text";
import { MANUAL_SOURCE, draftFromUrl, draftToOffre, type ManualDraft } from "@/lib/offres/manual";
import { scoreOffresLocal } from "@/lib/scoring/local";

export const runtime = "nodejs";

const FIELDS = ["url", "title", "company", "location", "country", "contract_type", "salary", "posted_at", "description_text", "description_html"] as const;

function toDraft(v: unknown): ManualDraft {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(FIELDS.map((k) => [k, typeof o[k] === "string" ? (o[k] as string).slice(0, 100_000) : ""])) as ManualDraft;
}

/**
 * Ajout manuel d'une offre.
 *   { action: "fetch", url }              → brouillon lu depuis la page
 *   { action: "save", draft, original? }  → offre enregistrée et notée, { id }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    if (body?.action === "fetch") {
      if (typeof body.url !== "string" || !body.url.trim()) return NextResponse.json({ error: "Lien manquant." }, { status: 400 });
      return NextResponse.json({ draft: await draftFromUrl(body.url) });
    }
    if (body?.action === "save") {
      const offre = draftToOffre(toDraft(body.draft), body.original ? toDraft(body.original) : undefined);
      const id = upsertOffreFromSource(MANUAL_SOURCE, offre);
      const profile = getProfile();
      if (profile) {
        const c = sanitizeScrapedOffre(offre, MANUAL_SOURCE);
        const [score] = scoreOffresLocal(profile, [
          { title: c.title, company: c.company, country: c.country, description_text: c.description_text, contract_type: c.contract_type },
        ]);
        setOffreScore(id, score);
      }
      return NextResponse.json({ id });
    }
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
