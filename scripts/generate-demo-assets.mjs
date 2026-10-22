// Generates placeholder images for the beta (no real photos are committed yet).
// Usage: node scripts/generate-demo-assets.mjs — idempotent, overwrites files.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = 'src/assets/uploads';
await mkdir(OUT, { recursive: true });

const PALETTES = [
  ['#1a0a0c', '#7a0a14', '#e30613'],
  ['#0d0d0d', '#3b2a12', '#c9a227'],
  ['#0b0f1a', '#1e2f4f', '#e30613'],
  ['#120707', '#4a1a0f', '#d98c2b'],
  ['#0a0a0a', '#2a2a2a', '#e30613'],
  ['#100c05', '#5c4313', '#f0c75e'],
];

function svgPhoto(w, h, seed, label) {
  const [a, b, c] = PALETTES[seed % PALETTES.length];
  let cercles = '';
  for (let i = 0; i < 7; i++) {
    const x = ((seed * 97 + i * 211) % 100) / 100;
    const y = ((seed * 53 + i * 131) % 100) / 100;
    const r = 0.08 + (((seed + i) * 37) % 25) / 100;
    cercles += `<circle cx="${x * w}" cy="${y * h}" r="${r * w}" fill="${i % 2 ? c : b}" opacity="${0.08 + (i % 3) * 0.06}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
  <radialGradient id="l" cx="0.7" cy="0.3" r="0.8"><stop offset="0" stop-color="${c}" stop-opacity="0.35"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#l)"/>${cercles}
  ${label ? `<text x="${w / 2}" y="${h / 2}" font-family="sans-serif" font-size="${Math.round(w / 28)}" fill="#fff" fill-opacity="0.55" text-anchor="middle">${label}</text>` : ''}
  <text x="${w - w / 40}" y="${h - w / 40}" font-family="sans-serif" font-size="${Math.round(w / 60)}" fill="#fff" fill-opacity="0.4" text-anchor="end">Photo de démonstration</text></svg>`;
}

async function photo(nom, w, h, seed, label) {
  await sharp(Buffer.from(svgPhoto(w, h, seed, label))).jpeg({ quality: 78, mozjpeg: true }).toFile(`${OUT}/${nom}.jpg`);
}

await photo('accueil-hero', 2400, 1400, 0, '');
await photo('partage-defaut', 1200, 630, 1, 'Brass Band Fribourg');
await photo('presentation', 1600, 1000, 2, 'Le BBF sur scène');
await photo('presse-photo', 2400, 1600, 3, 'Photo de presse');
for (const [i, n] of ['concours', 'recrutement', 'concert-annuel', 'nomination', 'assemblee', 'camp'].entries()) {
  await photo(`article-${n}`, 1600, 1000, i + 2, n.replace('-', ' '));
}
for (const [i, n] of ['robin-bartholini', 'aurelien-darbellay'].entries()) {
  await photo(`directeur-${n}`, 800, 1000, i + 4, n.replace('-', ' '));
}
const albums = ['concert-annuel-2024', 'concours-suisse-2023', 'fete-cantonale-2024', 'camp-musical-2023', 'concert-eglise-2022'];
for (const [i, a] of albums.entries()) {
  for (let p = 1; p <= 8; p++) {
    await photo(`album-${a}-${String(p).padStart(2, '0')}`, 1600, p % 3 ? 1067 : 2000, i * 8 + p, `${a.replaceAll('-', ' ')} · ${p}`);
  }
}

const partenaires = [
  'Banque Cantonale', 'Ville de Fribourg', 'État de Fribourg', 'Loterie Romande', 'Garage du Lac',
  'Imprimerie Sarine', 'Boulangerie du Bourg', 'Musique Instruments SA', 'Brasserie Fribourgeoise', 'Assurances Gruyère',
];
for (const [i, nom] of partenaires.entries()) {
  const slug = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="10 50 320 100">
<rect x="20" y="70" width="60" height="60" rx="${i % 2 ? 30 : 6}" fill="#${['e30613', '1d1d1b', '6b6b6b', 'c9a227'][i % 4]}"/>
<text x="95" y="112" font-family="sans-serif" font-weight="700" font-size="${nom.length > 18 ? 18 : 22}" fill="#1d1d1b">${nom}</text></svg>`;
  await writeFile(`${OUT}/logo-${slug}.svg`, svg);
}
console.log('Images de démonstration générées dans', OUT);
