import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import worker, { creerSession, lireSession, viderCache } from '../workers/cms-auth/index.js';
import { schemas } from '../src/lib/schemas.ts';

const env = {
  GITHUB_TOKEN: 'ghp_bbf',
  SESSION_SECRET: 'secret-de-test-assez-long-pour-hmac',
  ACCESS_TEAM_DOMAIN: 'bbf.cloudflareaccess.com',
  ACCESS_AUD: 'aud-bbf',
  ALLOWED_ORIGINS: 'https://brassbandfribourg.ch',
  REPO: 'brassbandfribourg/site-web',
  BRANCH: 'main',
  ACCESS_FILE: 'acces/redacteurs.json',
  EDITOR_PATHS: 'src/content/, src/assets/uploads/, public/documents/',
  RESCUE_ADMINS: 'secours@brassbandfribourg.ch',
};
// The access list as stored in the repository (edited in the CMS).
let listeAcces = {
  personnes: [
    { email: 'it@brassbandfribourg.ch', nom: 'IT', role: 'administrateur' },
    { email: 'ensemble-a@brassbandfribourg.ch', nom: 'Formation A', role: 'redacteur' },
    { email: 'presse@brassbandfribourg.ch', nom: 'Presse', role: 'redacteur' },
  ],
};
const W = 'https://bbf-cms-auth.example.workers.dev';
const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as ArrayBuffer).toString('base64url');

let cles: CryptoKeyPair;
let jwk: JsonWebKey;
async function jwt(charge: Record<string, unknown>, kid = 'k1') {
  const h = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', kid })));
  const p = b64url(Buffer.from(JSON.stringify(charge)));
  const s = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cles.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(s)}`;
}
const valide = () => ({ aud: ['aud-bbf'], iss: 'https://bbf.cloudflareaccess.com', email: 'Ensemble-A@brassbandfribourg.ch', exp: Date.now() / 1000 + 600 });

// Mocked network: Access certificates + GitHub API (records what it receives).
const appels: { url: string; init: RequestInit }[] = [];
beforeAll(async () => {
  cles = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  jwk = { ...(await crypto.subtle.exportKey('jwk', cles.publicKey)), kid: 'k1' } as JsonWebKey;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/cdn-cgi/access/certs')) return Response.json({ keys: [jwk] });
    if (url.includes('/contents/acces/redacteurs.json')) return Response.json(listeAcces);
    appels.push({ url, init });
    if (url === 'https://api.github.com/user') return Response.json({ login: 'bbf-site', name: 'BBF', id: 1 });
    return Response.json({ data: { ok: true } });
  });
});
afterEach(() => { appels.length = 0; viderCache(); });

const popupMessage = async (r: Response) => /const message = (".*?");/.exec(await r.text())![1];

describe('connexion par e-mail (Cloudflare Access)', () => {
  it('donne une session à une adresse vérifiée par Access', async () => {
    const r = await worker.fetch(new Request(`${W}/auth?provider=github`, { headers: { 'Cf-Access-Jwt-Assertion': await jwt(valide()) } }), env);
    const message = JSON.parse(await popupMessage(r)) as string;
    expect(message).toMatch(/^authorization:github:success:/);
    const { token } = JSON.parse(message.replace('authorization:github:success:', ''));
    expect(token).not.toContain('ghp_');
    expect((await lireSession(token, env))?.email).toBe('ensemble-a@brassbandfribourg.ch');
  });

  it('refuse sans Access, avec une mauvaise audience, un jeton expiré ou falsifié', async () => {
    const cas = [
      undefined,
      await jwt({ ...valide(), aud: ['autre'] }),
      await jwt({ ...valide(), exp: Date.now() / 1000 - 1 }),
      (await jwt(valide())).replace(/\.[^.]+$/, '.AAAA'),
    ];
    for (const j of cas) {
      const r = await worker.fetch(new Request(`${W}/auth`, { headers: j ? { 'Cf-Access-Jwt-Assertion': j } : {} }), env);
      expect(await popupMessage(r)).toContain('authorization:github:error:');
    }
  });

  it('ne répond au CMS que sur une origine autorisée', async () => {
    const r = await worker.fetch(new Request(`${W}/auth`, { headers: { 'Cf-Access-Jwt-Assertion': await jwt(valide()) } }), env);
    expect(await r.text()).toContain('["https://brassbandfribourg.ch"]');
  });
});

describe('sessions', () => {
  it('expirent et ne se falsifient pas', async () => {
    const s = await creerSession('a@b.ch', env, Date.now() - 13 * 3600_000);
    expect(await lireSession(s, env)).toBeNull();
    const t = await creerSession('a@b.ch', env);
    expect(await lireSession(t, { ...env, SESSION_SECRET: 'autre-secret-de-test-assez-long' })).toBeNull();
    expect(await lireSession('ghp_quelquechose', env)).toBeNull();
  });
});

describe('relais GitHub', () => {
  it('refuse sans session et ne contacte pas GitHub', async () => {
    const r = await worker.fetch(new Request(`${W}/api/v3/user`, { headers: { Authorization: 'token faux' } }), env);
    expect(r.status).toBe(401);
    expect(appels).toHaveLength(0);
  });

  it('remplace la session par le jeton du BBF et montre la personne connectée', async () => {
    const s = await creerSession('presse@brassbandfribourg.ch', env);
    const r = await worker.fetch(new Request(`${W}/api/v3/user`, { headers: { Authorization: `token ${s}`, Origin: 'https://brassbandfribourg.ch' } }), env);
    expect(appels[0].url).toBe('https://api.github.com/user');
    expect(new Headers(appels[0].init.headers).get('Authorization')).toBe('Bearer ghp_bbf');
    expect((await r.json()).name).toBe('presse@brassbandfribourg.ch');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://brassbandfribourg.ch');
  });

  it('signe chaque enregistrement avec l’adresse de la personne', async () => {
    const s = await creerSession('presse@brassbandfribourg.ch', env);
    const corps = {
      query: 'mutation($i:CreateCommitOnBranchInput!){createCommitOnBranch(input:$i){commit{oid}}}',
      variables: { i: { message: { headline: 'content: modification' }, fileChanges: { additions: [] } } },
    };
    await worker.fetch(new Request(`${W}/api/graphql`, { method: 'POST', body: JSON.stringify(corps), headers: { Authorization: `Bearer ${s}` } }), env);
    expect(appels[0].url).toBe('https://api.github.com/graphql');
    const envoye = JSON.parse(appels[0].init.body as string);
    expect(envoye.variables.i.message).toEqual({ headline: 'content: modification', body: 'Modifié par : presse@brassbandfribourg.ch' });
  });

  it('n’ouvre pas le CORS aux autres sites', async () => {
    const r = await worker.fetch(new Request(`${W}/api/graphql`, { method: 'OPTIONS', headers: { Origin: 'https://exemple.com' } }), env);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('liste des accès (Réglages → Accès à l’édition)', () => {
  const auth = async (email: string) =>
    popupMessage(await worker.fetch(new Request(`${W}/auth`, { headers: { 'Cf-Access-Jwt-Assertion': await jwt({ ...valide(), email }) } }), env));
  const commit = async (email: string, chemins: string[], query = 'mutation($i:CreateCommitOnBranchInput!){createCommitOnBranch(input:$i){commit{oid}}}') => {
    const s = await creerSession(email, env);
    const corps = { query, variables: { i: { message: { headline: 'x' }, fileChanges: { additions: chemins.map((path) => ({ path, contents: '' })) } } } };
    const r = await worker.fetch(new Request(`${W}/api/graphql`, { method: 'POST', body: JSON.stringify(corps), headers: { Authorization: `Bearer ${s}` } }), env);
    return (await r.json()) as { errors?: { message: string }[] };
  };

  it('le fichier du dépôt respecte le schéma', () => {
    expect(schemas.acces().safeParse(JSON.parse(readFileSync('acces/redacteurs.json', 'utf8'))).success).toBe(true);
  });

  it('refuse une adresse absente de la liste, accepte l’administrateur de secours', async () => {
    expect(await auth('inconnu@exemple.ch')).toContain('authorization:github:error:');
    expect(await auth('secours@brassbandfribourg.ch')).toContain('authorization:github:success:');
  });

  it('coupe une session ouverte dès que la personne est retirée', async () => {
    const s = await creerSession('presse@brassbandfribourg.ch', env);
    const appel = () => worker.fetch(new Request(`${W}/api/v3/user`, { headers: { Authorization: `token ${s}` } }), env);
    expect((await appel()).status).toBe(200);
    const avant = listeAcces;
    listeAcces = { personnes: avant.personnes.filter((p) => p.email !== 'presse@brassbandfribourg.ch') };
    viderCache();
    expect((await appel()).status).toBe(401);
    listeAcces = avant;
  });

  it('un rédacteur modifie le contenu, pas la liste ni le code du site', async () => {
    expect((await commit('presse@brassbandfribourg.ch', ['src/content/articles/a.md', 'src/assets/uploads/p.webp'])).errors).toBeUndefined();
    expect((await commit('presse@brassbandfribourg.ch', ['acces/redacteurs.json'])).errors?.[0].message).toMatch(/liste des accès/);
    expect((await commit('presse@brassbandfribourg.ch', ['src/pages/index.astro'])).errors?.[0].message).toMatch(/administrateurs/);
    expect((await commit('presse@brassbandfribourg.ch', ['src/content/../pages/x.astro'])).errors).toBeDefined();
  });

  it('un rédacteur ne peut pas déguiser une autre opération', async () => {
    const autres = [
      'mutation{updateRef(input:{refId:"x",oid:"y",force:true}){clientMutationId}}',
      '# commentaire\nmutation{deleteRef(input:{refId:"x"}){clientMutationId}}',
      'mutation($i:CreateCommitOnBranchInput!){a:createCommitOnBranch(input:$i){commit{oid}} b:mergeBranch(input:{}){clientMutationId}}',
    ];
    for (const q of autres) expect((await commit('presse@brassbandfribourg.ch', [], q)).errors?.[0].message).toMatch(/administrateurs/);
    const s = await creerSession('presse@brassbandfribourg.ch', env);
    const r = await worker.fetch(new Request(`${W}/api/v3/repos/brassbandfribourg/site-web/git/refs/heads/main`, { method: 'PATCH', body: '{}', headers: { Authorization: `token ${s}` } }), env);
    expect(r.status).toBe(403);
  });

  it('un administrateur peut modifier la liste', async () => {
    expect((await commit('it@brassbandfribourg.ch', ['acces/redacteurs.json'])).errors).toBeUndefined();
  });
});
