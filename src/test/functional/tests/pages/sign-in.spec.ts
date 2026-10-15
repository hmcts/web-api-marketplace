import { expect, test } from '../../fixtures';

test.describe('Sign in', () => {
  test(
    'sign_in_should_send_the_browser_to_entra_with_pkce_or_say_it_is_unavailable',
    { tag: '@smoke' },
    async ({ request }) => {
      const response = await request.get('/sign-in', { maxRedirects: 0 });
      const location = response.headers()['location'] ?? '';
      const sentTo = location ? new URL(location) : undefined;

      // Preview and AAT run with ENTRA_ENABLED=false; anywhere else this goes to Entra.
      expect([302, 503]).toContain(response.status());
      if (response.status() === 503) {
        expect(await response.text()).toContain('Sign in is not available at the moment');
        return;
      }
      expect(sentTo?.searchParams.get('response_type')).toBe('code');
      expect(sentTo?.searchParams.get('code_challenge_method')).toBe('S256');
      expect(sentTo?.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(sentTo?.searchParams.has('code_verifier')).toBe(false);
    }
  );
});
