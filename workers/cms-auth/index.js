// Cloudflare Worker between the editors and GitHub.
//
// The BBF owns ONE GitHub account. Editors never get a GitHub account: they
// sign in with their e-mail address (Cloudflare Access sends a one-time code),
// then this Worker
//   1. /auth        — hands Sveltia CMS a short-lived session for that e-mail
//                     (same popup protocol as sveltia-cms-auth);
//   2. /api/v3/*    — relays GitHub REST calls with the BBF token, which never
//      /api/graphql   leaves the Worker; every commit gets "Modifié par : <e-mail>".
// Anything else redirects to github.com (the CMS's "view on GitHub" links).
//
// Secrets: GITHUB_TOKEN (fine-grained token of the BBF account, this
// repository only), SESSION_SECRET (random, 32+ characters).
// Variables: ACCESS_TEAM_DOMAIN (e.g. bbf.cloudflareaccess.com), ACCESS_AUD
// (Application Audience tag), ALLOWED_ORIGINS (comma-separated), SESSION_HOURS.

const GITHUB_API = 'https://api.github.com';
const enc = new TextEncoder();

// ------------------------------------------------------------------ helpers
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
const origins = (env) => (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);

function cors(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !origins(env).includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, If-None-Match, X-GitHub-Api-Version',
    'Access-Control-Expose-Headers': 'ETag, Link, X-RateLimit-Remaining, X-RateLimit-Reset',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// ------------------------------------------------------------------ sessions
const hmacKey = (secret) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function creerSession(email, env, maintenant = Date.now()) {
  const heures = Number(env.SESSION_HOURS ?? 12);
  const charge = b64url(enc.encode(JSON.stringify({ email, exp: Math.floor(maintenant / 1000) + heures * 3600 })));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET), enc.encode(charge));
  return `bbf.${charge}.${b64url(signature)}`;
}

export async function lireSession(jeton, env, maintenant = Date.now()) {
  const [prefixe, charge, signature] = (jeton ?? '').split('.');
  if (prefixe !== 'bbf' || !charge || !signature || !env.SESSION_SECRET) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_SECRET), unb64url(signature), enc.encode(charge));
    if (!ok) return null;
    const session = JSON.parse(new TextDecoder().decode(unb64url(charge)));
    return session.exp > maintenant / 1000 && typeof session.email === 'string' ? session : null;
  } catch {
    return null;
  }
}

const jetonDe = (request) => (request.headers.get('Authorization') ?? '').replace(/^(token|bearer)\s+/i, '').trim();

// ------------------------------------------------------------------ Cloudflare Access
let certificats = { domaine: null, cles: null, lu: 0 };

async function clesAccess(env) {
  if (certificats.domaine === env.ACCESS_TEAM_DOMAIN && Date.now() - certificats.lu < 3600_000) return certificats.cles;
  const r = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`certs ${r.status}`);
  certificats = { domaine: env.ACCESS_TEAM_DOMAIN, cles: (await r.json()).keys, lu: Date.now() };
  return certificats.cles;
}

// Returns the verified e-mail of the Access JWT, or null.
export async function emailAccess(request, env, maintenant = Date.now()) {
  const cookie = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('Cookie') ?? '')?.[1];
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') ?? cookie;
  if (!jwt || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  try {
    const [h, p, s] = jwt.split('.');
    const entete = JSON.parse(new TextDecoder().decode(unb64url(h)));
    const charge = JSON.parse(new TextDecoder().decode(unb64url(p)));
    const jwk = (await clesAccess(env)).find((k) => k.kid === entete.kid);
    if (entete.alg !== 'RS256' || !jwk) return null;
    const cle = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cle, unb64url(s), enc.encode(`${h}.${p}`)))) return null;
    const aud = [].concat(charge.aud);
    if (!aud.includes(env.ACCESS_AUD) || charge.iss !== `https://${env.ACCESS_TEAM_DOMAIN}` || !(charge.exp > maintenant / 1000)) return null;
    return typeof charge.email === 'string' ? charge.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ /auth popup
function popup(env, message) {
  const autorises = JSON.stringify(origins(env));
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Connexion</title><body><p>Connexion en cours…</p><script>
(() => {
  const autorises = ${autorises};
  const message = ${JSON.stringify(message)};
  window.addEventListener('message', ({ data, origin }) => {
    if (data === 'authorizing:github' && autorises.includes(origin)) window.opener?.postMessage(message, origin);
  });
  window.opener?.postMessage('authorizing:github', '*');
})();
</script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function auth(request, env) {
  const email = await emailAccess(request, env);
  if (!email) return popup(env, `authorization:github:error:${JSON.stringify({ message: 'Accès refusé : adresse non autorisée.' })}`);
  const token = await creerSession(email, env);
  return popup(env, `authorization:github:success:${JSON.stringify({ provider: 'github', token })}`);
}

// ------------------------------------------------------------------ GitHub relay
// Adds the editor's e-mail to every commit message (CMS and Effectifs board).
function signer(valeur, email) {
  if (Array.isArray(valeur)) return valeur.forEach((v) => signer(v, email));
  if (!valeur || typeof valeur !== 'object') return;
  if (valeur.fileChanges && valeur.message && typeof valeur.message.headline === 'string') {
    const corps = valeur.message.body ? `${valeur.message.body}\n\n` : '';
    valeur.message.body = `${corps}Modifié par : ${email}`;
  }
  Object.values(valeur).forEach((v) => signer(v, email));
}

async function relayer(request, env, chemin, session) {
  const entetes = new Headers({
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'bbf-cms-auth',
    Accept: request.headers.get('Accept') ?? 'application/vnd.github+json',
  });
  for (const nom of ['Content-Type', 'If-None-Match', 'X-GitHub-Api-Version']) {
    const v = request.headers.get(nom);
    if (v) entetes.set(nom, v);
  }
  let corps = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
  if (chemin === '/graphql' && corps) {
    try {
      const requete = JSON.parse(corps);
      if (/createCommitOnBranch/.test(requete.query ?? '')) signer(requete.variables, session.email);
      corps = JSON.stringify(requete);
    } catch {
      return json({ message: 'Requête invalide' }, 400);
    }
  }
  const url = new URL(request.url);
  const reponse = await fetch(`${GITHUB_API}${chemin}${url.search}`, { method: request.method, headers: entetes, body: corps });
  const sortie = new Headers();
  for (const nom of ['Content-Type', 'ETag', 'Link', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']) {
    const v = reponse.headers.get(nom);
    if (v) sortie.set(nom, v);
  }
  // The CMS shows the person who is signed in, not the shared BBF account.
  if (chemin === '/user' && reponse.ok) {
    const utilisateur = await reponse.json();
    return json({ ...utilisateur, name: session.email, email: session.email }, 200, Object.fromEntries(sortie));
  }
  return new Response(reponse.body, { status: reponse.status, headers: sortie });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const entetesCors = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: entetesCors });

    let reponse;
    if (url.pathname === '/auth') {
      reponse = await auth(request, env);
    } else if (url.pathname === '/api/graphql' || url.pathname.startsWith('/api/v3/')) {
      const session = await lireSession(jetonDe(request), env);
      reponse = session
        ? await relayer(request, env, url.pathname === '/api/graphql' ? '/graphql' : url.pathname.slice('/api/v3'.length), session)
        : json({ message: 'Bad credentials' }, 401);
    } else {
      reponse = Response.redirect(`https://github.com${url.pathname}${url.search}`, 302);
    }
    const final = new Response(reponse.body, reponse);
    for (const [k, v] of Object.entries(entetesCors)) final.headers.set(k, v);
    return final;
  },
};
