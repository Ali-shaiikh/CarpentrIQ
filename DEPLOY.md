# Render Deployment Guide

## Prerequisites
- GitHub repo connected to Render
- Supabase project created (free tier)
- Upstash Redis database created (free tier)
- Razorpay account with test/live keys

---

## Step 1 — Connect GitHub to Render

1. Go to [render.com/dashboard](https://render.com/dashboard) → **New** → **Blueprint**
2. Connect your GitHub account and select the `CarpenterIQ` repository
3. Render will detect `render.yaml` and show two services: `carpentriq-api` and `carpentriq-frontend`
4. Click **Apply** — Render creates both services but they will fail until env vars are set (next step)

---

## Step 2 — Set Environment Variables (carpentriq-api)

Go to **carpentriq-api** → **Environment** in the Render dashboard and add every variable from `.env.example`. Production values:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://...` from Supabase → Settings → Database → Connection string (replace `postgres://` with `postgresql+asyncpg://`) |
| `REDIS_URL` | `rediss://...` from Upstash → Redis → Connect → TLS URL |
| `JWT_SECRET_KEY` | Run: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `JWT_ALGORITHM` | `HS256` |
| `JWT_EXPIRE_MINUTES` | `10080` |
| `RAZORPAY_KEY_ID` | From Razorpay dashboard → API Keys |
| `RAZORPAY_KEY_SECRET` | From Razorpay dashboard → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | Set after Step 6 |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `RESEND_API_KEY` | From resend.com → API Keys |
| `RESEND_FROM_EMAIL` | `noreply@carpentriq.in` |
| `SUPABASE_URL` | From Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | From Supabase → Settings → API → `service_role` key |
| `STORAGE_BUCKET` | `carpentriq-uploads` |
| `MSG91_AUTH_KEY` | From msg91.com |
| `MSG91_TEMPLATE_ID` | From MSG91 → Templates |
| `APP_ENV` | `production` |
| `APP_BASE_URL` | `https://carpentriq-api.onrender.com` |
| `FRONTEND_URL` | `https://carpentriq-frontend.onrender.com` |
| `ALLOWED_ORIGINS` | `https://carpentriq-frontend.onrender.com,https://carpentriq.in` |

---

## Step 3 — Deploy carpentriq-api (deploy first)

1. In Render dashboard → **carpentriq-api** → **Manual Deploy** → **Deploy latest commit**
2. Watch the build logs — the build command:
   - Installs Python dependencies
   - Downloads YOLOv8n model weights (`yolov8n.pt`, ~6MB)
   - Runs `alembic upgrade head` to apply all DB migrations
3. Wait for the health check to pass: `GET https://carpentriq-api.onrender.com/health`

Expected response:
```json
{"status": "ok", "version": "1.0.0", "db": "connected", "redis": "connected"}
```

If `status` is `"degraded"`, check Render logs for DB/Redis connection errors.

---

## Step 4 — Deploy carpentriq-frontend (deploy second)

1. In Render dashboard → **carpentriq-frontend** → **Manual Deploy** → **Deploy latest commit**
2. Build runs `npm install && npm run build` inside `frontend/`
3. Render serves the `dist/` folder as a static site with SPA rewrite (`/* → /index.html`)

Verify: open `https://carpentriq-frontend.onrender.com` in a browser — should load the CarpentrIQ landing page.

---

## Step 5 — Run Seed Scripts Against Production DB

After the API is deployed and health check passes, seed the reference data:

```bash
# Seed material prices (Mumbai region)
render run --service carpentriq-api -- python scripts/seed_materials.py

# Seed furniture catalogue
render run --service carpentriq-api -- python scripts/seed_catalogue.py
```

Alternatively, use the Render shell (carpentriq-api → **Shell**) and run:
```bash
python scripts/seed_materials.py
python scripts/seed_catalogue.py
```

---

## Step 6 — Configure Razorpay Webhook

1. Log in to [dashboard.razorpay.com](https://dashboard.razorpay.com)
2. Go to **Settings** → **Webhooks** → **Add New Webhook**
3. Set:
   - **Webhook URL**: `https://carpentriq-api.onrender.com/api/v1/webhooks/razorpay`
   - **Secret**: generate a random string (e.g. `python3 -c "import secrets; print(secrets.token_hex(24))"`)
   - **Active Events**: check `payment_link.paid` and `payment.failed`
4. Copy the webhook secret → go back to Render → **carpentriq-api** → **Environment** → set `RAZORPAY_WEBHOOK_SECRET`
5. Trigger a manual redeploy for the new env var to take effect

---

## Step 7 — Smoke Test

```bash
# Health check
curl https://carpentriq-api.onrender.com/health
# → {"status":"ok","version":"1.0.0","db":"connected","redis":"connected"}

# API docs
open https://carpentriq-api.onrender.com/docs

# Frontend
open https://carpentriq-frontend.onrender.com
```

---

## Render Free Tier Notes

- **API service spins down after 15 minutes of inactivity** — first request after spin-down takes ~30s (cold start). This is expected on the free tier.
- **Upgrade trigger**: when the first carpenter pays ₹299, upgrade to Render Starter ($7/mo) to eliminate spin-down.
- **Build minutes**: free tier includes 500 build minutes/month — sufficient for early stage.
- **Custom domain**: add `carpentriq.in` in Render → carpentriq-frontend → **Custom Domains** after DNS is pointed.

---

## Rollback

If a deploy breaks production:

```bash
# In Render dashboard → carpentriq-api → Deploys → click a previous deploy → "Rollback to this deploy"
```

Or via CLI:
```bash
render deploys rollback --service carpentriq-api
```
