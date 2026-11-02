#!/usr/bin/env node
// Fusionne data/mission/cv-cluster-F.json dans le modèle de CV maître actuel.
// Source du modèle (dans l'ordre) : chemin passé en argument, réglage `cv_template`
// de la base SQLite, puis data/cv-template.json.
// Sortie : data/mission/cv-template.F.json, à importer depuis la page « Modèle CV »
// (l'import valide le modèle avec le schéma de l'application).
// Relançable : un élément déjà présent est remplacé, jamais dupliqué.

import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.JOBSCOUT_DATA_DIR?.trim() || path.join(process.cwd(), "data");
const dbFile = process.env.JOBSCOUT_DB_PATH?.trim() || path.join(dataDir, "jobscout.db");
const patchFile = path.join(dataDir, "mission", "cv-cluster-F.json");
const outFile = path.join(dataDir, "mission", "cv-template.F.json");

function fail(msg) {
  console.error(`Erreur : ${msg}`);
  process.exit(1);
}

async function loadTemplate() {
  const arg = process.argv[2];
  if (arg) return { source: arg, template: JSON.parse(fs.readFileSync(arg, "utf-8")) };
  if (fs.existsSync(dbFile)) {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbFile, { readOnly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = 'cv_template'").get();
    db.close();
    if (row?.value && row.value !== "none") return { source: `${dbFile} (réglage cv_template)`, template: JSON.parse(row.value) };
  }
  const seed = path.join(dataDir, "cv-template.json");
  if (fs.existsSync(seed)) return { source: seed, template: JSON.parse(fs.readFileSync(seed, "utf-8")) };
  fail("aucun modèle trouvé. Passe le chemin du JSON en argument.");
}

function upsert(list, item, position) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else if (position === undefined) list.push(item);
  else list.splice(position, 0, item);
}

function findEntry(t, entryId) {
  for (const s of t.sections) {
    const e = s.entries.find((x) => x.id === entryId);
    if (e) return e;
  }
  fail(`entrée « ${entryId} » introuvable dans le modèle`);
}

if (!fs.existsSync(patchFile)) fail(`${patchFile} introuvable`);
const patch = JSON.parse(fs.readFileSync(patchFile, "utf-8"));
const { source, template: t } = await loadTemplate();

for (const c of patch.add_clusters ?? []) upsert(t.clusters, c);

for (const { section, position, entry } of patch.add_entries ?? []) {
  const s = t.sections.find((x) => x.id === section);
  if (!s) fail(`section « ${section} » introuvable`);
  upsert(s.entries, entry, position);
}

for (const { entry, bullet } of patch.add_bullets ?? []) upsert(findEntry(t, entry).bullets, bullet);

for (const { bullet, clusters } of patch.add_clusters_to_bullets ?? []) {
  const b = t.sections.flatMap((s) => s.entries).flatMap((e) => e.bullets).find((x) => x.id === bullet);
  if (!b) fail(`puce « ${bullet} » introuvable`);
  b.clusters = [...new Set([...b.clusters, ...clusters])];
}

for (const { entry, meta } of patch.set_entry_meta ?? []) findEntry(t, entry).meta = meta;

for (const { section, title } of patch.set_section_titles ?? []) {
  const s = t.sections.find((x) => x.id === section);
  if (!s) fail(`section « ${section} » introuvable`);
  s.title = title;
}

if (patch.set_tagline) {
  const key = JSON.stringify([...patch.set_tagline.countries].sort());
  t.identity.taglines = (t.identity.taglines ?? []).filter((x) => JSON.stringify([...(x.countries ?? [])].sort()) !== key);
  t.identity.taglines.unshift(patch.set_tagline);
}

if (patch.append_instructions && !(t.instructions ?? "").includes(patch.append_instructions)) {
  t.instructions = [t.instructions, patch.append_instructions].filter(Boolean).join(" ");
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(t, null, 2) + "\n");

const placeholders = JSON.stringify(t).match(/\[[^\]\n"]{1,60}\]/g) ?? [];
console.log(`Modèle lu depuis : ${source}`);
console.log(`Modèle fusionné : ${outFile}`);
console.log(`Crochets à remplir (${placeholders.length}) : ${[...new Set(placeholders)].join(", ") || "aucun"}`);
console.log("Étape suivante : page « Modèle CV » → importer ce fichier (il y est validé).");
