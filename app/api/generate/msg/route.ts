import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/db/queries";
import { getOffre } from "@/lib/db/offres";
import { generateMsgVie } from "@/lib/ai/generate-msg-vie";
import { genericFailure, translateAiError } from "@/lib/ai/errors";
import { saveDocument, offreFolderPath } from "@/lib/db/documents";
import { generateMsgContact } from "@/lib/ai/generate-msg-contact";
import { getCvTemplate } from "@/lib/cvtemplate/store";
import { assembleTemplateCv, templateCvFacts } from "@/lib/cvtemplate/assemble";
import { autoSelection, forcedSelection } from "@/lib/cvtemplate/select";
import { detectDocLanguage, sourceLanguageHint } from "@/lib/text/lang";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { offreId, mode, contact, cluster } = (await req.json()) as {
      offreId: unknown;
      mode?: unknown;
      contact?: { name?: unknown; role?: unknown };
      cluster?: unknown;
    };
    const profile = getProfile();
    if (!profile) return NextResponse.json({ error: "Profil introuvable" }, { status: 400 });
    const offre = getOffre(Number(offreId));
    if (!offre) return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });

    let text: string;
    if (mode === "contact") {
      // Message court à une personne nommée, pour n'importe quelle offre.
      const name = typeof contact?.name === "string" ? contact.name.trim().slice(0, 120) : "";
      if (!name) return NextResponse.json({ error: "Nom du contact requis." }, { status: 400 });
      const role = typeof contact?.role === "string" ? contact.role.trim().slice(0, 120) : null;
      const lang = detectDocLanguage(offre.title, offre.description_text, sourceLanguageHint(offre.source, offre.raw_payload), offre.country);
      // Faits autorisés : le CV assemblé depuis le modèle maître (cluster imposé ou choix automatique), sinon le profil.
      const template = getCvTemplate();
      let facts: string | undefined;
      if (template) {
        const sel = (typeof cluster === "string" && cluster ? forcedSelection(template, offre, lang, cluster) : null) ?? autoSelection(template, offre, lang);
        facts = templateCvFacts(assembleTemplateCv(template, sel, offre, lang));
      }
      text = await generateMsgContact(profile, offre, { name, role }, { facts, lang });
    } else {
      // Mode V.I.E (inchangé) : même règle que le badge et le filtre V.I.E (détection stricte).
      if (offre.contract_category !== "vie") return NextResponse.json({ error: "Offre non V.I.E" }, { status: 400 });
      text = await generateMsgVie(profile, offre);
    }
    const meta = { company: offre.company, title: offre.title };
    const doc = saveDocument({
      type: "msg",
      offreId: offre.id,
      format: "txt",
      buffer: text,
      meta,
    });
    return NextResponse.json({
      ok: true,
      document_id: doc.id,
      text,
      length: text.length,
      folder: offreFolderPath(offre.id, offre.company, offre.title),
    });
  } catch (e) {
    const ai = translateAiError(e);
    if (ai) return NextResponse.json({ error: ai.message }, { status: ai.status });
    return NextResponse.json(
      { error: genericFailure("generate/msg", e) },
      { status: 500 }
    );
  }
}
