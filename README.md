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

Or let the server read the secret from Key Vault as it starts, with `DefaultAzureCredential`
(`modules/entra/secret.ts`) — your `az login` session locally, the pod's workload identity
(a managed identity) in AKS. The value stays in the process; nothing is written to a file:

```bash
az login   # once; you must be a reader of the secret
export ENTRA_KEY_VAULT=kvspsextidsbox
export ENTRA_KEY_VAULT_SECRET=entra-app-web-api-marketplace-secret
export ENTRA_CLIENT_ID=8d56b09c-7e56-4bbb-8aa7-b26e1fc67969   # the app that secret belongs to
yarn start:dev
```

The client ID and the secret must belong to the same app registration, or Entra answers
`AADSTS7000215` (invalid client secret). An `ENTRA_CLIENT_SECRET` that is already set wins.

The server refuses to start without `ENTRA_CLIENT_SECRET`. Export it; do not put it in a
file in this repo. Locally everything else defaults to the HMCTS sandbox tenant (`entra` in
`config/development.json`, loaded only when `NODE_ENV` is `development`). Deployed
environments run as `production` and have no defaults: they refuse to start until every
setting is given for their own tenant, so none can sign users in against the sandbox by
accident. The settings:
`ENTRA_CLIENT_ID`, `ENTRA_AUTHORIZE_ENDPOINT`, `ENTRA_TOKEN_ENDPOINT`,
`ENTRA_DISCOVERY_ENDPOINT`, `ENTRA_REDIRECT_URI` and `ENTRA_POST_LOGOUT_REDIRECT_URI`.

`https://localhost:3344/auth/callback` and `https://localhost:3344/` must both be registered
as redirect URIs on the app registration (Authentication → Web): the first for signing in,
the second for coming back after signing out. On an address that is not registered, Entra
refuses with `AADSTS50011` before showing its form. To run elsewhere, register that
address's two URIs and set `PORT`, `ENTRA_REDIRECT_URI` and `ENTRA_POST_LOGOUT_REDIRECT_URI`
to match.

```bash
yarn lint          # stylelint + eslint + prettier
yarn test:unit     # jest
yarn test:routes   # supertest route tests
yarn test:functional  # playwright
```

## Structure

```
src/main/
  app.ts                 express wiring
  server.ts              entrypoint (HTTPS in dev, HTTP in AKS)
  controllers/           awilix-express decorated routes, loaded by convention
  interfaces/            AppRequest — express Request plus i18next typing
  locales/{en,cy}/       one JSON file per page
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
| First sign in: organisation, guidelines      | `/account/welcome`                                       |
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

1. `/sign-in` (`SignInController`) puts a random `state` and `nonce` in the session and
   redirects to Entra. `?prompt=create` opens Entra on its create-account form.
2. Entra sends the browser back to `/auth/callback` (`AuthCallbackController`) with a
   single-use code. The `state` must match the session's.
3. The code is swapped for an ID token server to server, using the client secret, and the
   token is verified (`services/Entra.ts`): RS256 signature against the tenant's published
   keys, issuer, audience, expiry and `nonce`.
4. The session starts with the token's `oid`, name and email. The first time, `/account/welcome`
   asks for the organisation and account type Entra does not hold, and keeps them against the
   `oid` (`services/Profiles.ts`).

Signing out ends Entra's session too, then comes back to the home page.

The tests sign in against a stub tenant (`src/test/stubs/entra.ts`) that issues really
signed tokens, so the same requests and checks run as in production. Only Entra's own pages
are skipped.

### Stand-ins until service-api-marketplace has the endpoints

These are deliberate, and each is confined to one service so it can be swapped for a backend
call without touching the journeys:

- **Profiles** (`services/Profiles.ts`) — each user's organisation and account type, keyed by
  their Entra `oid`. The backend cannot resolve an Entra user yet, so every user is treated
  as one it does not know (`local`): their subscribe requests go to the data store, and
  requests the backend already holds are not listed for them.
- **Applications and credentials** (`services/Applications.ts`, `services/Credentials.ts`) —
  client IDs, secrets and subscription keys are generated in Entra's and APIM's shapes but
  are **not registered with either**, and every page that shows them says so. Secrets are
  shown once and only their first three characters are kept.
- **Production credentials requests** (`services/LocalRequests.ts`) — stored here
  and listed under My requests alongside the backend's own. So are subscribe
  requests from users the backend does not know, which it would refuse.
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
- **Entra settings per environment.** Each deployed environment needs its own
  `ENTRA_CLIENT_ID`, `ENTRA_AUTHORIZE_ENDPOINT` and `ENTRA_TOKEN_ENDPOINT`, or the pod will
  not start.
- **Entra client secret in the key vault.** AKS gets `ENTRA_CLIENT_SECRET` from the
  `apim-{env}` vault (`modules/properties-volume`), which needs the same `aadIdentityName`
  and `keyVaults` as App Insights above. Until it is there the pod will not start. Alternatively,
  set `ENTRA_KEY_VAULT` and `ENTRA_KEY_VAULT_SECRET` and the server reads it itself with the
  pod's workload identity: in sandbox that is `apim-sandbox-mi`, already a reader of
  `kvspsextidsbox/entra-app-web-api-marketplace-secret` (external-entra-id), and federated to
  service account `apim` in namespace `apim`. Each
  environment's `/auth/callback` and home page must also be registered on the app
  registration (see the chart).
- **No Welsh translations.** `locales/cy/*.json` currently mirrors the English strings. The
  language toggle works, but the Welsh content is not translated. Decide whether this service
  needs Welsh at all before commissioning translation.
- **No feedback survey.** The phase banner links to `#`. Needs a real survey URL.
- **No analytics or RUM.** `analytics.gtmContainerId` and all `dynatrace.jstags` are empty, so
  neither script is rendered. Populate them with this service's own identifiers — the values
  inherited from FACT were deliberately removed rather than reused.
- **No backend calls.** FACT's `requests/`, `schemas/` and `services/` layers were removed
  along with its court domain. Add an axios client and Zod schemas when wiring to
  `service-api-marketplace`; FACT's `axiosConfig.ts` is the reference for the app-registration
  bearer-token pattern, which needs two Entra ID registrations.
