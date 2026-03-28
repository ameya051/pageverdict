# Landing Page Roaster — Backend Implementation Plan

## Context
Greenfield backend for the Landing Page Roaster: a tool where users paste a URL and get an AI-powered roast of their landing page with scores across performance, copy, SEO, and technical health. The spec exists at `Landing_Page_Roaster_Specsheet_v1.md`; the project has an empty `api/` directory and no code yet.

**Stack decisions (diverging from spec):**
- **Database**: NeonDB (serverless Postgres) with **psycopg 3** (async) — replaces Supabase PostgreSQL
- **Storage**: **Cloudinary** for screenshots — replaces Supabase Storage (handles WebP conversion + CDN, eliminates Pillow)
- **Auth**: Skipped for MVP — anonymous-only with IP-based rate limiting
- Screenshot height capped at 3000px via Playwright's `clip` parameter (no Pillow needed)

---

## Phase 1: Project Scaffolding (Tasks 1–3)

### Task 1: Directory structure + `__init__.py` files
Create all sub-packages:
```
api/app/__init__.py
api/app/models/__init__.py
api/app/collectors/__init__.py
api/app/agents/__init__.py
```

### Task 2: `api/requirements.txt`
```
fastapi[standard]>=0.115.0
uvicorn[standard]>=0.34.0
pydantic>=2.10.0
pydantic-settings>=2.7.0
openai>=1.60.0
httpx>=0.28.0
playwright>=1.49.0
beautifulsoup4>=4.12.0
psycopg[binary]>=3.2.0
psycopg-pool>=3.2.0
cloudinary>=1.41.0
sse-starlette>=2.2.0
python-dotenv>=1.0.0
```

### Task 3: `api/app/config.py`, `api/.env.example`, `api/Dockerfile`
- `config.py`: `pydantic-settings` `BaseSettings` with:
  - `openai_api_key: str`
  - `database_url: str` (Neon connection string)
  - `cloudinary_cloud_name: str`
  - `cloudinary_api_key: str`
  - `cloudinary_api_secret: str`
  - `pagespeed_api_key: str | None = None`
  - `allowed_origins: list[str] = ["http://localhost:3000"]`
  - `debug: bool = False`
  - Singleton via `@lru_cache` `get_settings()`.
- `.env.example`: all env vars with placeholder values and comments.
- `Dockerfile`: base `mcr.microsoft.com/playwright/python:v1.42.0-jammy`, installs deps, runs uvicorn.

---

## Phase 2: Data Models & DB Client (Tasks 4–5)

### Task 4: `api/app/models/schemas.py`
Pydantic models:
- `ScanRequest`: `url: HttpUrl` with SSRF-prevention validator (reject private IPs, non-http schemes, `@` in authority, max 2048 chars).
- `Issue`: id, title, description, severity (`critical`/`warning`/`info`), impact, recommendation.
- `AuditSection`: category, name, score (0–10), max_score=10, issues (max 5), strengths (max 3), summary.
- `ScanMetadata`: page_title, page_description, favicon_url, technologies, scan_duration_ms.
- `ScanResult`: id, url, screenshot_url, overall_score, sections, roast_summary, metadata, created_at.
- `ScanProgress`: step, message, progress (0–100) — for SSE.
- Internal: `ScrapedPage` (screenshot_bytes, html, headers, meta, console_errors, technologies), `PageSpeedResult` (scores, cwv dict, audits dict).

### Task 5: `api/app/models/db.py`
- **Async connection pool** via `psycopg_pool.AsyncConnectionPool` with Neon `DATABASE_URL`.
- Pool initialized in FastAPI lifespan, closed on shutdown.
- SQL schema creation (run once): `scans` table.
- Helper functions (all async, native — no `to_thread` needed):
  - `save_scan(scan: ScanResult)` — INSERT into `scans`, store sections/metadata as JSONB.
  - `get_scan(scan_id: str) -> ScanResult | None` — SELECT by ID.
  - `check_usage(client_ip: str) -> bool` — count scans for IP in current month, return True if under limit (3/month).

**Database schema:**
```sql
CREATE TABLE IF NOT EXISTS scans (
    id UUID PRIMARY KEY,
    url TEXT NOT NULL,
    client_ip TEXT NOT NULL,
    screenshot_url TEXT NOT NULL,
    overall_score SMALLINT NOT NULL,
    sections JSONB NOT NULL,
    roast_summary TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_scans_client_ip_created ON scans(client_ip, created_at);
```
Note: No separate `usage` table — rate limiting derived from `COUNT(*) FROM scans WHERE client_ip = $1 AND created_at >= date_trunc('month', NOW())`.

---

## Phase 3: Data Collectors (Tasks 6–7)

### Task 6: `api/app/collectors/scraper.py`
- `async def capture_page(url) -> ScrapedPage`.
- Singleton browser (managed by FastAPI lifespan), new context per request.
- Viewport 1280×800, 30s timeout, `networkidle` → fallback `domcontentloaded`.
- Screenshot: take full-page PNG, cap height at 3000px via Playwright `clip`. Upload raw PNG to Cloudinary (it handles WebP conversion + CDN).
- Capture: HTML (`page.content()`), response headers, meta tags (title, description, favicon, OG), console error count, technology detection (pattern matching in HTML/headers for Next.js, React, WordPress, Cloudflare, Vercel, etc.).

### Task 7: `api/app/collectors/pagespeed.py`
- `async def fetch_pagespeed(url) -> PageSpeedResult`.
- `httpx.AsyncClient` GET to PageSpeed API, strategy=mobile, all 4 categories.
- Extract: Lighthouse scores (0–1.0), CWV (LCP, CLS, INP/FID, TTI, Speed Index), relevant audit details.
- Graceful fallback on failure (return zeroed result, agents handle accordingly).

---

## Phase 4: Agent Layer (Tasks 8–13)

### Task 8: `api/app/agents/base.py`
- `BaseAgent` class: OpenAI async client (`AsyncOpenAI`), `_build_messages()` (abstract), `analyze()` with JSON response format, retry (max 2), score clamping (0–10), `_fallback_result()` (score=5, empty issues).

### Task 9: `api/app/agents/techhealth_agent.py`
- **No LLM.** Does NOT extend BaseAgent.
- Programmatic checks: 6 security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy), HTTPS, accessibility score, best practices score, console errors.
- Deterministic scoring: start at 10, deduct per finding.

### Task 10: `api/app/agents/performance_agent.py`
- Extends BaseAgent. Deterministic score via rubric (LCP 40%, CLS 30%, TTI 30%). GPT-4o only for witty summary.
- Issues created programmatically from CWV thresholds (spec section 4.1 rubric).

### Task 11: `api/app/agents/seo_agent.py`
- Extends BaseAgent. BeautifulSoup HTML parsing for SEO checklist (meta title/desc, heading hierarchy, OG tags, Twitter cards, structured data, canonical, alt text coverage).
- Deterministic scoring. GPT-4o only for summary.

### Task 12: `api/app/agents/copy_agent.py`
- Extends BaseAgent. Most LLM-intensive.
- Sends extracted text (8000 chars max, stripped of script/style/nav/footer) + base64 PNG screenshot (detail=low) to GPT-4o vision.
- Evaluates: headline clarity, value prop, CTA wording/prominence, trust signals, benefit vs feature language, tone consistency.
- System prompt demands specific quotable critiques, not generic advice.

### Task 13: `api/app/synthesizer.py`
- `async def synthesize(sections) -> (overall_score, roast_summary)`.
- Weighted average: Performance 30%, Copy 35%, SEO 20%, TechHealth 15%.
- GPT-4o for 3–4 sentence roast verdict referencing specific findings. Template fallback on failure.

---

## Phase 5: Orchestrator (Task 14)

### Task 14: `api/app/orchestrator.py`
- `async def run_scan(url, client_ip, progress_callback) -> ScanResult`.
- Phase 2: `asyncio.gather(capture_page, fetch_pagespeed)`.
- Screenshot upload to Cloudinary as background task (`asyncio.create_task`).
- Phase 3: `asyncio.gather(PerfAgent, CopyAgent, SEOAgent, TechHealthAgent)`.
- Phase 4: synthesize.
- Phase 5: await screenshot upload, persist to NeonDB, return result.
- Progress callback emits SSE events at each phase.

---

## Phase 6: API Routes (Tasks 15–18)

### Task 15: `api/app/main.py` — App skeleton
- FastAPI app with CORS, lifespan managing both Playwright browser + psycopg connection pool, `GET /health`.

### Task 16: `POST /api/analyze` — SSE streaming
- IP-based rate limit check (3/month anonymous) → `asyncio.Queue`-based SSE bridge → orchestrator → stream progress + final result.
- `429` on quota exceeded.

### Task 17: `GET /api/scan/{scan_id}`
- Fetch from NeonDB, return `ScanResult` or `404`. Cache-Control header.

### Task 18: `POST /api/analyze/sync`
- Non-SSE variant, returns JSON directly. Same logic, no progress callback. Useful for testing.

---

## Phase 7: Hardening (Tasks 19–22)

### Task 19: Error handling middleware
- Global handlers for `RequestValidationError`, `httpx.TimeoutException`, `playwright.TimeoutError`, generic `Exception`.
- Request ID middleware (`X-Request-ID` header).

### Task 20: SSRF protection (already in Task 4 validator)
- DNS resolution check, private IP rejection, scheme whitelist.

### Task 21: `api/app/logging_config.py`
- Structured JSON logging (prod) / human-readable (dev). Loggers per module.

### Task 22: `api/README.md`
- Setup, run, test, Docker instructions.

---

## Key Design Decisions
1. **No Pillow**: Cloudinary handles image optimization/WebP; Playwright `clip` caps height at 3000px.
2. **psycopg 3 async**: Native async PostgreSQL — no `to_thread()` wrappers. SQL composition module prevents injection. Built-in connection pooling.
3. **No separate `usage` table**: Rate limiting derived from `COUNT(*)` on `scans` by `client_ip` in current month. Simpler, one less table.
4. **asyncio.Queue for SSE**: Bridges orchestrator callbacks with SSE generator pattern.
5. **TechHealth standalone**: No LLM calls → no need for BaseAgent inheritance.
6. **Deterministic scores + LLM commentary**: Performance/SEO scores are computed programmatically; LLM writes the roast text only.
7. **Browser singleton via lifespan**: Avoids 2–3s startup per request. Connection pool also in lifespan.

## Critical Files
- `api/app/orchestrator.py` — central pipeline coordinator
- `api/app/models/schemas.py` — all Pydantic models
- `api/app/models/db.py` — psycopg 3 pool + query helpers
- `api/app/agents/base.py` — retry/fallback pattern for agents
- `api/app/collectors/scraper.py` — Playwright scraper (system bottleneck)
- `api/app/main.py` — routes, CORS, lifespan, SSE

## Verification
1. `pip install -r requirements.txt && playwright install chromium`
2. Copy `.env.example` → `.env`, fill in Neon connection string + OpenAI key + Cloudinary creds
3. `cd api && uvicorn app.main:app --reload --port 8000`
4. `curl http://localhost:8000/health` → `{"status": "ok"}`
5. `curl -N -X POST http://localhost:8000/api/analyze -H "Content-Type: application/json" -d '{"url":"https://example.com"}'` → SSE progress events + final ScanResult
6. Use returned `id` with `GET /api/scan/{id}` → same result
7. Measure end-to-end < 15 seconds
