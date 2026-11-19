# Admin dashboard: registered users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can go from the Admin tab to a list of active registered users, and from there to one user's details, applications and production credentials requests.

**Architecture:** The backend (hmcts/service-api-marketplace) gets two admin-only endpoints, `GET /admin/users` and `GET /admin/users/{userId}`. They're spec first, implement the generated `AdminApi`, and answer 403 to anyone who isn't an admin. The web app (hmcts/web-api-marketplace) calls them through `callBackend` and renders `/admin/users` and `/admin/users/:id` with GOV.UK components. Both pages use the same guard as `/admin`. The backend PR ships first.

**Tech Stack:**

- Backend: Java 21, Spring Boot, Spring Data JPA, MapStruct, openapi-generator `spring`, JUnit 5 with Mockito and Testcontainers.
- Web: TypeScript, Express with awilix-express, Nunjucks with govuk-frontend, Jest, supertest.

**Spec:** `docs/superpowers/specs/2026-11-19-admin-registered-users-design.md` (web repo)

## Global Constraints

- **Read-only.** No endpoint or page changes data.
- **Who can see it:**
  - Backend: a caller who isn't `ADMIN` gets **403**. A missing caller gets 400 and an unknown one gets 404, as `UserService.requireSignedIn` already does.
  - Web: signed out → `/sign-in`. Signed in but not an admin → `next()`, which shows the app's 404.
- **Never in a response:** client ids, object ids, secrets or hints, subscription names, Entra object ids.
- **The list:** only `status = ACTIVE`, newest `createdAt` first. The details page shows a user of any status.
- **Organisation:** the `organisation` from the user's most recent production request (by `submittedAt`), or null.
- **Applications:** oldest `createdAt` first. **Production requests:** newest `submittedAt` first.
- **Exact wording:**
  - Users page: "Users", "Everyone who has registered, newest first.", "Search by name or email", "Search", "N users." / "1 user.".
  - Users table headings: "Name", "Email", "Joined", "Last signed in", "Applications".
  - Details page: caption "User".
  - Summary list rows: "Name", "Email", "Organisation", "Status", "Joined", "Last signed in".
  - Section headings: "Applications" and "Production credentials requests".
  - Applications table headings: "Application", "APIs", "Created". The API count reads "1 API" / "N APIs".
  - Production requests table headings: "Reference", "Application", "Status", "Submitted".
  - Empty states: "This user has not created any applications." and "This user has not asked for production credentials."
  - A missing value shows "Not known".
- **Dates:** "29 October 2026", formatted as `AccountController.formatDate` does. Status `ACTIVE` reads "Active", and other user statuses are shown in sentence case. Production request status uses `statusText` from `src/main/services/LocalRequests.ts`.
- **The application name is plain text, not a link.**
- **The Admin nav item is highlighted** (`section = "admin"`) on all three admin pages.
- **Commits:** no Claude attribution, in either commits or PRs.

## Review Focus

1. **Calling the backend directly as a non-admin:** a `USER` who calls `/admin/users` or `/admin/users/{id}` with their own `requestingUserId` gets 403 and no data. Tested in Tasks 1 and 2.
2. **Search input:**
   - A search with spaces round it, or in a different case (`"  ADA "`), still matches "Ada Lovelace".
   - A search that matches nobody shows "0 users." and no table, rather than an empty table.
   - Tested in Task 4.
3. **A user id that isn't a number** (`/admin/users/abc`, or `/admin/users/1%2F..`): shows the app's 404, and the backend is never called with it. Tested in Task 5.
4. **A user with a blank name** (Entra sent no name): their row still has a link to click. The link text falls back to the email address. Tested in Task 4.
5. **The backend is down or answers 500:** the page says the users could not be loaded and returns 200 with the normal layout, not the error page. Tested in Tasks 4 and 5.

---

## Part A: backend (hmcts/service-api-marketplace)

Work in a new worktree on a new branch from `origin/master`, for example
`git worktree add ../service-api-marketplace-admin -b AMP-admin-registered-users origin/master`.
Run tests with `./gradlew test integration`. If there's no `NOTIFY_API_KEY`, exclude `NotifyFunctionalTest` locally.

### Task 1: Spec, admin guard and `GET /admin/users`

**Files:**

- Modify: `infrastructure/amp/specs/api-marketplace.openapi.yml`:
  - path `/admin/users` (tag `admin`, operationId `listAdminUsers`);
  - schema `AdminUser`;
  - response `NotAnAdmin` (403, `Error`).
- Create: `src/main/java/uk/gov/hmcts/amp/domain/AdminUserSummary.java`
- Create: `src/main/java/uk/gov/hmcts/amp/services/AdminService.java`
- Create: `src/main/java/uk/gov/hmcts/amp/controllers/AdminController.java`
- Modify: `src/main/java/uk/gov/hmcts/amp/mappers/ResponseMapper.java`
- Modify: `src/main/java/uk/gov/hmcts/amp/repository/UserRepository.java`
- Modify: `src/main/java/uk/gov/hmcts/amp/repository/ApplicationRepository.java`
- Test: `src/test/java/uk/gov/hmcts/amp/services/AdminServiceTest.java`
- Test: `src/test/java/uk/gov/hmcts/amp/integration/AdminEndpointIntegrationTest.java`

**Interfaces:**

- Produces:
  - **Spec schema `AdminUser`:** `id` (int64), `name`, `email`, `createdAt` (local-date-time), `lastLoginAt` (local-date-time, nullable), `applicationCount` (int64).
  - **Domain record:** `record AdminUserSummary(Long id, String name, String email, LocalDateTime createdAt, LocalDateTime lastLoginAt, long applicationCount)`.
  - **`AdminService`:**
    - `UserEntity requireAdmin(String requestingUserId)` calls `UserService.requireSignedIn`, then throws `ResponseStatusException(FORBIDDEN, "Admins only.")` unless the role is `UserRole.ADMIN`.
    - `List<AdminUserSummary> listUsers(String requestingUserId)`.
  - **`ResponseMapper`:** `List<AdminUser> toAdminUsers(List<AdminUserSummary>)`.
  - **`UserRepository`:** `List<UserEntity> findByStatusOrderByCreatedAtDesc(String status)`.
  - **`ApplicationRepository`:** application counts per user in one query. For example, `@Query("select a.user.id as userId, count(a) as total from ApplicationEntity a group by a.user.id") List<Object[]> countByUser()`, or a projection.
  - The name is built as `UserResponse.from` does: `(firstName + " " + lastName).trim()`.

- [ ] **Step 1: Write the failing integration tests** in `AdminEndpointIntegrationTest`. Set it up like `UserEndpointIntegrationTest`: a clean database, then sign in Ada and Grace through `POST /session`. Make Ada an admin by saving her `UserEntity` with `setRole(UserRole.ADMIN)`.
  - `an_admin_should_see_every_active_user_newest_first`: as Ada, `GET /admin/users` returns 200 and `$.length()` is 2. `$[0].email` is Grace's, because she signed in second.
  - `a_suspended_user_should_be_left_out_of_the_list`: set Grace's status to `"SUSPENDED"`. Then `$.length()` is 1.
  - `the_list_should_count_each_users_applications`: save two `ApplicationEntity` rows for Grace. Then Grace's `applicationCount` is 2 and Ada's is 0.
  - `the_list_should_not_expose_identifiers_or_secrets`: `$[0].entraObjectId`, `$[0].userReference` and `$[0].role` don't exist.
  - `a_user_who_is_not_an_admin_should_be_refused` (Review Focus 1): as Grace, the response is 403.
  - `a_missing_or_unknown_caller_should_be_refused_as_elsewhere`: no header gives 400, and an unknown oid gives 404.
- [ ] **Step 2: Run** `./gradlew integration --tests '*AdminEndpointIntegrationTest'`. Expected: the build fails because `AdminApi` doesn't exist (no spec path yet).
- [ ] **Step 3: Add the spec path, schema and 403 response, then implement** the repository methods, `AdminUserSummary`, `AdminService.requireAdmin` and `listUsers`, the mapper method, and `AdminController implements AdminApi`.
  - `AdminController` uses `@Slf4j`, logging "List users for an admin". Follow the pattern in `UserController`.
  - The spec description for `/admin/users` says it lists active users only, newest first, and is for admins only.
- [ ] **Step 4: Write `AdminServiceTest` with Mockito**, covering `requireAdmin` (USER → 403 `FORBIDDEN`, ADMIN → returns the entity) and the newest-first order passing through from the repository.
- [ ] **Step 5: Run** `./gradlew test integration --tests '*Admin*'`. Expected: PASS.
- [ ] **Step 6: Run** `./gradlew check`. Expected: PASS (checkstyle, PMD and the rest of the tests).
- [ ] **Step 7: Commit** with the message "Add GET /admin/users for admins: active users with their application counts".

### Task 2: `GET /admin/users/{userId}`

**Files:**

- Modify: `infrastructure/amp/specs/api-marketplace.openapi.yml`:
  - path `/admin/users/{userId}` (operationId `getAdminUser`, path param `userId`, int64);
  - schemas `AdminUserDetail`, `AdminApplication` and `AdminProductionRequest`.
- Create: `src/main/java/uk/gov/hmcts/amp/domain/AdminUserDetail.java`, with nested records or separate files following the domain package's convention.
- Modify: `AdminService`, `AdminController`, `ResponseMapper`, and `ApplicationApiRepository` (add `long countByApplicationId(Long applicationId)`).
- Test: `AdminServiceTest` and `AdminEndpointIntegrationTest`.

**Interfaces:**

- Consumes: `AdminService.requireAdmin` (Task 1). Also the existing `ApplicationRepository.findByUserIdOrderByCreatedAtAsc` and `ProductionRequestRepository.findByUserIdOrderBySubmittedAtDesc`.
- Produces:
  - **`AdminUserDetail`:** `id`, `name`, `email`, `status`, `createdAt`, `lastLoginAt` (nullable), `organisation` (nullable), `applications: AdminApplication[]`, `productionRequests: AdminProductionRequest[]`.
  - **`AdminApplication`:** `name`, `apiCount` (int64), `createdAt`.
  - **`AdminProductionRequest`:** `reference`, `applicationName`, `status`, `submittedAt`.
  - **Service:** `AdminUserDetail getUser(String requestingUserId, long userId)`. An unknown id throws `ResponseStatusException(NOT_FOUND, "No user " + userId + ".")`.
  - **Mapper:** `uk.gov.hmcts.amp.openapi.model.AdminUserDetail toAdminUserDetail(AdminUserDetail)`. Fully qualify the clashing name, as the mapper does for `CatalogueDetail`.

- [ ] **Step 1: Write the failing integration tests:**
  - `an_admin_should_see_one_user_with_their_applications_and_requests`:
    - Set up Grace with application "Case Viewer" (2 `ApplicationApiEntity` rows) and application "Listings" (none), plus two production requests: an older one with organisation "Old Org Ltd" and a newer one with "Example Legal Ltd".
    - Expect `$.organisation` to be "Example Legal Ltd".
    - Expect `$.applications[0].name` to be "Case Viewer" with `apiCount` 2, and `$.applications[1].apiCount` to be 0.
    - Expect `$.productionRequests[0].reference` to be the newer request.
  - `a_user_with_no_production_requests_should_have_no_organisation`: `$.organisation` doesn't exist or is null, and `$.productionRequests.length()` is 0.
  - `a_suspended_user_should_still_be_shown_by_id`: the response is 200 and `$.status` is "SUSPENDED".
  - `an_unknown_user_should_be_not_found`: `GET /admin/users/999999` returns 404.
  - `a_user_who_is_not_an_admin_should_be_refused_one_user` (Review Focus 1): as Grace, asking for Ada returns 403.
  - `one_user_should_not_expose_identifiers_or_secrets`: `$.applications[0].clientId` and `$.entraObjectId` don't exist.
- [ ] **Step 2: Run** `./gradlew integration --tests '*AdminEndpointIntegrationTest'`. Expected: the new tests fail with 404 (no route).
- [ ] **Step 3: Add the spec and implement `getUser`.** The organisation is `productionRequests.isEmpty() ? null : productionRequests.get(0).getOrganisation()`, using the newest-first list. Add a service unit test for the organisation choice to `AdminServiceTest`.
- [ ] **Step 4: Run** `./gradlew test integration check`. Expected: PASS.
- [ ] **Step 5: Commit** ("Add GET /admin/users/{userId} for admins: one user with their applications and requests"), push, and open the backend PR. Check `gh pr view --json state` first if a PR already exists.

---

## Part B: web (hmcts/web-api-marketplace)

Use branch `AMP-admin-registered-users`, which already holds the spec and this plan. Before each commit, run:

- `npx jest` (unit; this is what Jenkins measures coverage from, and new code must reach 80%);
- `npx jest -c jest.routes.config.js` (routes);
- `npx eslint . --ext .js,.ts`;
- `npx prettier --check .`.

### Task 3: Admin users client and the dashboard link

**Files:**

- Create: `src/main/services/AdminUsers.ts`
- Modify: `src/main/views/admin.njk`, adding a "Registered users" link to `/admin/users`.
- Modify: `src/test/stubs/entra.ts`. The stub backend answers `GET /backend/admin/users` and `/backend/admin/users/:id` from `savedUsers`, answering 403 unless the requesting oid is in `admins`. Detail data can be set per test with `stub.adminUserDetails.set(id, detail)`.
- Test: `src/test/unit/services/AdminUsers.test.ts`, and an updated `src/test/unit/controllers/AdminController.test.ts`.

**Interfaces:**

- Consumes: `callBackend`, `BackendError`, `Owner` and `ownerOf` from `src/main/services/Applications.ts`.
- Produces:

  ```ts
  export interface AdminUser {
    id: number;
    name: string;
    email: string;
    createdAt: string;
    lastLoginAt?: string | null;
    applicationCount: number;
  }
  export interface AdminApplication {
    name: string;
    apiCount: number;
    createdAt: string;
  }
  export interface AdminProductionRequest {
    reference: string;
    applicationName: string;
    status: string;
    submittedAt: string;
  }
  export interface AdminUserDetail {
    id: number;
    name: string;
    email: string;
    status: string;
    createdAt: string;
    lastLoginAt?: string | null;
    organisation?: string | null;
    applications: AdminApplication[];
    productionRequests: AdminProductionRequest[];
  }
  export async function listAdminUsers(owner: Owner): Promise<AdminUser[]>;
  /** Undefined when the backend answers 404. */
  export async function getAdminUser(owner: Owner, id: number): Promise<AdminUserDetail | undefined>;
  ```

- [ ] **Step 1: Write the failing unit tests** in `AdminUsers.test.ts`, mocking axios as `ProductionRequests.test.ts` does:
  - `listing_should_get_admin_users_as_the_caller`: the request is `GET /admin/users` with header `requestingUserId` set to the owner's oid.
  - `one_user_should_be_undefined_when_the_backend_does_not_know_them`: a 404 gives `undefined`.
  - `any_other_failure_should_be_thrown`: a 500 rejects with a `BackendError`.
- [ ] **Step 2: Run** `npx jest src/test/unit/services/AdminUsers.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `AdminUsers.ts`**, modelled on `ProductionRequests.ts`. Add the dashboard link to `admin.njk`. Add the stub backend routes.
- [ ] **Step 4: Add** `the_admin_page_should_link_to_the_registered_users` to `AdminController.test.ts`, or as a view test, asserting `href="/admin/users"`.
- [ ] **Step 5: Run the unit and route tests, lint and Prettier.** Expected: PASS.
- [ ] **Step 6: Commit** with the message "Link the admin dashboard to the registered users and add their backend client".

### Task 4: `/admin/users` list page

**Files:**

- Modify: `src/main/controllers/AdminController.ts`, adding `@route('/users') @GET() users(req, res, next)`.
- Create: `src/main/services/AdminGuard.ts`, holding the shared guard taken out of `AdminController.get`.
- Create: `src/main/views/admin/users.njk`
- Test: `src/test/unit/controllers/AdminController.test.ts`, and `src/test/routes/admin.ts`

**Interfaces:**

- Consumes: `listAdminUsers` and `AdminUser` (Task 3), `requireSignIn` and `isAdmin`.
- Produces:
  - `export function requireAdmin(req: AppRequest, res: Response, next: NextFunction): boolean` in `AdminGuard.ts`. It returns false after redirecting to sign-in, or after calling `next()`.
  - `export function formatDate(iso?: string | null): string | undefined`, moved from `AccountController`'s private method to a shared `src/main/services/Dates.ts`. `AccountController` then uses it too.
- **View model** for `admin/users.njk`: `{ q: string, count: number, users: { id, name, email, joined, lastSignedIn, applications }[], couldNotLoad: boolean }`.
  - `name` falls back to `email` when blank.
  - `joined` and `lastSignedIn` are already formatted, or "Not known".

- [ ] **Step 1: Write the failing unit tests** in `AdminController.test.ts`, mocking `../../../main/services/AdminUsers`:
  - `the_users_page_should_list_what_the_backend_returns`:
    - The backend returns 2 users.
    - `res.view` is `'admin/users'`, `count` is 2, and `users[0].joined` is `'29 October 2026'` for `'2026-10-29T10:00:00'`.
  - `a_user_who_has_never_signed_in_should_show_not_known`: with `lastLoginAt: null`, `lastSignedIn` is `'Not known'`.
  - `a_search_should_match_name_or_email_ignoring_case_and_spaces` (Review Focus 2):
    - With `query.q = '  ADA '`, the result is only Ada.
    - With `q = 'hopper@'`, the result is only Grace.
  - `a_search_matching_nobody_should_count_zero` (Review Focus 2): `count` is 0 and `users` is empty.
  - `a_user_with_no_name_should_be_listed_by_email` (Review Focus 4): with `name: ''`, `users[0].name` is the email address.
  - `an_unreachable_backend_should_say_the_users_could_not_be_loaded` (Review Focus 5): when `listAdminUsers` rejects, `couldNotLoad` is true, `res.view` is `'admin/users'`, and nothing is thrown.
  - `a_non_admin_should_be_handed_on_to_not_found` and `a_signed_out_visitor_should_be_sent_to_sign_in`, for `users()`.
- [ ] **Step 2: Run** `npx jest src/test/unit/controllers/AdminController.test.ts`. Expected: FAIL (`users` is not a function).
- [ ] **Step 3: Implement** `requireAdmin`, the shared `formatDate`, `users()` and `admin/users.njk`.
  - The view uses `govukBreadcrumbs` (Home `/`, Admin `/admin`), heading "Users", the intro line, and a GET form with `govukInput` (name `q`, label "Search by name or email", value `q`) and `govukButton` ("Search", secondary).
  - Then "{{ count }} user{% if count != 1 %}s{% endif %}.", followed by a `govukTable` only when `count > 0`.
  - When `couldNotLoad` is true, show a sentence saying the users could not be loaded, worded like the account page's `couldNotLoad` text.
  - Set `section = "admin"`.
- [ ] **Step 4: Add route tests** to `src/test/routes/admin.ts`:
  - `an_admin_should_see_the_registered_users` returns 200 and contains `href="/admin/users/1"`.
  - `a_user_should_be_told_the_users_page_is_not_found` returns 404.
  - `a_signed_out_visitor_should_be_sent_to_sign_in_from_the_users_page` returns 302 to `/sign-in`.
- [ ] **Step 5: Run the unit and route tests, lint and Prettier.** Expected: PASS. Check `npx jest --coverage --coverageReporters=text` shows `AdminController.ts`, `AdminGuard.ts` and `Dates.ts` at 80% or above.
- [ ] **Step 6: Commit** with the message "Add the registered users list for admins".

### Task 5: `/admin/users/:id` details page

**Files:**

- Modify: `src/main/controllers/AdminController.ts`, adding `@route('/users/:id') @GET() user(req, res, next)`.
- Create: `src/main/views/admin/user.njk`
- Test: `AdminController.test.ts`, `src/test/routes/admin.ts`, and a view test `src/test/unit/views/pages/admin-user.test.ts` for the empty states and exact wording.

**Interfaces:**

- Consumes: `getAdminUser` and `AdminUserDetail` (Task 3), `requireAdmin` and `formatDate` (Task 4), and `statusText` from `src/main/services/LocalRequests.ts`.
- **View model** for `admin/user.njk`: `{ user: { name, email, organisation, status, joined, lastSignedIn }, applications: { name, apis, created }[], productionRequests: { reference, applicationName, status, submitted }[], couldNotLoad: boolean }`.
  - `organisation`, `joined` and `lastSignedIn` default to "Not known".
  - `status`: `ACTIVE` becomes "Active", and any other value becomes sentence case.
  - `apis` reads "1 API" or "N APIs".
  - The production request `status` is `statusText(status)`.

- [ ] **Step 1: Write the failing unit tests:**
  - `one_user_should_show_their_details_applications_and_requests`:
    - `res.view` is `'admin/user'` and `user.organisation` is `'Example Legal Ltd'`.
    - `applications[0]` is `{ name: 'Case Viewer', apis: '2 APIs', created: '29 October 2026' }`.
    - `productionRequests[0].status` is `'Submitted'` for `SUBMITTED`.
  - `one_api_should_read_singular`: `apis` is `'1 API'`.
  - `missing_values_should_show_not_known`: with `organisation` null and `lastLoginAt` null, both show `'Not known'`.
  - `an_unknown_user_should_be_handed_on_to_not_found`: when `getAdminUser` resolves `undefined`, `next` is called.
  - `an_id_that_is_not_a_number_should_be_not_found_without_asking_the_backend` (Review Focus 3): with `params.id` of `'abc'` and of `'1abc'`, `next` is called and `getAdminUser` is never called.
  - `an_unreachable_backend_should_say_the_user_could_not_be_loaded` (Review Focus 5): `couldNotLoad` is true and `res.view` is `'admin/user'`.
  - The guard cases for a non-admin and for someone signed out.
- [ ] **Step 2: Run** `npx jest src/test/unit/controllers/AdminController.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `user()`, accepting only `/^[0-9]{1,18}$/` as an id, and write `admin/user.njk`.
  - The view has `govukBreadcrumbs` (Home, Admin, Users `/admin/users`), `<span class="govuk-caption-l">User</span>` above `<h1 class="govuk-heading-xl">{{ user.name }}</h1>`, and a `govukSummaryList` with the six rows.
  - "Applications" is an `<h2>` followed by a `govukTable`, or the empty sentence. The application name is plain text.
  - "Production credentials requests" is an `<h2>` followed by a `govukTable`, or the empty sentence.
  - Set `section = "admin"`.
- [ ] **Step 4: Write the view test** `admin-user.test.ts`. It renders with no applications and no requests, and asserts both exact empty sentences, plus "Not known" for organisation.
- [ ] **Step 5: Add route tests:**
  - `an_admin_should_see_one_user` returns 200 and contains "Production credentials requests".
  - `a_user_should_be_told_a_user_page_is_not_found` returns 404.
  - `an_unknown_user_should_be_not_found` returns 404 for `/admin/users/999`.
- [ ] **Step 6: Run the unit and route tests, coverage, lint and Prettier.** Expected: PASS, with the changed files at 80% or above.
- [ ] **Step 7: Commit** ("Add the user details page for admins"), push, and open the web PR. It includes the spec and this plan, and the description says it needs the backend PR deployed first.

### Task 6: Check it end to end locally

- [ ] **Step 1:** Build the backend branch image, or run the backend from the worktree. Point the web Docker stack at it (`docker compose` in the web repo uses `hmctsprod.azurecr.io/amp/marketplace:latest`, which has no `/admin` endpoints until the backend PR merges).
- [ ] **Step 2:** Sign in as `local@amp.com` and `test@amp.com`. Promote `local@amp.com` with
      `docker compose exec db psql -U postgres -d marketplace -c "update marketplace_user set role = 'ADMIN' where email = 'local@amp.com';"`, then sign in again.
- [ ] **Step 3:** Check, as an admin:
  - Admin → Registered users lists 2 users.
  - The search "TEST" finds Test User.
  - Clicking a name shows their details.
  - A user with no applications shows both empty sentences.
- [ ] **Step 4:** Check, as `test@amp.com`: `/admin/users` and `/admin/users/1` both show "Page not found".
