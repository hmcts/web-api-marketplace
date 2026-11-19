# Admin dashboard: registered users

## Why

The Marketplace Team needs a read-only view of who has registered on the API Marketplace and
what they have done there. A user only exists once they have signed in, and no environment but
sandbox allows a database connection, so today there is no way for the team to see this.

Story:

> As a member of the Marketplace Team I want a read-only admin dashboard showing every
> registered user, so that I have visibility of users who are registered and have accounts with
> the API Marketplace.
>
> - From the admin dashboard, clicking the registered users shows a list of the active
>   registered users: name, email address, when they joined, when they last signed in, and
>   their number of applications.
> - From the list, clicking a user's name opens a user details page.

Designs: `Users view.png` and `User details.png` (from the team, not in the repo).

## Goals

- An admin can get from the Admin tab to a list of registered users, and from there to one user.
- Only admins can see any of it, in the web app **and** in the backend.

## Non-goals

- Changing anything: no editing, suspending, promoting or deleting users.
- Viewing another user's application. Application names are plain text for now (decided).
- The other dashboard figures (application and production request totals) from the first ask.
  They are a later story.
- Paging. Users number in the tens.

## Anti-goals

- A normal user able to reach the pages or the data, by URL or by calling the backend.
- Showing secrets: client secrets, subscription keys or their hints.

## Existing state

- `marketplace_user.role` is `USER` or `ADMIN` (service-api-marketplace#234). Admins are granted
  by migration.
- web-api-marketplace#238 (merged) keeps the role in the session, shows an **Admin** tab to
  admins, and adds `/admin`: signed out goes to sign in, signed in but not an admin falls
  through to the app's own 404. This work starts from master.
- The web app calls the backend with the signed-in user's Entra object id in the
  `requestingUserId` header. The backend trusts the web app with that header (in-cluster only).
- Backend `GET /users` and `GET /users/{userId}` return name, email, status, role, `createdAt`
  and `lastLoginAt`. They are open to any signed-in user by design (see their spec text). This
  work leaves them as they are.
- Applications: `application` (owner `user_id`, `name`, `created_at`), with its APIs in
  `application_api`. Production requests: `production_request` (`user_id`, `reference`,
  `application_name`, `status`, `submitted_at`, `organisation`).

## Backend (hmcts/service-api-marketplace)

New admin-only endpoints, spec first in `infrastructure/amp/specs/api-marketplace.openapi.yml`,
tag `admin`:

- `GET /admin/users`: the active users (`status = ACTIVE`), newest first by `createdAt`. Each:
  `id`, `name`, `email`, `createdAt`, `lastLoginAt` (nullable), `applicationCount`.
- `GET /admin/users/{userId}` (row id): the user (`id`, `name`, `email`, `status`, `createdAt`,
  `lastLoginAt`, `organisation`), their `applications` (`name`, `apiCount`, `createdAt`, oldest
  first) and their `productionRequests` (`reference`, `applicationName`, `status`,
  `submittedAt`, newest first). Any status, so a user reached by id is still shown.
- `organisation` is the `organisation` of the user's most recent production request, or null
  when they have none (decided).
- Both take `requestingUserId`. Unknown or missing caller: as the other endpoints (400/404).
  A caller who is not an `ADMIN`: **403**. Unknown `userId`: 404.
- No secrets, client ids, object ids or subscription names in either response.

## Web (hmcts/web-api-marketplace)

All under `/admin`, with the same guard as `/admin` today: signed out → sign in, not an admin →
the app's 404.

- `/admin` (dashboard): adds a **Registered users** link to `/admin/users`.
- `/admin/users` (`Users view.png`):
  - Breadcrumbs Home › Admin. Heading "Users". "Everyone who has registered, newest first."
  - "Search by name or email" text input and a **Search** button: a GET form (`?q=`), matching
    case-insensitively on name or email. An empty search shows everyone.
  - "N users." (singular "1 user.").
  - Table: Name (link to `/admin/users/{id}`), Email, Joined, Last signed in, Applications.
  - Dates as "29 October 2026". A missing last sign-in shows "Not known".
- `/admin/users/{id}` (`User details.png`):
  - Breadcrumbs Home › Admin › Users. Caption "User", heading the user's name.
  - Summary list: Name, Email, Organisation, Status (`ACTIVE` shown as "Active"), Joined, Last
    signed in. Missing values show "Not known".
  - **Applications**: table of Application (plain text), APIs ("1 API", "2 APIs"), Created. No
    applications: "This user has not created any applications."
  - **Production credentials requests**: table of Reference, Application, Status, Submitted,
    with status worded as on the user's own account page (`statusText`). None: "This user has
    not asked for production credentials."
  - A user id the backend does not know: the app's 404.
- The backend being unreachable or refusing: the pages say the users could not be loaded, as the
  account page does, rather than erroring.
- The **Admin** nav item stays highlighted on all three pages.

## Settled details (author's calls)

- `lastLoginAt` is `not null` in the database but stays nullable in the spec, and the web shows
  "Not known" for a missing value, as the design does.
- A 404 from `GET /admin/users/{userId}` is shown as the app's 404. The caller is an admin who
  has signed in, so their own row exists and the 404 means the user id is unknown.
- Dates are UTC from the backend and are formatted as `AccountController.formatDate` does.
- Status: `ACTIVE` shows as "Active". Any other value is shown in sentence case.
- Release order: backend first. If the web goes out first, its pages say the users could not
  be loaded.

## Left to the builder

- Search on the backend (`?q=`) or in the web app over the returned list. Either is fine at
  this size.
- Naming of classes, DTOs and templates, following each repo's conventions.
- Tests in each repo's usual places. The web unit tests must cover the new controllers: Jenkins
  measures coverage from the unit tests only, and the SonarQube gate needs 80% on new code.
