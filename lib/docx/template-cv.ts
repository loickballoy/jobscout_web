import "server-only";
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } from "docx";
import type { TemplateCvDoc } from "@/lib/cvtemplate/assemble";
import { splitMeta } from "@/lib/cvtemplate/layout";

// Même contenu et même mise en page que le PDF (lib/pdf/template-cv.tsx) :
// nom et titres en linéale, corps en romain, dates alignées à droite.
const SANS = "Arial";
const SERIF = "Times New Roman";
const INK = "1A1A1A";
const MUTED = "555555";
// Demi-points : 20 = 10 pt. Multipliés par l'échelle retenue pour le PDF (une page).
const BASE = { body: 20, small: 17, name: 44, headline: 21, section: 16, entry: 19, skills: 18 };
let SZ = BASE;
// A4 = 11 906 twips de large ; marges de 920 twips → tabulation droite à la marge.
const MARGIN = 920;
const RIGHT_TAB = 11906 - 2 * MARGIN;

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text: text.toUpperCase(), size: SZ.section, color: MUTED, characterSpacing: 32, font: SANS })],
  });
}

/** Titre à gauche (gras linéale), date à droite (tabulation). */
function titleLine(title: string, date: string | null, opts: { bold?: boolean; serif?: boolean; before?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { before: opts.before ?? 90, after: 0 },
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
    children: [
      new TextRun({ text: title, bold: opts.bold ?? true, size: opts.serif ? SZ.body : SZ.entry, color: INK, font: opts.serif ? SERIF : SANS }),
      ...(date ? [new TextRun({ text: `\t${date}`, size: SZ.small, color: MUTED, font: SANS })] : []),
    ],
  });
}

function mutedLine(text: string, font = SANS, size = SZ.small): Paragraph {
  return new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text, size, color: MUTED, font })] });
}

export async function renderTemplateCvDocx(doc: TemplateCvDoc, scale = 1): Promise<Buffer> {
  // Word met en page un peu plus large que react-pdf : petite marge de sécurité en plus.
  const k = scale * 0.96;
  SZ = Object.fromEntries(Object.entries(BASE).map(([key, v]) => [key, Math.round(v * k)])) as typeof BASE;
  const children: Paragraph[] = [
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: doc.name, size: SZ.name, color: INK, font: SANS })] }),
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: doc.headline, size: SZ.headline, color: INK, font: SANS })] }),
    mutedLine(doc.contact.join("  ·  ")),
  ];
  if (doc.tagline) children.push(mutedLine(doc.tagline));
  // Filet sous l'en-tête.
  children.push(new Paragraph({ spacing: { after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "D4D4D4", space: 6 } }, children: [] }));

  if (doc.profile) {
    children.push(sectionTitle(doc.profileTitle));
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: doc.profile, size: SZ.body, font: SERIF, color: INK })] }));
  }

  for (const s of doc.sections) {
    children.push(sectionTitle(s.title));
    for (const e of s.entries) {
      const { date, extra } = splitMeta(e.meta);
      if (e.heading) children.push(titleLine(e.heading, date));
      if (extra) children.push(mutedLine(extra));
      if (e.sub) children.push(mutedLine(e.sub));
      for (const b of e.bullets) {
        children.push(
          new Paragraph({
            spacing: { before: 30, after: 0 },
            indent: { left: 300, hanging: 200 },
            children: [new TextRun({ text: `·\t${b.text}`, size: SZ.body, font: SERIF, color: INK })],
            tabStops: [{ type: TabStopType.LEFT, position: 300 }],
          })
        );
      }
    }
  }

  const skills = doc.skills.map((s) => s.items).join(", ");
  if (skills) {
    children.push(sectionTitle(doc.skillsTitle));
    children.push(new Paragraph({ spacing: { line: 276 }, children: [new TextRun({ text: skills, size: SZ.skills, font: SANS, color: INK })] }));
  }

  if (doc.education.length) {
    children.push(sectionTitle(doc.educationTitle));
    for (const e of doc.education) {
      const { date, extra } = splitMeta(e.meta);
      children.push(titleLine(e.heading, date, { bold: false, serif: true, before: 60 }));
      if (extra) children.push(mutedLine(extra, SERIF, 19));
    }
  }

  return Packer.toBuffer(
    new Document({
      creator: doc.name,
      title: `${doc.name} — ${doc.headline}`,
      styles: { default: { document: { run: { font: SERIF, size: SZ.body } } } },
      sections: [{ properties: { page: { margin: { top: 680, right: MARGIN, bottom: 600, left: MARGIN } } }, children }],
    })
  );
}
