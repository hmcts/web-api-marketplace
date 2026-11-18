import { randomUUID } from 'node:crypto';

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import config from 'config';
import { Application, NextFunction, Request, Response } from 'express';

import { getCorrelationId, runWithCorrelationId } from './context';

export { getCorrelationId } from './context';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

const VALID_CORRELATION_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function resolveCorrelationId(inbound: string | undefined): string {
  return inbound && VALID_CORRELATION_ID.test(inbound) ? inbound : randomUUID();
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = resolveCorrelationId(req.get(CORRELATION_ID_HEADER));
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  runWithCorrelationId(correlationId, next);
}

// Read per call: config locks on its first get(), before Key Vault properties are added.
function backendBaseUrl(): URL {
  return new URL(process.env.API_URL || config.get<string>('backend.url'));
}

export function isBackendRequest(requestConfig: InternalAxiosRequestConfig, backend: URL = backendBaseUrl()): boolean {
  try {
    const target = new URL(axios.getUri(requestConfig));
    return target.origin === backend.origin && target.pathname.startsWith(backend.pathname);
  } catch {
    return false;
  }
}

export function addCorrelationHeader(requestConfig: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const correlationId = getCorrelationId();
  if (correlationId && isBackendRequest(requestConfig)) {
    requestConfig.headers.set(CORRELATION_ID_HEADER, correlationId);
  }
  return requestConfig;
}

export class Correlation {
  constructor(private readonly client: AxiosInstance = axios) {}

  // Register after the body and session parsers, which can lose the async context.
  public enableFor(app: Application): void {
    app.use(correlationMiddleware);
    this.client.interceptors.request.use(addCorrelationHeader);
  }
}
