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
  /**
   * Real Entra accounts, for environments that sign in through Entra rather than the mock (AAT).
   * Absent where their variables are not set; the signed-in journeys then skip there.
   */
  accounts: {
    user?: TestAccountCredentials;
    admin?: TestAccountCredentials;
  };
}

export const config: Config = {
  urls: {
    homePageUrl: getEnvVar('TEST_URL', 'https://localhost:3344'),
  },
  accounts: {
    user: credentials('AMP_TEST_USER_EMAIL', 'AMP_TEST_USER_PASSWORD'),
    admin: credentials('AMP_TEST_ADMIN_EMAIL', 'AMP_TEST_ADMIN_PASSWORD'),
  },
};

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
