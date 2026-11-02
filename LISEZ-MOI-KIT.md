# Kit de campagne JobScout : installation (10 minutes)

## Ce que contient le kit

| Chemin | Versionné ? | Rôle |
|---|---|---|
| `CLAUDE.md` | oui (générique) | Consignes de Claude Code pour le dépôt, active le mode campagne |
| `docs/SPEC-mission.md` | oui | Spécification de la page Mission, budget 6 h |
| `scripts/apply-cluster-f.mjs` | oui | Ajoute le cluster F (finance) à ton modèle de CV |
| `.claude/skills/` | non (ignoré par Git) | `/matin`, `/soir`, `/audit-profil`, `/candidature` |
| `data/mission/` | non (ignoré par Git) | Brief, plan daté, cibles, patch du CV, journal |

Rien de personnel ne part sur ton dépôt public : `.claude/` et `data/` sont déjà dans ton `.gitignore`.

## 1. Copier le kit

Décompresse l'archive à la racine de ton clone de `jobscout_web` (les dossiers se fusionnent).
Si tu fais tourner JobScout en Docker, copie `data/mission/` dans le dossier de données monté (`JOBSCOUT_DATA_DIR`).

## 2. Ajouter le cluster F à ton CV

```
node scripts/apply-cluster-f.mjs
```

Le script lit ton modèle actuel dans la base, écrit `data/mission/cv-template.F.json` et liste les crochets à remplir.
Ouvre ensuite la page « Modèle CV », importe ce fichier : l'application le valide avec son propre schéma.
(Le fusionnement a été vérifié contre le schéma Zod de `lib/cvtemplate/types.ts`.)

## 3. Premier briefing

À la racine du dépôt :

```
claude
/matin
```

`/matin` fonctionne tout de suite en lisant `plan.json`, avant même que la page Mission existe.

## 4. Construire la page Mission (samedi 7 novembre, 6 h maximum)

Dans Claude Code, colle :

> Lis CLAUDE.md, data/mission/MISSION.md et docs/SPEC-mission.md. Implémente la SPEC dans l'ordre de ses étapes, un commit par étape, `npm test` et `npm run typecheck` verts à chaque fois. Budget total : 6 heures. Avant chaque étape, donne ton estimation ; quand le budget approche, termine proprement l'étape en cours et arrête-toi. Commence par me proposer le découpage de l'étape 1, sans écrire de code.

## 5. Le rituel

| Quand | Commande | Durée |
|---|---|---|
| Chaque matin | `/matin` | 2 min |
| Chaque soir | `/soir` suivi de ce que tu as fait | 10 min |
| Pour chaque offre retenue | `/candidature <id ou URL>` | 45 min avec la candidature |
| Chaque dimanche, ou après une série de refus | `/audit-profil` | 15 min |
