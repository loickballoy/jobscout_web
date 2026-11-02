import { NextRequest, NextResponse } from "next/server";
import { getCvTemplate, saveCvTemplateWithBackup } from "@/lib/cvtemplate/store";
import { applyCvPatch } from "@/lib/cvtemplate/patch";
import { templatePlaceholders } from "@/lib/cvtemplate/inspect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Applique un correctif au modèle de CV : { patch, dryRun }.
 * dryRun : résumé, erreurs et crochets restants, rien n'est écrit. Sinon, le modèle
 * courant est sauvegardé (cv_template_backup) avant d'enregistrer le modèle corrigé.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { patch?: unknown; dryRun?: unknown } | null;
  if (!body || body.patch === undefined) return NextResponse.json({ error: "Correctif manquant." }, { status: 400 });
  const current = getCvTemplate();
  if (!current) return NextResponse.json({ error: "Aucun modèle de CV à corriger : importez d'abord un modèle." }, { status: 400 });
  const r = applyCvPatch(current, body.patch);
  const placeholders = r.ok ? templatePlaceholders(r.template).map((p) => ({ where: p.where, lang: p.lang, placeholders: p.placeholders })) : [];
  const out = { ok: r.ok, description: r.description, summary: r.summary, errors: r.errors, placeholders };
  if (!r.ok) return NextResponse.json(out, { status: 422 });
  if (body.dryRun !== false) return NextResponse.json({ ...out, dryRun: true });
  saveCvTemplateWithBackup(r.template);
  return NextResponse.json({ ...out, dryRun: false });
}
