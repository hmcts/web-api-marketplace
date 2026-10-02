import { createClient } from 'redis';

import { Logger } from '../logging';
import { RedisOptions } from '../session';

const logger = Logger.getLogger('store');

/**
 * Where this service keeps the records service-api-marketplace has no endpoint for yet:
 * self-registered accounts and their email tokens, applications and their credentials,
 * and the requests only this service knows about (production credentials, new API
 * requests, and anything submitted by an account the backend has never heard of).
 *
 * A stand-in, deliberately small: get, set and delete of JSON documents by key. Every
 * caller reads and writes whole documents, so swapping a service onto a real backend
 * endpoint is a change to that service alone, not to this.
 *
 * Read-modify-write is not atomic. Two simultaneous changes to the same user's
 * applications can lose one of them — acceptable for a stand-in that one person drives
 * at a time, and the reason this must not outlive the backend endpoints it stands in for.
 */
export interface DataStore {
  get<T>(key: string): Promise<T | undefined>;
  /** `ttlSeconds` expires the document, for tokens that must stop working on their own. */
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** One process's memory: lost on restart and not shared between replicas. */
export class MemoryStore implements DataStore {
  private readonly documents = new Map<string, { json: string; expiresAt?: number }>();

  public get<T>(key: string): Promise<T | undefined> {
    const document = this.documents.get(key);

    if (!document) {
      return Promise.resolve(undefined);
    }
    if (document.expiresAt !== undefined && document.expiresAt <= Date.now()) {
      this.documents.delete(key);
      return Promise.resolve(undefined);
    }
    // Stored as JSON so a caller mutating what it read cannot change the stored copy,
    // which is how the Redis store behaves too.
    return Promise.resolve(JSON.parse(document.json) as T);
  }

  public set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    this.documents.set(key, {
      json: JSON.stringify(value),
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
    return Promise.resolve();
  }

  public delete(key: string): Promise<void> {
    this.documents.delete(key);
    return Promise.resolve();
  }
}

/** The three Redis commands the store uses, so it does not depend on the client's generics. */
export interface KeyValueClient {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, options?: { EX: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export class RedisStore implements DataStore {
  constructor(
    private readonly client: KeyValueClient,
    private readonly prefix = 'apim-marketplace-web:data:'
  ) {}

  public async get<T>(key: string): Promise<T | undefined> {
    const json = await this.client.get(this.prefix + key);
    return typeof json === 'string' ? (JSON.parse(json) as T) : undefined;
  }

  public async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const json = JSON.stringify(value);
    await this.client.set(this.prefix + key, json, ttlSeconds ? { EX: ttlSeconds } : undefined);
  }

  public async delete(key: string): Promise<void> {
    await this.client.del(this.prefix + key);
  }
}

let current: DataStore = new MemoryStore();

/** The store every service reads and writes. Memory until app.ts configures Redis. */
export function dataStore(): DataStore {
  return current;
}

/** For tests: a fresh, empty store, so one test's records cannot leak into the next. */
export function useDataStore(store: DataStore): void {
  current = store;
}

/**
 * Uses the same Redis as the session store when one is configured — the same reason
 * sessions are there: more than one replica serves this service, and memory is per
 * replica.
 */
export function configureDataStore(redis: RedisOptions): void {
  const { host, port, key, tls } = redis;

  if (!host) {
    logger.info('No REDIS_HOST configured, holding marketplace records in memory for this process only');
    current = new MemoryStore();
    return;
  }

  const client = createClient({
    url: `${tls ? 'rediss' : 'redis'}://${host}:${port}`,
    password: key || undefined,
    socket: tls ? { tls: true, servername: host } : {},
  });

  client.on('error', error => logger.error(`Redis connection error: ${error.message}`));
  client.connect().catch(error => logger.error(`Could not connect to Redis at ${host}: ${error.message}`));

  current = new RedisStore({
    get: storeKey => client.get(storeKey),
    set: (storeKey, value, options) => (options ? client.set(storeKey, value, options) : client.set(storeKey, value)),
    del: storeKey => client.del(storeKey),
  });
}
