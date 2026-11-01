# FieldOps customer portal — backend

Spring Boot API for the customer portal (`portal/frontend`). Port **8090**.

## How it fits

```
portal/frontend ──► portal/backend ──► PostgreSQL (shared, read-only, same RLS as admin)
                              │
                              └──► admin/backend /internal/portal/** (every change: OTP, register,
                                   book, cancel, invoice link) — X-Internal-Token shared secret
```

* The **admin backend owns the schema** (Flyway). This app never migrates; it reads with plain JDBC,
  inside a transaction that does `SET LOCAL ROLE fieldops_app` + `app.tenant_id`, so Row Level Security
  applies exactly as in the admin app.
* **Business rules stay in one place**: pricing, availability, the booking state machine, events and
  customer messages all run in the admin backend. The portal only calls its internal API.
* Customer tokens use their **own key and issuer** (`PORTAL_JWT_SECRET`), so they can't open the admin API.

## Run locally

1. Admin backend running with the `local` profile (it sets the matching dev internal token).
2. `mvn spring-boot:run -Dspring-boot.run.profiles=local`

## Configuration

| Variable | Meaning |
|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | Same database as the admin backend |
| `ADMIN_API_URL` | Internal URL of the admin backend (default `http://localhost:8080`) |
| `PORTAL_INTERNAL_TOKEN` | Same value as the admin backend's `PORTAL_INTERNAL_TOKEN` |
| `ADMIN_PUBLIC_URL` | Public origin of the admin backend (company logos) |
| `PORTAL_JWT_SECRET` | Base64, ≥ 32 bytes. **Different** from the admin `JWT_SECRET` |
| `CORS_ORIGINS` | Portal frontend origin(s) |

## API (all under `/api/portal/{companySlug}`)

| | |
|---|---|
| `GET /` · `GET /services` · `POST /quote` · `POST /availability` | public |
| `POST /auth/otp` · `POST /auth/verify` · `POST /auth/register` | sign-in (mobile + code) |
| `GET/PUT /me` | profile + saved addresses |
| `GET /bookings?scope=upcoming\|past` · `GET /bookings/{id}` · `POST /bookings` · `POST /bookings/{id}/cancel` | visits |
| `GET /invoices` · `POST /invoices/{id}/link` | invoices (opens the public invoice page) |
