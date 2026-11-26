# Oldi-berdi API

Next.js HTTPS sync API for the Oldi-berdi Android app.

- Postgres when `DATABASE_URL` is set (Cursor publish-app)
- Local PGlite (`.data/pglite`) otherwise

## Auth (PIN-only)

Default PINs (seeded on pair create / status / join backfill; never overwrite existing):

| Role | Label | Default PIN |
|---|---|---|
| A | Olimjon | `123456` |
| B | Azizbek | `654321` |

Change after login: `POST /api/auth/change-pin` (Bearer, own role only).

- `GET /api/auth/status?pair_code=` → `pin_set_a`, `pin_set_b` (+ seeds defaults if missing)
- `POST /api/auth/set-pin` `{ pair_code, role, pin }` — first time only if somehow unset
- `POST /api/auth/login` `{ pair_code, pin }` — role from PIN hash match
- `POST /api/auth/change-pin` Bearer `{ old_pin, new_pin }`

## Other endpoints

- `GET /api/health`
- `POST /api/pair` — create or join; seeds default PINs
- `POST /api/entries` · confirm|reject · `GET /api/sync` (Bearer)

## Local

```bash
npm install
env -u DATABASE_URL npm run dev
```
