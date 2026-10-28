// Zod schemas for every content type. Kept outside content.config.ts so that
// scripts/check-config-sync.mjs can compare them with public/admin/config.yml.
// Any change here must be mirrored in config.yml (the check fails otherwise).
import { z } from 'astro/zod';
import { PUPITRES } from './pupitres.ts';

// `image` is Astro's image() helper; scripts pass a plain string schema instead.

export const CATEGORIES_ARTICLE = ['Actualité', 'Recrutement', 'Concert', 'Concours', 'Association'] as const;
export const TYPES_EVENEMENT = ['Concert', 'Concours', 'Prestation', 'Autre'] as const;
export const CATEGORIES_PARTENAIRE = ['Partenaire principal', 'Sponsor', 'Institution', 'Fournisseur'] as const;
export const ENSEMBLES = ['A', 'B'] as const;

const DATE_LOCALE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/;
// YAML front matter turns bare dates into Date objects: normalise back to text.
const dateLocale = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, v.getUTCHours() || v.getUTCMinutes() ? 16 : 10) : v),
  z.string().regex(DATE_LOCALE, 'Format attendu : AAAA-MM-JJ ou AAAA-MM-JJTHH:MM'),
);
const url = z.url();
const texteRequis = z.string().trim().min(1);

const imageAvecAlt = <I extends z.ZodType>(image: () => I) =>
  z.object({
    src: image(),
    alt: texteRequis,
  });

export const schemas = {
  articles: <I extends z.ZodType>(image: () => I) =>
    z.object({
      titre: texteRequis,
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug : minuscules, chiffres et tirets'),
      date: dateLocale,
      categorie: z.enum(CATEGORIES_ARTICLE),
      image: imageAvecAlt(image).optional(),
      resume: texteRequis.max(200),
      brouillon: z.boolean().default(false),
    }),

  evenements: <I extends z.ZodType>(image: () => I) =>
    z.object({
      titre: texteRequis,
      date_debut: dateLocale,
      date_fin: dateLocale.optional(),
      lieu: texteRequis,
      localite: texteRequis,
      ensembles: z.array(z.enum(ENSEMBLES)).min(1, 'Choisir au moins un ensemble'),
      type: z.enum(TYPES_EVENEMENT),
      description: z.string().optional(),
      billetterie_url: url.optional(),
      image: imageAvecAlt(image).optional(),
      annule: z.boolean().default(false),
    }),

  musiciens: <I extends z.ZodType>(image: () => I) =>
    z.object({
      prenom: texteRequis,
      nom: texteRequis,
      ensemble: z.enum(ENSEMBLES),
      pupitre: z.enum(PUPITRES),
      ordre: z.number().int().optional(),
      photo: image().optional(),
      actif: z.boolean().default(true),
    }),

  directeurs: <I extends z.ZodType>(image: () => I) =>
    z.object({
      prenom: texteRequis,
      nom: texteRequis,
      ensemble: z.enum(ENSEMBLES),
      photo: imageAvecAlt(image).optional(),
      depuis: z.number().int().min(1900).max(2100),
      actif: z.boolean().default(true),
    }),

  comite: () =>
    z.object({
      prenom: texteRequis,
      nom: texteRequis,
      fonction: texteRequis,
      email: z.email().optional(),
      telephone: z.string().optional(),
      afficher_telephone: z.boolean().default(false),
      ordre: z.number().int().default(99),
    }),

  partenaires: <I extends z.ZodType>(image: () => I) =>
    z.object({
      nom: texteRequis,
      logo: image(),
      site_web: url.optional(),
      categorie: z.enum(CATEGORIES_PARTENAIRE),
      ordre: z.number().int().default(99),
      actif: z.boolean().default(true),
    }),

  albums: <I extends z.ZodType>(image: () => I) =>
    z.object({
      titre: texteRequis,
      date: dateLocale,
      ensemble: z.enum(['A', 'B', 'Les deux']),
      couverture: imageAvecAlt(image),
      photos: z
        .array(z.object({ image: image(), legende: z.string().optional() }))
        .max(60, 'Maximum 60 photos par album : mettre l’album complet sur le Drive'),
      lien_externe: url.optional(),
    }),

  presse: () =>
    z
      .object({
        titre: texteRequis,
        media: texteRequis,
        date: dateLocale,
        resume: z.string().optional(),
        fichier: z.string().optional(),
        lien: url.optional(),
      })
      .refine((p) => p.fichier || p.lien, 'Indiquer un fichier PDF ou un lien'),

  accueil: <I extends z.ZodType>(image: () => I) =>
    z.object({
      photo: imageAvecAlt(image),
      accroche: texteRequis,
      introduction: texteRequis,
      bloc_rejoindre: texteRequis,
      bloc_soutenir: texteRequis,
      bloc_suivre: texteRequis,
    }),

  presentation: <I extends z.ZodType>(image: () => I) =>
    z.object({
      introduction: texteRequis,
      photo: imageAvecAlt(image).optional(),
      palmares: z.array(z.object({ annee: z.number().int(), resultat: texteRequis })).default([]),
    }),

  page_partenaires: () =>
    z.object({
      remerciements: texteRequis,
    }),

  page_soutenir: <I extends z.ZodType>(image: () => I) =>
    z.object({
      introduction: texteRequis,
      email: z.email(),
      membre: z.object({
        texte: texteRequis,
        montant: texteRequis,
        avantages: z.array(texteRequis).default([]),
      }),
      don: z.object({
        texte: texteRequis,
        qr_twint: imageAvecAlt(image).optional(),
        lien_twint: url.optional(),
        beneficiaire: z.string().optional(),
        iban: z.string().optional(),
      }),
      sponsoring: z.object({
        texte: texteRequis,
        formules: z.array(z.object({ nom: texteRequis, prix: texteRequis, avantages: z.array(texteRequis).min(1) })).default([]),
        dossier: z.string().optional(),
      }),
    }),

  page_presse: <I extends z.ZodType>(image: () => I) =>
    z.object({
      introduction: texteRequis,
      texte_presentation: texteRequis,
      kit: z.array(z.object({ titre: texteRequis, fichier: z.string() })).default([]),
      photo_presse: imageAvecAlt(image).optional(),
      contact_nom: texteRequis,
      contact_email: z.email(),
    }),

  legal: () =>
    z.object({
      titre: texteRequis,
      mise_a_jour: dateLocale,
    }),

  reglages: <I extends z.ZodType>(image: () => I) =>
    z.object({
      nom: texteRequis,
      adresse: texteRequis,
      email_general: z.email(),
      facebook: url.optional(),
      instagram: url.optional(),
      youtube: url.optional(),
      description_seo: texteRequis.max(170),
      image_partage: image(),
      annonce_active: z.boolean().default(false),
      annonce_texte: z.string().optional(),
      annonce_lien: z.string().optional(),
      annonce_fin: dateLocale.optional(),
    }),

  // Who may sign in to /admin (read by workers/cms-auth, never published).
  acces: () =>
    z.object({
      personnes: z
        .array(
          z.object({
            email: z.email(),
            nom: texteRequis,
            role: z.enum(['redacteur', 'administrateur']),
          }),
        )
        .min(1),
    }),
};

export type NomSchema = keyof typeof schemas;
