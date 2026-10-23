# Passation — comptes, rôles et routines du site

Document de référence pour le comité. **Aucun mot de passe ici.** Les codes de secours sont dans le Drive partagé du comité, dossier « Site web — accès » (accès restreint aux administrateurs).

## Comptes (tous ouverts avec it@brassbandfribourg.ch)

| Service | Compte | Administrateurs | Double authentification | Renouvellement / coût |
| --- | --- | --- | --- | --- |
| GitHub | **Compte unique** `brassbandfribourg`, dépôt privé `site-web` | _à désigner (2–3)_, seuls à connaître l'accès | Obligatoire | Gratuit |
| Cloudflare | Compte BBF : Worker `bbf-cms-auth` + Access (connexion des rédacteurs par e-mail) | _à désigner (2)_ | Obligatoire | Gratuit |
| Infomaniak | Compte BBF : domaine, e-mails, Hébergement Web | _à désigner (2)_ | Obligatoire | ≈ CHF 6–7/mois + domaine (date : _à compléter_) |
| Google Drive partagé | Dossier « Site web — sauvegardes » | _à désigner_ | — | — |

## Rôles

| Rôle | Droits | Qui |
| --- | --- | --- |
| Administrateur | Accès aux comptes GitHub, Cloudflare et Infomaniak du BBF : gère les accès | _à compléter_ |
| Rédacteur | Son adresse e-mail dans la politique Access **Rédacteurs** : modifie le contenu via /admin, **sans compte GitHub** | _à compléter_ |
| Développeur | Fait évoluer le code ; accès temporaire au dépôt, retiré en fin de mission | — |

## Ajouter un rédacteur

1. dash.cloudflare.com → **Zero Trust → Access → Applications → bbf-cms-auth → politique Rédacteurs** → ajouter son adresse e-mail.
2. Lui envoyer `docs/MANUEL-EDITEUR.md`.

## Retirer un rédacteur ou un administrateur

Retirer son adresse de la politique **Rédacteurs** (et ses accès Cloudflare / Infomaniak / GitHub s'il était administrateur). Ses modifications restent dans l'historique, signées de son adresse.

## À chaque assemblée générale

- [ ] Retirer les personnes qui ont quitté le comité (politique Rédacteurs, Cloudflare, Infomaniak, GitHub).
- [ ] Vérifier qu'il reste au moins 2 administrateurs par service.
- [ ] Mettre à jour ce document (noms ci-dessus).
- [ ] Vérifier la liste des adresses de fonction chez Infomaniak (redirections vers les bonnes personnes).

## Contacts techniques

| Sujet | Contact |
| --- | --- |
| Développement du site | _à compléter_ |
| Hébergement | Support Infomaniak (manager.infomaniak.com) |

Procédures techniques (restauration, clés, pannes) : `docs/RUNBOOK.md`.
