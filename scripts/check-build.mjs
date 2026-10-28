// Post-build checks on dist/: key pages present, no broken internal links,
// nothing that would break the strict CSP, drafts never published.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { patcherCms } from './update-cms.mjs';

const DIST = 'dist';
const erreurs = [];

const PAGES_CLES = [
  'index.html', '404.html', 'agenda/index.html', 'agenda/archives/index.html', 'agenda.ics',
  'blog/index.html', 'blog/rss.xml', 'presentation/index.html', 'gallery/index.html',
  'partenaires/index.html', 'soutenir/index.html', 'presse/index.html', 'contact/index.html',
  'politique-de-confidentialite/index.html', 'conditions-generales/index.html',
  'sitemap-index.xml', 'robots.txt', '.htaccess', 'admin/index.html', 'admin/config.yml', 'admin/sveltia-cms.js', 'admin/locales/fr.json',
];
for (const p of PAGES_CLES) if (!existsSync(join(DIST, p))) erreurs.push(`Page clé manquante : /${p}`);

function* fichiersHtml(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (chemin !== join(DIST, 'admin')) yield* fichiersHtml(chemin);
    } else if (nom.endsWith('.html')) yield chemin;
  }
}

function existe(url) {
  const chemin = decodeURIComponent(url.split(/[?#]/)[0]);
  const cible = join(DIST, chemin);
  if (chemin.endsWith('/')) return existsSync(join(cible, 'index.html'));
  return existsSync(cible) || existsSync(join(cible, 'index.html'));
}

let liens = 0;
for (const fichier of fichiersHtml(DIST)) {
  const html = readFileSync(fichier, 'utf8');
  const page = '/' + fichier.slice(DIST.length + 1);
  for (const [, attr, url] of html.matchAll(/\s(href|src|srcset)="([^"]+)"/g)) {
    const urls = attr === 'srcset' ? url.split(',').map((s) => s.trim().split(/\s+/)[0]) : [url];
    for (const u of urls) {
      if (!u.startsWith('/') || u.startsWith('//')) continue;
      liens++;
      if (!existe(u)) erreurs.push(`${page} : lien interne cassé → ${u}`);
    }
  }
  if (/\sstyle="/.test(html)) erreurs.push(`${page} : attribut style= (bloqué par la CSP)`);
  for (const [, attrs, corps] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/type="application\/ld\+json"/.test(attrs) && corps.trim()) erreurs.push(`${page} : script inline (bloqué par la CSP)`);
  }
  if (/\son[a-z]+="/.test(html)) erreurs.push(`${page} : gestionnaire d'événement inline (bloqué par la CSP)`);
  if (!/<title>[^<]+<\/title>/.test(html)) erreurs.push(`${page} : <title> manquant`);
  if (!/<meta name="description" content="[^"]+"/.test(html)) erreurs.push(`${page} : meta description manquante`);
}

const descriptions = new Map();
for (const fichier of fichiersHtml(DIST)) {
  if (fichier.endsWith('404.html')) continue;
  const d = readFileSync(fichier, 'utf8').match(/<meta name="description" content="([^"]+)"/)?.[1];
  if (d) descriptions.set(d, [...(descriptions.get(d) ?? []), fichier]);
}
for (const [d, pages] of descriptions) {
  // Paginated or category listings may share a description; anything else must be unique.
  if (pages.length > 1 && !pages.every((p) => p.includes('/blog/'))) erreurs.push(`Description dupliquée sur ${pages.length} pages : « ${d.slice(0, 60)}… »`);
}

// The committed Sveltia copy must match the pinned npm version (Renovate updates the latter).
const cmsNpm = 'node_modules/@sveltia/cms/dist/sveltia-cms.js';
if (existsSync(cmsNpm) && patcherCms(readFileSync(cmsNpm, 'utf8')) !== readFileSync('public/admin/sveltia-cms.js', 'utf8')) {
  erreurs.push('public/admin/sveltia-cms.js ne correspond pas à la version épinglée : lancer « npm run cms:update »');
}

if (existsSync(join(DIST, 'article-en-preparation'))) erreurs.push('Un brouillon a été publié (/article-en-preparation/)');

if (erreurs.length) {
  console.error(`✗ ${erreurs.length} problème(s) :\n  - ${erreurs.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ Build vérifié : ${PAGES_CLES.length} pages clés, ${liens} liens internes, CSP respectée.`);
