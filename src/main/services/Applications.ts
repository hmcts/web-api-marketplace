import crypto from 'node:crypto';

import { dataStore } from '../modules/store';

import { normalise } from './Accounts';
import { CatalogueApi, getCatalogueApis } from './ApiCatalogue';
import { BackendApplication, fetchApplications, registerApplication } from './BackendApplications';
import { issueClientId, issueClientSecret, issueSubscriptionKey, publisherIdFor } from './Credentials';
import { SignedInUser } from './SignIn';
import { FieldError } from './answers';

/**
 * A consumer's applications: one Entra client ID and secret each, and an APIM
 * subscription key per API the application is subscribed to.
 *
 * Where they live depends on who owns them. An account the backend knows has its
 * applications registered by service-api-marketplace, which issues real Entra and APIM
 * credentials. An account registered only through this service is unknown to the backend,
 * which would reject its user id, so its applications stay in the data store with
 * simulated credentials - see services/Accounts.
 *
 * Every read is through the owner's own list, so one user can never open, change or delete
 * another's application by guessing its id — the ownership check is the lookup itself.
 */

/** Who an application belongs to: the signed-in user, as far as this service needs them. */
export type ApplicationOwner = Pick<SignedInUser, 'id' | 'email' | 'local'>;

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

/**
 * The environment every application created here is in. The user is not asked: the
 * self-service journey only issues sandbox credentials, and anything beyond the sandbox
 * goes through a production credentials request.
 */
export const SELF_SERVICE_ENVIRONMENT = 'sandbox';

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
  /**
   * Set when service-api-marketplace holds the application and issued its credentials.
   * The backend cannot yet change an application's APIs, rotate its secret or delete it,
   * so those actions are only offered when this is not set.
   */
  managedByBackend?: boolean;
}

/** What the "add new application" journey collects before anything is created. */
export interface ApplicationDraft {
  environment?: string;
  name?: string;
  description?: string;
  apis?: string[];
}

/**
 * What this service knows about a backend application that the backend does not store.
 * Kept by the backend's application id, and only ever read for an id the backend has just
 * returned in the owner's own list, so it cannot reveal anything about anyone else's.
 */
interface BackendApplicationDetails {
  description: string;
  secretHint: string;
  secretCreatedAt: string;
  secretExpiresAt: string;
  createdAt: string;
}

/**
 * The backend adds the secret through Graph's addPassword without an end date, and Graph
 * then makes it expire two years after it was created.
 */
const BACKEND_SECRET_LIFETIME_YEARS = 2;

const key = (ownerEmail: string) => `applications:${normalise(ownerEmail)}`;
const detailsKey = (id: number | string) => `application-details:${id}`;

export async function listApplications(owner: ApplicationOwner): Promise<Application[]> {
  if (owner.local) {
    return localApplications(owner.email);
  }

  const [applications, catalogue] = await Promise.all([fetchApplications(owner.id), getCatalogueApis()]);
  return Promise.all(
    applications.map(async application =>
      fromBackend(application, await dataStore().get<BackendApplicationDetails>(detailsKey(application.id)), catalogue)
    )
  );
}

export async function getApplication(owner: ApplicationOwner, id: string): Promise<Application | undefined> {
  return (await listApplications(owner)).find(application => application.id === id);
}

export async function validateDetails(owner: ApplicationOwner, draft: ApplicationDraft): Promise<FieldError[]> {
  const errors: FieldError[] = [];

  const name = draft.name ?? '';
  if (!name) {
    errors.push({ name: 'name', text: 'Enter an application name' });
  } else if (name.length > APPLICATION_NAME_MAX_LENGTH) {
    errors.push({ name: 'name', text: `Application name must be ${APPLICATION_NAME_MAX_LENGTH} characters or fewer` });
  } else if (
    (await listApplications(owner)).some(
      application =>
        application.environment === draft.environment && application.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    errors.push({ name: 'name', text: 'You already have an application with this name' });
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

/**
 * Throws ApplicationsUnavailableError when the backend cannot register it, in which case
 * nothing was created: the backend undoes its own Entra and APIM changes on failure.
 */
export async function createApplication(
  owner: ApplicationOwner,
  draft: Required<ApplicationDraft>,
  catalogue: CatalogueApi[]
): Promise<CreatedApplication> {
  if (!owner.local) {
    return createInBackend(owner, draft, catalogue);
  }

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

  await save(owner.email, [...(await localApplications(owner.email)), application]);
  return { application, clientSecret: secret.value };
}

async function createInBackend(
  owner: ApplicationOwner,
  draft: Required<ApplicationDraft>,
  catalogue: CatalogueApi[]
): Promise<CreatedApplication> {
  const created = await registerApplication(owner.id, {
    name: draft.name,
    environment: draft.environment,
    apiShortCodes: draft.apis,
  });
  const clientSecret = created.clientSecret as string;

  const now = new Date();
  const expires = new Date(now);
  expires.setFullYear(expires.getFullYear() + BACKEND_SECRET_LIFETIME_YEARS);

  const details: BackendApplicationDetails = {
    description: draft.description,
    // Entra's own hint for a secret is its first three characters.
    secretHint: clientSecret.slice(0, 3),
    secretCreatedAt: now.toISOString(),
    secretExpiresAt: expires.toISOString(),
    createdAt: now.toISOString(),
  };
  await dataStore().set(detailsKey(created.id), details);

  return { application: fromBackend(created, details, catalogue), clientSecret };
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
  owner: ApplicationOwner,
  id: string,
  selected: string[],
  catalogue: CatalogueApi[]
): Promise<ApiChanges | undefined> {
  const applications = await localApplications(owner.email);
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

  await save(owner.email, applications);
  return { added, removed };
}

/** Replaces the secret. The old one stops working at once, as it does in Entra. */
export async function regenerateSecret(owner: ApplicationOwner, id: string): Promise<string | undefined> {
  const applications = await localApplications(owner.email);
  const application = applications.find(candidate => candidate.id === id);

  if (!application) {
    return undefined;
  }

  const secret = issueClientSecret();
  application.secretHint = secret.hint;
  application.secretCreatedAt = secret.createdAt;
  application.secretExpiresAt = secret.expiresAt;

  await save(owner.email, applications);
  return secret.value;
}

export async function deleteApplication(owner: ApplicationOwner, id: string): Promise<Application | undefined> {
  const applications = await localApplications(owner.email);
  const application = applications.find(candidate => candidate.id === id);

  if (application) {
    await save(
      owner.email,
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

/**
 * A backend application, with what only this service holds filled in. An application
 * registered some other way has none of that, so those fields are left empty rather than
 * guessed.
 */
function fromBackend(
  application: BackendApplication,
  details: BackendApplicationDetails | undefined,
  catalogue: CatalogueApi[]
): Application {
  const createdAt = details?.createdAt ?? '';

  return {
    id: String(application.id),
    name: application.name,
    description: details?.description ?? '',
    environment: application.environment,
    clientId: application.clientId,
    secretHint: details?.secretHint ?? '',
    secretCreatedAt: details?.secretCreatedAt ?? '',
    secretExpiresAt: details?.secretExpiresAt ?? '',
    apis: (application.apiCredentials ?? []).map(credential => ({
      apiName: credential.apiShortCode,
      apiTitle: catalogue.find(api => api.name === credential.apiShortCode)?.title ?? credential.apiShortCode,
      publisherId: credential.publisherId,
      subscriptionKey: credential.subscriptionKey,
      subscribedAt: createdAt,
    })),
    createdAt,
    managedByBackend: true,
  };
}

async function localApplications(ownerEmail: string): Promise<Application[]> {
  return (await dataStore().get<Application[]>(key(ownerEmail))) ?? [];
}

async function save(ownerEmail: string, applications: Application[]): Promise<void> {
  await dataStore().set(key(ownerEmail), applications);
}
