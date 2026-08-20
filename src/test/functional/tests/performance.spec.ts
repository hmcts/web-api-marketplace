import { test } from '../fixtures';

const LIGHTHOUSE_THRESHOLDS = {
  accessibility: 100,
  'best-practices': 100,
  performance: 80,
} as const;

test.describe('Performance tests', { tag: '@performance' }, () => {
  test.describe.configure({ mode: 'serial' });

  test('Homepage performance', async ({ homePage, lighthouseUtils }) => {
    await homePage.goto();
    await homePage.headerComponent.checkIsVisible();
    await lighthouseUtils.audit(LIGHTHOUSE_THRESHOLDS);
  });
});
