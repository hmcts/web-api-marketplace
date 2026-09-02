# CNP Onboarding Plan — apim/marketplace-web

Service: `web-api-marketplace`
Product: `apim` · Component: `marketplace-web`
Ticket: AMP-1031

Status: ✅ done · ⏳ waiting on someone else · ○ to do · ⚠️ check first

---

## Names reference

All deployment names derive from `{product}-{component}` = `apim-marketplace-web`.
The repo name is deliberately different — it follows the team's `{type}-{name}` convention,
matching `service-api-marketplace`.

| What                            | Name                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| **GitHub repo**                 | `web-api-marketplace`                                        |
| **GitHub topic**                | `jenkins-cft-j-z`                                            |
| **Jenkins job path**            | `HMCTS_j_to_z/web-api-marketplace`                           |
| **Jenkins product / component** | `apim` / `marketplace-web`                                   |
| **Kubernetes namespace**        | `apim` (shared with `service-api-marketplace`)               |
| **Helm chart / release**        | `apim-marketplace-web`                                       |
| **Docker image**                | `hmctsprod.azurecr.io/apim/marketplace-web`                  |
| **Flux config path**            | `apps/apim/apim-marketplace-web/`                            |
| **Azure Key Vault**             | `apim-{env}` (shared — created by `service-api-marketplace`) |
| **Managed identity**            | `apim-{env}-mi`                                              |
| **Ingress (AAT)**               | `apim-marketplace-web.aat.platform.hmcts.net`                |
| **Preview**                     | `apim-marketplace-web-pr-{N}.preview.platform.hmcts.net`     |
| **AAD group / Backstage owner** | `DTS API Marketplace` / `group:dts-api-marketplace`          |
| **Slack**                       | `#api-marketplace-tech`                                      |
| **Sonar key**                   | `web-api-marketplace`                                        |

> **Why `marketplace-web` and not `frontend`:** `apim-frontend` reads as "a frontend for
> Azure APIM", which is a real and unhelpful collision. Keeping `marketplace` in the
> component name disambiguates. The `apim` product prefix itself is fixed — it is the
> existing CNP product, namespace and vault shared with the backend, and changing it would
> mean migrating a live service.

---

## Phase 0 — Already in place from `service-api-marketplace`

Nothing to do here. Recorded because it is why this onboarding is unusually short.

| #   | Item                                                                                             | Status |
| --- | ------------------------------------------------------------------------------------------------ | ------ |
| 0.1 | `apim` product in `cnp-jenkins-config/team-config.yml` — namespace, AAD group, Slack             | ✅     |
| 0.2 | `apim` namespace kustomizations on `cnp-flux-config` master (aat, demo, preview, serviceaccount) | ✅     |
| 0.3 | `apps/apim/automation` registered in `apps/flux-system/automation`                               | ✅     |
| 0.4 | Key vault `apim-{env}`, RG `apim-shared-{env}`, managed identity `apim-{env}-mi`                 | ✅     |

**No Terraform is needed in this repo.** There is no `infrastructure/` directory, so the
pipeline runs no Terraform stage and no `terraform-infra-approvals` file is required. The
vault already exists and predates this service, which also avoids the bootstrap deadlock —
`withPipeline` only runs `terraform apply` on master, so a vault created by this repo's own
Terraform would not exist during PR builds and mounts would fail with `Init:0/1`.

---

## Phase 1 — Repository

| #    | Step                                                                    | Status | Notes                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Repo created, public                                                    | ✅     | Created from `hmcts/expressjs-template` via GitHub's "Use this template"                                                                                                                                                           |
| 1.2  | Team access — `api-marketplace` maintain, `api-marketplace-admin` admin | ✅     | Matches `service-api-marketplace`                                                                                                                                                                                                  |
| 1.3  | Topic `jenkins-cft-j-z`                                                 | ✅     | Routes to `HMCTS_j_to_z`, same folder as the backend                                                                                                                                                                               |
| 1.4  | Branch protection on `master`                                           | ✅     | PR required, 1 approval, `enforce_admins`, no force-push, no deletion                                                                                                                                                              |
| 1.5  | `catalog-info.yaml` populated                                           | ✅     | Template placeholders were unsubstituted — GitHub's template button does no templating                                                                                                                                             |
| 1.5a | Component renamed `frontend` → `marketplace-web`                        | ✅     | Landed across two PRs — #2 then #7. #2 was incomplete: `git mv` staged the chart directory but the accompanying edits were not, leaving master with `charts/apim-marketplace-web/` containing a `Chart.yaml` named `apim-frontend` |
| 1.6  | Application code                                                        | ✅     | Derived from `fact-public-frontend`; single Hello world page                                                                                                                                                                       |
| 1.7  | Add `continuous-integration/jenkins/pr-merge` as required status check  | ○      | **Only possible after the first Jenkins build** — the check name is not selectable until then                                                                                                                                      |

---

## Phase 2 — Supporting PRs

| #   | Step                                       | Status    | PR                                                                                                                           |
| --- | ------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | `deployment-controls.yml` entry            | ✅ merged | hmcts/cnp-jenkins-config#1318                                                                                                |
| 2.2 | Flux HelmRelease + image automation        | ✅ merged | hmcts/cnp-flux-config#47001                                                                                                  |
| 2.3 | `environment-approvals.yml` for production | ○ later   | Not needed until prod. Master builds will fail the prod stage with _not approved for environment prod_ until then — expected |

All 17 checks passed. Note the image tag in the HelmRelease is seeded as
`prod-0000000-00000000000000` — the image-automation test rejects `:latest`, and flux
rewrites the seed to a real tag once the first image reaches ACR.

---

## Phase 3 — Jenkins first run

Do these in order. Nothing will build before 3.1 completes.

| #    | Step                              | Status | Notes                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | --------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Seed job approved and run         | ✅     | `build.hmcts.net/job/Seed%20Job/` fails with _script not yet approved for use_ until a Jenkins admin approves `organisations-beta.groovy` under Manage Jenkins → In-process Script Approval. Raise in `#platops-help`. Then click **Build Now** and wait for green — this bakes the repo into the org folder's allowlist, read from `deployment-controls.yml` on master |
| 3.2  | Scan Organization                 | ✅     | `build.hmcts.net/job/HMCTS_j_to_z/` → **Scan Organization Now**. The job folder appears but is empty — "no branches found". Expected                                                                                                                                                                                                                                    |
| 3.3  | Scan Repository                   | ○      | Click into `HMCTS_j_to_z/web-api-marketplace` → **Scan Repository Now**. Jenkins finds `Jenkinsfile_CNP` on master and queues the build                                                                                                                                                                                                                                 |
| 3.3a | SonarQube quality gate passes     | ✅     | Build #2 aborted with _Pipeline aborted due to quality gate failure: NONE_ — a brand-new project has no gate for `waitForQualityGate` to read. It resolved itself on re-run once the first analysis had created the project. No config change was needed                                                                                                                |
| 3.4  | First build green                 | ○      | Stages: Checkout → Build → Test → Docker push to ACR → Deploy preview                                                                                                                                                                                                                                                                                                   |
| 3.5  | Chart published to `hmcts-charts` | ○      | Automatic on a successful master build, on version increment. Flux cannot reconcile until `stable/apim-marketplace-web` exists                                                                                                                                                                                                                                          |

### Failure modes to expect

| Symptom                                              | Cause                                                       | Action                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| Repo not in Jenkins after scanning                   | Topic missing, or seed job not run                          | Both are done — re-run 3.2                                |
| `namespaces "apim" not found`                        | Flux namespace not reconciled                               | `apim` already exists; should not occur                   |
| Old ACR reference failure                            | `hmctspublic` in chart or values                            | Already `hmctsprod` throughout                            |
| Startup probe failing                                | App port disagrees with `applicationPort`                   | Both are 3344                                             |
| Prod stage: not approved                             | `environment-approvals.yml` not raised                      | Expected — see 2.3                                        |
| `Init:0/1`, MountVolume.SetUp failed                 | Vault mount without RBAC                                    | No `keyVaults` block is set — App Insights is stubbed     |
| HelmRelease failing in flux                          | Chart not yet in `hmcts-charts`                             | Expected until 3.5                                        |
| Build fails looking for `charts/apim-frontend`       | Chart directory and `Chart.yaml` name disagree              | Fixed by #7 — re-run Scan Repository                      |
| `Pipeline aborted due to quality gate failure: NONE` | Brand-new SonarQube project has no gate yet                 | Re-run the build — the first analysis creates the project |
| `ERROR: Functional test failed`                      | FACT's Playwright specs drive journeys that no longer exist | Trimmed to two tests — see 3.3b                           |

---

## Phase 4 — After the first successful build

| #   | Step                                                                                           | Status |
| --- | ---------------------------------------------------------------------------------------------- | ------ |
| 4.1 | Preview health check — `https://apim-marketplace-web-pr-{N}.preview.platform.hmcts.net/health` | ○      |
| 4.2 | AAT health check — `https://apim-marketplace-web.aat.platform.hmcts.net/health`                | ○      |
| 4.3 | `kubectl get helmrelease -n apim` shows `apim-marketplace-web` reconciled                      | ○      |
| 4.4 | Add the Jenkins required status check (1.7)                                                    | ○      |
| 4.5 | Confirm flux replaced the seed image tag `prod-0000000-00000000000000` with a real one         | ○      |

```bash
az aks get-credentials --resource-group cft-aat-01-rg --name cft-aat-01-aks \
  --subscription DCD-CFTAPPS-STG --overwrite-existing
kubectl get helmrelease -n apim
```

---

## Phase 5 — Exposing the service publicly

Both internal hostnames (`*.platform.hmcts.net`, `*.service.core-compute-*.internal`)
resolve only on the HMCTS VPN. Public access means putting the service behind Azure Front
Door, per [path-to-live](https://hmcts.github.io/cloud-native-platform/path-to-live/).

Front Door → firewall → Application Gateway routes by **host header**, so the ingress host
must equal the public custom domain. That is the whole reason sandbox needs an extra step
and AAT does not.

### Two things the older guidance gets wrong

- **Frontends skip the load balancer step.** _"Frontend applications are automatically
  handled as part of the front door config"_ — no `backend_lb_config.yaml` change.
- **The firewall step is stale.** The golden path tells you to edit `hub-terraform-infra`
  (`public_lb_config` / `aks_config`). Sandbox's `public_lb_config` holds five entries and
  none of the recent services are among them, while `golden-path-k-t` and
  `labs-tmckillop95-nodejs` have Front Door entries and no firewall entries. Skip it.

No certificate work either — Microsoft-managed certificates are mandatory on Front Door and
are generated from the config. Only if a domain fails to reach `deployed` do you add a
validation TXT record in `azure-public-dns`.

### All environments — ⏳ two PRs raised, awaiting PlatOps

Both are PlatOps-owned, so they need real review — they cannot be self-merged.
**The DNS PR must merge first:** Front Door validates domain ownership through the DNS
record, and the managed certificate will not deploy without it.

| #   | PR                                  | Change                                                              | Status                 |
| --- | ----------------------------------- | ------------------------------------------------------------------- | ---------------------- |
| 5.1 | hmcts/azure-public-dns#2478         | CNAMEs for demo, AAT and prod                                       | ⏳ raised, merge first |
| 5.2 | hmcts/azure-platform-terraform#3114 | Front Door entries for demo, AAT, prod + WAF exclusions on all four | ⏳ raised              |

Sandbox already had its DNS record and Front Door entry (raised by Alex Bance); 5.2 adds the
missing WAF exclusions to it.

Per-environment values, all following the dominant convention in each file. `custom_domain`
must equal the flux `ingressHost` exactly — Front Door routes through the firewall to the
App Gateway, which dispatches on host header.

| Env  | custom_domain                                     | backend_domain       | certificate                           |
| ---- | ------------------------------------------------- | -------------------- | ------------------------------------- |
| sbox | `apim-marketplace-web.sandbox.platform.hmcts.net` | `…palo-sbox`         | `wildcard-sandbox-platform-hmcts-net` |
| demo | `apim-marketplace-web.demo.platform.hmcts.net`    | `…cftdemoappgateway` | `wildcard-demo-platform-hmcts-net`    |
| stg  | `apim-marketplace-web.aat.platform.hmcts.net`     | `…cftaat`            | `wildcard-aat-platform-hmcts-net`     |
| prod | `apim-marketplace-web.platform.hmcts.net`         | `…cftprod`           | `wildcard-platform-hmcts-net`         |

Note the AAT directory is `environments/stg/`, not `aat`.

**Production is deliberately ahead of the deployment.** There is no `apim` overlay for prod
in `cnp-flux-config`, so nothing runs there and both records are inert until it does.
Including them now means enabling production later is a flux change alone, rather than
another round of DNS and Front Door review.

### Sandbox — ✅ already exposed

Sandbox went public first, raised by Alex Bance: the CNAME in
`azure-public-dns environments/sandbox/sandbox.yml` and the Front Door entry in
`azure-platform-terraform environments/sbox/sbox.tfvars`, plus a flux change moving the
`sbox.yaml` ingressHost from the older `.internal` form onto
`apim-marketplace-web.sandbox.platform.hmcts.net`.

Live at `https://apim-marketplace-web.sandbox.platform.hmcts.net`, no VPN — but see the WAF
section below: it still 403s any user who answers the cookie banner, which 5.2 fixes.

That entry sets no `mode`, so the module default applies — and the default turns out to be
Prevention, which is why the WAF is blocking at all. Worth asking PlatOps why, when `plum`
in the same file also sets no `mode` and is unaffected.

### The WAF blocks the cookie-consent cookie ⚠️

**Front Door runs its WAF in Prevention mode for this service, and it blocks the cookie
`@hmcts/cookie-manager` writes.** Any user who answers the cookie banner then gets HTTP 403
on every request until they clear cookies — a total outage for that user, not a degraded
experience.

The cookie holds JSON: `apim-cookie-preferences={"analytics":"off","apm":"off"}`. The WAF's
SQL-injection detector tokenises the value and, past a certain size, resolves it to
something resembling an injection payload. Measured behaviour:

| Cookie value            | Length | Result  |
| ----------------------- | ------ | ------- |
| `off`                   | 3      | 200     |
| `analytics-off-apm-off` | 21     | 200     |
| `{"aa":"bb"}`           | 11     | 200     |
| `{"aaa":"bb"}`          | 12     | **403** |
| `{"analytics":"off"}`   | 19     | **403** |

It needs both the JSON structure and enough length — long plain values pass, short JSON
passes. Nothing semantic: `{"aaa":"bb"}` is blocked while `analytics-off-apm-off` is not.
A textbook false positive.

**Symptom to recognise:** the browser shows a Front Door block page with a reference like
`20260901T131445Z-15c994b9b97…`, and `fetch` calls fail with
`Unexpected token '<', "<!DOCTYPE "... is not valid JSON` because the block page is HTML.
Nothing appears in the pod logs — the request never reaches the service. `curl` without
cookies succeeds, which makes it easy to misdiagnose as a browser cache problem.

**Fix:** `global_exclusions` on the Front Door entry, naming each cookie. Raised as
hmcts/azure-platform-terraform#3114 for all four environments.

Thirteen cookies are excluded, not two. `connect.sid` and `_csrf` are listed ahead of adding
sessions and CSRF protection, and the Google Analytics and Dynatrace cookies ahead of
enabling those tags — across the environment tfvars those names are already excluded by
dozens of services (`connect.sid` by 58, `_csrf` by 16), so each would hit the same 403. An
exclusion for a cookie that is never set does nothing; the alternative is rediscovering this
once per cookie.

```
apim-cookie-preferences  i18next  connect.sid  _csrf
_ga  _gid  _gat
dtCookie  dtLatC  dtPC  dtSa  rxVisitor  rxvt
```

This is the house pattern — FACT excludes `fact-cookie-preferences`, and
`nfdiv-cookie-preferences`, `cmc-cookie-preferences` and `money-claims-cookie-preferences`
all appear the same way.

> **The selector must match the cookie name exactly.** It is set in
> `src/main/bundles/cookie-preferences.ts` and shown to users in `views/cookies.njk`.
> Renaming it without a matching PlatOps PR silently restores the outage.

> Worth asking why this service's Front Door entry runs WAF in Prevention while others in
> the same file (`plum`) set no `mode` at all and are unaffected.

### Beyond platform.hmcts.net

These hostnames are on `platform.hmcts.net`, which is publicly resolvable but is not a
service domain. Going live on a `service.gov.uk` address is a separate GDS process, plus the
Shutter and Operational Acceptance Testing pages in path-to-live. Neither is needed for an
internal demo or for the work above.

---

## Phase 6 — Product gaps

Deliberately deferred to get the service deploying. Each needs a product decision, not
just code.

| #   | Item                | Notes                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | App Insights        | Stubbed with `APPLICATIONINSIGHTS_ENABLED: 'false'`. There is **no** `azurerm_application_insights` resource for the `apim` product, and the vault holds only `marketplace-POSTGRES-*`. Needs the resource created and a secret added — and that Terraform currently lives in `service-api-marketplace/infrastructure/`, which is the trigger to consider extracting `apim-shared-infrastructure` |
| 6.2 | Welsh translations  | `locales/cy/*.json` mirrors English. The toggle works but nothing is translated. Decide whether this service needs Welsh before commissioning it                                                                                                                                                                                                                                                  |
| 6.3 | Feedback survey     | Phase banner links to `#`                                                                                                                                                                                                                                                                                                                                                                         |
| 6.4 | Analytics / RUM     | `analytics.gtmContainerId` and all `dynatrace.jstags` are empty, so neither script renders. FACT's own GTM container and Dynatrace tags were deliberately removed rather than reused — populate with this service's own identifiers                                                                                                                                                               |
| 6.5 | Backend integration | FACT's `requests/`, `schemas/` and `services/` were removed with its court domain. FACT's `axiosConfig.ts` is the reference for the app-registration bearer-token pattern, which needs two Entra ID registrations                                                                                                                                                                                 |
| 6.6 | Sessions            | `express-session` removed — nothing read `req.session` and an in-memory store would not survive multiple replicas. A journey needing state means Redis, which becomes component-level Terraform in this repo                                                                                                                                                                                      |

---

## Reference

| Subscription        | Used for                                                     |
| ------------------- | ------------------------------------------------------------ |
| `DCD-CNP-DEV`       | Terraform creates managed identities, RGs, vaults (non-prod) |
| `DCD-CNP-Prod`      | ACR, production infrastructure                               |
| `DCD-CFTAPPS-STG`   | AAT AKS cluster — `cft-aat-01-aks`                           |
| `DTS-CFTPTL-INTSVC` | Jenkins infrastructure, DNS records                          |

Documentation: [The HMCTS Way](https://hmcts.github.io/cloud-native-platform/) —
_Starting a new component_ is the relevant section.
