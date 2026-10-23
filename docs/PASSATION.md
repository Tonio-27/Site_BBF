# Passation — comptes, rôles et routines du site

Document de référence pour le comité. **Aucun mot de passe ici.** Les codes de secours sont dans le Drive partagé du comité, dossier « Site web — accès » (accès restreint aux administrateurs).

## Comptes (tous ouverts avec it@brassbandfribourg.ch)

| Service | Compte | Administrateurs | Double authentification | Renouvellement / coût |
| --- | --- | --- | --- | --- |
| GitHub | **Compte unique** `brassbandfribourg`, dépôt privé `site-web` | _à désigner (2–3)_, seuls à connaître l'accès | Obligatoire | Gratuit |
| Cloudflare | Compte BBF : Worker `bbf-cms-auth` + Access (envoi du code de connexion par e-mail) | _à désigner (2)_ | Obligatoire | Gratuit |
| Infomaniak | Compte BBF : domaine, e-mails, Hébergement Web | _à désigner (2)_ | Obligatoire | ≈ CHF 6–7/mois + domaine (date : _à compléter_) |
| Google Drive partagé | Dossier « Site web — sauvegardes » | _à désigner_ | — | — |

## Rôles

| Rôle | Droits | Qui |
| --- | --- | --- |
| Administrateur | Rôle « Administrateur » dans **Réglages → Accès à l'édition** : contenu + liste des accès ; certains ont aussi les comptes GitHub, Cloudflare, Infomaniak du BBF | _à compléter_ |
| Rédacteur | Rôle « Rédacteur » dans **Réglages → Accès à l'édition** : modifie le contenu via /admin, **sans compte GitHub** | _à compléter_ |
| Développeur | Fait évoluer le code ; accès temporaire au dépôt, retiré en fin de mission | — |

## Ajouter un rédacteur

1. Un administrateur : `/admin` → **Réglages → Accès à l'édition** → **Ajouter** → adresse, nom ou fonction, rôle → **Enregistrer**.
2. Lui envoyer `docs/MANUEL-EDITEUR.md`.

## Retirer un rédacteur ou un administrateur

Supprimer sa ligne dans **Réglages → Accès à l'édition** : l'accès est coupé en une minute (et retirer ses accès Cloudflare / Infomaniak / GitHub s'il en avait). Ses modifications restent dans l'historique, signées de son adresse.

## À chaque assemblée générale

- [ ] Retirer les personnes qui ont quitté le comité (Réglages → Accès à l'édition, puis Cloudflare, Infomaniak, GitHub).
- [ ] Vérifier qu'il reste au moins 2 administrateurs par service.
- [ ] Mettre à jour ce document (noms ci-dessus).
- [ ] Vérifier la liste des adresses de fonction chez Infomaniak (redirections vers les bonnes personnes).

## Contacts techniques

| Sujet | Contact |
| --- | --- |
| Développement du site | _à compléter_ |
| Hébergement | Support Infomaniak (manager.infomaniak.com) |

Procédures techniques (restauration, clés, pannes) : `docs/RUNBOOK.md`.
