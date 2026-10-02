import crypto from 'node:crypto';

import { dataStore } from '../modules/store';

import { normalise } from './Accounts';
import { CatalogueApi } from './ApiCatalogue';
import { issueClientId, issueClientSecret, issueSubscriptionKey, publisherIdFor } from './Credentials';
import { FieldError } from './answers';

/**
 * A consumer's applications: one Entra client ID and secret each, and an APIM
 * subscription key per API the application is subscribed to.
 *
 * Held in the data store until service-api-marketplace has application endpoints. Every
 * read is through the owner's own list, so one user can never open, change or delete
 * another's application by guessing its id — the ownership check is the lookup itself.
 */

/**
 * Environments an application can be created in from here. Production is not one of them:
 * production credentials are issued by hand after a request is reviewed — see
 * ProductionCredentialsController.
 */
export const ENVIRONMENTS = [
  { value: 'sandbox', text: 'Sandbox', hint: { text: 'Mock data. For trying the APIs out.' } },
  { value: 'preview', text: 'Preview', hint: { text: 'For testing against early releases.' } },
  { value: 'aat', text: 'Integration test (AAT)', hint: { text: 'For end-to-end testing before go-live.' } },
];

export const APPLICATION_NAME_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 500;

export interface ApiSubscription {
  apiName: string;
  apiTitle: string;
  publisherId: string;
  subscriptionKey: string;
  subscribedAt: string;
}

export interface Application {
  id: string;
  name: string;
  description: string;
  environment: string;
  clientId: string;
  secretHint: string;
  secretCreatedAt: string;
  secretExpiresAt: string;
  apis: ApiSubscription[];
  createdAt: string;
}

/** What the "add new application" journey collects before anything is created. */
export interface ApplicationDraft {
  environment?: string;
  name?: string;
  description?: string;
  apis?: string[];
}

const key = (ownerEmail: string) => `applications:${normalise(ownerEmail)}`;

export async function listApplications(ownerEmail: string): Promise<Application[]> {
  return (await dataStore().get<Application[]>(key(ownerEmail))) ?? [];
}

export async function getApplication(ownerEmail: string, id: string): Promise<Application | undefined> {
  return (await listApplications(ownerEmail)).find(application => application.id === id);
}

export async function validateDetails(ownerEmail: string, draft: ApplicationDraft): Promise<FieldError[]> {
  const errors: FieldError[] = [];

  if (!ENVIRONMENTS.some(environment => environment.value === draft.environment)) {
    errors.push({ name: 'environment', text: 'Select an environment' });
  }

  const name = draft.name ?? '';
  if (!name) {
    errors.push({ name: 'name', text: 'Enter an application name' });
  } else if (name.length > APPLICATION_NAME_MAX_LENGTH) {
    errors.push({ name: 'name', text: `Application name must be ${APPLICATION_NAME_MAX_LENGTH} characters or fewer` });
  } else if (
    (await listApplications(ownerEmail)).some(
      application =>
        application.environment === draft.environment && application.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    errors.push({ name: 'name', text: 'You already have an application with this name in this environment' });
  }

  if ((draft.description ?? '').length > DESCRIPTION_MAX_LENGTH) {
    errors.push({ name: 'description', text: `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer` });
  }

  return errors;
}

export function validateApis(selected: string[], catalogue: CatalogueApi[]): FieldError[] {
  if (!selected.length || !selected.every(name => catalogue.some(api => api.name === name))) {
    return [{ name: 'apis', text: 'Select at least one API' }];
  }
  return [];
}

export interface CreatedApplication {
  application: Application;
  /** The only time the secret exists outside Entra. Show it, then let it go. */
  clientSecret: string;
}

export async function createApplication(
  ownerEmail: string,
  draft: Required<ApplicationDraft>,
  catalogue: CatalogueApi[]
): Promise<CreatedApplication> {
  const secret = issueClientSecret();
  const now = new Date().toISOString();
  const application: Application = {
    id: crypto.randomUUID(),
    name: draft.name,
    description: draft.description,
    environment: draft.environment,
    clientId: issueClientId(),
    secretHint: secret.hint,
    secretCreatedAt: secret.createdAt,
    secretExpiresAt: secret.expiresAt,
    apis: draft.apis.map(name => subscribe(name, catalogue, now)),
    createdAt: now,
  };

  await save(ownerEmail, [...(await listApplications(ownerEmail)), application]);
  return { application, clientSecret: secret.value };
}

export interface ApiChanges {
  added: string[];
  removed: string[];
}

/**
 * Makes the application's subscriptions exactly the APIs selected. An API kept keeps its
 * key; one added gets a new key; one removed loses its key, so it stops working.
 */
export async function setApis(
  ownerEmail: string,
  id: string,
  selected: string[],
  catalogue: CatalogueApi[]
): Promise<ApiChanges | undefined> {
  const applications = await listApplications(ownerEmail);
  const application = applications.find(candidate => candidate.id === id);

  if (!application) {
    return undefined;
  }

  const current = application.apis.map(api => api.apiName);
  const added = selected.filter(name => !current.includes(name));
  const removed = current.filter(name => !selected.includes(name));
  const now = new Date().toISOString();

  application.apis = [
    ...application.apis.filter(api => selected.includes(api.apiName)),
    ...added.map(name => subscribe(name, catalogue, now)),
  ];

  await save(ownerEmail, applications);
  return { added, removed };
}

/** Replaces the secret. The old one stops working at once, as it does in Entra. */
export async function regenerateSecret(ownerEmail: string, id: string): Promise<string | undefined> {
  const applications = await listApplications(ownerEmail);
  const application = applications.find(candidate => candidate.id === id);

  if (!application) {
    return undefined;
  }

  const secret = issueClientSecret();
  application.secretHint = secret.hint;
  application.secretCreatedAt = secret.createdAt;
  application.secretExpiresAt = secret.expiresAt;

  await save(ownerEmail, applications);
  return secret.value;
}

export async function deleteApplication(ownerEmail: string, id: string): Promise<Application | undefined> {
  const applications = await listApplications(ownerEmail);
  const application = applications.find(candidate => candidate.id === id);

  if (application) {
    await save(
      ownerEmail,
      applications.filter(candidate => candidate.id !== id)
    );
  }
  return application;
}

export function environmentName(value: string): string {
  return ENVIRONMENTS.find(environment => environment.value === value)?.text ?? value;
}

function subscribe(apiName: string, catalogue: CatalogueApi[], at: string): ApiSubscription {
  return {
    apiName,
    apiTitle: catalogue.find(api => api.name === apiName)?.title ?? apiName,
    publisherId: publisherIdFor(apiName),
    subscriptionKey: issueSubscriptionKey(),
    subscribedAt: at,
  };
}

async function save(ownerEmail: string, applications: Application[]): Promise<void> {
  await dataStore().set(key(ownerEmail), applications);
}
