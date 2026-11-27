import { Logger } from '@hmcts/nodejs-logging';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const logger = Logger.getLogger('functional-tests');

export interface TestAccountCredentials {
  email: string;
  password: string;
}

export interface Config {
  urls: {
    homePageUrl: string;
  };
  /** The environment's own developer portal host, where the web app runs in a known environment. */
  developerPortalHost?: string;
  /**
   * Real Entra accounts, for environments that sign in through Entra rather than the mock (AAT).
   * Absent where their variables are not set; the signed-in journeys then skip there.
   */
  accounts: {
    user?: TestAccountCredentials;
    admin?: TestAccountCredentials;
  };
  /**
   * Every browser, as the nightly run uses (PLAYWRIGHT_BROWSERS=all). Otherwise master runs Edge and Chrome,
   * and preview Edge only.
   */
  allBrowsers: boolean;
  /** The one browser the accessibility audits run in, or undefined when they run in every browser. */
  accessibilityProject?: string;
}

// Most specific first: prod's web host is the bare platform.hmcts.net one
const DEVELOPER_PORTAL_HOSTS: [string, string][] = [
  ['.sandbox.platform.hmcts.net', 'amp-portal.sandbox.api.hmcts.net'],
  ['.aat.platform.hmcts.net', 'amp-portal.aat.api.hmcts.net'],
  ['.demo.platform.hmcts.net', 'amp-portal.demo.api.hmcts.net'],
];
const PROD_WEB_HOST = 'amp-marketplace-web.platform.hmcts.net';

function developerPortalHostFor(webHost: string): string | undefined {
  if (webHost === PROD_WEB_HOST) {
    return 'amp-portal.api.hmcts.net';
  }
  return DEVELOPER_PORTAL_HOSTS.find(([suffix]) => webHost.endsWith(suffix))?.[1];
}

const allBrowsers = process.env.PLAYWRIGHT_BROWSERS?.trim().toLowerCase() === 'all';
const preview = process.env.ENV?.trim().toLowerCase() === 'preview';

const homePageUrl = getEnvVar('TEST_URL', 'https://localhost:3344');

export const config: Config = {
  urls: {
    homePageUrl,
  },
  developerPortalHost: developerPortalHostFor(new URL(homePageUrl).hostname),
  accounts: {
    user: credentials('AMP_TEST_USER_EMAIL', 'AMP_TEST_USER_PASSWORD'),
    admin: credentials('AMP_TEST_ADMIN_EMAIL', 'AMP_TEST_ADMIN_PASSWORD'),
  },
  allBrowsers,
  accessibilityProject: accessibilityProject(),
};

// axe reads the page's structure, which is the same in every browser, so one browser is enough
// outside the nightly run: Chrome, or Edge in preview where it is the only one
function accessibilityProject(): string | undefined {
  if (allBrowsers) {
    return undefined;
  }
  return preview ? 'edge' : 'chrome';
}

function credentials(emailVar: string, passwordVar: string): TestAccountCredentials | undefined {
  const email = process.env[emailVar]?.trim();
  const password = process.env[passwordVar];
  return email && password ? { email, password } : undefined;
}

function getEnvVar(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    logger.info(`${name} is not set; using ${fallback}.`);
    return fallback;
  }
  return value;
}
