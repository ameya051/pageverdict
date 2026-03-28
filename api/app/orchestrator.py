from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Callable, Awaitable
from uuid import uuid4

from app.agents.copy_agent import analyze_copy
from app.agents.performance_agent import analyze_performance
from app.agents.seo_agent import analyze_seo
from app.agents.techhealth_agent import analyze_tech_health
from app.collectors.pagespeed import fetch_pagespeed
from app.collectors.scraper import capture_page, upload_screenshot
from app.models.db import save_scan
from app.models.schemas import (
    AuditSection,
    ScanMetadata,
    ScanProgress,
    ScanResult,
)
from app.synthesizer import synthesize

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[ScanProgress], Awaitable[None]]


async def _noop_progress(_: ScanProgress) -> None:
    pass


async def run_scan(
    url: str,
    client_ip: str,
    progress_callback: ProgressCallback | None = None,
) -> ScanResult:
    cb = progress_callback or _noop_progress
    scan_id = str(uuid4())
    start = time.monotonic()

    # Phase 1: Collect data (scraper + pagespeed in parallel)
    await cb(ScanProgress(step="collecting", message="Scraping page and fetching PageSpeed data…", progress=10))

    scraped_page, pagespeed = await asyncio.gather(
        capture_page(url),
        fetch_pagespeed(url),
    )

    await cb(ScanProgress(step="collecting", message="Data collection complete.", progress=30))

    # Start screenshot upload in the background
    upload_task = asyncio.create_task(
        upload_screenshot(scraped_page.screenshot_bytes, scan_id)
    )

    # Phase 2: Run all four agents in parallel
    await cb(ScanProgress(step="analyzing", message="Running AI analysis…", progress=40))

    perf_section, copy_section, seo_section, tech_section = await asyncio.gather(
        analyze_performance(pagespeed),
        analyze_copy(scraped_page),
        analyze_seo(scraped_page, pagespeed),
        asyncio.to_thread(analyze_tech_health, scraped_page, pagespeed),
    )

    sections: list[AuditSection] = [perf_section, copy_section, seo_section, tech_section]

    await cb(ScanProgress(step="analyzing", message="Analysis complete.", progress=70))

    # Phase 3: Synthesize overall score and roast
    await cb(ScanProgress(step="synthesizing", message="Generating roast verdict…", progress=80))

    overall_score, roast_summary = await synthesize(sections)

    # Phase 4: Await screenshot upload + persist
    await cb(ScanProgress(step="saving", message="Saving results…", progress=90))

    screenshot_url = await upload_task

    elapsed_ms = int((time.monotonic() - start) * 1000)

    metadata = ScanMetadata(
        page_title=scraped_page.meta.get("title"),
        page_description=scraped_page.meta.get("description"),
        favicon_url=scraped_page.meta.get("favicon"),
        technologies=scraped_page.technologies,
        scan_duration_ms=elapsed_ms,
    )

    result = ScanResult(
        id=scan_id,
        url=str(url),
        screenshot_url=screenshot_url,
        overall_score=overall_score,
        sections=sections,
        roast_summary=roast_summary,
        metadata=metadata,
        created_at=datetime.now(timezone.utc),
    )

    await save_scan(result, client_ip)

    await cb(ScanProgress(step="done", message="Scan complete!", progress=100))

    logger.info("Scan %s completed in %dms (score=%d)", scan_id, elapsed_ms, overall_score)
    return result
