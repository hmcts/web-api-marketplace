import { test as baseTest } from '@playwright/test';
import getPort from 'get-port';

import { PageFixtures, pageFixtures } from './page-objects/pages';
import { type UtilsFixtures, utilsFixtures } from './utils';

export type CustomFixtures = PageFixtures & UtilsFixtures;
export type CustomWorkerFixtures = { lighthousePort: number };

export const test = baseTest.extend<CustomFixtures, CustomWorkerFixtures>({
  ...pageFixtures,
  ...utilsFixtures,
  lighthousePort: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use(await getPort());
    },
    { scope: 'worker' },
  ],
});

export const expect = test.expect;
