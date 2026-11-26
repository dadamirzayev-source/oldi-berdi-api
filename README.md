# Oldi-berdi API

Next.js HTTPS sync API for the Oldi-berdi Android app.

- Postgres when `DATABASE_URL` is set (Cursor publish-app)
- Local PGlite (`.data/pglite`) otherwise

## Auth (PIN-only)

PIN-only — no email / Resend.

- Provisional PINs may be seeded when a pair is **created**; they require
  `change-pin` before sync/entries (`must_change_pin`).
- Provisional default values are **not** published here; change on first use.
- PINs are 6–12 digits. Login is rate-limited; errors do not enumerate pairs.

Endpoints:

- `GET /api/auth/status?pair_code=` → pin / must_change flags (no seeding)
- `POST /api/auth/set-pin` `{ pair_code, role, pin }` — first time only if unset
- `POST /api/auth/login` `{ pair_code, pin }` — role from PIN hash match
- `POST /api/auth/change-pin` Bearer `{ old_pin, new_pin }` — clears must_change; drops other sessions

## Other endpoints

- `GET /api/health` — ok / generic error only
- `POST /api/pair` — **create** requires `PAIR_CREATE_KEY` (`x-pair-create-key` or Bearer); **join** with `{ pair_code }` is open (rate-limited)
- `POST /api/entries` · confirm|reject · `GET /api/sync` (Bearer; blocked while must_change)

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
