# FieldOps: SaaS for small cleaning & maintenance companies

Two apps, one database:

| Folder | What | Ports (dev) |
|---|---|---|
| `admin/backend` | Spring Boot API for companies (owners, coordinators, technicians). **Owns the database schema (Flyway) and all business rules.** | 8080 |
| `admin/frontend` | Angular admin app (PrimeNG) | 4200 |
| `portal/backend` | Spring Boot API for each company's **customers**: sign-in by mobile + code, visits, booking, cancelling, invoices. Reads the shared DB under the same RLS; every change goes through the admin backend's internal API (`/internal/portal/**`, shared secret). See [portal/backend/README.md](portal/backend/README.md). | 8090 |
| `portal/frontend` | Angular customer portal (mobile-first, Arabic/English), opened at `/p/{company-slug}` | 4300 |

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
cd admin/backend
mvn spring-boot:run -Dspring-boot.run.profiles=local

# 3. Frontend → http://localhost:4200  (/api proxied to :8080)
cd admin/frontend
npm install
npm start

# 4. Customer portal (optional) → http://localhost:4300/p/{company-slug}
cd portal/backend
mvn spring-boot:run -Dspring-boot.run.profiles=local
cd portal/frontend
npx -y -p node@24.22.0 -p npm@10 -- npm install
npm start
```

The company slug is the booking link in the admin app's Settings. With the `local` profile the sign-in code is shown on screen (no WhatsApp/SMS needed).

Open http://localhost:4200/signup, create a company, and you are signed in as its owner.

Run the whole stack in containers instead: `docker compose up --build`, then open http://localhost:8081.

### Tests

```bash
cd admin/backend && mvn verify        # unit + integration tests (Docker must be running)
cd admin/backend && mvn test          # unit tests only
cd admin/frontend && npx ng test --watch=false
```

## Project layout

```
admin/backend/src/main/java/com/fieldops/app
├── common        security (JWT, roles), tenant context, RLS transaction manager, errors, rate limit
├── tenant        companies, plans, settings
├── auth          signup/login/refresh, staff users
├── customer      customers + addresses (soft delete)
├── catalog       services + add-ons (prices in halalas)
├── scheduling    technicians, work hours, plan limits
├── booking       ⏭ week 3: bookings + state machine
├── field         ⏭ week 4: technician PWA, photos
├── notification  ⏭ week 5: WhatsApp / SMS
├── billing       ⏭ week 6: quotes, invoices, PDF
└── reporting     ⏭ week 7
backend/src/main/resources/db/migration   Flyway SQL
frontend/src/app
├── core          auth (service, interceptor, guards), i18n/RTL, API types, errors
├── layout        app shell (sidebar, top bar)
├── features      auth, dashboard, customers, services, technicians, users, settings
└── shared        SAR/phone formatting
frontend/public/i18n   ar.json, en.json
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
| `JWT_SECRET` | — (required) | base64, ≥ 32 bytes: `openssl rand -base64 48`. The `local` profile has a dev key |
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
