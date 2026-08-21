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
- **No server-side session.** `express-session` was removed — nothing read `req.session`, and
  an in-memory store would not survive multiple replicas. A journey needing state means
  adding Redis, which becomes component-level Terraform in this repo.
