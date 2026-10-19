# web-api-marketplace

Public frontend for the HMCTS API Marketplace.

Express 5 + TypeScript + Nunjucks + GOV.UK Frontend, deployed to CNP (CFT) by Jenkins.
Derived from [fact-public-frontend](https://github.com/hmcts/fact-public-frontend), which
remains the reference for the module and testing patterns used here.

|                     |                                                         |
| ------------------- | ------------------------------------------------------- |
| Product / component | `apim` / `frontend`                                     |
| Helm chart          | `apim-marketplace-web`                                  |
| Image               | `hmctsprod.azurecr.io/apim/marketplace-web`             |
| Jenkins folder      | `HMCTS_j_to_z` (via the `jenkins-cft-j-z` GitHub topic) |
| Key vault           | `apim-{env}` — shared with `service-api-marketplace`    |
| Local port          | 3344 (HTTPS in development)                             |

## Running locally

```bash
yarn install
yarn build
export ENTRA_CLIENT_SECRET=...   # from the Entra app registration
yarn start:dev
```

Then <https://localhost:3344>. The development server uses a self-signed certificate,
so expect a browser warning.

### Without Entra

To work on the pages behind sign in without setting Entra up at all:

```bash
BYPASS_ENTRA=true npm run start:dev
```

`/sign-in` then starts a session as John Doe (`john.doe@example.com`) without leaving the
service. No Entra settings are needed at all: the secret is never read, so there is no
`ENTRA_CLIENT_SECRET` to export and no Key Vault to be a reader of. The user is still saved
in service-api-marketplace exactly as a real sign in saves it, so applications and requests
work normally. To sign in through Entra again, drop the variable — anything but the exact
value `true` leaves it off.

It also needs `NODE_ENV` to be exactly `development`, which `start:dev` sets. `npm start`
sets `production`, so the bypass is off there however the variable is set — as it is in
every deployed environment, none of which sets `NODE_ENV` at all. The startup log says
which you have:

```
BYPASS_ENTRA is on: /sign-in starts a session as john.doe@example.com WITHOUT Entra. Local development only
BYPASS_ENTRA is set but ignored: it works only in development, and this is not. ...
```

Or let the server read the secret from Key Vault as it starts, with `DefaultAzureCredential`
(`modules/entra/secret.ts`) and your `az login` session. The value stays in the process;
nothing is written to a file:

```bash
az login   # once; you must be a reader of the secret
export ENTRA_KEY_VAULT=kvspsextidsbox
export ENTRA_KEY_VAULT_SECRET=entra-app-web-api-marketplace-secret
yarn start:dev
```

`config/development.json` signs in as `web-api-marketplace` (`8d56b09c-…`), the app
registration hmcts/external-entra-id manages in the sandbox tenant and whose secret that is.
The client ID and the secret must belong to the same app registration, or Entra answers
`AADSTS7000215` (invalid client secret). An `ENTRA_CLIENT_SECRET` that is already set wins.

The server refuses to start without `ENTRA_CLIENT_SECRET`, unless `BYPASS_ENTRA` is on.
Export it; do not put it in a file in this repo. Locally everything else defaults to the HMCTS sandbox tenant (`entra` in
`config/development.json`, loaded only when `NODE_ENV` is `development`). Deployed
environments run as `production` and have no defaults: they refuse to start until every
setting is given for their own tenant, so none can sign users in against the sandbox by
accident. The settings:
`ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_TENANT_ID` (or `ENTRA_AUTHORIZE_ENDPOINT` and
`ENTRA_TOKEN_ENDPOINT`), `ENTRA_DISCOVERY_ENDPOINT`, `ENTRA_REDIRECT_URI` and
`ENTRA_POST_LOGOUT_REDIRECT_URI`. The tenant ID alone gives both endpoints, on the tenant's own
host `https://<tenant-id>.ciamlogin.com/<tenant-id>/`.

An environment with no tenant yet sets `ENTRA_ENABLED=false` instead. The server then starts
with none of these, and sign in says it is unavailable. Only the exact value `false` switches
it off, so an environment that has just forgotten its settings still refuses to start.

`https://localhost:3344/auth/callback` and `https://localhost:3344/` must both be registered
as redirect URIs on the app registration: the first for signing in, the second for coming
back after signing out. They are managed in hmcts/external-entra-id
(`tenants/sbox/config/apps.yaml`, `web-api-marketplace`), which removes any added in the portal.
Only the first is registered there so far. On an address that is not registered, Entra
refuses with `AADSTS50011` before showing its form. To run elsewhere, register that
address's two URIs and set `PORT`, `ENTRA_REDIRECT_URI` and `ENTRA_POST_LOGOUT_REDIRECT_URI`
to match.

```bash
yarn lint          # stylelint + eslint + prettier
yarn test:unit     # jest
yarn test:routes   # supertest route tests
yarn test:functional  # playwright
```

### Smoke tests against the full stack

The `@smoke` Playwright tests run against web, service, Postgres and a mock Entra login from
[amp-marketplace-docker](https://github.com/hmcts/amp-marketplace-docker). CI runs the same
tests on every PR to `master`.

```bash
# 1. Start the stack (skip if it's already up)
cd ../amp-marketplace-docker
docker compose up --build -d

# 2. One-off setup in this repo
cd ../web-api-marketplace
nvm use 22
corepack enable
yarn install --immutable --mode=skip-build

# 3. Run the smoke tests
TEST_URL=http://localhost:3344 yarn test:smoke --project=chrome
```

Expect `2 passed`. After the first run, only step 3 is needed, plus `yarn install` again when
`yarn.lock` changes. Add `--headed` to watch the browser.

Always set `TEST_URL`: without it the tests use `https://localhost:3344`, which is right for
`yarn start:dev`, but the Docker stack serves plain `http`.

## Structure

```
src/main/
  app.ts                 express wiring
  server.ts              entrypoint (HTTPS in dev, HTTP in AKS)
  controllers/           awilix-express decorated routes, loaded by convention
  interfaces/            AppRequest — express Request plus i18next typing
  locales/en/            one JSON file per page
  modules/               appinsights, awilix, entra, helmet, i18next, logging,
                         nunjucks, properties-volume, session, store
  views/                 nunjucks templates
```

Controllers are discovered by `loadControllers('controllers/**/*')` — there is no route
registration step. A new page is a controller, a view, and a locale file per language.

## Pages and journeys

The public content migrated from the GitHub Pages site (AMP-1247) is served by
`ContentController` from `views/content/**`: Get started, Documentation, Help and support,
the publishing guidance and the privacy notice. The home page, API catalogue (rendered on the
server from the `amp-catalog` feed), cookies and accessibility statement have their own
controllers.

The consumer onboarding journey, end to end:

| Step                                         | Path                                                     |
| -------------------------------------------- | -------------------------------------------------------- |
| Create a developer account (on Entra)        | `/sign-in?prompt=create` (also `/register`)              |
| Sign in, forgotten password (on Entra)       | `/sign-in`, back to `/auth/callback`                     |
| First sign in: guidelines                    | `/account/welcome`                                       |
| Manage applications, create one, choose APIs | `/account/applications`, `/account/applications/new/...` |
| View, change APIs, view a subscription key   | `/account/applications/:id`, `.../apis`, `.../apis/:api` |
| Regenerate client secret, delete             | `/account/applications/:id/client-secret`, `.../delete`  |
| Request production credentials, follow it    | `/account/production-credentials`, `.../:reference`      |

`src/test/routes/links.ts` crawls every internal link signed out and signed in, and fails the
build on any that do not work.

### Signing in

Developer accounts belong to Microsoft Entra External ID. Its pages handle signing in,
creating an account, confirming the email address and resetting a password, so no password
reaches this service. The flow is OpenID Connect's authorization code flow:

1. `/sign-in` (`SignInController`) puts a random `state`, `nonce` and PKCE code verifier in
   the session and redirects to Entra with the verifier's SHA-256 as the `code_challenge`.
   `?prompt=create` opens Entra on its create-account form.
2. Entra sends the browser back to `/auth/callback` (`AuthCallbackController`) with a
   single-use code. The `state` must match the session's.
3. The code is swapped for an ID token server to server, using the client secret and the
   PKCE verifier, so a code intercepted on its way back is no use on its own, and the
   token is verified (`services/Entra.ts`): RS256 signature against the tenant's published
   keys, issuer, audience, expiry and `nonce`.
4. The token's `oid`, email and name (Entra holds a single display name, not first and last)
   are posted to service-api-marketplace's `POST /session` (`services/EntraUsers.ts`). The
   backend creates the user the first time and brings them up to date on every later sign in. If it cannot be reached or refuses, sign in says it is
   unavailable and no session starts.
5. The session starts as the backend's user, with the token's `oid`, name and email, and every
   sign in lands on `/account`, whichever page asked for it.

Signing out ends Entra's session too, then comes back to the home page.

`BYPASS_ENTRA=true` skips steps 1 to 3 and starts the session at step 4, as a fixed user
(`services/EntraBypass.ts`). Development only — see [Without Entra](#without-entra).

The tests sign in against a stub tenant (`src/test/stubs/entra.ts`) that issues really
signed tokens, so the same requests and checks run as in production. Only Entra's own pages
are skipped.

### Stand-ins until service-api-marketplace has the endpoints

These are deliberate, and each is confined to one service so it can be swapped for a backend
call without touching the journeys:

- **Profiles** (`services/Profiles.ts`) — when each user agreed to the guidelines, keyed by
  their Entra `oid`. The backend holds users but not yet requests, so every user is still
  `local`: their production credentials requests go to the data store.
- **Applications** (`services/Applications.ts`) — registered for real through the backend's
  `/applications` (Entra) and `/apim/subscription-keys` (APIM), sending the user's `oid` as
  `requestingUserId`. The secret is shown once, on the page after creating it. The backend does
  not yet record which subscription keys belong to an application or whether its role
  (`APPLICATIONS_ROLE`, default `app.read`) has been granted, so those are kept here against the
  client ID, and subscription keys are given temporary names under the user's prefix,
  `amp-user001-temp-…`, which the backend requires.
- **Production credentials requests** (`services/LocalRequests.ts`) — stored here, and
  listed under My requests, until the backend has somewhere to put them. There is no access
  request ("subscribe") journey: an API is added to an application instead.
- **GOV.UK Notify** (`services/Notify.ts`) — no email is sent. The page that follows shows the
  email, with its link, while `NOTIFY_SHOW_EMAILS_ON_PAGE` is true (the default). Turn it off
  once Notify is wired in.

All of it is held in the data store (`modules/store`): the session Redis when `REDIS_HOST` is
set, otherwise memory for that one process.

## Outstanding

These are known gaps from the initial AMP-1031 onboarding, not oversights:

- **App Insights is stubbed.** `APPLICATIONINSIGHTS_ENABLED: 'false'` in the chart. There is
  no `azurerm_application_insights` resource for the `apim` product, and the `apim-{env}`
  vault holds only the `marketplace-POSTGRES-*` secrets. Once a connection string exists in
  the vault and the managed identity has _Key Vault Secrets User_ on it, add `aadIdentityName`
  and `keyVaults` back to `charts/apim-marketplace-web/values.yaml`.
- **Entra in sandbox** is wired in cnp-flux-config (`apps/apim/apim-marketplace-web/sbox.yaml`):
  `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` and `ENTRA_TENANT_ID` are mounted from `kvspsextidsbox`,
  where hmcts/external-entra-id writes them, and read with the pod's workload identity
  (`workloadClientID` `775648eb-…`, `apim-sandbox-mi`). `modules/properties-volume` maps them into
  the Entra config.
- **Entra in AAT and demo** is switched off (`ENTRA_ENABLED=false` in cnp-flux-config's
  `aat.yaml` and `demo.yaml`, and in `values.aat.template.yaml` for the pipeline's AAT deploy),
  so sign in there says it is unavailable. Switching it on needs a tenant (`stg` or `prod` in external-entra-id, vaults `kv-entra-stg` and
  `kv-entra-prod`), the app registered there, and the same `keyVaults` and `workloadClientID`.
- **Redirect URIs still to register** on `web-api-marketplace` in external-entra-id: each
  environment's home page (the post-sign-out address, `ENTRA_POST_LOGOUT_REDIRECT_URI`).
  Previews have sign in switched off, since each has its own address and Entra takes no
  wildcard redirect URIs.
- **No feedback survey.** The phase banner links to `#`. Needs a real survey URL.
- **No analytics or RUM.** `analytics.gtmContainerId` and all `dynatrace.jstags` are empty, so
  neither script is rendered. Populate them with this service's own identifiers — the values
  inherited from FACT were deliberately removed rather than reused.
- **No backend calls.** FACT's `requests/`, `schemas/` and `services/` layers were removed
  along with its court domain. Add an axios client and Zod schemas when wiring to
  `service-api-marketplace`; FACT's `axiosConfig.ts` is the reference for the app-registration
  bearer-token pattern, which needs two Entra ID registrations.
