# JobScout

Trouvez des offres d'emploi grâce à un scan multi-plateformes, triez-les avec un score calculé sur votre vrai profil, et générez pour chacune un CV et une lettre de motivation d'une page (compatibles ATS), sans jamais inventer une compétence que vous n'avez pas.

Tout tourne sur votre machine : base SQLite locale, serveur limité à `127.0.0.1`, aucun compte à créer. Seuls sortent les recherches envoyées aux sites d'offres pendant un scan et, si vous utilisez une IA en ligne, les textes transmis au fournisseur que vous avez choisi, plus quelques requêtes techniques ([détail](CONFIDENTIALITE.md)).

> Site et guide de démarrage : **https://latenightsbeats1208-pixel.github.io/jobscout/** · [Installation](INSTALL.md) · [Installation sur Mac](INSTALL-MAC.md) · [Guide de l'IA](GUIDE-IA.md) · [Conditions d'utilisation](CGU.md) · [Confidentialité](CONFIDENTIALITE.md)
>
> **En vidéo**, moins de 2 minutes chacune : [1. Installation](https://youtu.be/cIh4PSmPlKE) · [2. Mise en place](https://youtu.be/gOMQkcsD6LA) · [3. Utilisation](https://youtu.be/45uLxsWXXLQ)

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** + **Tailwind**
- **IA au choix** — Anthropic Claude (référence : Opus 4.8 pour la rédaction, Sonnet 5 pour la relecture), OpenAI, Google Gemini, Mistral, DeepSeek, Groq, OpenRouter, Ollama et LM Studio en local, ou tout serveur compatible OpenAI. Deux modèles par fournisseur : un de **rédaction** (extraction du CV, CV, lettre, message V.I.E) et un de **relecture** (relecture, traduction anglaise, réparation ciblée de la lettre). Couche commune : `lib/ai/llm.ts` ; catalogue : `lib/ai/providers.ts`.
- **Tests** : Vitest (`npm test`) et intégration continue GitHub Actions (types, tests, build sur Windows, Linux et macOS à puce Apple avec Node 22, 24 et 26, et sur Mac Intel avec Node 24 ; sur les deux types de Mac, le parcours du [guide Mac](INSTALL-MAC.md) est rejoué : `npm ci`, démarrage, moteur LinkedIn installé puis lancé, lanceur)
- **SQLite** intégré (`node:sqlite`, WAL) + fichiers locaux
- **Scraping** : `fetch` + parsing DOM (`jsdom`) + JSON-LD `JobPosting` ; Playwright uniquement pour LinkedIn
- **@react-pdf/renderer** + **docx** pour les documents générés ; **xlsx** pour l'import/export des candidatures

## Installation

> **Première installation ? Suivez le [guide pas à pas](INSTALL.md)** : prérequis, durée de chaque étape (mesurée), messages normaux, ordinateur à laisser allumé ou non, problèmes fréquents.
>
> **Sur Mac ? Suivez le [guide Mac](INSTALL-MAC.md)** : les mêmes étapes, avec les gestes du Mac (Terminal, installeur de Node.js, lanceur à double-cliquer).
>
> En vidéo : [installation](https://youtu.be/cIh4PSmPlKE) · [mise en place](https://youtu.be/gOMQkcsD6LA) · [utilisation](https://youtu.be/45uLxsWXXLQ). Elles ont été tournées sous Windows ; sur Mac, [le guide Mac dit ce qui s'y applique](INSTALL-MAC.md#les-tutoriels-vidéo-sur-mac).
>
> En résumé (repères établis sous Windows) : **environ 10 à 20 minutes au total avec les réglages par défaut (jusqu'à 35 si vous activez d'autres sources), dont 10 à 15 devant l'écran**. `npm ci` prend environ 1 minute ; le premier scan dure 1 à 3 minutes avec France Travail seule, 10 à 20 minutes avec toutes les sources. Pendant ce temps, l'ordinateur doit rester allumé (hors veille), le terminal ouvert.

Requiert **Node ≥ 22.13** (module `node:sqlite` sans drapeau expérimental ; Node 24 convient). Au démarrage, Node affiche `ExperimentalWarning: SQLite is an experimental feature` : c'est normal et sans effet.

```bash
git clone https://github.com/latenightsbeats1208-pixel/jobscout.git
cd jobscout
npm ci
npm run dev
```

L'app démarre sur http://127.0.0.1:3000 (écoute limitée à la machine locale, rien n'est exposé au réseau). Sous Windows, `scripts/Start-JobScout.ps1` lance le serveur de développement et ouvre le navigateur. Sur Mac, `npm run shortcut:mac` (après `npm ci`) crée un lanceur `JobScout.command` dans le dossier du projet, avec une copie sur le Bureau : un double-clic ouvre le Terminal, démarre JobScout avec `caffeinate -i` (pas de mise en veille automatique tant qu'il tourne) et ouvre http://127.0.0.1:3000 dès qu'il répond ([guide Mac](INSTALL-MAC.md)).

**IA à configurer dès l'inscription** : l'onboarding lit votre CV avec un modèle d'IA pour créer le profil. Pas à pas, pour une clé payante ou une IA gratuite en local (Ollama, LM Studio) : [guide de l'IA](GUIDE-IA.md). Dans l'écran « Génération IA », choisissez votre fournisseur et collez votre clé :

| Fournisseur | Clé | Remarque |
|---|---|---|
| Anthropic (Claude) | https://platform.claude.com | référence de JobScout, meilleure fidélité au profil ; les modèles récents qui refusent l'appel d'outil forcé (Opus 5.5, Sonnet 5.5) passent d'eux-mêmes en mode « auto » |
| OpenAI | https://platform.openai.com/api-keys | GPT-6 Sol / Luna, raisonnement coupé (requis pour les réponses structurées en Chat Completions) |
| Google Gemini | https://aistudio.google.com/apikey | offre gratuite limitée |
| Mistral | https://console.mistral.ai/api-keys | fournisseur européen |
| DeepSeek | https://platform.deepseek.com/api_keys | très économique ; mode « thinking » coupé (requis pour l'appel d'outil forcé) |
| Groq, OpenRouter | console du fournisseur | Groq : offre gratuite très limitée (≈ 8 000 jetons/min) ; OpenRouter : une clé pour des centaines de modèles |
| Ollama, LM Studio | aucune clé | 100 % local et gratuit ; qualité selon le modèle (par exemple `gemma4:12b`, `qwen3.5:9b`, `ministral-3:14b`) ; réponse contrainte par le schéma JSON, ces serveurs ne sachant pas forcer un appel d'outil |
| Autre | selon le serveur | tout serveur au format OpenAI Chat Completions (URL de base à indiquer) |

« Charger la liste » propose les modèles disponibles chez le fournisseur, « Vérifier » teste la connexion. Les clés restent dans la base locale, enregistrées en clair (non chiffrées) : protégez l'accès à votre ordinateur. Une adresse de serveur doit être en `https://`, sauf serveur sur la machine même (`http://127.0.0.1…`). Mode développement : une `ANTHROPIC_API_KEY` dans `.env` sert de repli si rien n'est configuré.

**LinkedIn (optionnel)** : c'est la seule source qui a besoin d'un navigateur Chromium. Cochez-la dans Profil › Recherche › Sources : l'encadré « Moteur LinkedIn requis » apparaît, cliquez « Installer le moteur LinkedIn » (~100 Mo à télécharger, ~265 Mo sur le disque). En ligne de commande : `npm run playwright:install`.

**Mises à jour** : arrêtez JobScout (`Ctrl + C`), puis `git pull` et `npm ci`.

**Messages npm normaux** : `npm warn deprecated node-domexception`, « packages are looking for funding », et, avec npm récent, le script d'installation de `tesseract.js` ignoré (il n'affiche qu'un appel aux dons). `npm audit --omit=dev`, qui ne regarde que ce qui tourne réellement, doit afficher `found 0 vulnerabilities` (le PostCSS embarqué par Next.js est forcé en version corrigée via `overrides`). `npm audit` complet signale des failles dans des outils de développement (Tailwind CSS et ses dépendances), sans effet sur l'application. **Ne lancez jamais `npm audit fix --force`** : il installerait Tailwind CSS 4, incompatible.

## Serveur auto-hébergé (Docker)

`docker compose up -d --build` lance JobScout en permanence sur un serveur (homelab, Traefik, Tailscale) : écoute sur `0.0.0.0`, connexion par mot de passe (`JOBSCOUT_PASSWORD`), noms d'hôte autorisés (`JOBSCOUT_ALLOWED_HOSTS`), scan automatique quotidien (`JOBSCOUT_DAILY_SCAN=HH:MM`). Pas à pas : [DEPLOY-HOMELAB.md](DEPLOY-HOMELAB.md).

## Paquet Windows

`npm run package` produit `installer/output/JobScout_Setup_v<version>.exe` : un installeur autonome (Node 22 LTS embarqué, aucune dépendance sur la machine cible), avec launcher natif, données sous `%LOCALAPPDATA%\JobScout` et contrôle anti-fuite de données personnelles bloquant. Voir [`installer/README.md`](installer/README.md).

**Windows uniquement** : la commande a besoin d'Inno Setup 6 (`ISCC.exe`) et embarque un Node pour Windows (`win-x64`). Sur Mac ou Linux, elle échoue après la compilation de Next.js. Sur Mac, JobScout se lance depuis les sources : voir le [guide Mac](INSTALL-MAC.md).

## Sources de scan

| Source | Méthode | Périmètre | Par défaut |
|--------|---------|-----------|------------|
| France Travail | API officielle si `FT_CLIENT_ID` / `FT_CLIENT_SECRET` sont définis (https://francetravail.io), sinon HTML SSR | France | cochée |
| Welcome to the Jungle | Index de recherche Algolia du site, avec la clé de recherche de son interface (lecture seule, aucune page HTML) | International (filtré par pays cibles) | à activer vous-même |
| HelloWork | HTML SSR + JSON-LD | France | à activer vous-même |
| Talent.com | HTML SSR multi-domaines + JSON-LD | France, Belgique, Suisse, Luxembourg, Canada, USA, Maroc, Tunisie, Sénégal | à activer vous-même |
| jobup.ch | API de recherche du site (repli : page de recherche) + JSON-LD des fiches | Suisse (villes des zones suisses, sinon tout le pays) | à activer vous-même |
| LinkedIn | Playwright (pages publiques « guest ») | International (tous pays cibles) | à activer vous-même, moteur à installer |
| APEC | — | France (cadres) | **suspendue** : le site bloque désormais les requêtes automatiques |
| Civiweb (V.I.E) | — | International | **suspendue** : Business France exige désormais une authentification que JobScout ne gère pas |

**Avant d'activer une source, lisez les [conditions d'utilisation](CGU.md) (sections 5 et 6)** : les conditions de Welcome to the Jungle, HelloWork, Talent.com et LinkedIn interdisent l'extraction automatisée. Celles de jobup.ch n'ont pas été vérifiées. C'est pourquoi, depuis la 3.4.13, seule France Travail est cochée d'office. Chaque source s'active ou se désactive dans Profil › Recherche › Sources (ou à l'étape Préférences de l'onboarding). Une source suspendue n'est jamais interrogée, même si elle est restée cochée dans un ancien profil. Une source hors périmètre géographique (ex. HelloWork quand le profil ne cible pas la France) est automatiquement sautée. La disponibilité des sources dépend des sites tiers (anti-bot, changements d'API) ; une source en échec est signalée dans le journal du scan.

**Ajouter une offre à la main** (page Offres) : coller un lien (la page est lue, JobPosting schema.org en priorité, puis relue avant d'enregistrer) ou le texte de l'annonce. L'offre est rangée sous « Ajout manuel » et notée comme les autres. Seuls les liens publics http(s) sont lus : adresses IP, noms locaux et `*.ts.net` sont refusés, redirections comprises (`lib/offres/manual.ts`). Si le site bloque la lecture, le formulaire passe au texte collé en gardant le lien.

WTTJ est interrogée avec la clé de recherche (lecture seule) qu'utilise l'interface du site. Si elle cesse de fonctionner, décochez la source.

## Scoring des offres (local, déterministe, gratuit)

`lib/scoring/local.ts` — score honnête : aucun bonus, seulement des retraits et des plafonds. Critères exposés dans le détail de chaque offre :

- **Compétences** (55 %) — part des exigences de l'annonce couvertes par le profil (`lib/scoring/requirements.ts`). Exigences = termes techniques du dictionnaire (`lib/scoring/tech-terms.ts`) cités par l'offre + compétences du profil qu'elle cite. Chaque exigence est pondérée : **clé ×3** (dans l'intitulé, citée deux fois, ou « indispensable / requis / maîtrise de / required »), **normale ×1**, **souhaitée ×0,5** (« un plus / apprécié / nice to have »). Sans exigence repérable : 40 ; très peu d'exigences (poids < 3) : 70 au plus
- **Secteur** (25 %) — 100 si l'intitulé correspond à un secteur cible, 60 si seule la description y correspond, 0 sinon
- **Pays** (20 %) — 100 si le pays de l'offre fait partie des pays cibles, 0 sinon ; neutre si l'offre n'a pas de pays ou si aucun pays cible n'est déclaré
- **Plafond exigences clés** — chaque exigence clé non couverte plafonne le score : 88, 76, 64… jamais sous 40. Un 100/100 n'est possible que si toutes les exigences clés sont couvertes
- **Expérience** (0 à −28) — années demandées (« 5 ans d'expérience », intitulé « Senior » = 5) comparées aux vôtres (Profil › Niveau de poste) : écart d'1 an −6, 2 ans −12, 3 ans −20, 4 et plus −28 ; écart de 3 ans ou plus : score plafonné à 55 ; neutre si l'offre ne dit rien
- **Contrat** (0 ou −10) — −10 si le contrat est identifié mais hors de vos contrats recherchés
- **Langue** (0, −5 ou −10) — −5 si la langue de l'annonce est moyennement maîtrisée, −10 si elle ne l'est pas
- **Durée V.I.E** (0 ou −3) — −3 hors de la fourchette 12–24 mois

Aucun appel IA : instantané et illimité. Les offres en base sont recalculées à chaque enregistrement du profil, et une fois au démarrage quand la formule change (`lib/scoring/rescore.ts`) ; à la main : `POST /api/offres/rescore`.

## Analyse de l'offre (locale)

Sur chaque fiche d'offre, **Analyse et plan d'action** : points forts (compétences demandées que vous avez, secteur, niveau, zone, langue, contrat), points faibles (compétences clés absentes, écart d'expérience, lieu…) et actions priorisées **HIGH / MEDIUM / LOW** pour combler les écarts (compétence déjà dans le CV maître à ajouter au profil, compétence clé à démontrer, écart d'expérience, emplacements du modèle à remplir…). Les compétences demandées viennent d'un dictionnaire de termes techniques (`lib/scoring/tech-terms.ts`) ; les sigles ambigus (« CAN », « REST ») sont cherchés en respectant la casse (`lib/scoring/analysis.ts`).

## Filtre par distance (local)

Page Offres › « Définir ma ville » : choisissez votre ville de référence par son nom ou son code postal. La ville de votre profil est proposée, jamais enregistrée sans clic. Le menu « Toutes distances » garde ensuite les offres de votre ville ou situées jusqu'à 5, 10, 20, 30, 50, 100 ou 200 km, avec le nombre d'offres de chaque rayon, croisé avec les autres filtres. Le tri « Plus proches » classe la liste par distance, et chaque offre comme sa fiche affiche la sienne.

- **À vol d'oiseau**, depuis le centre de la commune, arrondie (au kilomètre sous 100 km) ; le filtre compare la distance affichée.
- **Lieu approximatif** (connu au seul département, ou commune devinée parmi des homonymes) : distance précédée de « ≈ », lieu compris affiché.
- **Offres en France sans ville précise** (télétravail, région seule) : hors rayon par défaut, « Les inclure » les ajoute. Une offre à l'étranger sans ville n'entre jamais dans un rayon.
- **Calcul local** : communes françaises et villes du monde sont embarquées dans `lib/geo/data` (`lib/geo`) ; rien n'est envoyé hors de l'ordinateur, aucune carte n'est chargée. Seul le code de la commune choisie est enregistré dans la base locale. Reconstruire la base : `node scripts/build-geo.mjs <dossier des sources>` (sources et adresses de téléchargement en tête du script).

## Extraction du CV

Cascade selon le type de fichier : PDF (`pdf-parse` ou `pdfjs-dist` multi-colonnes, meilleur retenu), DOCX (`mammoth`), image (`tesseract.js` FR+EN), TXT. Les modèles de reconnaissance d'image (FR, EN) sont téléchargés une fois depuis `cdn.jsdelivr.net`. Puis extraction structurée par le fournisseur d'IA choisi (appel d'outil forcé, ou réponse JSON contrainte selon le fournisseur), validation Zod, score de confiance et **garde-fou anti-hallucination** (suppression des entreprises et compétences non ancrées dans le profil).

## Modèle de CV maître (facultatif)

Page **Modèle CV** : un CV « maître » en JSON (clusters de postes, banque de puces étiquetées, blocs de compétences, FR et EN). S'il existe, chaque CV est **assemblé** à partir de vos textes au lieu d'être rédigé : l'IA (ou, sans clé, un choix par mots-clés) choisit le cluster, l'intitulé exact de l'offre, les puces et jusqu'à 5 mots-clés de l'annonce déjà présents dans vos compétences ; le code vérifie chaque choix (une seule version par fait, limites par entrée). La lettre de motivation ne s'appuie que sur les faits de ce CV. Les emplacements non remplis (`[N]`, `[mois]`) sont signalés à chaque génération. Un fichier `cv-template.json` déposé dans le dossier de données est importé au premier accès (`lib/cvtemplate`).

### Correctifs du modèle de CV

Modèle CV › **Appliquer un correctif** : collez ou chargez un correctif JSON, **Prévisualisez** (résumé, erreurs, crochets restants), puis **Appliquez**. Les opérations s'appliquent dans l'ordre sur une copie du modèle ; une référence introuvable ou un modèle obtenu invalide affiche les erreurs (numéro et nom de l'opération) et rien n'est enregistré. Le modèle d'avant est sauvegardé : **Restaurer la version précédente** le rétablit (`lib/cvtemplate/patch.ts`, `POST /api/cv-template/patch` avec `{ patch, dryRun }`, `POST /api/cv-template/restore`).

| `op` | Champs | Effet |
|---|---|---|
| `remove_clusters` | `ids` | Supprime ces clusters, les retire des puces ; une puce sans cluster est supprimée et retirée des `priority` |
| `update_clusters` | `id`, `add_titles?`, `add_keywords?`, `headline?`, `profile?`, `skills?` | Ajoute des intitulés et mots-clés sans doublon ; remplace les autres champs |
| `add_clusters` | `clusters` | Ajoute, ou remplace le cluster de même id |
| `add_entries` | `items: [{ section, position?, entry }]` | Insère l'entrée, ou remplace celle de même id à sa place |
| `add_bullets` | `items: [{ entry, bullet }]` | Ajoute la puce, ou remplace celle de même id |
| `add_clusters_to_bullets` | `items: [{ bullet, clusters }]` | Ajoute des clusters à une puce |
| `set_entry_meta` | `items: [{ entry, meta }]` | Remplace les dates et détails d'une entrée |
| `set_section_titles` | `items: [{ section, title }]` | Remplace le titre d'une section |
| `set_taglines` | `taglines` | Remplace les lignes sous le contact |
| `set_instructions` | `text` | Remplace les consignes pour l'IA |

```json
{
  "type": "jobscout-cv-patch",
  "version": 1,
  "description": "Ajouter un cluster finance",
  "operations": [
    { "op": "update_clusters", "id": "E", "add_titles": "Consultant IT", "add_keywords": ["ESN"] },
    { "op": "add_bullets", "items": [{ "entry": "projet-demo", "bullet": { "id": "D1-F", "clusters": ["F"], "text": { "fr": "Moteur d'appariement testé par invariants.", "en": "Matching engine tested with invariants." } } }] },
    { "op": "set_entry_meta", "items": [{ "entry": "projet-demo", "meta": { "fr": "2026", "en": "2026" } }] }
  ]
}
```

Sur une fiche d'offre, **CV à utiliser** impose un cluster (sinon : choix automatique, ou IA si elle est configurée). Le secteur de l'employeur aide le choix automatique : un cluster dont les mots-clés contiennent « finance » ou « ESN » gagne quand l'employeur est de ce secteur ; il est aussi transmis à l'IA comme indice, après les consignes du modèle.

## Zones de recherche

Profil › **Zones de recherche** (toutes décochées par défaut). Le scan interroge ces lieux au lieu du pays entier et la page Offres s'ouvre filtrée sur « Mes zones » (`lib/zones.ts`).

| Zone | Pays | Centres (rayon) | LinkedIn | Talent.com |
|---|---|---|---|---|
| Paris et Île-de-France | FR | Paris (45 km) + départements 75, 77, 78, 91, 92, 93, 94, 95 | Île-de-France | Paris |
| Lyon et agglomération | FR | Lyon (30 km) + département 69 | Lyon | Lyon |
| Suisse romande | CH | Genève, Nyon, Lausanne, Montreux, Yverdon, Neuchâtel, Fribourg, Sion (20 km) | 5 villes | 5 villes |
| Zurich et Zoug | CH | Zurich, Zoug (20 km) | Zurich, Zug | Zürich, Zug |
| Belgique (Bruxelles et Wallonie) | BE | Bruxelles, Wavre, Louvain-la-Neuve, Namur, Charleroi, Mons, Liège (20 km) | 5 villes | 6 villes |
| Luxembourg | LU | Luxembourg, Esch-sur-Alzette (25 km) | Luxembourg | Luxembourg (lu.talent.com) |
| Pays-Bas (Randstad) | NL | Amsterdam, Rotterdam, Utrecht, La Haye (20 km) | 4 villes | aucune (pas de site néerlandais) |

France Travail interroge les départements des zones françaises ; jobup.ch, les villes des zones suisses.

## Secteur de l'employeur

Chaque offre est classée **Banque & finance**, **ESN & conseil** ou **Autre secteur** (`lib/scoring/sector.ts`, sans IA), dans cet ordre :

1. entreprise cible de la Mission (nom normalisé égal, ou nom de la cible contenu dans celui de l'offre) ;
2. nom connu (`lib/scoring/sector-data.ts` : banques de France, de Suisse et du Benelux, infrastructures de marché, éditeurs financiers, paiement, négoce ; ESN, cabinets de conseil et Big 4) ;
3. mots-clés pondérés en français, anglais et néerlandais, dans le nom de l'entreprise et l'intitulé (poids double) puis la description ;
4. sinon « Autre secteur ».

Une ESN en mission chez une banque reste « ESN & conseil » ; l'assurance seule n'est pas de la finance. La justification (« Entreprise cible », « Nom connu : banque ou finance », « Mots-clés : banque, salle des marchés ») s'affiche au survol du badge, dans l'aperçu et sur la fiche. Le classement est enregistré avec l'offre, refait au démarrage quand les règles changent (`SECTOR_VERSION`) et après chaque modification des cibles.

Profil › **Secteurs d'employeur visés** (les trois par défaut). Page Offres : filtre **Secteur** (Secteurs visés, chaque secteur, Tous), avec le nombre d'offres de chaque option croisé avec les autres filtres, et paramètre d'URL `?secteur=vises|finance|conseil|autre|tous`. Les cartes de l'accueil ouvrent la page sur `?secteur=tous`, pour que leurs chiffres concordent.

## Niveau de poste

Profil › **Niveau de poste** › « Postes junior uniquement » : niveau de chaque offre déduit localement (intitulé « Senior », « Lead », « Junior » ; « 5 ans d'expérience », « 3+ years » ; champ « Débutant accepté » de France Travail), filtre « Junior » de la page Offres actif d'office, retrait au score selon l'écart d'expérience (voir Scoring), recherche LinkedIn sur « Entry level » et « Associate » (`lib/seniority.ts`).

## Préparer la candidature

Sur chaque fiche d'offre, avant la génération des documents :

- **Verdict** Go, À vérifier ou No-go, ligne par ligne : secteur (visé et différent de « Autre », sinon No-go), lieu (zone active ou V.I.E, sinon À vérifier), niveau (junior, V.I.E, stage ou au plus 2 ans : OK ; 3 à 4 ans : À vérifier ; 5 ans et plus ou poste senior : No-go), langue (allemand ou néerlandais exigé et non maîtrisé : No-go ; souhaité : À vérifier), contrat (hors de vos contrats recherchés : À vérifier) — `lib/mission/verdict.ts` ;
- **CV** : cluster retenu et sa raison (secteur, mots-clés), avec le sélecteur « CV à utiliser » ;
- **Contact** (nom, rôle, lien) : crée la cible de l'entreprise (secteur de l'offre, statut « À contacter ») ou met à jour son contact ;
- **Message court** à ce contact : 4 phrases au plus, dans la langue de l'offre — le poste, le fait du CV maître le plus proche du besoin, un lien réel avec l'entreprise (sinon rien), une demande simple ; aucun fait absent du modèle ou du profil, mêmes contrôles et relecture que la lettre (`POST /api/generate/msg` avec `mode: "contact"` ; le message V.I.E est inchangé) ;
- **Ajouter au suivi** : candidature envoyée, avec le contact et les documents ; la cible passe à « Candidature », prochaine action « Relance » à J+7.

## Mission

Page **Mission** (en tête du menu) : le plan d'une campagne de recherche, importé d'un **pack** JSON. Sans pack, la page est vide et renvoie vers l'import. En tête : date, phase, « J-x avant » l'échéance, bannière pendant le gel, bouton **Brief** (Markdown affiché sans HTML).

- **Aujourd'hui** : « Si tu ne fais qu'une chose », liste du jour à cocher (durées, catégories), barre minutes prévues / budget, relances dues (« Relance faite »), trois offres à traiter, « Si tu as du temps ». Le plan vient de `buildDay` (`lib/mission/today.ts`, fonction pure) : habitudes du jour réservées d'abord, relances dues (envoyée depuis 7 jours, dernière relance il y a 7 jours ou plus, 10 min, 5 par jour au plus), tâches en retard (jamais masquées), tâches de la fenêtre du jour, puis le reste dans « Si tu as du temps ». Pendant le gel : ni candidature, ni relance, ni offre. Journée allégée (habitudes et priorité 1) si rien n'a été coché la veille ou si l'énergie est restée à 2 ou moins deux soirs de suite. Offres à traiter : hors suivi, secteur visé, score ≥ 70, publiées depuis 14 jours, dans vos zones ou V.I.E, seulement un jour avec une habitude de candidature.
- **Débrief du soir** : éléments du jour (cocher ici coche aussi les tâches et habitudes), réponses reçues (candidature, étape, issue : le statut du suivi est mis à jour avec son historique et l'étape enregistrée), énergie de 1 à 5, blocage, priorité de demain. Après enregistrement : les trois priorités de demain et le fait le plus solide du jour. Le dimanche, bilan de la semaine (candidatures, messages à une personne nommée, mock interviews, comparés aux objectifs ; refus par étape ; « Ce que je change »).
- **Plan** : phases repliables, édition en ligne de la fenêtre, de la priorité et des minutes ; tâches personnelles (`U-1`, `U-2`…) supprimables, tâches du pack non supprimables ; habitudes en lecture seule.
- **Cibles** : tableau filtrable et triable, édition en ligne (statut, contact, prochaine action et date, notes), ajout, compteurs par statut, lien « Offres de cette entreprise ».
- **Journal** : entrées du plus récent au plus ancien, avec les bilans hebdomadaires.
- **Profil** : audit du dossier. Critères automatiques (modèle de CV présent, aucun crochet, anglais complet, aucun terme à éviter dans les textes que chaque cluster peut rendre, volume de la semaine, secteurs visés, taux de réponse sur les candidatures de plus de 14 jours, au moins un entretien parmi les 20 dernières, aucune relance en retard de plus de 3 jours) et critères manuels du pack, à cocher. Score réussis / évalués (un critère non évaluable ne compte pas), historique, et un diagnostic du tunnel en une phrase une fois assez de candidatures envoyées (`lib/mission/audit.ts`).
- **Importer / Exporter** : collage ou fichier, Prévisualiser, Importer ; Exporter l'état actuel (`mission-AAAA-MM-JJ.json`, même format, tâches cochées comprises) ; Réinitialiser la mission (taper `RÉINITIALISER`).

L'import fusionne sans perte : brief, plan et termes à éviter remplacés ; critères manuels fusionnés par `id` (date de validation gardée) ; tâches par `id` créées ou mises à jour, sauf `done_at` et `origin` (une tâche absente du pack reste) ; cibles par nom normalisé créées ou complétées sur les champs vides seulement (le statut n'est remplacé que s'il vaut encore `a_verifier`). Après l'import, les secteurs des offres sont reclassés. Données : tables `mission_*` et réglages `mission_plan`, `mission_audit` de la base locale (`lib/mission/store.ts`).

Format du pack (exemple fictif ; `category` libre, valeurs connues : `candidature`, `cv`, `github`, `vitrine`, `reseau`, `projet-java`, `orderbook`, `entretien`, `domaine`, `admin`, `outil` ; `priority` 1 à 3 ; `days` de `mon` à `sun` ; statut d'une cible : `a_verifier`, `a_contacter`, `contacte`, `candidature`, `entretien`, `refus`, `offre`, `ecartee` ; `country` : code ISO à 2 lettres ou `VIE`) :

```json
{
  "type": "jobscout-mission-pack",
  "version": 1,
  "brief": "# Campagne démo\n\nUn poste de développeur junior.",
  "plan": {
    "start": "2026-11-02",
    "offer_deadline": "2027-01-31",
    "start_target": "2027-02-01",
    "budget_minutes": { "mon": 180, "tue": 180, "wed": 180, "thu": 180, "fri": 180, "sat": 480, "sun": 300 },
    "freeze": { "from": "2026-12-19", "to": "2027-01-04", "note": "Recrutement à l'arrêt : préparation uniquement." },
    "phases": [{ "id": "P1", "label": "Vitrine", "from": "2026-11-02", "to": "2026-11-08" }],
    "habits": [{ "id": "H-CAND", "title": "Une candidature ciblée", "minutes": 60, "days": ["mon", "tue", "wed", "thu", "fri"], "from": "2026-11-09", "to": "2027-01-31", "category": "candidature" }],
    "kpi_weekly": { "candidatures_ciblees": 10, "messages_nommes": 8, "mock_interviews": 2 },
    "diagnostic": { "min_candidatures": 40, "min_response_rate": 0.1 }
  },
  "tasks": [{ "id": "P1-01", "phase": "P1", "title": "Mettre le CV à jour", "minutes": 60, "window": ["2026-11-02", "2026-11-04"], "priority": 1, "category": "cv" }],
  "targets": [{ "company": "Banque Exemple SA", "city": "Genève", "country": "CH", "sector": "finance", "type": "Banque privée", "tier": "A", "cv": "F", "angle": "Systèmes fiables", "contact": "", "status": "a_verifier", "next": "" }],
  "audit": {
    "forbidden_terms": [{ "cluster": "F", "terms": ["mot à éviter"] }],
    "manual": [{ "id": "linkedin", "label": "Profil LinkedIn à jour" }]
  }
}
```

Routes : `GET /api/mission/today?date=`, `POST /api/mission/tasks` et `POST|DELETE /api/mission/tasks/[id]`, `POST /api/mission/habits/[id]`, `POST /api/mission/relance/[candidatureId]`, `GET|PUT /api/mission/journal/[date]`, `GET|POST|PUT /api/mission/targets`, `POST /api/mission/import`, `GET /api/mission/export`, `POST /api/mission/reset`, `POST /api/mission/audit`, `POST /api/mission/audit/manual`, `POST /api/mission/prepare/contact`, `POST /api/mission/prepare/track` — entrées validées par Zod, champs modifiables en liste blanche.

## Suivi des candidatures

Page **Candidatures** : statut, date de candidature (modifiable ; une candidature « En cours » passée à « Envoyée » prend la date du jour), échéance, contact, notes. Une candidature restée **« Envoyée » sans réponse 14 jours après sa date de candidature passe en « Archivée »** (onglet dédié, note datée), à chaque ouverture du suivi et au scan quotidien ; délai réglable par `JOBSCOUT_ARCHIVE_DAYS`. En haut de la page : **vitrine des offres acceptées** (salaire et date de début notés dans la fiche), **entonnoir** envoyées → réponses → entretiens → offres (un entretien reste compté même refusé ensuite, grâce à l'historique des statuts) et **objectif hebdomadaire** (10 par défaut, modifiable). **Importer** accepte l'export de JobScout ou un tracker Excel personnel sur plusieurs feuilles (« Job Details », « Pre-Interview », « Interviews »…), fusionnées par entreprise et poste ; un réimport ne crée pas de doublon (`lib/excel/io.ts`).

## Génération de documents

`data/documents/…` — CV et lettre en PDF **et** DOCX, avec une boucle de rétrécissement qui garantit une page A4. Langue détectée par offre (français, ou anglais si l'annonce est en anglais). Relecture automatique : orthographe, affirmations non étayées par le profil. Message court (V.I.E) réservé aux offres V.I.E.

Coût : avec Claude (Anthropic), environ 0,12 à 0,20 $ par dossier (CV + lettre, relecture comprise) aux tarifs actuels, selon la longueur du profil et de l'offre. Avec un autre fournisseur, le coût suit ses tarifs ; en local (Ollama, LM Studio), il est nul. Le nombre de jetons de chaque appel est écrit dans le journal du serveur (`[llm] …`).

**Qualité selon le modèle** : les garde-fous anti-invention (validation contre le profil, limites de mise en page) s'appliquent quel que soit le modèle. Mais JobScout a été mis au point avec Claude : avec un autre modèle, relisez vos premiers documents. Si un modèle renvoie une réponse mal formée, JobScout tente un repli (mode JSON, extraction tolérante) avant d'afficher une erreur qui invite à choisir un modèle plus capable.

## Sécurité

- Serveur limité à `127.0.0.1` ; l'API refuse les requêtes venant d'un autre site ou d'un hôte non local (`middleware.ts`)
- Clés IA stockées en clair dans la base locale, jamais renvoyées au navigateur (seuls les 4 derniers caractères sont affichés)
- Aucune télémétrie : JobScout n'envoie rien à son éditeur, et les scripts de lancement (`npm run dev`, `npm run build`) coupent celle de Next.js (`scripts/next.mjs`) — voir [Confidentialité](CONFIDENTIALITE.md)
- Whitelist de colonnes sur la mise à jour des candidatures (anti mass-assignment)
- Bornage des chemins d'écriture du dossier documents ; ouverture de dossier restreinte au dossier configuré
- Descriptions d'offres assainies (DOMPurify) ; `rel="noopener noreferrer"` sur tous les liens sortants

## Modes IA

JobScout est gratuit (licence MIT), sans compte ni abonnement. Modes IA (`lib/ai/client.ts`) : `byok` (votre clé ou votre modèle local, fournisseur au choix) ; `unset` (rien de configuré : l'onboarding reste bloqué à l'import du CV). Le code contient aussi un mode `pack` (relais défini par `JOBSCOUT_PROXY_URL`) : il est inactif dans cette version, aucun relais n'étant configuré.

## Tests

```bash
npm test            # tests automatiques (Vitest) : couche IA, fournisseurs, configuration, génération de bout en bout
npm run typecheck   # vérification des types
```

Les tests n'utilisent ni clé ni réseau : un faux serveur compatible OpenAI rejoue la génération complète (prompts, validation anti-invention, relecture). GitHub Actions les lance à chaque push et pull request (`.github/workflows/ci.yml`).

Test réel optionnel avec votre propre fournisseur (appels facturés par lui, quelques centimes) :

```bash
JOBSCOUT_LIVE=1 JOBSCOUT_LIVE_PROVIDER=openai JOBSCOUT_LIVE_KEY=sk-... npx vitest run tests/live
```

## Licence

MIT — voir [`LICENSE`](LICENSE). Les marques des sites scannés appartiennent à leurs propriétaires ; JobScout n'est affilié à aucun d'eux.

Composants tiers embarqués, avec leurs propres licences : polices DM Sans et Plus Jakarta Sans (SIL OFL 1.1) ; données géographiques du filtre par distance (`lib/geo/data`) :

- `geo-fr.json.gz` (communes et départements français) : base de données mise à disposition sous [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Elle contient des informations issues du jeu « Contours administratifs » (Etalab, data.gouv.fr), disponible sous ODbL, à partir duquel geo.api.gouv.fr calcule les centres des communes (contours d'ADMIN EXPRESS, IGN, pour la métropole ; d'un jeu publié pour chacune pour la Polynésie française et la Nouvelle-Calédonie). Communes, codes et populations : INSEE ; codes postaux : La Poste (Licence Ouverte 2.0 pour leurs propres données). Données modifiées ; méthode de construction : [`scripts/build-geo.mjs`](scripts/build-geo.mjs). L'ODbL porte sur cette base, pas sur le code de JobScout (MIT).
- `geo-world.json.gz` (villes et pays du monde) : villes et pays de GeoNames (CC BY 4.0, données modifiées), noms français des pays de l'INSEE (Licence Ouverte 2.0).

Sources, dates, modifications et textes de licence : [`THIRD_PARTY_NOTICES.txt`](THIRD_PARTY_NOTICES.txt).

Utilisation : [conditions générales d'utilisation](CGU.md). Données personnelles : [politique de confidentialité](CONFIDENTIALITE.md).
