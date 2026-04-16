from __future__ import annotations

import asyncio
import json
import logging
import sys
from contextlib import asynccontextmanager

# Windows + Python 3.13: SelectorEventLoop doesn't support subprocesses (needed by Playwright)
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from app.collectors.scraper import init_browser, close_browser
from app.config import get_settings
from app.logging_config import setup_logging
from app.middleware import install_middleware
from app.models.db import init_pool, close_pool, get_scan, check_usage
from app.models.schemas import ScanProgress, ScanRequest
from app.orchestrator import run_scan

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_browser()
    await init_pool()
    yield
    await close_pool()
    await close_browser()


settings = get_settings()
setup_logging(debug=settings.debug)

app = FastAPI(title="Landing Page Roaster", lifespan=lifespan)

install_middleware(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _monthly_limit_response() -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Monthly scan limit reached (3 scans/month)."},
    )


async def _ensure_scan_quota(client_ip: str) -> JSONResponse | None:
    if await check_usage(client_ip):
        return None
    return _monthly_limit_response()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/analyze")
async def analyze_sse(body: ScanRequest, request: Request):
    """SSE streaming endpoint — emits progress events and a final result."""
    client_ip = _get_client_ip(request)

    quota_response = await _ensure_scan_quota(client_ip)
    if quota_response:
        return quota_response

    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def progress_callback(progress: ScanProgress) -> None:
        await queue.put({"event": "progress", "data": progress.model_dump()})

    async def run() -> None:
        try:
            result = await run_scan(str(body.url), client_ip, progress_callback)
            await queue.put({"event": "result", "data": result.model_dump(mode="json")})
        except Exception as exc:
            logger.exception("Scan failed for %s", body.url)
            await queue.put({"event": "error", "data": {"detail": str(exc)}})
        finally:
            await queue.put(None)  # sentinel to close the stream

    async def event_generator():
        task = asyncio.create_task(run())
        try:
            while True:
                msg = await queue.get()
                if msg is None:
                    break
                yield {"event": msg["event"], "data": json.dumps(msg["data"])}
        finally:
            if not task.done():
                task.cancel()

    return EventSourceResponse(event_generator())


@app.get("/api/scan/{scan_id}")
async def get_scan_by_id(scan_id: str):
    """Fetch a previously completed scan by ID."""
    result = await get_scan(scan_id)
    if result is None:
        return JSONResponse(status_code=404, content={"detail": "Scan not found"})
    return JSONResponse(
        content=result.model_dump(mode="json"),
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.post("/api/analyze/sync")
async def analyze_sync(body: ScanRequest, request: Request):
    """Non-SSE variant — returns the full ScanResult as JSON."""
    client_ip = _get_client_ip(request)

    quota_response = await _ensure_scan_quota(client_ip)
    if quota_response:
        return quota_response

    result = await run_scan(str(body.url), client_ip)
    return result.model_dump(mode="json")
