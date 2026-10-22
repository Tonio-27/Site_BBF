// Accessibility check (axe-core, WCAG 2.2 AA) on representative pages, desktop and mobile.
// Usage: serve dist/ on PORT (default 4321), then: node scripts/check-a11y.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const BASE = `http://localhost:${process.env.PORT ?? 4321}`;
const PAGES = [
  '/', '/agenda/', '/agenda/archives/', '/blog/', '/presentation/', '/gallery/',
  '/partenaires/', '/presse/', '/contact/', '/404.html',
];

const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// Add one article, one event and one album, whatever their slugs.
const decouverte = await navigateur.newPage();
for (const [liste, motif] of [['/blog/', /^\/(?!blog|agenda|gallery)[a-z0-9-]+\/$/], ['/agenda/', /^\/agenda\/\d{4}-[a-z0-9-]+\/$/], ['/gallery/', /^\/gallery\/[a-z0-9-]+\/$/]]) {
  await decouverte.goto(BASE + liste);
  const hrefs = await decouverte.$$eval('main a[href]', (as) => as.map((a) => a.getAttribute('href')));
  const trouve = hrefs.find((h) => motif.test(h));
  if (trouve) PAGES.push(trouve);
}

let graves = 0;
for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  const page = await navigateur.newPage({ viewport });
  for (const chemin of PAGES) {
    await page.goto(BASE + chemin, { waitUntil: 'networkidle' });
    await page.addScriptTag({ content: axe });
    const { violations } = await page.evaluate(() =>
      window.axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }),
    );
    for (const v of violations) {
      const grave = v.impact === 'serious' || v.impact === 'critical';
      if (grave) graves++;
      console.log(`${grave ? '✗' : '·'} [${viewport.width}px] ${chemin} — ${v.impact} ${v.id} (${v.nodes.length}) ${v.help}`);
    }
  }
}
await navigateur.close();
if (graves) {
  console.error(`✗ ${graves} violation(s) sérieuse(s) ou critique(s).`);
  process.exit(1);
}
console.log(`✓ Accessibilité : 0 violation sérieuse ou critique sur ${PAGES.length} pages × 2 formats.`);
