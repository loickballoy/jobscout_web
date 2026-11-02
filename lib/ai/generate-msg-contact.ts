import "server-only";
import fs from "node:fs";
import path from "node:path";
import { callStructured, type StructuredTool } from "./llm";
import { AiContentError, assertNotTruncated } from "./errors";
import { validateLMAgainstProfile } from "./validate";
import { proofreadTexts } from "./proofread";
import { profileFacts } from "./profile-facts";
import { detectDocLanguage, sourceLanguageHint, type DocLang } from "@/lib/text/lang";
import type { ProfileFull } from "@/lib/cv/types";
import type { OffreFiltered } from "@/lib/db/offres";

/**
 * Message court à une personne nommée (panneau « Préparer la candidature ») :
 * 4 phrases au plus — poste visé, fait du CV maître le plus proche du besoin, lien
 * réel avec l'entreprise (ou rien), demande simple. Mêmes garde-fous que la lettre :
 * faits autorisés seulement, contrôle des entreprises citées, relecture.
 */

const TOOL = {
  name: "build_msg_contact",
  description: "Construit le message court à une personne nommée, en 4 phrases au plus.",
  input_schema: {
    type: "object",
    properties: {
      target: { type: "string", description: "Phrase 1 : le poste visé (intitulé exact et entreprise)." },
      proof: { type: "string", description: "Phrase 2 : un fait autorisé, le plus proche du besoin, chiffré seulement s'il l'est déjà." },
      link: { type: "string", description: "Phrase 3 : un lien réel avec l'entreprise, le secteur ou le pays ; chaîne vide sinon." },
      ask: { type: "string", description: "Phrase 4 : une demande simple." },
    },
    required: ["target", "proof", "link", "ask"],
  },
} as const;

let _system: string | null = null;

export type ContactPerson = { name: string; role?: string | null };

function languageBlock(lang: DocLang): string {
  return lang === "en"
    ? "## LANGUE DE SORTIE : ANGLAIS — l'offre est rédigée en anglais : le message est entièrement en anglais (noms propres conservés)."
    : "## Langue de sortie : FRANÇAIS — le message est en français.";
}

/** Coupe à 4 phrases au plus (garde-fou : la sortie d'outil n'est pas garantie conforme). */
export function capSentences(parts: string[], max = 4): string {
  const sentences = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => p.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [p])
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.slice(0, max).join(" ");
}

export async function generateMsgContact(
  profile: ProfileFull,
  offre: OffreFiltered,
  contact: ContactPerson,
  opts: { facts?: string; lang?: DocLang } = {}
): Promise<string> {
  if (!_system) _system = fs.readFileSync(path.join(process.cwd(), "prompts", "generate-msg-contact.md"), "utf-8");
  const lang = opts.lang ?? detectDocLanguage(offre.title, offre.description_text, sourceLanguageHint(offre.source, offre.raw_payload), offre.country);
  const message = await callStructured({
    role: "writer",
    maxTokens: 800,
    system: [{ text: _system, cache: true }],
    tool: TOOL as unknown as StructuredTool,
    user:
      `${languageBlock(lang)}\n\n## Faits autorisés (seule source sur le candidat)\n${opts.facts ?? profileFacts(profile)}\n\n` +
      `## Destinataire\n- Rôle : ${contact.role || "(non précisé)"}\n\n` +
      `## Offre\n- Intitulé : ${offre.title}\n- Entreprise : ${offre.company || "(non précisée)"}\n- Lieu : ${[offre.location, offre.country].filter(Boolean).join(", ") || "(non précisé)"}\n- Description :\n${offre.description_text.slice(0, 4000)}\n\nRédige le message.`,
  });
  assertNotTruncated(message, "le message court");
  if (!message.input) throw new AiContentError("La réponse IA pour le message court est vide — relancez la génération.");
  const out = message.input as Record<string, unknown>;
  const field = (k: string) => (typeof out[k] === "string" ? (out[k] as string).trim() : "");
  const parts = [field("target"), field("proof"), field("link"), field("ask")].filter(Boolean);
  if (parts.join("").length < 40) throw new AiContentError("La réponse IA pour le message court est inexploitable (contenu vide) — relancez la génération.");

  // Anti-invention : entreprises citées absentes du profil signalées (comme pour la lettre).
  const { warnings } = validateLMAgainstProfile({ object: "", body_paragraphs: parts }, profile);
  for (const w of warnings) console.log(`[generateMsgContact] ${w}`);
  // Relecture (orthographe, faits non étayés) — jamais bloquante ; une phrase vidée reste vide.
  const reviewed = await proofreadTexts(parts, profile, "lm", lang);
  return capSentences(reviewed);
}
