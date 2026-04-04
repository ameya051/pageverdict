# Landing Page Roaster - API

FastAPI backend that scrapes a landing page, runs AI-powered audits (performance, copy, SEO, tech health), and returns a scored roast with actionable feedback.

## Prerequisites

- Python 3.11+
- A [NeonDB](https://neon.tech) serverless Postgres database
- A [Cloudinary](https://cloudinary.com) account for screenshot storage
- A Google Gemini API key
- An optional but strongly recommended Google PageSpeed Insights API key

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

`PAGESPEED_API_KEY` is optional, but this backend makes automated PageSpeed requests and can hit Google quota quickly without one. When Google returns `429 Too Many Requests`, scans now complete with partial results and include a warning in the response metadata instead of failing the entire scan.

## Running

```bash
cd api
uvicorn app.main:app --reload --port 8000
```

Verify it is up:

```bash
curl http://localhost:8000/health
# -> {"status": "ok"}
```

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Health check |
| POST | `/api/analyze` | SSE streaming scan with progress and result |
| POST | `/api/analyze/sync` | Synchronous scan returning full JSON |
| GET | `/api/scan/{scan_id}` | Fetch a previously completed scan by ID |

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

```text
app/
|-- main.py              # FastAPI app, routes, lifespan
|-- config.py            # pydantic-settings configuration
|-- middleware.py        # Request ID and global error handlers
|-- logging_config.py    # Structured JSON (prod) or human-readable (dev) logging
|-- orchestrator.py      # Scan pipeline coordinator
|-- synthesizer.py       # Overall score and roast summary generation
|-- llm.py               # LLM client wrapper
|-- models/
|   |-- schemas.py       # Pydantic request and response models
|   `-- db.py            # psycopg 3 async pool and query helpers
|-- collectors/
|   |-- scraper.py       # Playwright page capture and Cloudinary upload
|   `-- pagespeed.py     # PageSpeed Insights API client
`-- agents/
    |-- base.py
    |-- performance_agent.py
    |-- copy_agent.py
    |-- seo_agent.py
    `-- techhealth_agent.py
```

## Rate Limiting

Anonymous users are limited to **3 scans per month** per IP address. Exceeding that limit returns `429 Too Many Requests` from this API.
