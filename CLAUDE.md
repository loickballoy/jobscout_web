# JobScout : consignes pour Claude Code

Application Next.js 15 (App Router, React 19, TypeScript, Tailwind) qui tourne en local.
Base SQLite via `node:sqlite` (`lib/db`), données utilisateur dans `data/` (jamais versionné).
Tests : `npm test` (Vitest) et `npm run typecheck` avant chaque commit.

## Mode campagne

Si `data/mission/MISSION.md` existe, une campagne de recherche d'emploi est en cours :
- lis ce fichier au début de chaque session ;
- le matin, propose `/matin` ; le soir, propose `/soir` ;
- pour toute nouvelle fonctionnalité liée à la campagne, suis `docs/SPEC-mission.md` et respecte son budget de temps ;
- toute donnée personnelle reste dans `data/` : ne jamais la copier dans un fichier versionné, un test ou un message de commit.

## Règles de code

- Réutiliser les composants existants (`components/ui`, `components/app`) plutôt que d'en créer.
- Textes d'interface en français, voix active.
- Petits commits, un sujet par commit.
