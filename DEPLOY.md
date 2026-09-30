# Deploy — Backend API (Render)

Free-tier deploy of the TAAJ Handloom API to [Render](https://render.com) using the
`render.yaml` blueprint in this repo. **Never commit real secret values** — the tables below
use `<placeholders>`; enter the actual values only in the Render dashboard.

## Order of operations
1. **Deploy this backend** → get its URL → confirm `https://<url>/api/v1/health` is green.
2. Set each frontend's `VITE_API_URL` to `<url>/api/v1`, deploy them, collect their URLs.
3. Put those URLs in this service's `FRONTEND_URL` / `ADMIN_URL` → redeploy.
4. Seed the first admin user (see below).

## 1. Create the service
Render Dashboard → **New → Blueprint** → connect `NadeemBeg/taaj_handloom-backend`.
Render reads `render.yaml`:
- Build: `npm install && npm run build`
- Start: `npm start`
- Health check: `/api/v1/health`

## 2. Environment variables

Set automatically by `render.yaml` (no action): `NODE_ENV=production`,
`API_PREFIX=/api/v1`, `JWT_ACCESS_EXPIRES=15m`, `JWT_REFRESH_EXPIRES=7d`.
Render also injects `PORT` — the app reads it; do **not** set it manually.

Enter these in the dashboard (marked `sync: false` in the blueprint):

| Key | Value |
|-----|-------|
| `MONGODB_URI` | `mongodb+srv://<db_user>:<db_password>@taajhandloom.yaa7gxu.mongodb.net/taaj_handloom?retryWrites=true&w=majority&appName=taajhandloom` |
| `JWT_ACCESS_SECRET` | `<generate — see below>` |
| `JWT_REFRESH_SECRET` | `<generate — see below>` |
| `COOKIE_SECRET` | `<generate — see below>` |
| `CLOUDINARY_CLOUD_NAME` | `dcjgsrmqy` |
| `CLOUDINARY_API_KEY` | `<cloudinary api key>` |
| `CLOUDINARY_API_SECRET` | `<cloudinary api secret>` |
| `WHATSAPP_NUMBER` | `917509724030` |
| `FRONTEND_URL` | `https://<your-frontend>.vercel.app` (set after Vercel deploy) |
| `ADMIN_URL` | `https://<your-admin>.vercel.app` (set after Vercel deploy) |

### Generate production secrets
Do **not** reuse local dev secrets. Generate fresh ones:
```bash
for k in JWT_ACCESS_SECRET JWT_REFRESH_SECRET COOKIE_SECRET; do
  echo "$k=$(openssl rand -hex 32)"
done
```

## 3. MongoDB Atlas network access
Atlas → **Network Access → Add IP → `0.0.0.0/0`**. Render's free tier uses dynamic outbound
IPs, so a fixed-IP allowlist blocks the DB connection.

## 4. Seed the first admin user
The database has no admin user yet, so the admin panel can't be logged into until you create
one. In the Render **Shell** tab:
```bash
SEED_ADMIN_EMAIL='you@taajhandloom.com' SEED_ADMIN_PASSWORD='<strong-password>' \
SEED_ADMIN_NAME='Super Admin' npm run seed:admin
```

## Notes
- Render free web services **sleep after ~15 min idle**; first request after a nap takes ~50s.
- On first deploy, watch the logs for `MongoDB connected` and `listening` — if the health
  check is green, the API is up.
