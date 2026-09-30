# TAAJ Handloom — Backend API

Node/Express + TypeScript REST API for the TAAJ Handloom storefront and admin.
MongoDB (Atlas) for data, Cloudinary for product media.

## Tech
- Express 4, TypeScript (ESM / NodeNext), Mongoose
- Auth: JWT access/refresh + httpOnly cookies
- Bundles the shared `@taaj/shared` package locally (see [Shared package](#shared-package))

## Local development
```bash
npm install
cp .env.example .env      # fill in the values below
npm run dev               # tsx watch, http://localhost:3000/api/v1
```
Other scripts: `npm run build` (compile to `dist/`), `npm start` (run `dist/`),
`npm run seed:admin`, `npm run typecheck`, `npm test`.

## Environment variables
| Var | Notes |
|-----|-------|
| `NODE_ENV` | `development` / `production` |
| `PORT` | Local default `3000`. **Render sets this automatically — don't hardcode it in prod.** |
| `API_PREFIX` | `/api/v1` |
| `MONGODB_URI` | MongoDB Atlas SRV string, including `/taaj_handloom` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET` | long random strings |
| `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_EXPIRES` | e.g. `15m`, `7d` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | image storage |
| `WHATSAPP_NUMBER` | business number, country code, no `+` |
| `FRONTEND_URL`, `ADMIN_URL` | CORS allowlist — the deployed storefront & admin origins |

Never commit `.env` or `atlas-credentials.env` (both are gitignored).

## Deploy — Render (free)
This repo ships a `render.yaml` blueprint.

1. Render Dashboard → **New → Blueprint** → connect this repo. Render reads `render.yaml`:
   - Build: `npm install && npm run build`
   - Start: `npm start`
   - Health check: `/api/v1/health`
2. Fill the secret env vars (marked `sync: false`) in the dashboard:
   `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`,
   `CLOUDINARY_*`, `WHATSAPP_NUMBER`, and `FRONTEND_URL` / `ADMIN_URL`.
3. **MongoDB Atlas → Network Access → add `0.0.0.0/0`.** Render's free tier uses dynamic
   outbound IPs, so a fixed-IP allowlist will block the DB connection.
4. Deploy, then note the service URL (e.g. `https://taaj-handloom-api.onrender.com`).
   Set the frontends' `VITE_API_URL` to `<that URL>/api/v1`, and set this service's
   `FRONTEND_URL` / `ADMIN_URL` to the deployed Vercel URLs, then redeploy.

> Render's free web service **sleeps after ~15 min idle** — the first request after a nap
> takes ~50s to wake. Fine for testing.

## Shared package
`@taaj/shared` (constants, types, zod schemas, utils) is vendored into `./shared` and wired
as a local dependency: `"@taaj/shared": "file:./shared"`. The build compiles it first via
`npm run build:shared` (prepended to `build`). If you change shared logic, keep it in sync
with the copies in the frontend and admin repos.
