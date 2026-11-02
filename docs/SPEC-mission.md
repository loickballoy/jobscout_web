# SPEC : page Mission (campagne de recherche d'emploi)

Budget : **6 heures de travail au total**. Les étapes sont classées par valeur : si le budget est atteint, on s'arrête là où on en est, l'essentiel existe déjà.

## Objectif

Chaque matin et chaque soir, ouvrir JobScout (ou lancer `/matin` dans Claude Code) et savoir exactement quoi faire aujourd'hui : tâches du plan, habitudes, relances dues, offres à traiter, avec un budget de temps réaliste.

Hors périmètre : notifications, synchronisation de calendrier, comptes multiples, refonte visuelle, nouvel usage de l'IA.

## Données

Source de vérité : des fichiers dans `data/mission/` (déjà ignoré par Git, données personnelles).

| Fichier | Rôle |
|---|---|
| `MISSION.md` | Brief de campagne (lecture seule pour l'app) |
| `plan.json` | Phases, tâches (avec `done`, `done_at`), habitudes, budget, gel des fêtes, KPI |
| `targets.json` | Entreprises cibles, contact, statut |
| `journal.md` | Une entrée par soir, la plus récente en haut |
| `audit.json` | Résultat du dernier `/audit-profil` (écrit par Claude Code) |

Pas de migration SQLite pour la mission. Les candidatures et les offres restent dans la base existante et sont lues avec les fonctions de `lib/db`.

Écriture des JSON : validation Zod, puis écriture atomique (fichier temporaire + `rename`).

## Règles du jour (une seule implémentation, utilisée par l'app ET par la CLI)

Fonction pure `buildDay(plan, date, ctx)` dans `lib/mission/today.ts`, sans `server-only`, sans alias `@/` (imports relatifs), pour être exécutable par la CLI.

1. Budget du jour = `plan.budget_minutes[jour]`.
2. Habitudes actives ce jour-là (jour de semaine + plage `from`/`to`) : leurs minutes sont réservées en premier, la routine ne saute jamais.
3. Tâches en retard (`done=false`, échéance passée) : ensuite, par priorité.
4. Tâches dont la fenêtre contient la date : enfin, par priorité puis échéance.
5. Relances : candidatures au statut `envoyee`, envoyées depuis 7 jours ou plus, sans balise `[relance AAAA-MM-JJ]` datée de moins de 7 jours dans `notes`. Marquer une relance faite ajoute cette balise.
6. Offres à traiter (seulement si une habitude de catégorie `candidature` est active ce jour) : 3 offres hors suivi, score ≥ 70, dans les zones Suisse romande ou Zurich, publiées depuis 14 jours au plus.
7. Pendant `plan.freeze` : aucune habitude `candidature`, aucune relance, aucune offre ; une bannière affiche la note du gel.
8. On remplit jusqu'au budget. Ce qui dépasse est listé à part (« Si tu as du temps ») au lieu d'être caché. Une tâche en retard n'est jamais repoussée en silence.
9. Sortie : `{ date, phase, daysToOfferDeadline, budget, planned, overflow, items[] }`. Chaque item porte `source` (`task` | `habit` | `relance` | `offre`), `id`, `title`, `minutes`, `category`, `overdueDays?`.

Tests Vitest obligatoires : jour de semaine nominal, samedi, tâche en retard, dépassement de budget, jour de gel, dimanche hors habitudes de candidature.

## Étapes, par ordre de valeur

1. **`lib/mission/`** : schémas Zod de `plan.json` et `targets.json`, chargement/sauvegarde atomique, `buildDay`, tests.
2. **CLI** `scripts/mission-cli.ts`, lancée par `npm run mission -- <commande>` (Node : `--experimental-strip-types`). Commandes :
   - `today [--date AAAA-MM-JJ] [--json]` : plan du jour en Markdown (ou JSON) ;
   - `done <id>` : coche une tâche ;
   - `week` : bilan de la semaine (candidatures envoyées, réponses, entretiens, comparés à `kpi_weekly`).
   La CLI lit la base SQLite en lecture seule avec `node:sqlite`.
3. **API** : `GET /api/mission/today?date=`, `POST /api/mission/tasks/[id]` (`{ done }`), `POST /api/mission/relance/[candidatureId]`, `GET` et `PUT /api/mission/targets`.
4. **Page `/mission`**, en tête de la barre latérale (libellé « Mission »). Contenu, de haut en bas :
   - la date, la phase en cours et le compte à rebours jusqu'au 31 janvier (le seul élément visuellement marquant de la page) ;
   - la liste du jour avec cases à cocher, durées, et une barre « minutes prévues / budget » ;
   - relances dues et offres à traiter, chacune avec son lien vers la fiche existante ;
   - tunnel de la semaine (réutiliser `lib/tracker-stats.ts`) comparé aux KPI ;
   - état du profil : les points de `audit.json` (vert / à corriger) et la date du dernier audit.
5. **Zone Zurich** dans `lib/zones.ts` (Zurich et Zug ; LinkedIn « Zurich, Switzerland », Talent.com « Zürich », « Zug »), puis l'activer dans le profil.
6. Finitions : état vide (« Aucune tâche aujourd'hui : prends de l'avance sur … »), rendu mobile.

## Contraintes

- Réutiliser les composants et classes existants (`glass-panel`, `Badge`, `Card`, `PageHeader`) : la page doit ressembler au reste de JobScout.
- Libellés en français, voix active, aucun texte décoratif.
- `npm run typecheck` et `npm test` passent avant chaque commit.
- Rien de personnel dans le dépôt : tout ce qui vient de `data/mission/` reste dans `data/`.
- Petits commits, un par étape.
