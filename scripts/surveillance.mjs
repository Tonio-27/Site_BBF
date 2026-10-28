// Watches the live site. Used by .github/workflows/surveillance.yml.
//   node scripts/surveillance.mjs disponibilite <url>  — is the site up? (3 tries)
//   node scripts/surveillance.mjs liens <url>          — broken links on every page of the sitemap
// Writes a French report to rapport.md and exits 1 when something is wrong.
// LIENS_INTERNES_SEULEMENT=1 skips external links (local tests).
import { writeFileSync } from 'node:fs';

const [mode, base] = process.argv.slice(2);
if (!['disponibilite', 'liens'].includes(mode) || !base) {
  console.error('Usage : node scripts/surveillance.mjs disponibilite|liens <url>');
  process.exit(2);
}
const racine = new URL(base);
const AGENT = 'BBF-surveillance (+https://brassbandfribourg.ch/)';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function lire(url, methode = 'GET') {
  try {
    const r = await fetch(url, { method: methode, redirect: 'follow', headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(20_000) });
    return { statut: r.status, texte: methode === 'GET' ? await r.text() : '' };
  } catch (e) {
    return { statut: 0, texte: '', erreur: e.cause?.code ?? e.name };
  }
}

function terminer(ok, titre, lignes) {
  const rapport = `${titre}\n\n${lignes.join('\n')}\n`;
  writeFileSync('rapport.md', rapport);
  console.log(rapport);
  process.exit(ok ? 0 : 1);
}

// ------------------------------------------------------------------ availability
if (mode === 'disponibilite') {
  const pages = ['/', '/agenda/'].map((p) => new URL(p, racine).href);
  const pannes = [];
  for (const url of pages) {
    let r;
    for (let essai = 1; essai <= 3; essai++) {
      r = await lire(url);
      if (r.statut === 200 && r.texte.includes('</html>')) break;
      if (essai < 3) await pause(30_000);
    }
    if (!(r.statut === 200 && r.texte.includes('</html>'))) pannes.push(`- ${url} : ${r.statut ? `erreur HTTP ${r.statut}` : `pas de réponse (${r.erreur})`}`);
  }
  if (pannes.length) terminer(false, 'Le site ne répond pas correctement (3 essais à 30 secondes d’intervalle).', pannes);
  terminer(true, 'Le site répond normalement.', pages.map((p) => `- ${p} : OK`));
}

// ------------------------------------------------------------------ links
const IGNORES = /^(mailto:|tel:|javascript:|data:|#)/;
// Social networks refuse robots: a 4xx there is not a broken link.
const ROBOTS_REFUSES = /(^|\.)(facebook|instagram|linkedin|x|twitter)\.com$/;

// Pages are read on the site being checked, whatever host the sitemap names.
const surSite = (url) => new URL(new URL(url).pathname, racine).href;
const sitemap = await lire(new URL('/sitemap-index.xml', racine).href);
const pagesSitemap = [];
for (const plan of sitemap.texte.match(/<loc>([^<]+)<\/loc>/g) ?? []) {
  const contenu = await lire(surSite(plan.slice(5, -6)));
  for (const loc of contenu.texte.match(/<loc>([^<]+)<\/loc>/g) ?? []) pagesSitemap.push(loc.slice(5, -6));
}
if (!pagesSitemap.length) terminer(false, 'Plan du site illisible : impossible de vérifier les liens.', [`- ${racine.href}sitemap-index.xml`]);

const liens = new Map(); // url -> first page where it appears
for (const page of pagesSitemap) {
  const { texte } = await lire(surSite(page));
  for (const [, href] of texte.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const brut = href.replace(/&amp;/g, '&');
    if (IGNORES.test(brut)) continue;
    const url = new URL(brut, surSite(page));
    url.hash = '';
    if (url.pathname.startsWith('/admin')) continue;
    if (!liens.has(url.href)) liens.set(url.href, new URL(page).pathname);
  }
}

const aVerifier = [...liens.keys()].filter((u) => !process.env.LIENS_INTERNES_SEULEMENT || new URL(u).host === racine.host);
const casses = [];
const file = [...aVerifier];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (file.length) {
    const url = file.shift();
    const interne = new URL(url).host === racine.host;
    let r = await lire(url, interne ? 'GET' : 'HEAD');
    if (!interne && (r.statut === 0 || r.statut >= 400)) r = await lire(url); // some servers refuse HEAD
    const refusRobot = !interne && ROBOTS_REFUSES.test(new URL(url).hostname) && r.statut >= 400 && r.statut < 500;
    if ((r.statut === 0 || r.statut >= 400) && !refusRobot) {
      casses.push(`- ${url} (${r.statut ? `erreur ${r.statut}` : `pas de réponse : ${r.erreur}`}) — sur la page ${liens.get(url)}`);
    }
  }
}));

if (casses.length) terminer(false, `${casses.length} lien(s) cassé(s) sur ${pagesSitemap.length} pages vérifiées.`, casses.sort());
terminer(true, `Aucun lien cassé : ${aVerifier.length} liens vérifiés sur ${pagesSitemap.length} pages.`, []);
