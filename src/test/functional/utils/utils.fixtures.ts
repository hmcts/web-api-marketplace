import os from 'node:os';
import path from 'node:path';

import { AxeUtils, LighthouseUtils, createLogger } from '@hmcts/playwright-common';
import { Page, chromium } from '@playwright/test';

import { Config, config } from './config.utils';

type LoggerInstance = ReturnType<typeof createLogger>;

export interface UtilsFixtures {
  axeUtils: AxeUtils;
  config: Config;
  lighthousePage: Page;
  lighthouseUtils: LighthouseUtils;
  logger: LoggerInstance;
}

/** Audits only in the browser the accessibility checks run in for this run; see config.accessibilityProject. */
class BrowserAxeUtils extends AxeUtils {
  constructor(
    page: Page,
    private readonly enabled: boolean
  ) {
    super(page);
  }

  public override async audit(options?: Parameters<AxeUtils['audit']>[0]): Promise<void> {
    if (this.enabled) {
      await super.audit(options);
    }
  }
}

export const utilsFixtures = {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, no-empty-pattern
  config: async ({}, use): Promise<void> => {
    await use(config);
  },
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, no-empty-pattern
  logger: async ({}, use, testInfo): Promise<void> => {
    await use(
      createLogger({
        serviceName: 'apim-marketplace-web',
        defaultMeta: { testId: `${testInfo.project.name}::${testInfo.title}` },
      })
    );
  },
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  axeUtils: async ({ page }, use, testInfo): Promise<void> => {
    const browser = config.accessibilityProject;
    const axeUtils = new BrowserAxeUtils(page, !browser || testInfo.project.name === browser);
    await use(axeUtils);
    await axeUtils.generateReport(testInfo, 'Accessibility Test Report');
  },
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  lighthouseUtils: async ({ lighthousePage, lighthousePort }, use): Promise<void> => {
    await use(new LighthouseUtils(lighthousePage, lighthousePort));
  },
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  lighthousePage: async ({ lighthousePort, page }, use, testInfo): Promise<void> => {
    if (!testInfo.tags.includes('@performance')) {
      await use(page);
      return;
    }

    const userDataDir = path.join(os.tmpdir(), 'apim-public-playwright', String(Math.random()));
    const context = await chromium.launchPersistentContext(userDataDir, {
      args: [`--remote-debugging-port=${lighthousePort}`],
      baseURL: config.urls.homePageUrl,
      ignoreHTTPSErrors: true,
    });

    try {
      await use(context.pages()[0] ?? (await context.newPage()));
    } finally {
      await context.close();
    }
  },
};
