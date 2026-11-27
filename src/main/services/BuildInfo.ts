import { readFile } from 'node:fs/promises';

import axios from 'axios';
import config from 'config';

import { Logger } from '../modules/logging';

export interface Builds {
  web: string;
  service: string;
}

const UNKNOWN = 'unknown';
const SHORT_COMMIT = 8;
const SERVICE_CACHE_MS = 60_000;
const TIMEOUT_MS = 2000;

const logger = Logger.getLogger('build-info');

let webBuild: Promise<string> | undefined;
let serviceBuild: { readAt: number; text: string } | undefined;

export async function builds(): Promise<Builds> {
  const [web, service] = await Promise.all([fromVersionFile(), fromBackend()]);

  return { web, service };
}

/** The file the CNP pipeline writes beside the app; absent in a local run and in a plain docker run. */
function fromVersionFile(): Promise<string> {
  webBuild ??= readVersionFile();

  return webBuild;
}

async function readVersionFile(): Promise<string> {
  const path = `${process.env.NODE_PATH || '.'}/version`;

  try {
    const raw = await readFile(path, 'utf8');
    return describe(valueOf(raw, 'commit'), valueOf(raw, 'date'));
  } catch (error) {
    logger.warn(`No build to read at ${path}: ${(error as Error).message}`);
    return UNKNOWN;
  }
}

/**
 * A failure is cached for as long as a success. The backend being unreachable is the moment an
 * admin most wants the page itself to render, and retrying on every request would add the
 * timeout to each one.
 */
async function fromBackend(): Promise<string> {
  if (serviceBuild && Date.now() - serviceBuild.readAt < SERVICE_CACHE_MS) {
    return serviceBuild.text;
  }

  let text = UNKNOWN;
  try {
    // Read here rather than at import: config locks itself on its first get(), and app.ts
    // imports this module above the point where the mounted secrets are added to it.
    const backend = process.env.API_URL || config.get<string>('backend.url');
    const { data } = await axios.get(`${backend}/info`, { timeout: TIMEOUT_MS });
    text = describe(data?.git?.commit?.id, data?.build?.time);
  } catch (error) {
    logger.warn(`Could not read the backend build: ${(error as Error).message}`);
  }
  serviceBuild = { readAt: Date.now(), text };

  return text;
}

function valueOf(raw: string, key: string): string | undefined {
  const line = raw.split('\n').find(candidate => candidate.trim().startsWith(`${key}:`));

  return (
    line
      ?.slice(line.indexOf(':') + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '') || undefined
  );
}

function describe(commit?: string, built?: string): string {
  const short = commit ? commit.slice(0, SHORT_COMMIT) : UNKNOWN;
  const when = buildTime(built);

  return when ? `${short} · ${when}` : short;
}

function buildTime(built?: string): string | undefined {
  if (!built) {
    return undefined;
  }

  const date = new Date(built);
  if (Number.isNaN(date.getTime())) {
    return built;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}
