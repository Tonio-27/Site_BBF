// One-off migration from the old WordPress 4.9.8 site through its REST API.
// Usage: node scripts/migrate-wordpress.mjs [https://brassbandfribourg.ch] [--dry-run]
//
// What it does:
//  - posts      → src/content/articles/*.md (original slug kept, duplicates merged, images downloaded)
//  - pages      → migration/pages/*.md (raw Markdown, for the committee to dispatch: history, legal…)
//  - PDFs       → public/documents/ + 301 redirects from /app/uploads/...
//  - redirects  → injected into public/.htaccess between the "migration redirects" markers
//  - report     → migration/RAPPORT.md (counts, missing images, items to check)
// Musicians, events, partners and albums live in theme templates, not in the API:
// they are parsed from the public HTML in a second step, reviewed by hand (see docs/RUNBOOK.md).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname } from 'node:path';

const SITE = (process.argv.find((a) => a.startsWith('http')) ?? 'https://brassbandfribourg.ch').replace(/\/$/, '');
const DRY = process.argv.includes('--dry-run');
const API = `${SITE}/wp-json/wp/v2`;
const rapport = { articles: 0, doublons: [], images: 0, imagesManquantes: [], pages: 0, pdf: 0, redirections: [] };

async function toutRecuperer(type) {
  const items = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`${API}/${type}?per_page=100&page=${page}&_embed=1`);
    if (r.status === 400) break;
    if (!r.ok) throw new Error(`${type} page ${page} : HTTP ${r.status}`);
    items.push(...(await r.json()));
    if (page >= Number(r.headers.get('x-wp-totalpages') ?? 1)) break;
  }
  return items;
}

const entites = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#8217;': '’', '&#8211;': '–', '&#8212;': '—', '&nbsp;': ' ', '&#8230;': '…', '&laquo;': '«', '&raquo;': '»' };
const decoder = (s) => s.replace(/&[#a-z0-9]+;/gi, (e) => entites[e] ?? e);

/** Minimal HTML → Markdown for WordPress post bodies (reviewed by the committee afterwards). */
function versMarkdown(html) {
  return decoder(
    html
      .replace(/\r/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, (m) => {
        const yt = m.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/);
        return yt ? `\n\nhttps://www.youtube.com/watch?v=${yt[1]}\n\n` : '';
      })
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${'#'.repeat(Math.max(2, Number(n)))} ${t.trim()}\n\n`)
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*')
      .replace(/<a [^>]*href="mailto:([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2')
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
      .replace(/<img [^>]*src="([^"]+)"[^>]*?(?:alt="([^"]*)")?[^>]*>/gi, '\n\n![$2]($1)\n\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
      .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '  \n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

const slugifier = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const categorie = (noms) => {
  const t = noms.join(' ').toLowerCase();
  if (/recrut/.test(t)) return 'Recrutement';
  if (/concours/.test(t)) return 'Concours';
  if (/concert/.test(t)) return 'Concert';
  if (/assembl|comit|nomination|direct/.test(t)) return 'Association';
  return 'Actualité';
};
const yamlTexte = (s) => JSON.stringify(s);

async function telecharger(url, destination) {
  if (DRY) return true;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await writeFile(destination, Buffer.from(await r.arrayBuffer()));
    return true;
  } catch (e) {
    rapport.imagesManquantes.push(`${url} (${e.message})`);
    return false;
  }
}

async function migrerArticles() {
  const posts = await toutRecuperer('posts');
  const vus = new Map();
  for (const p of posts) {
    const titre = decoder(p.title.rendered).trim();
    const cle = slugifier(titre);
    if (vus.has(cle)) {
      rapport.doublons.push(`« ${titre} » (${p.slug}) fusionné avec ${vus.get(cle)}`);
      rapport.redirections.push([`/${p.slug}/`, `/${vus.get(cle)}/`]);
      continue;
    }
    vus.set(cle, p.slug);
    const date = p.date.slice(0, 10);
    const cats = (p._embedded?.['wp:term']?.[0] ?? []).map((c) => c.name);
    const media = p._embedded?.['wp:featuredmedia']?.[0];
    let image = '';
    if (media?.source_url) {
      const fichier = `wp-${date}-${basename(new URL(media.source_url).pathname)}`;
      if (await telecharger(media.source_url, `src/assets/uploads/${fichier}`)) {
        rapport.images++;
        const alt = decoder(media.alt_text || titre);
        image = `image:\n  src: ../../assets/uploads/${fichier}\n  alt: ${yamlTexte(alt)}\n`;
      }
    }
    const resume = decoder(p.excerpt.rendered.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim().slice(0, 197);
    const md = `---\ntitre: ${yamlTexte(titre)}\nslug: ${p.slug}\ndate: ${date}\ncategorie: ${categorie(cats)}\n${image}resume: ${yamlTexte(resume || titre)}\n---\n\n${versMarkdown(p.content.rendered)}\n`;
    if (!DRY) await writeFile(`src/content/articles/${date}-${p.slug}.md`, md);
    rapport.articles++;
  }
}

async function migrerPages() {
  await mkdir('migration/pages', { recursive: true });
  for (const p of await toutRecuperer('pages')) {
    if (!DRY) await writeFile(`migration/pages/${p.slug}.md`, `# ${decoder(p.title.rendered)}\n\n${versMarkdown(p.content.rendered)}\n`);
    rapport.pages++;
  }
}

async function migrerDocuments() {
  for (const m of await toutRecuperer('media')) {
    if (m.mime_type !== 'application/pdf') continue;
    const chemin = new URL(m.source_url).pathname;
    const fichier = slugifier(basename(chemin, extname(chemin))) + '.pdf';
    if (await telecharger(m.source_url, `public/documents/${fichier}`)) {
      rapport.pdf++;
      rapport.redirections.push([chemin, `/documents/${fichier}`]);
    }
  }
}

async function injecterRedirections() {
  const regles = rapport.redirections
    .map(([de, vers]) => `  RewriteRule ^${de.replace(/^\//, '').replace(/[.+?()[\]^$]/g, '\\$&')}$ ${vers} [L,R=301]`)
    .join('\n');
  const htaccess = await readFile('public/.htaccess', 'utf8');
  const nouveau = htaccess.replace(/(# BEGIN migration redirects\n)[\s\S]*?(\s*# END migration redirects)/, `$1${regles}$2`);
  if (!DRY) await writeFile('public/.htaccess', nouveau);
}

await mkdir('migration', { recursive: true });
await mkdir('public/documents', { recursive: true });
await migrerArticles();
await migrerPages();
await migrerDocuments();
await injecterRedirections();

const texte = `# Rapport de migration — ${new Date().toISOString().slice(0, 10)}

Source : ${SITE}${DRY ? ' (simulation, rien n’a été écrit)' : ''}

| Élément | Nombre |
| --- | --- |
| Articles | ${rapport.articles} |
| Images d’articles | ${rapport.images} |
| Pages (à répartir) | ${rapport.pages} |
| PDF | ${rapport.pdf} |
| Redirections 301 | ${rapport.redirections.length} |

## Doublons fusionnés
${rapport.doublons.map((d) => `- ${d}`).join('\n') || '- aucun'}

## Images manquantes
${rapport.imagesManquantes.map((d) => `- ${d}`).join('\n') || '- aucune'}

## À faire à la main
- Relire chaque article (mise en forme, liens) et compléter les résumés tronqués.
- Répartir migration/pages/ : historique → pages/presentation.md, textes légaux → legal/.
- Musiciens, événements, partenaires, albums : reprise depuis les pages publiques, puis relecture.
- Supprimer le dossier migration/ une fois la relecture terminée.
`;
await writeFile('migration/RAPPORT.md', texte);
console.log(texte);
