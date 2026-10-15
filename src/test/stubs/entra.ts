import { createHash } from 'node:crypto';
import http from 'node:http';
import { AddressInfo } from 'node:net';

import { JWTPayload, SignJWT, exportJWK, generateKeyPair } from 'jose';

/**
 * A stand-in Microsoft Entra tenant on an ephemeral port, so sign in runs for real in
 * tests: the app's own requests for the discovery document, the signing keys and the
 * token all reach it over HTTP rather than being mocked away. Its ID tokens are really
 * signed, with a key pair made for each run, so the app's signature check runs too.
 *
 * The authorize step is the one part a test does not visit, because Entra's own pages are
 * there. Instead the test reads `state` and `nonce` off the redirect and comes back to
 * /auth/callback with a code that carries who signed in — `codeFor(claims, nonce)` — which
 * the token endpoint turns into the ID token Entra would have issued.
 */

export const CLIENT_ID = 'test-client';
const KID = 'stub-key-1';

export interface StubClaims {
  oid: string;
  name?: string;
  email?: string;
  emails?: string[];
}

export const ADA: StubClaims = {
  oid: '11111111-2222-3333-4444-555555555555',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
};

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

/** What a token must not be, one way at a time, for the tests that check it is refused. */
export interface TokenOverrides {
  key?: KeyPair['privateKey'] | Uint8Array;
  alg?: string;
  iss?: string;
  aud?: string;
  exp?: string | number;
}

export interface StubEntra {
  issuer: string;
  authorizeEndpoint: string;
  endSessionEndpoint: string;
  /** Signs a token as this tenant would, for the given sign in. */
  idToken(claims: StubClaims, nonce: string, overrides?: TokenOverrides): Promise<string>;
  /** Replaces what the token endpoint answers with, until `reset()`. */
  answerTokenRequestsWith(issue: (claims: StubClaims, nonce: string) => Promise<string> | string): void;
  /** Makes the token endpoint fail, as an unreachable or unhappy tenant would. */
  failTokenRequests(status: number): void;
  /** Every user saved through the backend's POST /session, by oid. */
  savedUsers: Map<string, { id: number; email: string; name: string }>;
  /** Makes the backend refuse to save users, as an unreachable or unhappy one would. */
  failUserSaves(status: number): void;
  reset(): void;
  close(): Promise<void>;
}

/** The code a test brings back to /auth/callback; with a challenge, its verifier is required. */
export function codeFor(claims: StubClaims, nonce: string, codeChallenge?: string): string {
  return Buffer.from(JSON.stringify({ claims, nonce, codeChallenge })).toString('base64url');
}

/**
 * Starts the stub and points the app's Entra settings at it. The settings are read on
 * each use, so this works whether or not the app has already been loaded.
 */
export async function startStubEntra(): Promise<StubEntra> {
  const keyPair = await generateKeyPair('RS256');
  let issue: ((claims: StubClaims, nonce: string) => Promise<string> | string) | undefined;
  let failWith: number | undefined;
  let failSavesWith: number | undefined;
  const savedUsers: StubEntra['savedUsers'] = new Map();

  const server = http.createServer((req, res) => {
    void handle(req, res).catch(() => res.writeHead(500).end());
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/tenant`;
  const issuer = `${base}/v2.0`;

  const stub: StubEntra = {
    issuer,
    authorizeEndpoint: `${base}/oauth2/v2.0/authorize`,
    endSessionEndpoint: `${base}/oauth2/v2.0/logout`,
    idToken: (claims, nonce, overrides = {}) =>
      new SignJWT({ ...claims, nonce } as JWTPayload)
        .setProtectedHeader({ alg: overrides.alg ?? 'RS256', kid: KID })
        .setIssuer(overrides.iss ?? issuer)
        .setAudience(overrides.aud ?? CLIENT_ID)
        .setIssuedAt()
        .setExpirationTime(overrides.exp ?? '1h')
        .sign(overrides.key ?? keyPair.privateKey),
    answerTokenRequestsWith: answer => (issue = answer),
    failTokenRequests: status => (failWith = status),
    savedUsers,
    failUserSaves: status => (failSavesWith = status),
    reset: () => {
      issue = undefined;
      failWith = undefined;
      failSavesWith = undefined;
    },
    close: () =>
      new Promise<void>(resolve => {
        // fetch keeps its connections alive, and close() alone would wait for them.
        server.closeAllConnections();
        server.close(() => resolve());
        restoreApiUrl();
      }),
  };

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.url === '/tenant/v2.0/.well-known/openid-configuration') {
      return json(200, {
        issuer,
        jwks_uri: `${base}/discovery/v2.0/keys`,
        end_session_endpoint: stub.endSessionEndpoint,
      });
    }
    if (req.url === '/tenant/discovery/v2.0/keys') {
      const jwk = await exportJWK(keyPair.publicKey);
      return json(200, { keys: [{ ...jwk, kid: KID, use: 'sig', alg: 'RS256' }] });
    }
    if (req.url === '/tenant/oauth2/v2.0/token' && req.method === 'POST') {
      if (failWith) {
        return json(failWith, { error: 'temporarily_unavailable', error_description: 'Stub told to fail' });
      }
      const form = new URLSearchParams(await bodyOf(req));
      const { claims, nonce, codeChallenge } = JSON.parse(
        Buffer.from(form.get('code') ?? '', 'base64url').toString() || '{}'
      );
      if (!claims) {
        return json(400, { error: 'invalid_grant', error_description: 'Unknown code' });
      }
      const verifier = form.get('code_verifier') ?? '';
      if (codeChallenge && createHash('sha256').update(verifier).digest('base64url') !== codeChallenge) {
        return json(400, { error: 'invalid_grant', error_description: 'The code_verifier does not match' });
      }
      const idToken = issue ? await issue(claims, nonce) : await stub.idToken(claims, nonce);
      return json(200, { id_token: idToken, expires_in: 3600 });
    }
    if (req.url === '/backend/session' && req.method === 'POST') {
      if (failSavesWith) {
        return json(failSavesWith, { message: 'Stub told to fail' });
      }
      const { objectId, email, name } = JSON.parse(await bodyOf(req));
      const user = { id: savedUsers.get(objectId)?.id ?? savedUsers.size + 1, email, name };
      savedUsers.set(objectId, user);
      const now = new Date().toISOString();
      const userReference = `user${String(user.id).padStart(3, '0')}`;
      return json(200, {
        ...user,
        userReference,
        entraObjectId: objectId,
        status: 'ACTIVE',
        createdAt: now,
        lastLoginAt: now,
      });
    }
    res.writeHead(404).end();
  }

  process.env.ENTRA_CLIENT_ID = CLIENT_ID;
  process.env.ENTRA_CLIENT_SECRET = 'test-secret';
  process.env.ENTRA_AUTHORIZE_ENDPOINT = stub.authorizeEndpoint;
  process.env.ENTRA_TOKEN_ENDPOINT = `${base}/oauth2/v2.0/token`;
  process.env.ENTRA_REDIRECT_URI = 'http://localhost/auth/callback';
  process.env.ENTRA_POST_LOGOUT_REDIRECT_URI = 'http://localhost/';

  // The stub also stands in for the backend's user endpoint, which reads API_URL on each call.
  const savedApiUrl = process.env.API_URL;
  process.env.API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/backend`;
  function restoreApiUrl(): void {
    if (savedApiUrl === undefined) {
      delete process.env.API_URL;
    } else {
      process.env.API_URL = savedApiUrl;
    }
  }

  return stub;
}

function bodyOf(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
