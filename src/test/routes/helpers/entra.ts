import crypto from 'node:crypto';

import { expect } from 'chai';
import request from 'supertest';

import { StubClaims, StubEntra, codeFor, startStubEntra } from '../../stubs/entra';

export type Agent = ReturnType<typeof request.agent>;

let entra: StubEntra | undefined;

/**
 * A stub Entra tenant for the whole test file, started before its first test. Importing
 * this module is enough: every file that signs anyone in needs one.
 */
beforeAll(async () => {
  entra = await startStubEntra();
});

afterAll(async () => {
  await entra?.close();
  entra = undefined;
});

export function stubEntra(): StubEntra {
  expect(entra, 'the stub Entra tenant should have started').to.not.equal(undefined);
  return entra as StubEntra;
}

/** Who signs in as this address: an oid that stays the same for the same address. */
export function claimsFor(email: string, name = 'Ada Lovelace'): StubClaims {
  const hex = crypto.createHash('sha256').update(email).digest('hex');
  const oid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  return { oid, name, email };
}

/**
 * Signs the agent in the way a browser does: /sign-in sends it to Entra, and it comes back
 * to /auth/callback with the state it was given and a code standing for these claims.
 * Entra's own pages are the only part skipped. Returns the callback's response.
 */
export async function signInThroughEntra(agent: Agent, claims: StubClaims): Promise<request.Response> {
  stubEntra();
  const started = await agent.get('/sign-in').expect(302);
  const sentTo = new URL(started.headers.location);
  const state = sentTo.searchParams.get('state') as string;
  const nonce = sentTo.searchParams.get('nonce') as string;
  const challenge = sentTo.searchParams.get('code_challenge') as string;

  return agent.get(`/auth/callback?code=${codeFor(claims, nonce, challenge)}&state=${state}`);
}
