# Oldi-berdi API

Next.js HTTPS sync API for the Oldi-berdi Android app.

- Postgres when `DATABASE_URL` is set (Cursor publish-app)
- Local PGlite (`.data/pglite`) otherwise

## Auth (PIN-only)

PIN-only — no email / Resend.

- Pair **create** always requires `PAIR_CREATE_KEY` and seeds random provisional
  PINs server-side (plaintext PINs are never returned in the HTTP body).
- Production may seed one initial pair via migration (hashed only; `must_change`).
- PINs are 6–12 digits. Login is rate-limited; pair lookup errors do not enumerate.

Endpoints:

- `GET /api/auth/status?pair_code=` → pin / must_change flags (no seeding)
- `POST /api/auth/set-pin` `{ pair_code, role, pin }` — first time only if unset
- `POST /api/auth/login` `{ pair_code, pin }` — role from PIN hash match
- `POST /api/auth/change-pin` Bearer `{ old_pin, new_pin }` — clears must_change; drops other sessions

## Other endpoints

- `GET /api/health` — ok / generic error only
- `POST /api/pair` — **create** requires `PAIR_CREATE_KEY` (no plaintext PINs in response); **join** with `{ pair_code }` (rate-limited)
- `POST /api/entries` · confirm|reject|cancel · `GET /api/sync` (Bearer; pair-scoped; blocked while must_change)
  - **confirm** / **reject** — other role only (not the creator)
  - **cancel** — creator only; marks own `PENDING` as `REJECTED` so the other party’s sync drops it from pending
  - Sync returns `{ pending, confirmed, rejected, cursor }`; clients must apply `rejected` (or full replace) so cancelled/rejected rows do not stay pending locally

## Secrets

| Env | Purpose |
|---|---|
| `DATABASE_URL` | Set by Cursor Apps when Postgres is attached |
| `PAIR_CREATE_KEY` | Required to create pairs |

## Local

```bash
npm install
PAIR_CREATE_KEY=your-create-key env -u DATABASE_URL npm run dev
```
