import { NextRequest, NextResponse } from "next/server";
import { xlsxToCandidatures } from "@/lib/excel/io";
import { archiveStaleCandidatures, createCandidature, importedCandidatureExists } from "@/lib/db/candidatures";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "fichier manquant" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const rows = xlsxToCandidatures(buf);
  let imported = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.ext_company && !r.ext_title) continue;
    // Réimporter le même fichier ne crée pas de doublons.
    if (importedCandidatureExists(r.ext_company, r.ext_title, r.applied_at)) {
      skipped++;
      continue;
    }
    createCandidature({ offre_id: null, ...r });
    imported++;
  }
  // Les candidatures déjà anciennes et sans réponse passent tout de suite en « Archivée ».
  const archived = archiveStaleCandidatures();
  return NextResponse.json({ ok: true, imported, skipped, archived });
}
