// Installs the pinned Sveltia CMS into public/admin/ so that /admin never
// depends on a third-party CDN: the UI translations (unpkg) and the fonts
// (jsDelivr) the editor would otherwise fetch are copied next to it, along
// with SortableJS for the "Effectifs" board.
// Usage: npm run cms:update   (after Renovate bumps @sveltia/cms)
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CMS = 'node_modules/@sveltia/cms';
const ADMIN = 'public/admin';

const POLICES = [
  ['material-symbols-outlined:vf@5.3.9/latin-wght-normal.woff2', '@fontsource-variable/material-symbols-outlined/files/material-symbols-outlined-latin-wght-normal.woff2', 'material-symbols-outlined.woff2'],
  ['noto-mono@5.3.0/latin-400-normal.woff2', '@fontsource/noto-mono/files/noto-mono-latin-400-normal.woff2', 'noto-mono.woff2'],
  ['source-sans-3:vf@5.3.1/latin-wght-normal.woff2', '@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2', 'source-sans-3.woff2'],
];

/** Returns the patched Sveltia bundle; throws if an expected CDN URL is gone or a new one appeared. */
export function patcherCms(source) {
  let js = source.replace(/`https:\/\/unpkg\.com\/@sveltia\/cms@\$\{(\w+)\}\/locales`/, '`./locales`');
  if (js === source) throw new Error('URL des traductions Sveltia introuvable : adapter scripts/update-cms.mjs');
  for (const [cdn, , local] of POLICES) {
    const url = `https://cdn.jsdelivr.net/fontsource/fonts/${cdn}`;
    if (!js.includes(url)) throw new Error(`Police ${cdn} introuvable dans Sveltia : adapter scripts/update-cms.mjs`);
    js = js.replaceAll(url, `./fonts/${local}`);
  }
  // U+FFFD only appears inside template literals: the escaped form is equivalent
  // and keeps the file free of a character some hosts reject as corruption.
  js = js.replaceAll('\uFFFD', '\\uFFFD');
  const restantes = js.match(/https:\/\/cdn\.jsdelivr\.net\/fontsource\/[^)`"]+/g);
  if (restantes) throw new Error(`Nouvelles polices CDN dans Sveltia : ${restantes.join(', ')}`);
  return js;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(`${ADMIN}/sveltia-cms.js`, patcherCms(readFileSync(`${CMS}/dist/sveltia-cms.js`, 'utf8')));
  mkdirSync(`${ADMIN}/locales`, { recursive: true });
  for (const f of readdirSync(`${CMS}/locales`)) if (['fr.json', 'de.json', 'en-US.json'].includes(f)) copyFileSync(`${CMS}/locales/${f}`, `${ADMIN}/locales/${f}`);
  mkdirSync(`${ADMIN}/fonts`, { recursive: true });
  for (const [, npm, local] of POLICES) copyFileSync(`node_modules/${npm}`, `${ADMIN}/fonts/${local}`);
  // Drag-and-drop library for the "Effectifs" board.
  mkdirSync(`${ADMIN}/vendor`, { recursive: true });
  copyFileSync('node_modules/sortablejs/Sortable.min.js', `${ADMIN}/vendor/sortable.min.js`);
  console.log('✓ Sveltia CMS installé dans public/admin/ (traductions et polices locales).');
}
