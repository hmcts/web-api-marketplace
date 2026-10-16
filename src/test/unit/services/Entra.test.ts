import { generateKeyPair } from 'jose';

import { assertEntraConfigured } from '../../../main/modules/entra/config';
import {
  authorizeUrl,
  exchangeCodeForIdToken,
  isEntraPrompt,
  logoutUrl,
  newPkce,
  pkceChallenge,
  verifiedClaims,
} from '../../../main/services/Entra';
import { ADA, CLIENT_ID, StubEntra, TokenOverrides, codeFor, startStubEntra } from '../../stubs/entra';

let entra: StubEntra;

beforeAll(async () => {
  entra = await startStubEntra();
});

afterAll(() => entra.close());

afterEach(() => entra.reset());

describe('Entra', () => {
  describe('authorizeUrl', () => {
    test('the_browser_should_be_sent_for_a_code_and_never_a_token', () => {
      const sentTo = new URL(authorizeUrl('the-state', 'the-nonce', 'the-challenge'));

      expect(sentTo.origin + sentTo.pathname).toBe(entra.authorizeEndpoint);
      expect(sentTo.searchParams.get('response_type')).toBe('code');
      expect(sentTo.searchParams.get('client_id')).toBe(CLIENT_ID);
      expect(sentTo.searchParams.get('scope')).toBe('openid profile email');
      expect(sentTo.searchParams.get('state')).toBe('the-state');
      expect(sentTo.searchParams.get('nonce')).toBe('the-nonce');
      expect(sentTo.searchParams.has('prompt')).toBe(false);
    });

    test('the_pkce_challenge_should_go_to_entra_as_s256_and_the_verifier_should_not', () => {
      const pkce = newPkce();
      const sentTo = new URL(authorizeUrl('s', 'n', pkce.challenge));

      expect(sentTo.searchParams.get('code_challenge')).toBe(pkce.challenge);
      expect(sentTo.searchParams.get('code_challenge_method')).toBe('S256');
      expect(sentTo.toString()).not.toContain(pkce.verifier);
    });

    test('create_should_open_entra_on_its_create_account_form', () => {
      expect(new URL(authorizeUrl('s', 'n', 'c', 'create')).searchParams.get('prompt')).toBe('create');
    });

    test('only_the_prompts_we_use_should_be_passed_on', () => {
      expect(isEntraPrompt('create')).toBe(true);
      expect(isEntraPrompt('login')).toBe(true);
      expect(isEntraPrompt('none')).toBe(false);
      expect(isEntraPrompt(['create'])).toBe(false);
    });
  });

  describe('pkce', () => {
    test('the_verifier_should_be_43_url_safe_characters_and_the_challenge_its_sha256', () => {
      const pkce = newPkce();

      expect(pkce.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(pkce.challenge).toBe(pkceChallenge(pkce.verifier));
    });

    test('the_challenge_should_match_the_rfc_7636_example', () => {
      expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
        'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
      );
    });

    test('each_sign_in_should_get_its_own_verifier', () => {
      expect(newPkce().verifier).not.toBe(newPkce().verifier);
    });
  });

  describe('signing in', () => {
    test('a_code_exchanged_with_its_verifier_should_be_answered_with_a_token', async () => {
      const pkce = newPkce();

      await expect(exchangeCodeForIdToken(codeFor(ADA, 'n1', pkce.challenge), pkce.verifier)).resolves.toMatch(/\./);
    });

    test('a_code_exchanged_with_the_wrong_verifier_should_be_refused', async () => {
      const pkce = newPkce();

      await expect(exchangeCodeForIdToken(codeFor(ADA, 'n1', pkce.challenge), newPkce().verifier)).rejects.toThrow(
        /400 invalid_grant/
      );
    });

    test('a_good_token_should_yield_the_oid_name_and_email', async () => {
      const pkce = newPkce();
      const idToken = await exchangeCodeForIdToken(codeFor(ADA, 'n1', pkce.challenge), pkce.verifier);

      await expect(verifiedClaims(idToken, 'n1')).resolves.toEqual({
        oid: ADA.oid,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      });
    });

    test('an_email_returned_as_an_array_should_still_be_read', async () => {
      const idToken = await entra.idToken({ oid: ADA.oid, emails: ['ada@example.net'] }, 'n1');

      expect((await verifiedClaims(idToken, 'n1')).email).toBe('ada@example.net');
    });

    test('a_failed_token_exchange_should_throw_with_entras_reason', async () => {
      entra.failTokenRequests(503);

      await expect(exchangeCodeForIdToken(codeFor(ADA, 'n1'), 'v')).rejects.toThrow(/503 temporarily_unavailable/);
    });
  });

  describe('a token that must not be believed', () => {
    const verifying = async (token: Promise<string> | string) => verifiedClaims(await token, 'n1');

    const tokenWith = (overrides: TokenOverrides) => entra.idToken(ADA, 'n1', overrides);

    test('signed_by_some_other_key', async () => {
      const forger = await generateKeyPair('RS256');
      await expect(verifying(tokenWith({ key: forger.privateKey }))).rejects.toThrow();
    });

    test('unsigned', async () => {
      const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      await expect(
        verifying(`${segment({ alg: 'none' })}.${segment({ ...ADA, iss: entra.issuer, aud: CLIENT_ID, nonce: 'n1' })}.`)
      ).rejects.toThrow();
    });

    test('signed_with_a_shared_secret_instead_of_the_tenant_key', async () => {
      // The HS256 key-confusion attack: sign with a secret and hope it is treated as a key.
      await expect(
        verifying(tokenWith({ alg: 'HS256', key: new TextEncoder().encode('x'.repeat(32)) }))
      ).rejects.toThrow();
    });

    test('issued_for_another_app', async () => {
      await expect(verifying(tokenWith({ aud: 'some-other-client' }))).rejects.toThrow();
    });

    test('issued_by_another_tenant', async () => {
      await expect(verifying(tokenWith({ iss: 'https://login.example/other-tenant/v2.0' }))).rejects.toThrow();
    });

    test('expired', async () => {
      await expect(verifying(tokenWith({ exp: Math.floor(Date.now() / 1000) - 3600 }))).rejects.toThrow();
    });

    test('from_a_different_sign_in', async () => {
      // A genuine token, but its nonce belongs to some other round trip: a replay.
      await expect(verifying(entra.idToken(ADA, 'from-an-earlier-sign-in'))).rejects.toThrow();
    });

    test('with_no_nonce_expected_at_all', async () => {
      await expect(verifiedClaims(await entra.idToken(ADA, 'n1'), undefined)).rejects.toThrow(/nonce/);
    });

    test('with_no_oid', async () => {
      await expect(verifiedClaims(await entra.idToken({ name: 'No One' } as never, 'n1'), 'n1')).rejects.toThrow(/oid/);
    });
  });

  describe('signing out', () => {
    test('should_go_to_the_tenants_sign_out_page_and_come_back_here', async () => {
      const sentTo = new URL(await logoutUrl());

      expect(sentTo.origin + sentTo.pathname).toBe(entra.endSessionEndpoint);
      expect(sentTo.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost/');
    });
  });

  describe('configuration', () => {
    test('a_missing_secret_should_name_itself_rather_than_fail_later', () => {
      const secret = process.env.ENTRA_CLIENT_SECRET;
      delete process.env.ENTRA_CLIENT_SECRET;
      try {
        expect(() => assertEntraConfigured()).toThrow(/ENTRA_CLIENT_SECRET/);
      } finally {
        process.env.ENTRA_CLIENT_SECRET = secret;
      }
    });

    test('a_deployed_environment_without_its_own_tenant_should_refuse_to_start', () => {
      // Tests run outside development, as a deployment does, so there is no sandbox to fall
      // back to: a setting left unset must be named rather than quietly defaulted.
      const clientId = process.env.ENTRA_CLIENT_ID;
      const tokenEndpoint = process.env.ENTRA_TOKEN_ENDPOINT;
      delete process.env.ENTRA_CLIENT_ID;
      delete process.env.ENTRA_TOKEN_ENDPOINT;
      try {
        expect(() => assertEntraConfigured()).toThrow(/ENTRA_CLIENT_ID, ENTRA_TOKEN_ENDPOINT are not set/);
      } finally {
        process.env.ENTRA_CLIENT_ID = clientId;
        process.env.ENTRA_TOKEN_ENDPOINT = tokenEndpoint;
      }
    });

    test('every_setting_present_should_start_without_complaint', () => {
      expect(() => assertEntraConfigured()).not.toThrow();
    });
  });
});
