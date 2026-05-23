# CarpentrIQ — AI Operating System for Indian Carpenters

> A WhatsApp-first AI platform that helps local Indian carpenters generate professional quotes, visualise furniture, and collect advance payments — all from a phone link.

**Live:** [carpentriq.in](https://carpentriq.in) · **API:** [carpentriq-api.onrender.com](https://carpentriq-api.onrender.com/health)

---

## What It Does

A carpenter shares a unique link with their client. The client opens it in any browser, uploads room photos and selects the furniture they need. From there:

1. **CV Module** — YOLOv8 estimates room dimensions from photos using standard door size (900 × 2100 mm) as a scale reference
2. **Material Estimator** — Calculates plywood sheets, laminate, hinges, drawer slides, and labour for each furniture item
3. **AI Room Preview** — DALL-E 3 generates a photorealistic room image with the selected furniture
4. **Quote PDF** — Professional A4 quote with itemised breakdown, material specs, and QR code for digital approval
5. **Razorpay Payment** — Client approves and pays the advance directly from the quote link

No app install. No WhatsApp Business API. Just a link.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy (async) |
| Database | PostgreSQL 15 (Supabase) |
| Cache | Upstash Redis |
| CV | YOLOv8 (ultralytics) — CPU inference |
| Room Preview | DALL-E 3 via OpenAI API |
| Furniture AI | fal.ai FLUX image generation |
| AI Assistant | Claude Haiku (Anthropic) |
| Frontend | React 18, Vite, Tailwind CSS |
| Auth | Phone + Email OTP → JWT |
| Email | Resend (noreply@carpentriq.in) |
| Payments | Razorpay payment links |
| Hosting | Render (backend) + Vercel (frontend) |

---

## Project Structure

```
carpentriq/
├── app/
│   ├── api/              # FastAPI routers
│   │   ├── auth.py       # Phone OTP + JWT
│   │   ├── enquiry.py    # Client enquiry flow
│   │   ├── quote.py      # Quote generation + PDF
│   │   ├── cv.py         # YOLOv8 room analysis
│   │   ├── furniture_ai.py  # AI image generation
│   │   ├── billing.py    # Razorpay subscriptions
│   │   └── ...
│   ├── models/           # SQLAlchemy ORM models
│   ├── services/         # Business logic
│   │   ├── auth_service.py
│   │   ├── material_estimator.py
│   │   ├── furniture_ai.py
│   │   └── ...
│   ├── ml/
│   │   └── room_analyser.py  # YOLOv8 pipeline
│   └── config.py
├── frontend/
│   └── src/
│       ├── pages/        # React page components
│       ├── components/   # Shared UI components
│       └── services/     # API client
├── alembic/              # DB migrations
├── scripts/              # Seed scripts
└── tests/
```

---

## Local Development

**Prerequisites:** Python 3.11, Node 18+, PostgreSQL

```bash
# Clone
git clone https://github.com/Ali-shaiikh/CarpentrIQ.git
cd CarpentrIQ

# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in your keys
alembic upgrade head
python scripts/seed_materials.py
python scripts/seed_catalogue.py
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

App runs at `http://localhost:5173` · API at `http://localhost:8000`

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (asyncpg) |
| `REDIS_URL` | Upstash Redis URL |
| `JWT_SECRET_KEY` | 64-char random string |
| `ANTHROPIC_API_KEY` | Claude Haiku — AI assistant |
| `OPENAI_API_KEY` | DALL-E 3 — room image generation |
| `FAL_API_KEY` | fal.ai — furniture renders |
| `RESEND_API_KEY` | Email OTP delivery |
| `RESEND_FROM_EMAIL` | `noreply@carpentriq.in` |
| `RAZORPAY_KEY_ID` | Razorpay payments |
| `RAZORPAY_KEY_SECRET` | Razorpay secret |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `APP_ENV` | `development` or `production` |

---

## API Overview

```
POST /api/v1/auth/send-otp        # Send OTP to email
POST /api/v1/auth/verify-otp      # Verify OTP → JWT

GET  /api/v1/enquiry/form/:slug   # Client loads carpenter's form
POST /api/v1/enquiry/submit       # Client submits enquiry
POST /api/v1/enquiry/:id/photos   # Client uploads room photos

POST /api/v1/cv/analyse/:id       # Run YOLOv8 on photos
POST /api/v1/quote/generate       # Generate quote from CV results
POST /api/v1/quote/:id/send       # PDF + Razorpay link → client

GET  /api/v1/quote/:token/view    # Client views quote
POST /api/v1/quote/:token/approve # Client approves + pays
```

Full docs at `/docs` (Swagger UI) when running locally.

---

## Pricing

| Plan | Price | Limits |
|---|---|---|
| Trial | Free | 7 days · 5 AI images/day |
| Basic | ₹299/month | Unlimited quotes |
| Pro | ₹599/month | Priority support + analytics |

---

## Target Market

- **Phase 1:** Individual carpenters in Mumbai
- **Market size:** 20,000+ SME carpenters in India
- **80–90%** have zero digital tools today
- Primary device: Android phones (₹8,000–12,000)

---

## Roadmap

- [x] Phone + Email OTP auth
- [x] Client enquiry form via unique link
- [x] YOLOv8 room dimension estimation
- [x] AI furniture image generation
- [x] Quote PDF generation
- [x] Razorpay payment links
- [x] 7-day free trial with usage limits
- [ ] WhatsApp Business API (after 20 paying carpenters)
- [ ] Multi-city expansion (after 50 paying carpenters)
- [ ] Native Android app

---

## License

Private — All rights reserved © 2026 CarpentrIQ
