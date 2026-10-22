// End-to-end check of the "Effectifs" board against a mocked GitHub API:
// what exactly gets committed for a move, an addition and a deletion, and
// that a concurrent change is refused instead of overwritten.
// Usage: serve dist/ on PORT (default 4321), then: node scripts/check-effectifs.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = `http://localhost:${process.env.PORT ?? 4321}`;
const DOSSIER = 'src/content/musiciens';
const fichiers = readdirSync(DOSSIER).filter((n) => n.endsWith('.json'));
const entrees = fichiers.map((n) => ({ name: n, object: { text: readFileSync(`${DOSSIER}/${n}`, 'utf8') } }));

let tete = 'tete-1';
let modifieAilleurs = null;
const commits = [];

const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 860 } });
await contexte.addInitScript(() => localStorage.setItem('sveltia-cms.user', JSON.stringify({ token: 'jeton-test' })));
await contexte.route('https://api.github.com/graphql', async (route) => {
  const { query, variables } = route.request().postDataJSON();
  if (query.startsWith('mutation')) {
    commits.push(variables.i);
    tete = `tete-${commits.length + 1}`;
    return route.fulfill({ json: { data: { createCommitOnBranch: { commit: { oid: tete } } } } });
  }
  const liste = entrees.map((e) => (e.name === modifieAilleurs ? { ...e, object: { text: e.object.text.replace('"actif"', '"photo": "x.jpg", "actif"') } } : e));
  return route.fulfill({ json: { data: { repository: { ref: { target: { oid: tete } }, object: { entries: liste } } } } });
});

const page = await contexte.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(e.message));
await page.goto(`${BASE}/admin/effectifs/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.musicien');

// Pick two active musicians of formation A, in different sections.
const a = await page.locator('.musicien').nth(0).getAttribute('aria-label');
const nomA = a.split(',')[0];
const b = await page.locator('.musicien').last().getAttribute('aria-label');
const nomB = b.split(',')[0];

// 1. Move the first one to the next section (keyboard).
await page.locator('.musicien').nth(0).focus();
await page.keyboard.press('Alt+ArrowRight');
// 2. Quick-add a new musician.
const champ = page.locator('.ajout input').first();
await champ.fill('Test Exemple');
await champ.press('Enter');
// 3. Retire the last one, then delete them for good from the side panel.
await page.locator('.musicien', { hasText: nomB.split(' ').pop() }).last().focus();
await page.keyboard.press('Delete');
await page.click('#btn-anciens');
const ancien = page.locator('.ancien', { hasText: nomB.split(' ').pop() });
await ancien.getByRole('button', { name: /Supprimer/ }).click();
await ancien.getByRole('button', { name: /Confirmer|Supprimer/ }).click();

assert.equal(await page.locator('#detail li').count(), 3, 'trois actions listées avant enregistrement');
await page.keyboard.press('Control+s');
await page.waitForFunction(() => document.getElementById('barre-enregistrer').hidden);

assert.equal(commits.length, 1, 'un seul commit');
const c = commits[0];
assert.equal(c.expectedHeadOid, 'tete-1', 'le commit vérifie la version de la branche');
assert.match(c.message.headline, /^content: effectifs — 1 déplacement, 1 ajout, 1 suppression$/);
assert.equal(c.fileChanges.additions.length, 2, 'deux fichiers écrits (déplacé + nouveau), aucun renumérotage parasite');
assert.equal(c.fileChanges.deletions.length, 1, 'un fichier supprimé');
const ecrits = Object.fromEntries(c.fileChanges.additions.map((x) => [x.path, JSON.parse(Buffer.from(x.contents, 'base64').toString('utf8'))]));
assert.ok(ecrits[`${DOSSIER}/exemple-test.json`], 'nouveau fichier nommé nom-prénom');
assert.deepEqual(Object.keys(ecrits[`${DOSSIER}/exemple-test.json`]), ['prenom', 'nom', 'ensemble', 'pupitre', 'actif']);
const deplace = Object.values(ecrits).find((x) => `${x.prenom} ${x.nom}` === nomA);
const avant = entrees.map((e) => JSON.parse(e.object.text)).find((x) => `${x.prenom} ${x.nom}` === nomA);
assert.ok(deplace, `${nomA} est enregistré`);
assert.notEqual(deplace.pupitre, avant.pupitre, `${nomA} a changé de pupitre`);

// 4. A concurrent edit of a file we touch must be refused, not overwritten.
await page.locator('.musicien').nth(0).focus();
await page.keyboard.press('Alt+ArrowRight');
const touche = await page.evaluate(() => document.querySelector('#detail li')?.textContent);
modifieAilleurs = fichiers.find((n) => {
  const d = JSON.parse(readFileSync(`${DOSSIER}/${n}`, 'utf8'));
  return touche && touche.startsWith(`${d.prenom} ${d.nom}`);
});
await page.click('#btn-enregistrer');
await page.waitForFunction(() => /Échec/.test(document.getElementById('annonce').textContent));
assert.equal(commits.length, 1, 'aucun commit en cas de conflit');

assert.deepEqual(erreurs, [], 'aucune erreur JavaScript');
await navigateur.close();
console.log('✓ Effectifs : déplacement, ajout, suppression et conflit vérifiés (API GitHub simulée).');
