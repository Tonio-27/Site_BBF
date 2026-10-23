# Site du Brass Band Fribourg

Site statique du BBF : [Astro](https://astro.build) génère du HTML pur, le comité édite le contenu via [Sveltia CMS](https://github.com/sveltia/sveltia-cms) sur `/admin`, GitHub Actions publie chez Infomaniak. Aucun code ne tourne côté serveur.

> **Statut : bêta (phases 1 à 4 du cahier des charges).** Contenus de démonstration (textes, noms, photos fictifs). Voir [`docs/PRESENTATION-COMITE.md`](docs/PRESENTATION-COMITE.md).

## Démarrer

```bash
nvm use            # Node 24 (voir .nvmrc ; Astro 7 exige Node ≥ 22.23.4)
npm ci
npm run dev        # http://localhost:4321
```

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Génère `dist/` |
| `npm run check` | Types (`astro check`) + concordance `config.yml` ↔ schémas Zod |
| `npm test` | Tests unitaires (Vitest) : pupitres, dates/fuseau, agenda, `.ics`, Markdown sécurisé |
| `npm run check:build` | Après build : pages clés, liens internes, respect de la CSP, HTML valide |
| `npm run check:a11y` | Accessibilité axe-core (servir `dist/` sur le port 4321 avant) |
| `npm run verify` | Tout ce qui précède sauf l'accessibilité |
| `npm run cms:update` | Réinstalle Sveltia (version épinglée), ses traductions et polices, et SortableJS dans `public/admin/` |
| `npm run demo` | Construit `dist-demo/` : site autonome + éditeur et tableau des effectifs en bac à sable pré-rempli |
| `npm run demo:images` | Régénère les images de démonstration |

## Architecture

```
Rédacteur → /admin (Sveltia) → code par e-mail (Cloudflare Access) → Worker bbf-cms-auth → commit sur main (compte GitHub unique du BBF) → Actions : build + tests → rsync SSH → Infomaniak
```

- `src/content/` : **contenu édité par le CMS** (Markdown + JSON, un fichier par entrée).
- `src/assets/uploads/` : images envoyées depuis l'admin, optimisées au build (WebP, `srcset`).
- `public/documents/` : PDF servis tels quels.
- `src/lib/schemas.ts` : schémas Zod de **tous** les contenus (source unique, utilisée par `content.config.ts` et par le contrôle de concordance).
- `src/lib/pupitres.ts` : liste ordonnée des pupitres (source unique).
- `src/lib/dates.ts` : dates stockées en heure suisse murale (`2026-11-28T20:00`), interprétées en `Europe/Zurich`.
- `src/lib/remark-safe-content.mjs` : supprime le HTML brut du Markdown, transforme un lien YouTube seul en vidéo chargée au clic (youtube-nocookie).
- `public/js/` : seul JavaScript public (≈ 5 Ko) : menu mobile, filtre agenda, visionneuse, e-mails anti-spam, vidéos.
- `public/.htaccess` : HTTPS, en-têtes de sécurité (CSP stricte), cache, redirections 301.
- `public/admin/` : Sveltia CMS (copie locale épinglée, traductions et polices locales) + `config.yml` (menus en français, validé contre le schéma JSON de Sveltia).
- `src/pages/admin/effectifs.astro` + `public/admin/effectifs/` : tableau « Effectifs » (glisser-déposer des musiciens par pupitre). Il lit et écrit les mêmes fichiers `src/content/musiciens/*.json` que Sveltia, via l'API GitHub (session Sveltia, un seul commit par enregistrement, refus si un fichier a changé entre-temps). En démo, il partage le bac à sable de Sveltia (stockage privé du navigateur).
- `workers/cms-auth/` : Worker Cloudflare de connexion. Les rédacteurs se connectent par e-mail (Cloudflare Access), le Worker relaie les appels à GitHub avec le jeton du compte unique du BBF (jamais transmis au navigateur) et signe chaque commit de l'adresse du rédacteur. Mise en place : `docs/RUNBOOK.md` (Admin).

### Règles

- Zéro code serveur, zéro traceur, zéro ressource tierce (sauf vidéo YouTube après clic).
- Pas de `style=` ni de script inline : la CSP les bloque (contrôlé par `check:build`).
- Versions exactes dans `package.json`, actions GitHub épinglées par hash.
- Commits du CMS : `content: …` ; commits de code : Conventional Commits.

## Ajouter un champ ou une collection

1. Modifier le schéma dans `src/lib/schemas.ts` (et `src/content.config.ts` pour une nouvelle collection).
2. Reporter le champ dans `public/admin/config.yml` (libellé et `hint` en français).
3. `npm run check:config` doit passer : il compare les champs et les listes fermées des deux côtés.
4. Mettre à jour le gabarit et `docs/MANUEL-EDITEUR.md`.

## Dépendances

| Paquet | Pourquoi |
| --- | --- |
| `astro`, `sharp` | Générateur et optimisation d'images au build |
| `@astrojs/sitemap` | `sitemap.xml` |
| `@astrojs/markdown-remark` | Processeur Markdown permettant le plugin de sécurité (Astro 7 utilise Sätteri par défaut) |
| `@sveltia/cms` (dev) | Source de la copie locale de l'admin, mise à jour par Renovate |
| `vitest`, `@astrojs/check`, `typescript` (dev) | Tests et types |
| `html-validate`, `playwright`, `axe-core` (dev) | Validation HTML et accessibilité en CI |
| `js-yaml`, `ajv` (dev) | Lecture de `config.yml` et validation contre le schéma de Sveltia |
| `sortablejs` (dev) | Glisser-déposer du tableau des effectifs (copié dans `public/admin/vendor/`, 45 Ko, MIT) |
| `@fontsource*` (dev) | Polices de l'interface Sveltia, copiées localement (pas de CDN) |

Mises à jour : Renovate, une PR groupée par mois, délai de 7 jours, fusion automatique si la CI est verte (sauf Sveltia CMS : test manuel de `/admin`).

## Déploiement

Voir [`docs/RUNBOOK.md`](docs/RUNBOOK.md). Tant que les secrets `INFOMANIAK_*` ne sont pas configurés, la CI construit et teste le site mais n'envoie rien.
