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
yarn start:dev
```

Then <https://localhost:3344>. The development server uses a self-signed certificate,
so expect a browser warning.

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
  modules/               appinsights, awilix, helmet, i18next, logging,
                         nunjucks, properties-volume
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
| Create a developer account, confirm email    | `/register`, `/register/check-email`, `/verify-email`    |
| Sign in, forgotten password                  | `/sign-in`, `/forgotten-password`, `/reset-password`     |
| First sign in: profile and guidelines        | `/account/welcome`                                       |
| Manage applications, create one, choose APIs | `/account/applications`, `/account/applications/new/...` |
| View, change APIs, view a subscription key   | `/account/applications/:id`, `.../apis`, `.../apis/:api` |
| Regenerate client secret, delete             | `/account/applications/:id/client-secret`, `.../delete`  |
| Request production credentials, follow it    | `/account/production-credentials`, `.../:reference`      |
| Request a new API                            | `/api-catalogue/request-new-api`                         |

`src/test/routes/links.ts` crawls every internal link signed out and signed in, and fails the
build on any that do not work.

### Stand-ins until service-api-marketplace has the endpoints

These are deliberate, and each is confined to one service so it can be swapped for a backend
call without touching the journeys:

- **Accounts registered here** (`services/Accounts.ts`) — the backend can look a user up but
  cannot create one, verify an address or reset a password. Passwords are scrypt-hashed.
  Accounts the backend already knows still sign in against it.
- **Applications and credentials** (`services/Applications.ts`, `services/Credentials.ts`) —
  client IDs, secrets and subscription keys are generated in Entra's and APIM's shapes but
  are **not registered with either**, and every page that shows them says so. Secrets are
  shown once and only their first three characters are kept.
- **Production credentials and new API requests** (`services/LocalRequests.ts`) — stored here
  and listed under My requests alongside the backend's own. So are subscribe and publish
  requests from accounts registered here, which the backend would refuse.
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
