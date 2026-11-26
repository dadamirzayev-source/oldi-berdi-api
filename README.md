# Oldi-berdi API

Next.js HTTPS sync API for the Oldi-berdi Android app.

- Postgres when `DATABASE_URL` is set (Cursor publish-app)
- Local PGlite (`.data/pglite`) otherwise

## Auth (PIN-only)

- `GET /api/auth/status?pair_code=` → `{ pin_set: { A, B }, roles: { A: { label, pin_set }, B: … } }`
- `POST /api/auth/set-pin` `{ pair_code, role, pin }` — first time per role only (role required once)
- `POST /api/auth/login` `{ pair_code, pin }` — role inferred from PIN hash match
- `POST /api/auth/change-pin` Bearer `{ old_pin, new_pin }` — new PIN must differ from the other role
- A and B must use **different** PINs so login can resolve role

## Other endpoints

- `GET /api/health`
- `POST /api/pair` — create or join `{ "pair_code"?: "..." }`
- `POST /api/entries` — create pending entry (Bearer)
- `POST /api/entries/:id/confirm|reject` (Bearer)
- `GET /api/sync` (Bearer)

## Local

```bash
npm install
env -u DATABASE_URL npm run dev
```
