import { z } from "zod";
import {
  BulletSchema,
  ClusterSchema,
  EntrySchema,
  LocSchema,
  SkillLineSchema,
  TaglineSchema,
  parseCvTemplate,
  type CvTemplate,
} from "./types";

/**
 * Correctif du modèle de CV maître : une liste d'opérations appliquées dans l'ordre
 * sur une copie du modèle. Le résultat n'est retenu que si chaque référence existe et
 * si le modèle obtenu passe parseCvTemplate. Fonction pure, sans dépendance serveur.
 */

const Id = z.string().trim().min(1);

const OperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("remove_clusters"), ids: z.array(Id).min(1) }),
  z.object({
    op: z.literal("update_clusters"),
    id: Id,
    add_titles: z.string().optional(),
    add_keywords: z.array(z.string().trim().min(1)).optional(),
    headline: LocSchema.optional(),
    profile: LocSchema.optional(),
    skills: z.object({ fr: z.array(SkillLineSchema).min(1), en: z.array(SkillLineSchema).default([]) }).optional(),
  }),
  z.object({ op: z.literal("add_clusters"), clusters: z.array(ClusterSchema).min(1) }),
  z.object({
    op: z.literal("add_entries"),
    items: z.array(z.object({ section: Id, position: z.number().int().min(0).optional(), entry: EntrySchema })).min(1),
  }),
  z.object({ op: z.literal("add_bullets"), items: z.array(z.object({ entry: Id, bullet: BulletSchema })).min(1) }),
  z.object({ op: z.literal("add_clusters_to_bullets"), items: z.array(z.object({ bullet: Id, clusters: z.array(Id).min(1) })).min(1) }),
  z.object({ op: z.literal("set_entry_meta"), items: z.array(z.object({ entry: Id, meta: LocSchema })).min(1) }),
  z.object({ op: z.literal("set_section_titles"), items: z.array(z.object({ section: Id, title: LocSchema })).min(1) }),
  z.object({ op: z.literal("set_taglines"), taglines: z.array(TaglineSchema) }),
  z.object({ op: z.literal("set_instructions"), text: z.string() }),
]);
export type CvPatchOperation = z.infer<typeof OperationSchema>;

export const CvPatchSchema = z.object({
  type: z.literal("jobscout-cv-patch"),
  version: z.literal(1),
  description: z.string().optional().default(""),
  operations: z.array(OperationSchema).min(1),
});
export type CvPatch = z.infer<typeof CvPatchSchema>;

export type CvPatchResult = {
  ok: boolean;
  /** Modèle corrigé (valide) si ok, sinon le modèle d'origine inchangé. */
  template: CvTemplate;
  description: string;
  summary: string[];
  errors: string[];
};

const list = (ids: string[]) => ids.map((id) => `« ${id} »`).join(", ");

export function applyCvPatch(original: CvTemplate, raw: unknown): CvPatchResult {
  const parsed = CvPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      template: original,
      description: "",
      summary: [],
      errors: parsed.error.issues.slice(0, 20).map((i) => {
        const [first, index, ...rest] = i.path;
        const where = first === "operations" && typeof index === "number" ? `Opération ${index + 1}${rest.length ? ` › ${rest.join(".")}` : ""}` : i.path.join(".") || "(racine)";
        return `${where} : ${i.message}`;
      }),
    };
  }
  const patch = parsed.data;
  const t: CvTemplate = structuredClone(original);
  const errors: string[] = [];
  const done = {
    clustersAdded: [] as string[], clustersReplaced: [] as string[], clustersRemoved: [] as string[], clustersUpdated: [] as string[],
    bulletsAdded: [] as string[], bulletsReplaced: [] as string[], bulletsRemoved: [] as string[],
    entriesAdded: [] as string[], entriesReplaced: [] as string[], fields: [] as string[],
  };
  const entries = () => t.sections.flatMap((s) => s.entries);
  const findEntry = (id: string) => entries().find((e) => e.id === id);

  patch.operations.forEach((op, i) => {
    const fail = (msg: string) => errors.push(`Opération ${i + 1} (${op.op}) : ${msg}`);
    switch (op.op) {
      case "remove_clusters": {
        const ids = new Set(op.ids);
        // Un cluster déjà absent n'est pas une erreur : réappliquer le correctif donne le même modèle.
        const present = t.clusters.filter((c) => ids.has(c.id)).map((c) => c.id);
        t.clusters = t.clusters.filter((c) => !ids.has(c.id));
        const removed = new Set<string>();
        for (const s of t.sections)
          for (const e of s.entries) {
            e.bullets = e.bullets.filter((b) => {
              b.clusters = b.clusters.filter((c) => !ids.has(c));
              if (b.clusters.length) return true;
              removed.add(b.id);
              return false;
            });
          }
        for (const c of t.clusters) c.priority = c.priority.filter((p) => !removed.has(p));
        done.clustersRemoved.push(...present);
        done.bulletsRemoved.push(...removed);
        break;
      }
      case "update_clusters": {
        const c = t.clusters.find((x) => x.id === op.id);
        if (!c) return fail(`cluster « ${op.id} » introuvable`);
        if (op.add_titles) {
          const have = c.titles.split(",").map((s) => s.trim()).filter(Boolean);
          const lower = new Set(have.map((s) => s.toLowerCase()));
          for (const title of op.add_titles.split(",").map((s) => s.trim()).filter(Boolean))
            if (!lower.has(title.toLowerCase())) {
              have.push(title);
              lower.add(title.toLowerCase());
            }
          c.titles = have.join(", ");
        }
        if (op.add_keywords) {
          const lower = new Set(c.keywords.map((k) => k.toLowerCase()));
          for (const k of op.add_keywords) if (!lower.has(k.toLowerCase())) {
            c.keywords.push(k);
            lower.add(k.toLowerCase());
          }
        }
        if (op.headline) c.headline = op.headline;
        if (op.profile) c.profile = op.profile;
        if (op.skills) c.skills = op.skills;
        done.clustersUpdated.push(c.id);
        break;
      }
      case "add_clusters": {
        for (const cluster of op.clusters) {
          const at = t.clusters.findIndex((c) => c.id === cluster.id);
          if (at >= 0) {
            t.clusters[at] = cluster;
            done.clustersReplaced.push(cluster.id);
          } else {
            t.clusters.push(cluster);
            done.clustersAdded.push(cluster.id);
          }
        }
        break;
      }
      case "add_entries": {
        for (const { section, position, entry } of op.items) {
          const s = t.sections.find((x) => x.id === section);
          if (!s) {
            fail(`section « ${section} » introuvable`);
            continue;
          }
          const owner = t.sections.find((x) => x.entries.some((e) => e.id === entry.id));
          if (owner) {
            owner.entries[owner.entries.findIndex((e) => e.id === entry.id)] = entry;
            done.entriesReplaced.push(entry.id);
          } else {
            s.entries.splice(position === undefined ? s.entries.length : Math.min(position, s.entries.length), 0, entry);
            done.entriesAdded.push(entry.id);
          }
        }
        break;
      }
      case "add_bullets": {
        for (const { entry, bullet } of op.items) {
          const e = findEntry(entry);
          if (!e) {
            fail(`entrée « ${entry} » introuvable`);
            continue;
          }
          const at = e.bullets.findIndex((b) => b.id === bullet.id);
          if (at >= 0) {
            e.bullets[at] = bullet;
            done.bulletsReplaced.push(bullet.id);
          } else {
            e.bullets.push(bullet);
            done.bulletsAdded.push(bullet.id);
          }
        }
        break;
      }
      case "add_clusters_to_bullets": {
        for (const { bullet, clusters } of op.items) {
          const b = entries().flatMap((e) => e.bullets).find((x) => x.id === bullet);
          if (!b) {
            fail(`puce « ${bullet} » introuvable`);
            continue;
          }
          b.clusters = [...new Set([...b.clusters, ...clusters])];
          done.fields.push(`clusters de la puce « ${bullet} »`);
        }
        break;
      }
      case "set_entry_meta": {
        for (const { entry, meta } of op.items) {
          const e = findEntry(entry);
          if (!e) {
            fail(`entrée « ${entry} » introuvable`);
            continue;
          }
          e.meta = meta;
          done.fields.push(`dates et détails de l'entrée « ${entry} »`);
        }
        break;
      }
      case "set_section_titles": {
        for (const { section, title } of op.items) {
          const s = t.sections.find((x) => x.id === section);
          if (!s) {
            fail(`section « ${section} » introuvable`);
            continue;
          }
          s.title = title;
          done.fields.push(`titre de la section « ${section} »`);
        }
        break;
      }
      case "set_taglines":
        t.identity.taglines = op.taglines;
        done.fields.push("lignes sous le contact");
        break;
      case "set_instructions":
        t.instructions = op.text;
        done.fields.push("consignes pour l'IA");
        break;
    }
  });

  const summary: string[] = [];
  if (done.clustersAdded.length) summary.push(`Clusters ajoutés : ${list(done.clustersAdded)}`);
  if (done.clustersReplaced.length) summary.push(`Clusters remplacés : ${list(done.clustersReplaced)}`);
  if (done.clustersUpdated.length) summary.push(`Clusters complétés : ${list(done.clustersUpdated)}`);
  if (done.clustersRemoved.length) summary.push(`Clusters supprimés : ${list(done.clustersRemoved)}`);
  if (done.bulletsRemoved.length) summary.push(`Puces supprimées (plus aucun cluster) : ${list(done.bulletsRemoved)}`);
  if (done.entriesAdded.length) summary.push(`Entrées ajoutées : ${list(done.entriesAdded)}`);
  if (done.entriesReplaced.length) summary.push(`Entrées remplacées : ${list(done.entriesReplaced)}`);
  if (done.bulletsAdded.length) summary.push(`Puces ajoutées : ${list(done.bulletsAdded)}`);
  if (done.bulletsReplaced.length) summary.push(`Puces remplacées : ${list(done.bulletsReplaced)}`);
  if (done.fields.length) summary.push(`Champs remplacés : ${done.fields.join(", ")}`);

  if (errors.length) return { ok: false, template: original, description: patch.description, summary, errors };
  const valid = parseCvTemplate(t);
  if (!valid.ok) return { ok: false, template: original, description: patch.description, summary, errors: valid.errors.map((e) => `Modèle obtenu invalide : ${e}`) };
  return { ok: true, template: valid.template, description: patch.description, summary, errors: [] };
}
