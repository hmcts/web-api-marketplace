import axios from 'axios';
import config from 'config';

import { Logger } from '../modules/logging';

const logger = Logger.getLogger('backend-health');

export const backendUrl: string = process.env.API_URL || config.get('backend.url');
export const backendPath: string = process.env.API_PATH || config.get('backend.path');

export interface BackendHealthResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  detail: string;
}

/**
 * Reachability check against the API Marketplace backend. Any 2xx counts as connected —
 * the backend answers its root path with a plain-text greeting rather than JSON.
 */
export async function checkBackendHealth(): Promise<BackendHealthResult> {
  const startedAt = Date.now();
  const url = `${backendUrl}${backendPath}`;

  logger.info(`Checking backend at ${url}`);

  try {
    const response = await axios.get(url, {
      timeout: 5000,
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: [data => data],
    });
    const latencyMs = Date.now() - startedAt;
    const ok = response.status >= 200 && response.status < 300;

    if (!ok) {
      logger.error(`Backend check returned ${response.status} from ${url} in ${latencyMs}ms`);
      return { ok, status: response.status, latencyMs, detail: `Unexpected response: ${response.status}` };
    }

    logger.info(`Backend check succeeded: ${response.status} from ${url} in ${latencyMs}ms`);
    return { ok, status: response.status, latencyMs, detail: summarise(response.data) };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const detail = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Backend check failed for ${url} after ${latencyMs}ms: ${detail}`);

    return { ok: false, status: null, latencyMs, detail };
  }
}

function summarise(body: unknown): string {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const trimmed = (text ?? '').trim();

  if (!trimmed) {
    return 'Empty response';
  }
  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
}
