import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { schemas } from './lib/schemas.ts';

const md = (dossier: string) => glob({ pattern: '**/*.md', base: `./src/content/${dossier}` });
const json = (dossier: string) => glob({ pattern: '**/*.json', base: `./src/content/${dossier}` });
const page = (fichier: string) => glob({ pattern: fichier, base: './src/content/pages' });

export const collections = {
  articles: defineCollection({ loader: md('articles'), schema: ({ image }) => schemas.articles(image) }),
  evenements: defineCollection({ loader: json('evenements'), schema: ({ image }) => schemas.evenements(image) }),
  musiciens: defineCollection({ loader: json('musiciens'), schema: ({ image }) => schemas.musiciens(image) }),
  directeurs: defineCollection({ loader: md('directeurs'), schema: ({ image }) => schemas.directeurs(image) }),
  comite: defineCollection({ loader: json('comite'), schema: () => schemas.comite() }),
  partenaires: defineCollection({ loader: json('partenaires'), schema: ({ image }) => schemas.partenaires(image) }),
  albums: defineCollection({ loader: json('albums'), schema: ({ image }) => schemas.albums(image) }),
  presse: defineCollection({ loader: json('presse'), schema: () => schemas.presse() }),
  legal: defineCollection({ loader: md('legal'), schema: () => schemas.legal() }),
  accueil: defineCollection({ loader: page('accueil.json'), schema: ({ image }) => schemas.accueil(image) }),
  presentation: defineCollection({ loader: page('presentation.md'), schema: ({ image }) => schemas.presentation(image) }),
  page_partenaires: defineCollection({ loader: page('partenaires.json'), schema: () => schemas.page_partenaires() }),
  page_presse: defineCollection({ loader: page('presse.json'), schema: ({ image }) => schemas.page_presse(image) }),
  reglages: defineCollection({ loader: page('reglages.json'), schema: ({ image }) => schemas.reglages(image) }),
};
