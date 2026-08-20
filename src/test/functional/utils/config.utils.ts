import { Logger } from '@hmcts/nodejs-logging';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const logger = Logger.getLogger('functional-tests');

export interface Config {
  urls: {
    dataApiUrl: string;
    homePageUrl: string;
  };
}

export const config: Config = {
  urls: {
    dataApiUrl: getEnvVar('DATA_API_URL', 'http://localhost:8989'),
    homePageUrl: getEnvVar('TEST_URL', 'https://localhost:3344'),
  },
};

function getEnvVar(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    logger.info(`${name} is not set; using ${fallback}.`);
    return fallback;
  }
  return value;
}
