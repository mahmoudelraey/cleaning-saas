# FieldOps customer portal — backend

Spring Boot API for the customer portal (`portal/frontend`). Port **8090**.

## How it fits

```
portal/frontend ──► portal/backend ──┐
                                     ├── core (same entities, services, rules) ──► PostgreSQL (shared)
admin/frontend  ──► admin/backend  ──┘
```

* **Same code, same database.** The portal runs the shared `core` module, so booking, pricing,
  availability, the state machine, history and customer messages behave exactly as in the admin app.
  Customer actions go through `core`'s `CustomerPortalService`.
* **Isolation per company** is the same as the admin app: Hibernate `@TenantId` plus PostgreSQL Row Level
  Security (`SET LOCAL ROLE fieldops_app` + `app.tenant_id` in every transaction). The company comes from
  the customer's token (`tid`), never from the request.
* **The admin app owns the schema** (Flyway) and runs the background jobs. Messages the portal queues
  (sign-in codes, "we got your request", cancellations) are sent by the admin app's dispatcher. The portal
  has no Flyway and only validates the schema at startup, so start the admin backend first.
* Screens read through plain SQL read models (`BookingQueries`, `MeController`, `InvoiceController`) that
  never select internal notes or staff notes, and show technicians by first name.
* Customer tokens use their **own key and issuer** (`PORTAL_JWT_SECRET`), so they can't open the admin API.

## Run locally

From the repository root, with the admin backend already running (it migrates the database):

```bash
mvn -q -DskipTests install                     # builds core (repeat after changing core/)
mvn -pl portal/backend spring-boot:run -Dspring-boot.run.profiles=local
```

With the `local` profile the sign-in code is returned to the screen (no WhatsApp/SMS needed).

## Configuration

| Variable | Meaning |
|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | Same database as the admin backend |
| `PORTAL_JWT_SECRET` | Base64, ≥ 32 bytes. **Different** from the admin `JWT_SECRET` |
| `PUBLIC_BASE_URL` | Admin app origin (invoice links open its public invoice page) — same value as the admin backend |
| `ADMIN_PUBLIC_URL` | Public origin of the admin backend (company logos) |
| `CORS_ORIGINS` | Portal frontend origin(s) |
| `STORAGE_*` | Same storage settings as the admin backend |

## API (all under `/api/portal/{companySlug}`)

| | |
|---|---|
| `GET /` · `GET /services` · `POST /quote` · `POST /availability` | public |
| `POST /auth/otp` · `POST /auth/verify` · `POST /auth/register` | sign-in (mobile + code) |
| `GET/PUT /me` | profile + saved addresses |
| `GET /bookings?scope=upcoming\|past` · `GET /bookings/{id}` · `POST /bookings` · `POST /bookings/{id}/cancel` | visits |
| `GET /invoices` · `POST /invoices/{id}/link` | invoices (opens the public invoice page) |
