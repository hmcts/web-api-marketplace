import crypto from 'node:crypto';

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ]{6,48}[A-Za-z0-9]$/;

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
 * and status codes the real ones answer with. `knownUsers` are the object ids /session has seen.
 */
export function stubMarketplace(knownUsers: () => Set<string>): {
  state: StubMarketplace;
  handle: (method: string, path: string, requestingUserId: string | undefined, body: string, json: Json) => boolean;
} {
  const applications = new Map<string, StubApplication>();
  const subscriptions = new Map<string, { productId: string; displayName: string; primaryKey: string }>();
  let notAssignable = 0;
  let refuseRolesWith: number | undefined;
  let failSubscriptionsWith: number | undefined;

  const state: StubMarketplace = {
    applications,
    subscriptions,
    roleNotAssignableFor: times => (notAssignable = times),
    refuseRoles: status => (refuseRolesWith = status),
    failSubscriptions: status => (failSubscriptionsWith = status),
    reset: () => {
      applications.clear();
      subscriptions.clear();
      notAssignable = 0;
      refuseRolesWith = undefined;
      failSubscriptionsWith = undefined;
    },
  };

  const view = ({ clientId, name, appname, secretHint, secretExpiresAt, createdAt }: StubApplication) => ({
    clientId,
    name,
    appname,
    secretHint,
    secretExpiresAt,
    createdAt,
  });

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
        const name = String(JSON.parse(body || '{}').name ?? '');
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
            roles: [],
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
          mine.roles.push(String(JSON.parse(body || '{}').role));
          json(204);
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

    const keyPath = /^\/apim\/subscription-keys(?:\/([^/]+))?(\/values)?$/.exec(path);
    if (keyPath) {
      const [, name, values] = keyPath;
      const existing = name ? subscriptions.get(decodeURIComponent(name)) : undefined;
      if (!name && method === 'POST') {
        const request = JSON.parse(body || '{}') as { name: string; productId: string; displayName: string };
        if (failSubscriptionsWith) {
          json(failSubscriptionsWith, { error: 'APIM could not be reached.' });
        } else if (!/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(request.name)) {
          json(400, { error: 'Name must be lower case letters, digits and hyphens, 2 to 80 characters.' });
        } else if (subscriptions.has(request.name)) {
          json(409, { error: 'A subscription of that name already exists.' });
        } else {
          const created = { ...request, primaryKey: crypto.randomBytes(16).toString('hex') };
          subscriptions.set(request.name, created);
          json(201, { name: request.name, state: 'active', primaryKey: created.primaryKey });
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
