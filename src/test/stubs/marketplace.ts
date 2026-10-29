import crypto from 'node:crypto';

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ]{6,48}[A-Za-z0-9]$/;

/** What the backend accepts for the two long production request answers. */
const ANSWER_MAX_LENGTH = 2000;
/** Every application is registered in the one tenant the backend is configured with. */
export const STUB_TENANT_ID = 'd44f885c-4fac-47bf-afde-d7d861ec4d7b';

/** marketplace_api, which is what a short code resolves to. */
const CATALOGUE: Record<
  string,
  { title: string; catalogueName: string; productId: string; role: string; resourceAppId: string }
> = {
  hearing: {
    title: 'CP Crime Hearing API',
    catalogueName: 'api-cp-crime-hearing',
    productId: 'cp-crime-hearing',
    role: 'app.read',
    resourceAppId: '11111111-1111-1111-1111-111111111111',
  },
  defendant: {
    title: 'Defendant Details',
    catalogueName: 'api-cp-crime-defendant-details',
    productId: 'cp-crime-defendant-details',
    role: 'app.read',
    resourceAppId: '22222222-2222-2222-2222-222222222222',
  },
  slc: {
    title: 'Scheduling and Listing Court Schedule',
    catalogueName: 'api-cp-crime-schedulingandlisting-courtschedule',
    productId: 'try-it-now-cp-crime-schedulingandlisting',
    role: 'app.read',
    resourceAppId: '33333333-3333-3333-3333-333333333333',
  },
};

/** Each API's own resource application, which is what /products carries for the token scope. */
const PRODUCTS = Object.entries(CATALOGUE).map(([shortCode, api]) => ({
  shortCode,
  title: api.title,
  catalogueName: api.catalogueName,
  productId: api.productId,
  gatewayPath: `amp/${shortCode}`,
  role: api.role,
  resourceAppId: api.resourceAppId,
}));

interface StubProductionRequest {
  owner: string;
  reference: string;
  status: string;
  submittedAt: string;
  applicationName: string;
  clientId: string;
  organisation: string;
  goLiveDate: string;
  callVolume: string;
  dataRequest: string;
  proposedOutputs: string;
}

interface StubApplication {
  owner: string;
  clientId: string;
  name: string;
  appname: string;
  secretHint: string;
  secretExpiresAt: string;
  createdAt: string;
  roles: string[];
}

export interface StubMarketplace {
  applications: Map<string, StubApplication>;
  productionRequests: Map<string, StubProductionRequest>;
  subscriptions: Map<string, { productId: string; displayName: string; primaryKey: string }>;
  /** The next n role grants answer 404, as Entra does for a service principal seconds old. */
  roleNotAssignableFor(times: number): void;
  /** Role grants answer this status, as Graph does when a permission is missing. */
  refuseRoles(status: number): void;
  /** Subscription keys cannot be created, as when APIM is unreachable. */
  failSubscriptions(status: number): void;
  reset(): void;
}

type Json = (status: number, body?: unknown) => void;

/**
 * service-api-marketplace's /applications and /apim/subscription-keys in memory, with the rules
 * and status codes the real ones answer with. `knownUsers` are the ids /session gave each object id.
 */
export function stubMarketplace(knownUsers: () => Map<string, number>): {
  state: StubMarketplace;
  handle: (method: string, path: string, requestingUserId: string | undefined, body: string, json: Json) => boolean;
} {
  const applications = new Map<string, StubApplication>();
  const productionRequests = new Map<string, StubProductionRequest>();
  const subscriptions = new Map<string, { productId: string; displayName: string; primaryKey: string }>();
  let notAssignable = 0;
  let refuseRolesWith: number | undefined;
  let failSubscriptionsWith: number | undefined;

  const state: StubMarketplace = {
    applications,
    productionRequests,
    subscriptions,
    roleNotAssignableFor: times => (notAssignable = times),
    refuseRoles: status => (refuseRolesWith = status),
    failSubscriptions: status => (failSubscriptionsWith = status),
    reset: () => {
      applications.clear();
      productionRequests.clear();
      subscriptions.clear();
      notAssignable = 0;
      refuseRolesWith = undefined;
      failSubscriptionsWith = undefined;
    },
  };

  const view = ({ clientId, name, appname, secretHint, secretExpiresAt, createdAt }: StubApplication) => ({
    clientId,
    tenantId: STUB_TENANT_ID,
    name,
    appname,
    secretHint,
    secretExpiresAt,
    createdAt,
  });

  const summary = (request: StubProductionRequest) => ({
    reference: request.reference,
    status: request.status,
    submittedAt: request.submittedAt,
    applicationName: request.applicationName,
    clientId: applications.has(request.clientId) ? request.clientId : null,
  });

  const detail = (request: StubProductionRequest) => ({
    ...summary(request),
    organisation: request.organisation,
    goLiveDate: request.goLiveDate,
    callVolume: request.callVolume,
    dataRequest: request.dataRequest,
    proposedOutputs: request.proposedOutputs,
  });

  const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function newReference(): string {
    let suffix = '';
    for (let character = 0; character < 8; character++) {
      suffix += REFERENCE_ALPHABET[crypto.randomInt(REFERENCE_ALPHABET.length)];
    }
    return `PCR-${suffix}`;
  }

  function submitProductionRequest(user: string, body: string, json: Json): void {
    const request = JSON.parse(body || '{}') as Record<string, unknown>;
    const text = (name: string) => String(request[name] ?? '').trim();
    const application = applications.get(text('clientId'));

    const requested = [...productionRequests.values()].find(held => held.clientId === text('clientId'));

    if (!application || application.owner !== user) {
      json(400, { error: `No application with client id ${text('clientId')}.` });
    } else if (requested) {
      // One request per application: a second is a duplicate ask, not a second thing being asked for.
      json(409, { error: `${application.name} already has a production access request.` });
    } else if (!text('organisation')) {
      json(400, { error: "Enter the organisation's legal name." });
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(text('goLiveDate'))) {
      json(400, { error: 'Enter a go live date.' });
    } else if (!['low', 'medium', 'high'].includes(text('callVolume'))) {
      json(400, { error: 'Call volume must be low, medium or high.' });
    } else if (!text('dataRequest') || text('dataRequest').length > ANSWER_MAX_LENGTH) {
      json(400, { error: 'Describe the data request, how you plan to use it and why you need it.' });
    } else if (!text('proposedOutputs') || text('proposedOutputs').length > ANSWER_MAX_LENGTH) {
      json(400, { error: 'Describe the proposed outputs from this data use.' });
    } else {
      const stored: StubProductionRequest = {
        owner: user,
        reference: newReference(),
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString().slice(0, 19),
        applicationName: application.name,
        clientId: application.clientId,
        organisation: text('organisation'),
        goLiveDate: text('goLiveDate'),
        callVolume: text('callVolume'),
        dataRequest: text('dataRequest'),
        proposedOutputs: text('proposedOutputs'),
      };
      productionRequests.set(stored.reference, stored);
      json(201, summary(stored));
    }
  }

  function handle(
    method: string,
    path: string,
    requestingUserId: string | undefined,
    body: string,
    json: Json
  ): boolean {
    const applicationPath = /^\/applications(?:\/([^/]+))?(\/roles)?$/.exec(path);
    if (applicationPath) {
      const user = requestingUserId?.toLowerCase();
      if (!user) {
        json(400, { error: 'requestingUserId is required.' });
        return true;
      }
      if (!knownUsers().has(user)) {
        json(404, { error: 'Sign in again.' });
        return true;
      }
      const [, clientId, roles] = applicationPath;
      const owned = clientId ? applications.get(decodeURIComponent(clientId)) : undefined;
      const mine = owned?.owner === user ? owned : undefined;

      if (!clientId && method === 'GET') {
        json(200, [...applications.values()].filter(application => application.owner === user).map(view));
      } else if (!clientId && method === 'POST') {
        const request = JSON.parse(body || '{}') as { name?: string; apis?: string[] };
        const name = String(request.name ?? '');
        const appname = name.trim().toLowerCase().replace(/\s+/g, '-');
        if (!NAME_PATTERN.test(name)) {
          json(400, { error: 'Use letters, digits and spaces only, 8 to 50 characters.' });
        } else if ([...applications.values()].some(a => a.owner === user && a.appname === appname)) {
          json(409, { error: `You already have an application called ${name}.` });
        } else {
          const secret = `${crypto.randomBytes(2).toString('hex').slice(0, 3)}8Q~${crypto.randomBytes(30).toString('base64url').slice(0, 34)}`;
          const created: StubApplication = {
            owner: user,
            clientId: crypto.randomUUID(),
            name: name.trim(),
            appname,
            secretHint: secret.slice(0, 3),
            secretExpiresAt: '2028-10-15T12:00:00',
            createdAt: '2026-10-15T12:00:00',
            roles: (request.apis ?? []).map(shortCode => CATALOGUE[shortCode]?.role).filter(Boolean),
          };
          applications.set(created.clientId, created);
          json(201, { ...view(created), clientSecret: secret });
        }
      } else if (!mine) {
        json(404, { error: `No application with client id ${clientId}.` });
      } else if (roles && method === 'POST') {
        if (refuseRolesWith) {
          json(refuseRolesWith, { error: 'Graph refused: AppRoleAssignment.ReadWrite.All is missing.' });
        } else if (notAssignable > 0) {
          notAssignable--;
          json(404, { error: 'No service principal yet.' });
        } else {
          const { shortCode } = JSON.parse(body || '{}') as { shortCode?: string };
          const api = shortCode ? CATALOGUE[shortCode] : undefined;
          if (!api) {
            json(404, { error: `No API with short code ${shortCode}.` });
          } else {
            mine.roles.push(api.role);
            json(204);
          }
        }
      } else if (!roles && method === 'GET') {
        json(200, view(mine));
      } else if (!roles && method === 'DELETE') {
        applications.delete(mine.clientId);
        json(204);
      } else {
        return false;
      }
      return true;
    }

    const productionPath = /^\/production-requests(?:\/([^/]+))?$/.exec(path);
    if (productionPath) {
      const user = requestingUserId?.toLowerCase();
      if (!user) {
        json(400, { error: 'Missing requestingUserId.' });
        return true;
      }
      if (!knownUsers().has(user)) {
        json(404, { error: 'Sign in again.' });
        return true;
      }
      const [, reference] = productionPath;
      const mine = reference ? productionRequests.get(decodeURIComponent(reference)) : undefined;
      const owned = mine?.owner === user ? mine : undefined;

      if (!reference && method === 'GET') {
        json(
          200,
          [...productionRequests.values()]
            .filter(request => request.owner === user)
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
            .map(summary)
        );
      } else if (!reference && method === 'POST') {
        submitProductionRequest(user, body, json);
      } else if (!owned) {
        json(404, { error: `No request with reference ${reference}.` });
      } else if (method === 'GET') {
        json(200, detail(owned));
      } else {
        return false;
      }
      return true;
    }

    if (path === '/products' && method === 'GET') {
      json(200, PRODUCTS);
      return true;
    }

    const keyPath = /^\/apim\/subscription-keys(?:\/([^/]+))?(\/values)?$/.exec(path);
    if (keyPath) {
      const id = requestingUserId ? knownUsers().get(requestingUserId.toLowerCase()) : undefined;
      if (id === undefined) {
        json(requestingUserId ? 404 : 400, {
          error: requestingUserId ? 'Sign in again.' : 'Missing requestingUserId.',
        });
        return true;
      }
      const prefix = `amp-user${String(id).padStart(3, '0')}-`;
      const [, name, values] = keyPath;
      const existing =
        name && decodeURIComponent(name).startsWith(prefix) ? subscriptions.get(decodeURIComponent(name)) : undefined;
      if (!name && method === 'POST') {
        const request = JSON.parse(body || '{}') as { clientId: string; shortCode: string };
        const application = applications.get(request.clientId);
        const api = CATALOGUE[request.shortCode];
        const subscriptionName = application && `${prefix}${application.appname}-${request.shortCode}`;
        if (!request.clientId || !request.shortCode) {
          json(400, { error: 'Choose which API to subscribe to. Say which application the subscription is for.' });
        } else if (!application || application.owner !== requestingUserId?.toLowerCase()) {
          json(404, { error: `No application with client id ${request.clientId}.` });
        } else if (!api) {
          json(404, { error: `No API with short code ${request.shortCode}.` });
        } else if (failSubscriptionsWith) {
          json(failSubscriptionsWith, { error: 'APIM could not be reached.' });
        } else if (subscriptions.has(subscriptionName as string)) {
          json(409, { error: `Already subscribed to ${request.shortCode}.` });
        } else {
          const primaryKey = crypto.randomBytes(16).toString('hex');
          subscriptions.set(subscriptionName as string, {
            productId: api.productId,
            displayName: application.name,
            primaryKey,
          });
          json(201, {
            shortCode: request.shortCode,
            title: api.title,
            productId: api.productId,
            subscriptionName,
            subscriptionKey: primaryKey,
          });
        }
      } else if (!existing) {
        json(404, { error: 'No such subscription.' });
      } else if (values && method === 'GET') {
        json(200, { name, primaryKey: existing.primaryKey });
      } else if (!values && method === 'DELETE') {
        subscriptions.delete(decodeURIComponent(name));
        json(204);
      } else {
        return false;
      }
      return true;
    }
    return false;
  }

  return { state, handle };
}
