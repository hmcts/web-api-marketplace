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

### AAT — 2 PRs

The AAT ingress already equals the required custom domain, so nothing in flux changes.

| #   | Repo                       | File                           | Change                                                     |
| --- | -------------------------- | ------------------------------ | ---------------------------------------------------------- |
| 5.1 | `azure-public-dns`         | `environments/staging/aat.yml` | CNAME `apim-marketplace-web` → the AAT Front Door endpoint |
| 5.2 | `azure-platform-terraform` | `environments/stg/stg.tfvars`  | Front Door entry (note: directory is `stg`, not `aat`)     |

```hcl
{
  name              = "apim-marketplace-web"
  custom_domain     = "apim-marketplace-web.aat.platform.hmcts.net"
  dns_zone_name     = "aat.platform.hmcts.net"
  backend_domain    = ["firewall-prod-int-palo-cftaat.uksouth.cloudapp.azure.com"]
  disabled_rules    = {}
  global_exclusions = []
},
```

Copy the shape of `expressjs-monorepo-template-web` in the same file — the closest analogue,
a Node GOV.UK frontend.

### Sandbox — 3 PRs

Sandbox is exposable and routine; the golden path walks lab users through it. It needs one
extra step only because the sbox patch uses the older `.internal` hostname.

| #   | Repo                       | File                                       | Change                                                                                                                                          |
| --- | -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.3 | `cnp-flux-config`          | `apps/apim/apim-marketplace-web/sbox.yaml` | `ingressHost: apim-marketplace-web.sandbox.platform.hmcts.net` — replacing `apim-marketplace-web-sandbox.service.core-compute-sandbox.internal` |
| 5.4 | `azure-public-dns`         | `environments/sandbox/sandbox.yml`         | CNAME under `cname:`                                                                                                                            |
| 5.5 | `azure-platform-terraform` | `environments/sbox/sbox.tfvars`            | Front Door entry                                                                                                                                |

```yaml
- name: 'apim-marketplace-web'
  ttl: 300
  record: 'hmcts-sbox-gufqadefbjgbhkhv.z01.azurefd.net'
```

```hcl
{
  product             = "apim"
  name                = "apim-marketplace-web"
  custom_domain       = "apim-marketplace-web.sandbox.platform.hmcts.net"
  mode                = "Prevention"
  dns_zone_name       = "sandbox.platform.hmcts.net"
  backend_domain      = ["firewall-sbox-int-palo-sbox.uksouth.cloudapp.azure.com"]
  cipher_suite_policy = "TLS12_2023"
},
```

Result: `https://apim-marketplace-web.sandbox.platform.hmcts.net`, no VPN.

### Order and review

Public DNS merges before the Front Door PR — Front Door validates domain ownership through
the DNS record. `azure-public-dns` and `azure-platform-terraform` are PlatOps-owned, so
raise them in `#platops-code-review`; the flux change you can self-merge.

Going fully public on a `service.gov.uk` domain is a separate GDS process, plus the Shutter
and Operational Acceptance Testing pages in path-to-live. Neither is needed for an internal
demo.

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
