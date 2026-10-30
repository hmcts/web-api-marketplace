import { expect, test } from '../fixtures';

test.describe('Health', () => {
  for (const path of ['/health', '/health/liveness', '/health/readiness']) {
    test(`${path}_should_report_up`, { tag: '@smoke' }, async ({ request }) => {
      const response = await request.get(path);

      expect(response.status()).toBe(200);
      expect((await response.json()).status).toBe('UP');
    });
  }
});
