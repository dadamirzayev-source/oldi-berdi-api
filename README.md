# Oldi-berdi API

Next.js HTTPS sync API for the Oldi-berdi Android app.

- Postgres when `DATABASE_URL` is set (Cursor publish-app)
- Local PGlite (`.data/pglite`) otherwise

## Endpoints

- `GET /api/health`
- `POST /api/pair` — create or join `{ "pair_code"?: "..." }`
- `POST /api/entries` — create pending entry
- `POST /api/entries/:id/confirm|reject`
- `GET /api/sync?pair_code=&role=&since=`

## Local

```bash
npm install
npm run dev
```
