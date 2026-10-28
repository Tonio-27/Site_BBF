# Runbook — procédures techniques

Pour un administrateur ou un développeur. Chaque procédure correspond à un scénario de la section 13 du cahier des charges.

## Mise en place initiale (phase 0 → 1)

### Secrets et variables GitHub (Settings → Secrets and variables → Actions)

| Nom | Type | Contenu |
| --- | --- | --- |
| `INFOMANIAK_SSH_KEY` | Secret | Clé privée ed25519 du compte SSH de déploiement |
| `INFOMANIAK_KNOWN_HOSTS` | Secret | Résultat de `ssh-keyscan -t ed25519 ssh.clusterXXX.hosting.infomaniak.com` (vérifié) |
| `INFOMANIAK_HOST` | Secret | `ssh.clusterXXX.hosting.infomaniak.com` |
| `INFOMANIAK_USER` | Secret | Utilisateur SSH dédié |
| `INFOMANIAK_PATH` | Secret | Dossier web : d'abord celui de `nouveau.brassbandfribourg.ch`, puis celui du domaine principal à la bascule |
| `GDRIVE_SERVICE_ACCOUNT` | Secret | JSON du compte de service Google (accès au seul dossier de sauvegarde) |
| `GDRIVE_FOLDER_ID` | Secret | Identifiant du dossier Drive |
| `PUBLIC_BETA` | Variable | `true` pendant la recette (bandeau jaune), `false` à la mise en ligne |
| `SITE_URL` | Variable | URL contrôlée après déploiement (`https://nouveau.brassbandfribourg.ch/` pendant la recette) |

Sans les secrets Infomaniak, la CI construit et teste mais n'envoie rien.

### Clé de déploiement

```bash
ssh-keygen -t ed25519 -N '' -C 'deploy@brassbandfribourg.ch' -f bbf-deploy
# bbf-deploy.pub → ~/.ssh/authorized_keys du compte SSH Infomaniak
# bbf-deploy     → secret INFOMANIAK_SSH_KEY, puis supprimer le fichier local
```

Pendant la recette, protéger `nouveau.brassbandfribourg.ch` par mot de passe depuis le Manager Infomaniak (protection de dossier).

### Admin (phase 4) — un seul compte GitHub, connexion par e-mail

Principe : le BBF a **un seul compte GitHub** (`it@brassbandfribourg.ch`). Les rédacteurs n'en ont pas : ils se connectent à `/admin` avec leur adresse e-mail (code à usage unique envoyé par Cloudflare Access). Le Worker `workers/cms-auth` garde le jeton GitHub du BBF, relaie les appels du CMS et du tableau Effectifs, et ajoute « Modifié par : <e-mail> » à chaque enregistrement.

La liste des personnes autorisées est le fichier `acces/redacteurs.json`, modifié **dans l'interface d'édition** (Réglages → Accès à l'édition). Le Worker la relit chaque minute et applique les rôles : un **rédacteur** n'enregistre que du contenu (`src/content/`, `src/assets/uploads/`, `public/documents/`) ; seul un **administrateur** peut modifier la liste ou le reste du dépôt. `RESCUE_ADMINS` (dans `wrangler.toml`) reste administrateur même si la liste est cassée ou vidée.

```
Rédacteur → /admin → « Se connecter avec mon adresse e-mail »
         → Cloudflare Access (code par e-mail) → Worker bbf-cms-auth (session 12 h)
         → API GitHub avec le jeton du BBF → commit « … Modifié par : x@… »
```

**GitHub (une fois)**
1. Créer le compte `brassbandfribourg` avec `it@brassbandfribourg.ch`, double authentification activée, codes de secours dans le Drive « Site web — accès ».
2. Y placer le dépôt privé `site-web`.
3. Dépôt → Settings → **Rules → Rulesets → New branch ruleset** sur `main` : bloquer *force push* et *deletion*, sans exception.
4. Settings du compte → Developer settings → **Fine-grained tokens → Generate** : dépôt `site-web` uniquement ; permissions *Contents : Read and write*, *Actions : Read-only* (le reste à *No access*) ; échéance la plus longue proposée, rappel dans l'agenda du comité.

**Cloudflare Access (une fois, plan Zero Trust gratuit)**
1. Zero Trust → nom d'équipe `brassbandfribourg` (domaine `brassbandfribourg.cloudflareaccess.com`). Méthode de connexion : **One-time PIN**.
2. Access → Applications → **Add → Self-hosted** : domaine du Worker (`bbf-cms-auth.<sous-domaine>.workers.dev`), chemin `auth`, durée de session 24 h.
3. Politique **Code par e-mail** : *Allow*, *Include → Everyone*. Access ne fait qu'envoyer le code ; c'est la liste de l'interface d'édition qui décide qui entre.
4. Copier l'**Application Audience (AUD) tag** dans `workers/cms-auth/wrangler.toml` (`ACCESS_AUD`).

**Worker**
```bash
npx wrangler login                                            # compte Cloudflare du BBF
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET --config workers/cms-auth/wrangler.toml
npx wrangler secret put GITHUB_TOKEN --config workers/cms-auth/wrangler.toml   # coller le jeton fine-grained
npx wrangler deploy --config workers/cms-auth/wrangler.toml
```
Reporter l'URL du Worker dans `public/admin/config.yml` (`base_url`, `api_root`, `graphql_api_root`). Tests du Worker : `npx vitest run tests/cms-auth.test.ts`.

### Ajouter ou retirer un rédacteur (1 min)

Un administrateur : `/admin` → **Réglages → Accès à l'édition** → ajouter ou supprimer la ligne → **Enregistrer**. Un retrait coupe aussi une session ouverte, en une minute. Pour couper tout le monde immédiatement, changer `SESSION_SECRET` (commande ci-dessus).

## Surveillance du site (alertes)

`.github/workflows/surveillance.yml` vérifie **chaque heure** que le site répond (accueil et agenda, 3 essais) et **chaque lundi** qu'aucun lien n'est cassé (toutes les pages du plan du site, liens internes et externes ; les réseaux sociaux qui refusent les robots sont ignorés).

- À activer à la mise en ligne : variable de dépôt `SURVEILLANCE` = `true` (et `SITE_URL` si l'adresse diffère).
- Un problème ouvre un ticket GitHub (« Site inaccessible » ou « Liens cassés sur le site »), envoyé par e-mail au compte du BBF ; le ticket se ferme tout seul quand tout va bien. Un seul ticket par problème, pas de rappel chaque heure.
- Faire suivre les e-mails de GitHub depuis it@ vers les administrateurs (règle de redirection dans kSuite).
- Test à la main : **Actions → Surveillance → Run workflow**, ou `node scripts/surveillance.mjs liens https://brassbandfribourg.ch/`.

## Statistiques de visite (sans cookie)

Hébergement Infomaniak : Manager → Hébergement → le site → **Statistiques**. Elles sont calculées à partir des journaux du serveur : aucun cookie, rien à ajouter au site, pas de bandeau. Hébergement Cloudflare : *Web Analytics* du compte Cloudflare, également sans cookie.

## Restaurer un fichier supprimé (5 min)

GitHub → dépôt `site-web` → **Commits** → trouver le commit `content: suppression …` → ouvrir le fichier supprimé → **View file** → copier → **Add file → Create new file** au même chemin. Ou en ligne de commande :

```bash
git log --diff-filter=D --oneline -- src/content/
git checkout <commit>^ -- src/content/articles/<fichier>.md && git commit -m "content: restauration" && git push
```

## Annuler une mauvaise modification (10 min)

```bash
git revert <commit> && git push    # le site se reconstruit automatiquement
```

## Restaurer depuis une archive

```bash
tar xzf site-web-AAAA-MM-JJ.tar.gz
git clone site-web-AAAA-MM-JJ/depot-complet.bundle site-web
cd site-web && git remote set-url origin git@github.com:brassbandfribourg/site-web.git && git push --all
```

Test de restauration **une fois par an** : restaurer la dernière archive dans un dossier temporaire, lancer `npm ci && npm run build`.

## Compte GitHub perdu → GitLab ou Codeberg (½ journée)

1. Importer le bundle dans un nouveau dépôt GitLab/Codeberg.
2. `config.yml` : `backend.name: gitlab` (ou `gitea` pour Codeberg) et `repo`.
3. Recréer la CI (mêmes étapes que `.github/workflows/deploy.yml`).

## Worker Cloudflare en panne (1 h)

Le site public n'est pas touché. Redéployer le Worker (`npx wrangler deploy --config workers/cms-auth/wrangler.toml`). En attendant, un administrateur peut modifier le contenu directement sur github.com avec le compte du BBF.

## Jeton GitHub échu ou divulgué (10 min)

Générer un nouveau jeton fine-grained (mêmes réglages), `npx wrangler secret put GITHUB_TOKEN --config workers/cms-auth/wrangler.toml`, puis supprimer l'ancien jeton sur GitHub.

## Infomaniak indisponible (1 h)

Construire `dist/` (`npm ci && npm run build`), le publier sur Cloudflare Pages (`npx wrangler pages deploy dist`), puis faire pointer le DNS vers Cloudflare Pages.

## Bascule DNS (phase 6)

1. La veille : TTL des enregistrements à 300 s.
2. `INFOMANIAK_PATH` → dossier du domaine principal ; `PUBLIC_BETA=false` ; `SITE_URL` → domaine.
3. Lancer **Actions → Déploiement → Run workflow**.
4. Vérifier 10 anciennes URL (redirections), securityheaders.com (A), SSL Labs (A).
5. Archiver l'ancien WordPress (fichiers + base) 3 mois, puis résilier.

## Migration de l'ancien site (phase 5)

```bash
node scripts/migrate-wordpress.mjs https://brassbandfribourg.ch --dry-run   # simulation
node scripts/migrate-wordpress.mjs https://brassbandfribourg.ch
```

Le rapport est écrit dans `migration/RAPPORT.md`, les redirections 301 sont injectées dans `public/.htaccess`. Supprimer ensuite les contenus de démonstration (`npm run demo:images` n'est plus utile) et `src/components/BandeauBeta.astro`.

## Revue annuelle

- [ ] Liste « Accès à l'édition » (rédacteurs et administrateurs) après l'AG.
- [ ] Échéance du jeton GitHub du Worker.
- [ ] Test de restauration.
- [ ] Nouvelle clé SSH de déploiement (et suppression de l'ancienne).
- [ ] Versions de Sveltia CMS (`npm run cms:update`) et du Worker.
- [ ] Taille du dépôt (alerte au-delà de 800 Mo) : `git count-objects -vH`.
