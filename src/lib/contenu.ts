// Content access helpers shared by pages: one place for filtering and sorting.
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { versDate } from './dates.ts';

export type Article = CollectionEntry<'articles'>;
export type Evenement = CollectionEntry<'evenements'>;

// Root-level article slugs must not shadow real pages.
const SLUGS_RESERVES = new Set([
  'agenda', 'blog', 'presentation', 'gallery', 'contact', 'partenaires', 'presse', 'admin',
  'politique-de-confidentialite', 'conditions-generales', '404', 'app', 'documents', 'js', 'fonts', '_astro',
]);

export async function articlesPublies(): Promise<Article[]> {
  const articles = (await getCollection('articles', ({ data }) => !data.brouillon)).sort(
    (a, b) => versDate(b.data.date).getTime() - versDate(a.data.date).getTime(),
  );
  for (const a of articles) {
    if (SLUGS_RESERVES.has(a.data.slug)) throw new Error(`Le slug d'article « ${a.data.slug} » est réservé par une page du site.`);
  }
  const vus = new Set<string>();
  for (const a of articles) {
    if (vus.has(a.data.slug)) throw new Error(`Deux articles ont le même slug « ${a.data.slug} ».`);
    vus.add(a.data.slug);
  }
  return articles;
}

export const evenements = () => getCollection('evenements');

export async function partenairesActifs() {
  return (await getCollection('partenaires', ({ data }) => data.actif)).sort((a, b) => a.data.ordre - b.data.ordre);
}

export async function reglages() {
  const r = await getEntry('reglages', 'reglages');
  if (!r) throw new Error('Fichier de réglages manquant (src/content/pages/reglages.json).');
  return r.data;
}

/** Announcement banner: shown only when active, with text, and before its end date. */
export async function annonceVisible(maintenant = new Date()) {
  const r = await reglages();
  if (!r.annonce_active || !r.annonce_texte) return null;
  if (r.annonce_fin && versDate(`${r.annonce_fin.slice(0, 10)}T23:59`) < maintenant) return null;
  return { texte: r.annonce_texte, lien: r.annonce_lien };
}

export function slugCategorie(c: string): string {
  return c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
}
