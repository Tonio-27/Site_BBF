import type { APIRoute } from 'astro';
import { articlesPublies } from '../../lib/contenu.ts';
import { versDate } from '../../lib/dates.ts';

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export const GET: APIRoute = async ({ site }) => {
  const articles = (await articlesPublies()).slice(0, 30);
  const items = articles
    .map((a) => {
      const url = new URL(`/${a.data.slug}/`, site).href;
      return `<item><title>${xml(a.data.titre)}</title><link>${url}</link><guid>${url}</guid><pubDate>${versDate(a.data.date).toUTCString()}</pubDate><category>${xml(a.data.categorie)}</category><description>${xml(a.data.resume)}</description></item>`;
    })
    .join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Brass Band Fribourg — Actualités</title><link>${site}</link><description>Les actualités du Brass Band Fribourg</description><language>fr-CH</language>${items}</channel></rss>`;
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
