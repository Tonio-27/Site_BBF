// Builds dist-demo/: a self-contained copy of dist/ for showing the site
// anywhere (shared link, USB stick, sub-folder) without the real domain.
// - every internal URL becomes relative and points to an explicit index.html;
// - /admin runs Sveltia CMS on its in-memory "test-repo" backend: editors can
//   click through every menu and form, nothing is saved.
// Usage: npm run demo   (builds, then writes dist-demo/)
import { cpSync, readFileSync, writeFileSync, rmSync, existsSync, statSync, readdirSync, renameSync } from 'node:fs';
import { join, relative, posix } from 'node:path';
import { load } from 'js-yaml';

const SRC = 'dist';
const OUT = 'dist-demo';
if (!existsSync(SRC)) throw new Error('Lancer « npm run build » avant.');
rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });
// Server-only files are useless (and sometimes refused) outside Apache.
for (const f of ['.htaccess', 'admin/.htaccess']) rmSync(join(OUT, f), { force: true });
// Some hosts reserve names starting with "_": serve Astro's bundle folder as assets/.
renameSync(join(OUT, '_astro'), join(OUT, 'assets'));
const renommer = (s) => s.replaceAll('/_astro/', '/assets/');

function* fichiers(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* fichiers(chemin);
    else yield chemin;
  }
}

/** "/agenda/" seen from "agenda/archives/index.html" → "../index.html" */
function relatif(url, depuis) {
  const [, chemin, suite = ''] = url.match(/^([^?#]*)(.*)$/);
  let cible = chemin.replace(/^\//, '');
  const disque = join(OUT, cible);
  if (cible === '' || cible.endsWith('/')) cible += 'index.html';
  else if (existsSync(disque) && statSync(disque).isDirectory()) cible += '/index.html';
  const r = posix.relative(posix.dirname(depuis), cible) || 'index.html';
  return r + suite;
}

const estInterne = (u) => u.startsWith('/') && !u.startsWith('//');

for (const f of fichiers(OUT)) {
  const rel = relative(OUT, f).split('\\').join('/');
  if (f.endsWith('.html')) {
    let html = renommer(readFileSync(f, 'utf8'));
    html = html.replace(/(\s(?:href|src|action))="([^"]*)"/g, (m, attr, u) => (estInterne(u) ? `${attr}="${relatif(u, rel)}"` : m));
    html = html.replace(/(\ssrcset)="([^"]*)"/g, (_, attr, v) =>
      `${attr}="${v.split(',').map((part) => {
        const [u, ...rest] = part.trim().split(/\s+/);
        return [estInterne(u) ? relatif(u, rel) : u, ...rest].join(' ');
      }).join(', ')}"`,
    );
    // In a sandboxed viewer, embedded players are blocked: the video link opens YouTube instead.
    html = html.replace(/ data-youtube="[^"]*"/g, '');
    // Calendar files (.ics) are not served by every demo host: drop those links.
    html = html.replace(/<a [^>]*href="[^"]*\.ics"[^>]*>[\s\S]*?<\/a>/g, '');
    if (rel === 'index.html') html = html.replace(/<title>[^<]*<\/title>/, '<title>Démo site BBF</title>');
    writeFileSync(f, html);
  } else if (f.endsWith('.css')) {
    const css = renommer(readFileSync(f, 'utf8')).replace(/url\((['"]?)(\/[^)'"]+)\1\)/g, (m, q, u) => (estInterne(u) ? `url(${q}${posix.relative(posix.dirname(rel), u.slice(1))}${q})` : m));
    writeFileSync(f, css);
  }
}

for (const f of fichiers(OUT)) if (f.endsWith('.ics')) rmSync(f);

// Sandbox admin: Sveltia's in-memory test backend, no GitHub account needed.
// The config is shipped as JSON, a type every static host serves.
const cfg = join(OUT, 'admin/config.yml');
const yaml = readFileSync(cfg, 'utf8')
    .replace(/^backend:\n(?:  .*\n|    .*\n)+/m, 'backend:\n  name: test-repo\n')
    .replace(/^  src: \/favicon\.svg$/m, '  src: ../favicon.svg');
writeFileSync(join(OUT, 'admin/config.json'), JSON.stringify(load(yaml), null, 2));
rmSync(cfg);
const admin = join(OUT, 'admin/index.html');
writeFileSync(
  admin,
  readFileSync(admin, 'utf8').replace('</head>', '  <link href="config.json" type="application/json" rel="cms-config-url" />\n  </head>'),
);

const n = [...fichiers(OUT)].length;
console.log(`✓ Démo autonome prête dans ${OUT}/ (${n} fichiers). Ouvrir ${OUT}/index.html via un petit serveur local.`);
