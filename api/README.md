# Landing Page Roaster — API

FastAPI backend that scrapes a landing page, runs AI-powered audits (performance, copy, SEO, tech health), and returns a scored "roast" with actionable feedback.

## Prerequisites

- Python 3.11+
- A [NeonDB](https://neon.tech) serverless Postgres database
- A [Cloudinary](https://cloudinary.com) account (screenshot storage)
- A Google Gemini API key
- (Optional) Google PageSpeed Insights API key

## Setup

```bash
# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate   # Linux/macOS
.venv\Scripts\activate      # Windows

# Install dependencies
pip install -r requirements.txt

# Install Playwright's Chromium browser
playwright install chromium

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials
```

## Running

```bash
cd api
uvicorn app.main:app --reload --port 8000
```

Verify it's up:

```bash
curl http://localhost:8000/health
# → {"status": "ok"}
```

## API Endpoints

| Method | Path                  | Description                              |
|--------|-----------------------|------------------------------------------|
| GET    | `/health`             | Health check                             |
| POST   | `/api/analyze`        | SSE streaming scan (progress + result)   |
| POST   | `/api/analyze/sync`   | Synchronous scan (returns full JSON)     |
| GET    | `/api/scan/{scan_id}` | Fetch a previously completed scan by ID  |

### Example: Start a scan (SSE)

```bash
curl -N -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Example: Start a scan (sync)

```bash
curl -X POST http://localhost:8000/api/analyze/sync \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

## Docker

```bash
docker build -t landing-page-roaster-api .
docker run --env-file .env -p 8000:8000 landing-page-roaster-api
```

## Architecture

```
app/
├── main.py              # FastAPI app, routes, lifespan
├── config.py            # pydantic-settings configuration
├── middleware.py         # Request ID + global error handlers
├── logging_config.py    # Structured JSON (prod) / human-readable (dev) logging
├── orchestrator.py      # Scan pipeline coordinator
├── synthesizer.py       # Overall score + roast summary generation
├── llm.py               # LLM client wrapper
├── models/
│   ├── schemas.py       # Pydantic request/response models
│   └── db.py            # psycopg 3 async pool + query helpers
├── collectors/
│   ├── scraper.py       # Playwright page capture + Cloudinary upload
│   └── pagespeed.py     # PageSpeed Insights API client
└── agents/
    ├── base.py          # Base agent with retry/fallback
    ├── performance_agent.py
    ├── copy_agent.py
    ├── seo_agent.py
    └── techhealth_agent.py
```

## Rate Limiting

Anonymous users are limited to **3 scans per month** per IP address. Exceeding the limit returns `429 Too Many Requests`.
