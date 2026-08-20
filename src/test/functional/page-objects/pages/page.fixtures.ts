import { Page } from '@playwright/test';

import { AccessibilityPage } from './accessibility.po';
import { HomePage } from './home.po';
import { NotFoundPage } from './not-found.po';

export interface PageFixtures {
  accessibilityPage: AccessibilityPage;
  determinePage: Page;
  homePage: HomePage;
  notFoundPage: NotFoundPage;
}

export const pageFixtures = {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  determinePage: async ({ page, lighthousePage }, use, testInfo): Promise<void> => {
    await use(testInfo.tags.includes('@performance') ? lighthousePage : page);
  },
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  accessibilityPage: async ({ determinePage }, use): Promise<void> => {
    await use(new AccessibilityPage(determinePage));
  },
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  homePage: async ({ determinePage }, use): Promise<void> => {
    await use(new HomePage(determinePage));
  },
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  notFoundPage: async ({ determinePage }, use): Promise<void> => {
    await use(new NotFoundPage(determinePage));
  },
};
