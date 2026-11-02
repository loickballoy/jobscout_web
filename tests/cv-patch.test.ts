import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { applyCvPatch } from "@/lib/cvtemplate/patch";
import { parseCvTemplate, type CvTemplate } from "@/lib/cvtemplate/types";
import { getCvTemplate, getCvTemplateBackup, saveCvTemplate } from "@/lib/cvtemplate/store";

const cluster = (id: string) => ({
  id,
  name: `Cluster ${id}`,
  titles: `Poste ${id}`,
  keywords: [`mot${id}`],
  headline: { fr: `Titre ${id}`, en: `Title ${id}` },
  profile: { fr: `Profil ${id}.`, en: `Profile ${id}.` },
  order: ["experience", "projects"],
  priority: id === "A" ? ["X1-A", "P1-AB"] : id === "B" ? ["P1-AB"] : [],
  limits: {},
  skills: { fr: [{ label: "Langages", items: "Python, C++" }], en: [{ label: "Languages", items: "Python, C++" }] },
});

/** Modèle fictif à cinq clusters (A à E), sur le modèle de tests/cv-template-fixture.ts. */
const RAW = {
  version: 1,
  identity: { full_name: "Jean Test", contact: ["jean.test@example.com"], taglines: [] },
  clusters: ["A", "B", "C", "D", "E"].map(cluster),
  sections: [
    {
      id: "experience",
      title: { fr: "Expérience", en: "Experience" },
      entries: [
        {
          id: "demo",
          heading: { fr: "ESN Démo — Développeur", en: "ESN Démo — Developer" },
          meta: { fr: "2025", en: "2025" },
          bullets: [
            { id: "X1-A", clusters: ["A"], text: { fr: "Fait réservé à A.", en: "A only." } },
            { id: "X2-all", clusters: ["*"], text: { fr: "Fait commun.", en: "Shared fact." } },
            { id: "X3-CD", clusters: ["C", "D"], text: { fr: "Fait C et D.", en: "C and D." } },
          ],
        },
      ],
    },
    {
      id: "projects",
      title: { fr: "Projets", en: "Projects" },
      entries: [
        {
          id: "proj",
          heading: { fr: "Projet Démo", en: "Demo project" },
          bullets: [
            { id: "P1-AB", clusters: ["A", "B"], text: { fr: "Projet A et B.", en: "Project A and B." } },
            { id: "P2-E", clusters: ["E"], text: { fr: "Projet E [N].", en: "Project E [N]." } },
          ],
        },
      ],
    },
  ],
};

function base(): CvTemplate {
  const r = parseCvTemplate(RAW);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.template;
}

const PATCH = {
  type: "jobscout-cv-patch",
  version: 1,
  description: "Garder B, E et F",
  operations: [
    { op: "remove_clusters", ids: ["A", "C", "D"] },
    { op: "update_clusters", id: "B", add_titles: "Poste B, Ingénieur Démo", add_keywords: ["finance", "motB"] },
    { op: "add_clusters", clusters: [{ ...cluster("F"), priority: ["F1"] }] },
    {
      op: "add_entries",
      items: [{ section: "projects", position: 0, entry: { id: "ledger", heading: { fr: "Ledger Démo", en: "Demo ledger" }, bullets: [{ id: "F1", clusters: ["F"], text: { fr: "Écritures en partie double.", en: "Double-entry bookkeeping." } }] } }],
    },
    { op: "add_bullets", items: [{ entry: "demo", bullet: { id: "X4-F", clusters: ["F"], text: { fr: "Fait F.", en: "F fact." } } }] },
    { op: "add_clusters_to_bullets", items: [{ bullet: "P1-AB", clusters: ["F"] }] },
    { op: "set_entry_meta", items: [{ entry: "proj", meta: { fr: "2026", en: "2026" } }] },
    { op: "set_section_titles", items: [{ section: "projects", title: { fr: "Projets personnels", en: "Personal projects" } }] },
    { op: "set_taglines", taglines: [{ countries: ["CH"], text: { fr: "Permis B", en: "B permit" } }] },
    { op: "set_instructions", text: "Choisir F pour la finance." },
  ],
};

describe("correctifs du modèle de CV", () => {
  it("applique toutes les opérations ; remove_clusters supprime les puces orphelines et nettoie les priorités", () => {
    const r = applyCvPatch(base(), PATCH);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    const t = r.template;
    expect(t.clusters.map((c) => c.id)).toEqual(["B", "E", "F"]);
    const bullets = t.sections.flatMap((s) => s.entries).flatMap((e) => e.bullets);
    expect(bullets.map((b) => b.id)).not.toContain("X1-A");
    expect(bullets.map((b) => b.id)).not.toContain("X3-CD");
    expect(bullets.find((b) => b.id === "X2-all")!.clusters).toEqual(["*"]);
    expect(bullets.find((b) => b.id === "P1-AB")!.clusters).toEqual(["B", "F"]);
    expect(t.clusters.find((c) => c.id === "B")!.priority).toEqual(["P1-AB"]);
    expect(t.clusters.find((c) => c.id === "B")!.titles).toBe("Poste B, Ingénieur Démo");
    expect(t.clusters.find((c) => c.id === "B")!.keywords).toEqual(["motB", "finance"]);
    expect(t.sections[1].entries.map((e) => e.id)).toEqual(["ledger", "proj"]);
    expect(t.sections[1].title.fr).toBe("Projets personnels");
    expect(t.sections[1].entries[1].meta?.fr).toBe("2026");
    expect(t.identity.taglines).toHaveLength(1);
    expect(t.instructions).toBe("Choisir F pour la finance.");
    expect(r.summary).toEqual(expect.arrayContaining([
      "Clusters supprimés : « A », « C », « D »",
      "Puces supprimées (plus aucun cluster) : « X1-A », « X3-CD »",
      "Clusters ajoutés : « F »",
      "Entrées ajoutées : « ledger »",
      "Puces ajoutées : « X4-F »",
    ]));
    expect(parseCvTemplate(t).ok).toBe(true);
  });

  it("idempotent : appliquer deux fois le même correctif donne le même modèle", () => {
    const once = applyCvPatch(base(), PATCH);
    const twice = applyCvPatch(once.template, PATCH);
    expect(twice.ok).toBe(true);
    expect(twice.template).toEqual(once.template);
  });

  it("référence introuvable : erreur qui cite l'opération, aucune modification", () => {
    const original = base();
    const r = applyCvPatch(original, {
      type: "jobscout-cv-patch",
      version: 1,
      operations: [
        { op: "set_instructions", text: "x" },
        { op: "add_bullets", items: [{ entry: "absente", bullet: { id: "Z1", clusters: ["A"], text: { fr: "z" } } }] },
        { op: "update_clusters", id: "Z" },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      "Opération 2 (add_bullets) : entrée « absente » introuvable",
      "Opération 3 (update_clusters) : cluster « Z » introuvable",
    ]);
    expect(r.template).toBe(original);
    expect(original.instructions).toBe("");
  });

  it("correctif mal formé ou modèle obtenu invalide : erreurs lisibles", () => {
    expect(applyCvPatch(base(), { type: "autre" }).errors[0]).toMatch(/^type : /);
    const bad = applyCvPatch(base(), { type: "jobscout-cv-patch", version: 1, operations: [{ op: "add_bullets", items: [{ entry: "demo", bullet: { id: "Q1", clusters: ["Inconnu"], text: { fr: "q" } } }] }] });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/Modèle obtenu invalide : puce « Q1 » : cluster « Inconnu » inconnu/);
    const unknownOp = applyCvPatch(base(), { type: "jobscout-cv-patch", version: 1, operations: [{ op: "rename" }] });
    expect(unknownOp.errors[0]).toMatch(/^Opération 1/);
  });
});

describe("API des correctifs : aperçu, application, restauration", () => {
  beforeEach(() => {
    getDb().exec("DELETE FROM settings WHERE key IN ('cv_template', 'cv_template_backup')");
    saveCvTemplate(RAW);
  });

  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/cv-template/patch/route");
    return POST(new Request("http://x/api/cv-template/patch", { method: "POST", body: JSON.stringify(body) }) as never);
  };

  it("dryRun n'écrit rien et liste les crochets restants", async () => {
    const before = JSON.stringify(getCvTemplate());
    const res = await post({ patch: PATCH, dryRun: true });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.dryRun).toBe(true);
    expect(d.placeholders.length).toBeGreaterThan(0);
    expect(JSON.stringify(getCvTemplate())).toBe(before);
    expect(getCvTemplateBackup()).toBeNull();
  });

  it("appliquer sauvegarde l'original ; restaurer le rend", async () => {
    const before = getCvTemplate();
    const res = await post({ patch: PATCH, dryRun: false });
    expect(res.status).toBe(200);
    expect(getCvTemplate()!.clusters.map((c) => c.id)).toEqual(["B", "E", "F"]);
    expect(getCvTemplateBackup()?.saved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const { POST } = await import("@/app/api/cv-template/restore/route");
    expect((await POST()).status).toBe(200);
    expect(getCvTemplate()).toEqual(before);
  });

  it("correctif invalide : 422 et rien d'écrit", async () => {
    const before = JSON.stringify(getCvTemplate());
    const res = await post({ patch: { type: "jobscout-cv-patch", version: 1, operations: [{ op: "remove_clusters", ids: ["A", "B", "C", "D", "E"] }] }, dryRun: false });
    expect(res.status).toBe(422);
    expect(JSON.stringify(getCvTemplate())).toBe(before);
  });
});

describe("choix du cluster : secteur et cluster imposé", () => {
  const withSectorKeywords = () => {
    const t = base();
    t.clusters.find((c) => c.id === "B")!.keywords.push("finance");
    t.clusters.find((c) => c.id === "C")!.keywords.push("ESN");
    return t;
  };
  const offre = { title: "Développeur Python", description_text: "Projet interne.", country: "CH" };

  it("le secteur de l'offre départage les clusters marqués « finance » ou « ESN »", async () => {
    const { pickCluster, clusterReason } = await import("@/lib/cvtemplate/select");
    const t = withSectorKeywords();
    expect(pickCluster(t, offre).id).toBe("A"); // aucun indice : premier cluster
    expect(pickCluster(t, { ...offre, sector: "finance" }).id).toBe("B");
    expect(clusterReason(t, { ...offre, sector: "finance" })).toBe("Secteur de l'employeur");
    expect(pickCluster(t, { ...offre, sector: "conseil" }).id).toBe("C");
    expect(pickCluster(t, { ...offre, sector: "autre" }).id).toBe("A");
    expect(clusterReason(t, { ...offre, title: "Poste D" })).toBe("Mots-clés de l'offre");
    expect(clusterReason(t, offre)).toBe("Cluster par défaut du modèle");
  });

  it("cluster imposé : ni IA ni choix automatique", async () => {
    const { chooseSelection } = await import("@/lib/cvtemplate/generate");
    const t = withSectorKeywords();
    const call = async () => { throw new Error("l'IA ne doit pas être appelée"); };
    const r = await chooseSelection(t, { ...offre, sector: "finance" }, "fr", { aiConfigured: true, call, cluster: "E" });
    expect(r.selection).toMatchObject({ cluster: "E", mode: "forced" });
    expect(Object.values(r.selection.bullets).flat()).toContain("P2-E");
    // Cluster inconnu : retour au choix habituel (ici automatique, IA non configurée).
    const fallback = await chooseSelection(t, offre, "fr", { aiConfigured: false, cluster: "Z" });
    expect(fallback.selection.mode).toBe("auto");
  });
});
