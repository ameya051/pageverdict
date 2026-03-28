from __future__ import annotations

import logging

import httpx

from app.config import get_settings
from app.models.schemas import PageSpeedResult

logger = logging.getLogger(__name__)

PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

_DETAIL_AUDITS = [
    "render-blocking-resources",
    "unused-css-rules",
    "unused-javascript",
    "uses-optimized-images",
    "uses-webp-images",
    "uses-responsive-images",
    "offscreen-images",
    "uses-text-compression",
    "uses-rel-preconnect",
    "server-response-time",
    "redirects",
    "efficient-animated-content",
    "duplicated-javascript",
    "legacy-javascript",
]


def _zeroed() -> PageSpeedResult:
    return PageSpeedResult(
        scores={"performance": 0.0, "accessibility": 0.0, "best-practices": 0.0, "seo": 0.0},
        cwv={
            "lcp_ms": 0.0,
            "cls": 0.0,
            "inp_ms": 0.0,
            "tbt_ms": 0.0,
            "tti_ms": 0.0,
            "speed_index_ms": 0.0,
        },
        audits={},
    )


async def fetch_pagespeed(url: str) -> PageSpeedResult:
    settings = get_settings()

    params: dict = {
        "url": url,
        "strategy": "mobile",
        "category": ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"],
    }
    if settings.pagespeed_api_key:
        params["key"] = settings.pagespeed_api_key

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(PAGESPEED_URL, params=params)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        logger.warning("PageSpeed API failed for %s: %s", url, exc)
        return _zeroed()

    try:
        lhr = data.get("lighthouseResult", {})
        categories = lhr.get("categories", {})
        audits = lhr.get("audits", {})

        scores = {
            "performance": float(categories.get("performance", {}).get("score") or 0.0),
            "accessibility": float(categories.get("accessibility", {}).get("score") or 0.0),
            "best-practices": float(categories.get("best-practices", {}).get("score") or 0.0),
            "seo": float(categories.get("seo", {}).get("score") or 0.0),
        }

        def _num(audit_id: str) -> float:
            return float(audits.get(audit_id, {}).get("numericValue") or 0.0)

        # INP may not exist in older Lighthouse versions; fall back to TBT as proxy
        inp_ms = _num("interaction-to-next-paint") or _num("total-blocking-time")

        cwv = {
            "lcp_ms": _num("largest-contentful-paint"),
            "cls": _num("cumulative-layout-shift"),
            "inp_ms": inp_ms,
            "tbt_ms": _num("total-blocking-time"),
            "tti_ms": _num("interactive"),
            "speed_index_ms": _num("speed-index"),
        }

        detail: dict[str, dict] = {}
        for audit_id in _DETAIL_AUDITS:
            if audit_id in audits:
                a = audits[audit_id]
                detail[audit_id] = {
                    "score": a.get("score"),
                    "display_value": a.get("displayValue"),
                    "numeric_value": a.get("numericValue"),
                }

        return PageSpeedResult(scores=scores, cwv=cwv, audits=detail)

    except Exception as exc:
        logger.warning("Failed to parse PageSpeed response for %s: %s", url, exc)
        return _zeroed()
