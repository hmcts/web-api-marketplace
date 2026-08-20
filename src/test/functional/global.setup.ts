import { test as setup } from './fixtures';
import { config } from './utils';

setup.describe('Global Playwright setup', () => {
  setup('Validate functional test URLs', async () => {
    for (const [name, value] of Object.entries(config.urls)) {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error(`${name} must be a valid absolute URL; received ${value}.`);
      }

      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`${name} must use HTTP or HTTPS; received ${value}.`);
      }
    }
  });
});
