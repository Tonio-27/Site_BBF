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

### Admin (phase 4)

1. Organisation GitHub → Settings → Developer settings → **OAuth Apps → New** : callback `https://<worker>.workers.dev/callback`.
2. Déployer `sveltia/sveltia-cms-auth` (version épinglée) sur Cloudflare Workers, variables : `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (chiffré), `ALLOWED_DOMAINS=brassbandfribourg.ch, nouveau.brassbandfribourg.ch`.
3. Reporter l'URL du Worker dans `public/admin/config.yml` (`base_url`) et dans `public/admin/.htaccess` (CSP `connect-src`).

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

Le site public n'est pas touché. Redéployer le Worker ; en attendant, un administrateur peut se connecter à `/admin` avec un jeton personnel GitHub (ajouter temporairement `token` à `auth_methods`).

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

- [ ] Liste des éditeurs et administrateurs (après l'AG).
- [ ] Test de restauration.
- [ ] Nouvelle clé SSH de déploiement (et suppression de l'ancienne).
- [ ] Versions de Sveltia CMS (`npm run cms:update`) et du Worker.
- [ ] Taille du dépôt (alerte au-delà de 800 Mo) : `git count-objects -vH`.
