// Checks that public/admin/config.yml (Sveltia CMS) and src/lib/schemas.ts (Zod)
// describe the same fields and the same closed lists. Run: npm run check:config
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { z } from 'astro/zod';
import { schemas } from '../src/lib/schemas.ts';
import Ajv from 'ajv';

const config = load(readFileSync('public/admin/config.yml', 'utf8'));

// 1. The file must follow Sveltia's own JSON schema (catches typos in options).
const schemaCms = JSON.parse(readFileSync('node_modules/@sveltia/cms/schema/sveltia-cms.json', 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
if (!ajv.validate(schemaCms, config)) {
  const details = ajv.errors
    .filter((e) => e.keyword === 'additionalProperties' || e.keyword === 'enum' || e.keyword === 'required')
    .map((e) => `${e.instancePath || '/'} ${e.message} ${JSON.stringify(e.params)}`);
  console.error(`✗ config.yml ne respecte pas le schéma de Sveltia CMS :\n  - ${[...new Set(details)].slice(0, 20).join('\n  - ')}`);
  process.exit(1);
}

// 2. Fields and closed lists must match the Zod schemas.
const fakeImage = () => z.string();

// CMS entry → schema name. `body` in the CMS is the Markdown body, not a front matter field.
const correspondances = {
  articles: 'articles',
  evenements: 'evenements',
  musiciens: 'musiciens',
  directeurs: 'directeurs',
  comite: 'comite',
  albums: 'albums',
  partenaires: 'partenaires',
  presse: 'presse',
  'pages/accueil': 'accueil',
  'pages/presentation': 'presentation',
  'pages/partenaires': 'page_partenaires',
  'pages/presse': 'page_presse',
  'pages/confidentialite': 'legal',
  'pages/conditions': 'legal',
  'reglages/reglages': 'reglages',
  'reglages/acces': 'acces',
};

const erreurs = [];

function forme(schema) {
  let s = schema;
  while (s && !s.shape) s = s.def?.innerType ?? s.def?.in ?? s.def?.schema ?? s.def?.out;
  return s?.shape;
}

function valeursEnum(schema) {
  let s = schema;
  for (let i = 0; i < 6 && s; i++) {
    if (s.def?.type === 'enum') return Object.values(s.def.entries);
    if (s.def?.type === 'array') s = s.def.element;
    else s = s.def?.innerType ?? s.def?.in;
  }
  return null;
}

function comparer(chemin, champsCms, schema) {
  const shape = forme(schema);
  if (!shape) return erreurs.push(`${chemin} : schéma introuvable`);
  const cms = new Map(champsCms.filter((f) => f.name !== 'body').map((f) => [f.name, f]));
  for (const nom of Object.keys(shape)) if (!cms.has(nom)) erreurs.push(`${chemin} : champ « ${nom} » présent dans le schéma Zod mais absent de config.yml`);
  for (const nom of cms.keys()) if (!(nom in shape)) erreurs.push(`${chemin} : champ « ${nom} » présent dans config.yml mais absent du schéma Zod`);
  for (const [nom, champ] of cms) {
    if (!(nom in shape)) continue;
    if (champ.widget === 'select') {
      const attendues = valeursEnum(shape[nom]);
      const options = champ.options.map((o) => (typeof o === 'object' ? o.value : o));
      if (attendues && JSON.stringify(attendues) !== JSON.stringify(options)) {
        erreurs.push(`${chemin}.${nom} : options ${JSON.stringify(options)} ≠ schéma ${JSON.stringify(attendues)}`);
      }
    }
    if (champ.widget === 'object' && champ.fields) comparer(`${chemin}.${nom}`, champ.fields, shape[nom]);
    if (champ.widget === 'list' && champ.fields) {
      let el = shape[nom];
      while (el && el.def?.type !== 'array') el = el.def?.innerType ?? el.def?.in;
      comparer(`${chemin}.${nom}[]`, champ.fields, el?.def?.element);
    }
  }
}

const vus = new Set();
for (const col of config.collections) {
  if (col.divider) continue;
  const entrees = col.files ? col.files.map((f) => [`${col.name}/${f.name}`, f.fields]) : [[col.name, col.fields]];
  for (const [cle, champs] of entrees) {
    const nomSchema = correspondances[cle];
    if (!nomSchema) {
      erreurs.push(`config.yml : « ${cle} » n'a pas de schéma correspondant (voir scripts/check-config-sync.mjs)`);
      continue;
    }
    vus.add(nomSchema);
    comparer(cle, champs, schemas[nomSchema](fakeImage));
  }
}
for (const nom of Object.keys(schemas)) if (!vus.has(nom)) erreurs.push(`Schéma « ${nom} » non éditable dans l'admin`);

if (erreurs.length) {
  console.error(`✗ config.yml et les schémas Zod divergent :\n  - ${erreurs.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ config.yml valide (schéma Sveltia) et concordant avec les schémas Zod (${vus.size} schémas vérifiés).`);
