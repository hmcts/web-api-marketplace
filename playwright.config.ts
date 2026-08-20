import { CommonConfig, ProjectsConfig } from '@hmcts/playwright-common';
import { ReporterDescription, defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import { cpus } from 'node:os';

import { config as functionalConfig } from './src/test/functional/utils/config.utils';

const { version: appVersion, name: appName } = require('./package.json') as { version: string; name: string };

dotenv.config({ quiet: true });

function generateAlphabeticSuffix(length = 4): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

process.env.PLAYWRIGHT_TEST_RUN_SUFFIX ??= generateAlphabeticSuffix();

function safeSerialize(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[MaxDepth]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => safeSerialize(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'function') continue;
    try {
      result[key] = safeSerialize(child, depth + 1);
    } catch {
      result[key] = '[Unserializable]';
    }
  }
  return result;
}

const TRUTHY_FLAGS = new Set(['1', 'true', 'yes', 'on', 'all']);
const FALSY_FLAGS = new Set(['0', 'false', 'no', 'off']);

function safeBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalised = value.trim().toLowerCase();
  if (TRUTHY_FLAGS.has(normalised)) return true;
  if (FALSY_FLAGS.has(normalised)) return false;
  return defaultValue;
}

function resolveWorkerCount(): number {
  const configured = Number.parseInt(process.env.PLAYWRIGHT_WORKERS ?? '', 10);
  if (Number.isInteger(configured) && configured > 0) return configured;
  if (process.env.CI) return 1;

  const logical = cpus()?.length ?? 1;
  if (logical <= 2) return 1;
  return Math.min(8, Math.max(2, Math.round(logical / 2)));
}

function resolveDefaultReporterNames(): string[] {
  const override = process.env.PLAYWRIGHT_DEFAULT_REPORTER;
  if (override?.trim()) {
    return override
      .split(',')
      .map(name => name.trim())
      .filter(Boolean);
  }
  return [process.env.CI ? 'dot' : 'list'];
}

function resolveOdhinTestOutput(): boolean | 'only-on-failure' {
  const configured = process.env.PW_ODHIN_TEST_OUTPUT?.trim().toLowerCase();
  if (configured === 'only-on-failure') return configured;
  if (configured && TRUTHY_FLAGS.has(configured)) return true;
  if (configured && FALSY_FLAGS.has(configured)) return false;
  return 'only-on-failure';
}

function resolveReporters(): ReporterDescription[] {
  const configured = process.env.PLAYWRIGHT_REPORTERS?.split(',')
    .map(name => name.trim())
    .filter(Boolean);
  const reporterNames = configured?.length ? configured : resolveDefaultReporterNames();
  const normalisedNames = new Set(reporterNames.map(name => name.toLowerCase()));
  const reporters: ReporterDescription[] = [];

  for (const name of reporterNames) {
    switch (name.toLowerCase()) {
      case 'list':
        reporters.push(['list']);
        break;
      case 'dot':
        reporters.push(['dot']);
        break;
      case 'line':
        reporters.push(['line']);
        break;
      case 'html':
        reporters.push([
          'html',
          {
            open: process.env.PLAYWRIGHT_HTML_OPEN ?? 'never',
            outputFolder: process.env.PLAYWRIGHT_HTML_OUTPUT ?? 'playwright-report',
          },
        ]);
        break;
      case 'junit':
        reporters.push(['junit', { outputFile: process.env.PLAYWRIGHT_JUNIT_OUTPUT ?? 'playwright-junit.xml' }]);
        break;
      case 'odhin':
      case 'odhin-reports-playwright':
        reporters.push([
          'odhin-reports-playwright',
          {
            outputFolder: process.env.PW_ODHIN_OUTPUT ?? './test-results/odhin-report',
            indexFilename: process.env.PW_ODHIN_INDEX ?? 'index.html',
            title: process.env.PW_ODHIN_TITLE ?? `${appName} Playwright`,
            testEnvironment:
              process.env.PW_ODHIN_ENV ??
              `${process.env.TEST_ENVIRONMENT ?? (process.env.CI ? 'ci' : 'local')} | workers=${resolveWorkerCount()}`,
            project: process.env.PW_ODHIN_PROJECT ?? appName,
            release: process.env.PW_ODHIN_RELEASE ?? `${appVersion} | branch=${process.env.GIT_BRANCH ?? 'local'}`,
            testFolder: process.env.PW_ODHIN_TEST_FOLDER ?? './src/test/functional',
            startServer: safeBoolean(process.env.PW_ODHIN_START_SERVER, false),
            consoleLog: safeBoolean(process.env.PW_ODHIN_CONSOLE_LOG, false),
            consoleError: safeBoolean(process.env.PW_ODHIN_CONSOLE_ERROR, true),
            consoleTestOutput: safeBoolean(process.env.PW_ODHIN_TEST_CONSOLE_OUTPUT, false),
            testOutput: resolveOdhinTestOutput(),
          },
        ]);
        break;
      default:
        reporters.push([name]);
    }
  }

  const emitHtml = normalisedNames.has('html');
  const emitOdhin = normalisedNames.has('odhin') || normalisedNames.has('odhin-reports-playwright');
  if (emitHtml || emitOdhin) {
    reporters.push([
      './scripts/report-links-reporter.mjs',
      {
        emitHtml,
        emitOdhin,
        htmlOutput: process.env.PLAYWRIGHT_HTML_OUTPUT ?? 'playwright-report',
        htmlIndex: 'index.html',
        odhinOutput: process.env.PW_ODHIN_OUTPUT ?? './test-results/odhin-report',
        odhinIndex: process.env.PW_ODHIN_INDEX ?? 'index.html',
      },
    ]);
  }

  return reporters;
}

function resolveVideoMode(): 'off' | 'on' | 'retain-on-failure' | 'on-first-retry' {
  const configured = process.env.PLAYWRIGHT_VIDEO_MODE?.trim().toLowerCase();
  if (configured === 'on' || configured === 'retain-on-failure' || configured === 'on-first-retry') {
    return configured;
  }
  return configured === 'true' || configured === '1' ? 'retain-on-failure' : 'off';
}

function resolveProjects() {
  const setupProject = {
    name: 'setup',
    testMatch: /global\.setup\.ts/,
  };
  // edge runs everything
  const edgeProject = {
    ...ProjectsConfig.edge,
    dependencies: ['setup'],
  };
  // standard projects run everything except performance tests
  const standardProjects = [
    ProjectsConfig.chrome,
    ProjectsConfig.firefox,
    ProjectsConfig.webkit,
    ProjectsConfig.tabletChrome,
    ProjectsConfig.tabletWebkit,
  ].map(project => ({
    ...project,
    dependencies: ['setup'],
    grepInvert: /@performance/,
  }));

  return process.env.ENV?.trim().toLowerCase() === 'preview'
    ? [setupProject, edgeProject]
    : [setupProject, edgeProject, ...standardProjects];
}

const config = defineConfig({
  testDir: './src/test/functional',
  snapshotDir: './src/test/functional/snapshots',
  ...CommonConfig.recommended,
  reporter: resolveReporters(),
  workers: resolveWorkerCount(),
  timeout: 120_000,
  use: {
    baseURL: functionalConfig.urls.homePageUrl,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: resolveVideoMode(),
  },
  projects: resolveProjects(),
});

if (safeBoolean(process.env.PW_DUMP_CONFIG, false)) {
  console.log('[playwright.config.ts] Loaded configuration:', JSON.stringify(safeSerialize(config), null, 2));
}

export default config;
