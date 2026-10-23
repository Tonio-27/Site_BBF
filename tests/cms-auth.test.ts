import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker, { creerSession, lireSession } from '../workers/cms-auth/index.js';

const env = {
  GITHUB_TOKEN: 'ghp_bbf',
  SESSION_SECRET: 'secret-de-test-assez-long-pour-hmac',
  ACCESS_TEAM_DOMAIN: 'bbf.cloudflareaccess.com',
  ACCESS_AUD: 'aud-bbf',
  ALLOWED_ORIGINS: 'https://brassbandfribourg.ch',
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
    appels.push({ url, init });
    if (url === 'https://api.github.com/user') return Response.json({ login: 'bbf-site', name: 'BBF', id: 1 });
    return Response.json({ data: { ok: true } });
  });
});
afterEach(() => { appels.length = 0; });

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
