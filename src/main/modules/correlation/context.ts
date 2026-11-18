import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<string>();

export function runWithCorrelationId<T>(correlationId: string, callback: () => T): T {
  return storage.run(correlationId, callback);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore();
}
