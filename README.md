# FieldOps: SaaS for small cleaning & maintenance companies

Two apps, one database, one shared domain module:

```
backend/          one Maven build (backend/pom.xml) with three modules
├── core          shared Java library: entities, repositories, business services, tenant isolation
├── admin         admin API (owns the database schema with Flyway, runs the background jobs)   :8080
└── portal        customer portal API                                                          :8090
frontend/
├── admin         Angular admin app (PrimeNG)                                                  :4200
└── portal        Angular customer portal at /{company-slug} (mobile-first)                  :4300
```

| Module | What |
|---|---|
| `backend/core` | Entities, repositories and business services (pricing, scheduling, booking state machine, OTP, WhatsApp/SMS outbox, billing), tenant isolation (Hibernate `@TenantId` + PostgreSQL RLS), errors. No controllers, no jobs. |
| `backend/admin` | API for companies (owners, coordinators, technicians). **Owns the database schema (Flyway)** and runs the background jobs (sending messages, reminders, automatic invoices). |
| `backend/portal` | API for each company's **customers**: sign-in by mobile + code, visits, booking, cancelling, invoices. Uses `core` directly against the same database. See [backend/portal/README.md](backend/portal/README.md). |

All versions and plugins live in `backend/pom.xml`; the module poms only list what each module uses. Open the `backend` folder (or the repository) in IntelliJ to get the three modules.

`start-dev.bat` starts all four (plus PostgreSQL in Docker). `docker compose up --build` runs everything in containers: admin on :8081, portal on :8082.

Arabic-first (RTL) multi-tenant SaaS. Companies manage customers, services and technicians in one place instead of WhatsApp and spreadsheets.

This repository covers **weeks 1–2 of the 10-week plan**: the foundation and the first CRUD features.

| Area | Status |
|---|---|
| Project structure, Docker, CI, Flyway | ✅ |
| Signup (14-day trial), login by phone/email, JWT + rotating refresh tokens, roles | ✅ |
| Tenant isolation: Hibernate `@TenantId` + PostgreSQL RLS + isolation tests | ✅ |
| Customers & addresses, services & add-ons, technicians & work hours, staff users, company settings | ✅ |
| Angular app: RTL/LTR, PrimeNG, login/signup, dashboard, all CRUD screens | ✅ |
| Bookings + state machine, scheduling & conflicts (week 3) | ⏭ next |

## Stack

- **Backend:** Spring Boot 3.5, Java 21, PostgreSQL 16, Flyway, Spring Security (OAuth2 resource server, HS256 JWT), springdoc OpenAPI
- **Frontend:** Angular 21 (standalone, signals, zoneless), PrimeNG 21 (Aura theme, MIT), ngx-translate, IBM Plex Sans Arabic
- **Tests:** JUnit 5 + Testcontainers (real Postgres), Vitest

## Quick start

Requirements: JDK 21, Maven 3.9+, Docker. Node 24 is a project devDependency, so your global Node version doesn't matter; run installs with `npx -y -p node@24.22.0 -p npm@10 -- npm install`.

```bash
# 1. Database
docker compose up -d db

# 2. Backend  → http://localhost:8080  (Swagger: /swagger-ui.html)
cd backend
mvn -q -DskipTests install                     # builds core (repeat after changing core/)
mvn -pl admin spring-boot:run

# 3. Frontend → http://localhost:4200  (/api proxied to :8080)
cd frontend/admin
npm install
npm start

# 4. Customer portal (optional) → http://localhost:4300/{company-slug}
cd backend && mvn -pl portal spring-boot:run
cd frontend/portal
npx -y -p node@24.22.0 -p npm@10 -- npm install
npm start
```

The company slug is the booking link in the admin app's Settings. Locally the sign-in code is shown on screen (no WhatsApp/SMS needed). There are no Spring profiles: `application.yml` defaults are for localhost, and every real environment overrides them with the env vars below.

Open http://localhost:4200/signup, create a company, and you are signed in as its owner.

Run the whole stack in containers instead: `docker compose up --build`, then open http://localhost:8081.

### Tests

```bash
cd backend && mvn verify                # all backends: unit + integration tests (Docker must be running)
cd backend && mvn test                  # unit tests only
cd frontend/admin && npx ng test --watch=false
```

## Project layout

Java packages are `com.fieldops.app.*` in `core` and `admin` (same packages, split by role),
and `com.fieldops.portal.*` in `portal`.

```
backend/core/src/main/java/com/fieldops/app    domain shared by both apps
├── common          tenant context, RLS transaction manager, storage, errors, current user
├── tenant          companies, plans, plan features, settings
├── auth            staff users and account rules
├── customer        customers + addresses (soft delete)
├── catalog         services + add-ons (prices in halalas)
├── scheduling      technicians, work hours, availability, plan limits
├── booking         bookings, pricing, state machine, history, calendar
├── field           technician visits, photos
├── notification    WhatsApp / SMS outbox, templates, dispatcher
├── billing         quotes, invoices, payments, PDF, ZATCA QR
├── publicpage      booking page, one-time codes
├── reporting       reports
└── customerportal  what a customer may do in the portal (book, cancel, sign in)
backend/admin/src/main/java/com/fieldops/app   controllers, staff sign-in (JWT + refresh), security, jobs
backend/admin/src/main/resources/db/migration  Flyway SQL (the only schema owner)
backend/portal/src/main/java/com/fieldops/portal  controllers, customer tokens, read models (SQL)
frontend/admin/src/app
├── core          auth (service, interceptor, guards), i18n/RTL, API types, errors
├── layout        app shell (sidebar, top bar)
├── features      bookings, calendar, customers, services, technicians, billing, reports, settings…
└── shared        SAR/phone/date formatting
frontend/portal/src/app                        customer portal (shell, login, home, visits, booking, invoices)
```

## Key design decisions

### Multi-tenancy (plan §5.3)
One database, one schema, `tenant_id` on every tenant-owned table. Two independent layers:

1. **Hibernate `@TenantId`** (`TenantScopedEntity`): every query is filtered and every insert stamped with the current tenant. Entities have no tenant setter.
2. **PostgreSQL Row Level Security**: `TenantAwareTransactionManager` runs `SET LOCAL ROLE fieldops_app` and `set_config('app.tenant_id', …, true)` at the start of every transaction. Policies use `FORCE ROW LEVEL SECURITY`, so they apply even to the table owner. Both settings are transaction-local and never leak through the pool.

The tenant comes **only** from the signed JWT `tid` claim (or trusted server code via `TenantContext.runAs`). If no tenant is resolved, it falls back to a nil UUID that matches nothing (fail closed).

`TenantIsolationIT` checks that company B gets 404 on every read/update/delete of company A's records. `RowLevelSecurityIT` checks RLS on its own using native SQL, which bypasses Hibernate. **When you add an endpoint, add a case to `TenantIsolationIT`.**

`users`, `tenants`, `plans` and `refresh_tokens` are not RLS-protected because login has to find a user before a tenant is known. `UserRepository` filters by tenant explicitly.

> Data migrations that touch RLS tables must set the tenant first (`SET LOCAL app.tenant_id = '…'`) or run as a superuser. The table owner cannot see rows without it.

### Auth
- Access token: 15-min HS256 JWT (`sub`, `tid`, `role`, `name`). Refresh token: opaque, stored as a SHA-256 hash, rotated on every use. **Reusing a rotated token revokes all of that user's sessions.**
- Login accepts a Saudi mobile in any format (`05…`, `+9665…`, Arabic digits) or an email. Phones are stored as E.164.
- Roles: `OWNER` (prices, staff, settings), `COORDINATOR` (customers, scheduling), `TECHNICIAN` (own profile now, visits later). Enforced with `@PreAuthorize`. The UI guards are only for UX.
- Unauthenticated endpoints are rate-limited per IP (in-memory; move it to Redis or Postgres when you run more than one instance).

### Money & time
Money is stored as `bigint` halalas end to end, and only the UI converts to riyals. Timestamps are `timestamptz` in UTC. Technician shifts are stored as `"HH:mm"` in company local time (default `Asia/Riyadh`).

### Errors
All errors are RFC 9457 `problem+json` with a stable `code`, e.g. `slug_taken` or `plan_technician_limit`. The frontend translates the code rather than the message.

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | local fieldops | Login user needs `CREATEROLE` the first time Flyway runs V1 (it creates `fieldops_app`), or create that role beforehand |
| `JWT_SECRET` | dev key (localhost only) | **Required in production.** base64, ≥ 32 bytes: `openssl rand -base64 48` |
| `PORTAL_JWT_SECRET` | dev key (localhost only) | **Required in production**, and different from `JWT_SECRET` |
| `OTP_EXPOSE_CODE` | `true` | **Must be `false` in production**: otherwise verification codes are returned by the API |
| `PUBLIC_BASE_URL` | `http://localhost:4200` | When it is not localhost, both apps refuse to start with the dev keys or `OTP_EXPOSE_CODE=true` (`DevDefaultsGuard`) |
| `GOOGLE_PLACES_API_KEY` | — (off) | Optional, set on **both** backends. Google Places API (New) key, restricted to that API. Lets owners connect their Google Maps listing (Settings) and shows the Google rating and up to 5 reviews on the portal page, loaded live (Google's terms forbid storing them). Each page view that reaches the reviews section is a billed Place Details call. Put Google's official logo at `frontend/portal/public/google/google_logo.png` (attribution requirement) |
| `LOG_LEVEL` | `DEBUG` | log level for `com.fieldops`; use `INFO` in production |
| `CORS_ORIGINS` | `http://localhost:4200` | comma-separated |
| `SERVER_FORWARD_HEADERS_STRATEGY` | — | set to `native` behind a reverse proxy so rate limiting sees real client IPs |

## Saudi cities & districts (third-party data)

Migration `V10__ksa_regions_cities_districts.sql` seeds 13 regions, 4,581 cities and 3,732 districts
(Arabic + English) from [homaily/Saudi-Arabia-Regions-Cities-and-Districts](https://github.com/homaily/Saudi-Arabia-Regions-Cities-and-Districts),
public data from maps.address.gov.sa, distributed under **GPL-2.0**. Running it inside your own hosted
service is fine; if you ever ship the backend to customers (on-premise), review the GPL terms or replace
the data with the official National Address (SPL) API. Lookup API: `GET /api/v1/geo/regions|cities|cities/{id}/districts`.

## PrimeNG version (licensing)

The UI is pinned to **PrimeNG 21.1.10** with Angular 21, `@primeuix/themes` 2.0.3 and primeicons 7.0.0. All of these are **MIT**. PrimeNG 22 and primeicons 8 moved to the commercial PrimeUI license, which shows an "Invalid PrimeUI License" badge without a key. Don't upgrade these packages without checking the license first. Only regular 21.x releases are MIT; `-lts` builds are commercial.

## Next (week 3, per plan)
- `booking`: `bookings`, `booking_items`, and an explicit state machine (NEW → CONFIRMED → ASSIGNED → ON_THE_WAY → IN_PROGRESS → COMPLETED / CANCELLED / NO_SHOW). Reject illegal transitions.
- `scheduling`: `assignments`, an availability calculation from work hours, and conflict prevention (DB exclusion constraint on technician time ranges plus a service-level check).
- Calendar screen (day/week) in the frontend.
