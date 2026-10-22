# Passation — comptes, rôles et routines du site

Document de référence pour le comité. **Aucun mot de passe ici.** Les codes de secours sont dans le Drive partagé du comité, dossier « Site web — accès » (accès restreint aux administrateurs).

## Comptes (tous ouverts avec it@brassbandfribourg.ch)

| Service | Compte | Administrateurs | Double authentification | Renouvellement / coût |
| --- | --- | --- | --- | --- |
| GitHub | Organisation `brassbandfribourg`, dépôt privé `site-web` | _à désigner (2–3)_ | Obligatoire pour toute l'organisation | Gratuit |
| Cloudflare | Compte BBF (Worker `bbf-cms-auth`) | _à désigner (2)_ | Obligatoire | Gratuit |
| Infomaniak | Compte BBF : domaine, e-mails, Hébergement Web | _à désigner (2)_ | Obligatoire | ≈ CHF 6–7/mois + domaine (date : _à compléter_) |
| Google Drive partagé | Dossier « Site web — sauvegardes » | _à désigner_ | — | — |

## Rôles

| Rôle | Droits | Qui |
| --- | --- | --- |
| Administrateur | Owner de l'organisation GitHub : tout | _à compléter_ |
| Éditeur | Équipe `redaction`, droit Write sur `site-web` : modifier le contenu via /admin | _à compléter_ |
| Développeur | Accès temporaire Write, retiré en fin de mission | — |

## Ajouter un éditeur

1. github.com/orgs/brassbandfribourg → **People → Invite member** → saisir son e-mail.
2. Rôle : **Member**, équipe **redaction**.
3. Lui envoyer `docs/MANUEL-EDITEUR.md`.

## Retirer un éditeur ou un administrateur

github.com/orgs/brassbandfribourg → **People** → la personne → **Remove from organization**. Ses contributions restent dans l'historique.

## À chaque assemblée générale

- [ ] Retirer les personnes qui ont quitté le comité (GitHub, Cloudflare, Infomaniak).
- [ ] Vérifier qu'il reste au moins 2 administrateurs par service.
- [ ] Mettre à jour ce document (noms ci-dessus).
- [ ] Vérifier la liste des adresses de fonction chez Infomaniak (redirections vers les bonnes personnes).

## Contacts techniques

| Sujet | Contact |
| --- | --- |
| Développement du site | _à compléter_ |
| Hébergement | Support Infomaniak (manager.infomaniak.com) |

Procédures techniques (restauration, clés, pannes) : `docs/RUNBOOK.md`.
