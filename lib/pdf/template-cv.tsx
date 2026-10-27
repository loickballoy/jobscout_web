import "server-only";
import * as React from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import type { TemplateCvDoc } from "@/lib/cvtemplate/assemble";
import { splitMeta } from "@/lib/cvtemplate/layout";

// Pas de césure automatique (règles anglaises appliquées au français sinon).
Font.registerHyphenationCallback((word) => [word]);

// =============================================================
// CV assemblé depuis le modèle maître — une colonne, compatible ATS :
// texte réel (aucune image), titres de sections standards, ordre de
// lecture linéaire. Typographie sobre : nom et titres en linéale
// (Helvetica), corps en romain (Times), dates alignées à droite.
// `scale` réduit tailles et marges pour tenir sur une page.
// =============================================================

const INK = "#1a1a1a";
const MUTED = "#555555";
const RULE = "#d4d4d4";

/** « Libellé : » en français (espace insécable), « Label: » en anglais. */
export const labelSep = (lang: TemplateCvDoc["lang"]) => (lang === "fr" ? " : " : ": ");

function styles(scale: number) {
  const s = (n: number) => Math.round(n * scale * 100) / 100;
  return StyleSheet.create({
    page: {
      paddingHorizontal: s(44),
      paddingVertical: s(32),
      fontFamily: "Times-Roman",
      fontSize: s(10),
      lineHeight: 1.3,
      color: INK,
    },
    // Interligne explicite : hérité de la page, il ferait chevaucher nom et titre.
    name: { fontFamily: "Helvetica", fontSize: s(22), lineHeight: 1.1, color: INK, marginBottom: s(3) },
    headline: { fontFamily: "Helvetica", fontSize: s(10.5), lineHeight: 1.2, color: INK, marginBottom: s(3) },
    contact: { fontFamily: "Helvetica", fontSize: s(8.5), lineHeight: 1.3, color: MUTED },
    rule: { borderBottomWidth: 0.6, borderBottomColor: RULE, marginTop: s(9), marginBottom: s(1) },
    sectionTitle: {
      fontFamily: "Helvetica",
      fontSize: s(8),
      color: MUTED,
      textTransform: "uppercase",
      letterSpacing: 1.6,
      marginTop: s(11),
      marginBottom: s(5),
    },
    paragraph: { textAlign: "justify" },
    entry: { marginBottom: s(6) },
    entryHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    entryTitle: { fontFamily: "Helvetica-Bold", fontSize: s(9.5), color: INK, flex: 1, paddingRight: s(10) },
    entryDate: { fontFamily: "Helvetica", fontSize: s(8.5), color: MUTED, textAlign: "right" },
    entrySub: { fontFamily: "Helvetica", fontSize: s(8.5), color: MUTED, marginTop: s(1) },
    bullet: { flexDirection: "row", marginTop: s(2.2), paddingLeft: s(4) },
    bulletDot: { width: s(10), color: MUTED },
    bulletText: { flex: 1 },
    eduBlock: { marginBottom: s(4) },
    eduRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    eduExtra: { fontSize: s(9.5), color: MUTED },
    eduHeading: { flex: 1, paddingRight: s(10) },
    skills: { fontFamily: "Helvetica", fontSize: s(9), lineHeight: 1.55, color: INK },
  });
}

type St = ReturnType<typeof styles>;

/** Ligne de titre : intitulé à gauche, dates (ou détails) alignés à droite. */
function TitleRow({ st, title, right }: { st: St; title: string; right: string | null }) {
  return (
    <View style={st.entryHead}>
      <Text style={st.entryTitle}>{title}</Text>
      {right ? <Text style={st.entryDate}>{right}</Text> : null}
    </View>
  );
}

export function TemplateCVDocument({ doc, scale = 1 }: { doc: TemplateCvDoc; scale?: number }) {
  const st = styles(scale);
  // Compétences : une seule liste continue, comme dans le modèle visuel (les libellés de blocs n'y figurent pas).
  const skills = doc.skills.map((s) => s.items).join(", ");
  return (
    <Document title={`${doc.name} — ${doc.headline}`} author={doc.name} language={doc.lang}>
      <Page size="A4" style={st.page}>
        <Text style={st.name}>{doc.name}</Text>
        <Text style={st.headline}>{doc.headline}</Text>
        <Text style={st.contact}>{doc.contact.join("  ·  ")}</Text>
        {doc.tagline && <Text style={st.contact}>{doc.tagline}</Text>}
        <View style={st.rule} />

        {doc.profile && (
          <>
            <Text style={st.sectionTitle}>{doc.profileTitle}</Text>
            <Text style={st.paragraph}>{doc.profile}</Text>
          </>
        )}

        {doc.sections.map((section) => (
          <View key={section.id}>
            <Text style={st.sectionTitle}>{section.title}</Text>
            {section.entries.map((e) => {
              const { date, extra } = splitMeta(e.meta);
              return (
              <View key={e.id} style={st.entry} wrap={false}>
                {e.heading ? <TitleRow st={st} title={e.heading} right={date} /> : null}
                {extra ? <Text style={st.entrySub}>{extra}</Text> : null}
                {e.sub ? <Text style={st.entrySub}>{e.sub}</Text> : null}
                {e.bullets.map((b) => (
                  <View key={b.id} style={st.bullet}>
                    <Text style={st.bulletDot}>·</Text>
                    <Text style={st.bulletText}>{b.text}</Text>
                  </View>
                ))}
              </View>
              );
            })}
          </View>
        ))}

        {skills && (
          <>
            <Text style={st.sectionTitle}>{doc.skillsTitle}</Text>
            <Text style={st.skills}>{skills}</Text>
          </>
        )}

        {doc.education.length > 0 && (
          <>
            <Text style={st.sectionTitle}>{doc.educationTitle}</Text>
            {doc.education.map((e, i) => {
              const { date, extra } = splitMeta(e.meta);
              return (
                <View key={i} style={st.eduBlock}>
                  <View style={st.eduRow}>
                    <Text style={st.eduHeading}>{e.heading}</Text>
                    {date ? <Text style={st.entryDate}>{date}</Text> : null}
                  </View>
                  {extra ? <Text style={st.eduExtra}>{extra}</Text> : null}
                </View>
              );
            })}
          </>
        )}
      </Page>
    </Document>
  );
}
