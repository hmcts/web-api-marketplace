import { expect, test } from '../fixtures';

test.describe('Backend', () => {
  test('the_web_app_should_reach_the_service', { tag: '@smoke' }, async ({ request }) => {
    const response = await request.get('/backend-check');

    expect(response.status()).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});
