import crypto from 'node:crypto';

import axios, { AxiosRequestConfig } from 'axios';
import config from 'config';

import { Logger } from '../modules/logging';
import { dataStore } from '../modules/store';

import { CatalogueApi } from './ApiCatalogue';
import { FieldError } from './answers';

/** Which subscriptions belong to an application, and whether its role is granted, are not held by the backend yet. */

const logger = Logger.getLogger('applications');

export const APPLICATION_ROLE: string = config.get('applications.role');
export const ACCESS_ATTEMPTS = 8;
export const ACCESS_RETRY_SECONDS = 15;

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ]{6,48}[A-Za-z0-9]$/;
const SUBSCRIPTION_NAME_ATTEMPTS = 3;

export interface ApiSubscription {
  apiName: string;
  apiTitle: string;
  publisherId: string;
  subscriptionName: string;
  subscribedAt: string;
}

export interface Application {
  id: string;
  clientId: string;
  name: string;
  secretHint: string;
  secretExpiresAt: string;
  createdAt: string;
  apis: ApiSubscription[];
  accessGranted: boolean;
}

export interface ApplicationDraft {
  name?: string;
  apis?: string[];
}

export interface Owner {
  oid: string;
}

export class BackendError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }

  get signInAgain(): boolean {
    return this.status === 404 && /sign in again/i.test(this.message);
  }
}

interface BackendApplication {
  clientId: string;
  name: string;
  secretHint?: string;
  secretExpiresAt?: string;
  createdAt?: string;
  clientSecret?: string;
}

interface Links {
  apis: ApiSubscription[];
  accessGranted: boolean;
}

const linksKey = (clientId: string) => `application:${clientId}`;

export function publisherIdFor(apiName: string): string {
  return apiName.replace(/^api-/, '');
}

export function maskSecret(hint: string): string {
  return `${hint}****`;
}

/** Until the backend builds subscription names, a random one: lower case, digits and hyphens. */
export function temporarySubscriptionName(): string {
  return `amp-temp-${crypto.randomBytes(4).toString('hex')}`;
}

export async function listApplications(owner: Owner): Promise<Application[]> {
  const found = await call<BackendApplication[]>(owner, { method: 'GET', url: '/applications' });
  return Promise.all(found.map(withLinks));
}

export async function getApplication(owner: Owner, clientId: string): Promise<Application | undefined> {
  try {
    return await withLinks(
      await call<BackendApplication>(owner, { method: 'GET', url: `/applications/${encodeURIComponent(clientId)}` })
    );
  } catch (error) {
    if (error instanceof BackendError && error.status === 404 && !error.signInAgain) {
      return undefined;
    }
    throw error;
  }
}

export function validateName(name: string | undefined): FieldError[] {
  const value = (name ?? '').trim();
  if (!value) {
    return [{ name: 'name', text: 'Enter an application name' }];
  }
  if (!NAME_PATTERN.test(value)) {
    return [{ name: 'name', text: 'Application name must be 8 to 50 letters, numbers or spaces' }];
  }
  return [];
}

export function validateApis(selected: string[], catalogue: CatalogueApi[]): FieldError[] {
  if (!selected.length || !selected.every(name => catalogue.some(api => api.name === name))) {
    return [{ name: 'apis', text: 'Select at least one API' }];
  }
  return [];
}

export interface IssuedKey {
  apiName: string;
  apiTitle: string;
  publisherId: string;
  subscriptionKey: string;
}

export interface CreatedApplication {
  application: Application;
  clientSecret: string;
  keys: IssuedKey[];
  failedApis: string[];
}

export async function createApplication(
  owner: Owner,
  draft: Required<ApplicationDraft>,
  catalogue: CatalogueApi[]
): Promise<CreatedApplication> {
  const created = await call<BackendApplication>(
    owner,
    { method: 'POST', url: '/applications', data: { name: draft.name.trim() } },
    30000
  );

  const keys: IssuedKey[] = [];
  const failedApis: string[] = [];
  const apis: ApiSubscription[] = [];
  for (const apiName of draft.apis) {
    try {
      const { subscription, key } = await subscribe(owner, created.name, apiName, catalogue);
      apis.push(subscription);
      keys.push({
        apiName,
        apiTitle: subscription.apiTitle,
        publisherId: subscription.publisherId,
        subscriptionKey: key,
      });
    } catch (error) {
      logger.error(`Could not subscribe ${created.clientId} to ${apiName}: ${(error as Error).message}`);
      failedApis.push(titleOf(apiName, catalogue));
    }
  }

  await saveLinks(created.clientId, { apis, accessGranted: false });
  return {
    application: toApplication(created, { apis, accessGranted: false }),
    clientSecret: created.clientSecret ?? '',
    keys,
    failedApis,
  };
}

export type AccessResult = { state: 'granted' } | { state: 'pending' } | { state: 'failed'; message: string };

/** One attempt. A service principal seconds old is not assignable yet, so 404 means "try again". */
export async function grantAccess(owner: Owner, application: Application): Promise<AccessResult> {
  if (application.accessGranted) {
    return { state: 'granted' };
  }
  try {
    await call(owner, {
      method: 'POST',
      url: `/applications/${encodeURIComponent(application.clientId)}/roles`,
      data: { role: APPLICATION_ROLE },
    });
  } catch (error) {
    if (error instanceof BackendError && error.status === 404 && !error.signInAgain) {
      return { state: 'pending' };
    }
    if (error instanceof BackendError && error.status !== undefined && !error.signInAgain) {
      return { state: 'failed', message: error.message };
    }
    throw error;
  }
  await saveLinks(application.clientId, { apis: application.apis, accessGranted: true });
  return { state: 'granted' };
}

export interface ApiChanges {
  added: string[];
  removed: string[];
  failed: string[];
}

export async function setApis(
  owner: Owner,
  application: Application,
  selected: string[],
  catalogue: CatalogueApi[]
): Promise<ApiChanges> {
  const current = application.apis.map(api => api.apiName);
  const changes: ApiChanges = { added: [], removed: [], failed: [] };
  let apis = [...application.apis];

  for (const subscription of application.apis.filter(api => !selected.includes(api.apiName))) {
    try {
      await revoke(owner, subscription.subscriptionName);
      apis = apis.filter(api => api !== subscription);
      changes.removed.push(subscription.apiName);
    } catch (error) {
      logger.error(`Could not revoke ${subscription.subscriptionName}: ${(error as Error).message}`);
      changes.failed.push(subscription.apiTitle);
    }
  }
  for (const apiName of selected.filter(name => !current.includes(name))) {
    try {
      apis.push((await subscribe(owner, application.name, apiName, catalogue)).subscription);
      changes.added.push(apiName);
    } catch (error) {
      logger.error(`Could not subscribe ${application.clientId} to ${apiName}: ${(error as Error).message}`);
      changes.failed.push(titleOf(apiName, catalogue));
    }
  }

  await saveLinks(application.clientId, { apis, accessGranted: application.accessGranted });
  return changes;
}

export async function subscriptionKey(owner: Owner, subscription: ApiSubscription): Promise<string> {
  const values = await call<{ primaryKey?: string }>(owner, {
    method: 'GET',
    url: `/apim/subscription-keys/${encodeURIComponent(subscription.subscriptionName)}/values`,
  });
  return values.primaryKey ?? '';
}

/** Its subscriptions first: once the registration has gone nothing would lead back to them. */
export async function deleteApplication(owner: Owner, application: Application): Promise<void> {
  for (const subscription of application.apis) {
    await revoke(owner, subscription.subscriptionName);
  }
  await call(owner, { method: 'DELETE', url: `/applications/${encodeURIComponent(application.clientId)}` });
  await dataStore().delete(linksKey(application.clientId));
}

async function subscribe(
  owner: Owner,
  displayName: string,
  apiName: string,
  catalogue: CatalogueApi[]
): Promise<{ subscription: ApiSubscription; key: string }> {
  const publisherId = publisherIdFor(apiName);
  for (let attempt = 1; ; attempt++) {
    const name = temporarySubscriptionName();
    try {
      const created = await call<{ primaryKey?: string }>(owner, {
        method: 'POST',
        url: '/apim/subscription-keys',
        data: { name, productId: publisherId, displayName },
      });
      return {
        subscription: {
          apiName,
          apiTitle: titleOf(apiName, catalogue),
          publisherId,
          subscriptionName: name,
          subscribedAt: new Date().toISOString(),
        },
        key: created.primaryKey ?? '',
      };
    } catch (error) {
      if (!(error instanceof BackendError && error.status === 409) || attempt === SUBSCRIPTION_NAME_ATTEMPTS) {
        throw error;
      }
    }
  }
}

async function revoke(owner: Owner, subscriptionName: string): Promise<void> {
  try {
    await call(owner, { method: 'DELETE', url: `/apim/subscription-keys/${encodeURIComponent(subscriptionName)}` });
  } catch (error) {
    if (!(error instanceof BackendError && error.status === 404)) {
      throw error;
    }
  }
}

async function call<T = unknown>(owner: Owner, request: AxiosRequestConfig, timeout = 10000): Promise<T> {
  const baseURL = process.env.API_URL || config.get<string>('backend.url');
  try {
    const response = await axios.request<T>({
      ...request,
      baseURL,
      timeout,
      headers: { requestingUserId: owner.oid },
    });
    return response.data;
  } catch (error) {
    const response = (error as { response?: { status?: number; data?: { error?: string } } }).response;
    if (response?.status) {
      throw new BackendError(response.data?.error || `The backend answered ${response.status}`, response.status);
    }
    throw new BackendError(`Could not reach the backend: ${(error as Error).message}`);
  }
}

async function withLinks(found: BackendApplication): Promise<Application> {
  const links = (await dataStore().get<Links>(linksKey(found.clientId))) ?? { apis: [], accessGranted: false };
  return toApplication(found, links);
}

function toApplication(found: BackendApplication, links: Links): Application {
  return {
    id: found.clientId,
    clientId: found.clientId,
    name: found.name,
    secretHint: found.secretHint ?? '',
    secretExpiresAt: found.secretExpiresAt ?? '',
    createdAt: found.createdAt ?? '',
    apis: links.apis,
    accessGranted: links.accessGranted,
  };
}

async function saveLinks(clientId: string, links: Links): Promise<void> {
  await dataStore().set(linksKey(clientId), links);
}

function titleOf(apiName: string, catalogue: CatalogueApi[]): string {
  return catalogue.find(api => api.name === apiName)?.title ?? apiName;
}
