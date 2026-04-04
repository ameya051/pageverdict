from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

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

_MAX_RETRIES = 2
_BASE_BACKOFF_SECONDS = 1.0
_MAX_RETRY_AFTER_SECONDS = 5


def _zeroed() -> PageSpeedResult:
    return PageSpeedResult(
        available=True,
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


def _degraded(
    reason: str,
    warning: str,
    retry_after_seconds: int | None = None,
) -> PageSpeedResult:
    result = _zeroed()
    result.available = False
    result.degraded_reason = reason
    result.retry_after_seconds = retry_after_seconds
    result.warning = warning
    return result


def _parse_retry_after_seconds(header_value: str | None) -> int | None:
    if not header_value:
        return None

    raw = header_value.strip()
    if not raw:
        return None

    try:
        return max(0, int(raw))
    except ValueError:
        pass

    try:
        retry_at = parsedate_to_datetime(raw)
    except (TypeError, ValueError, IndexError):
        return None

    if retry_at.tzinfo is None:
        retry_at = retry_at.replace(tzinfo=timezone.utc)

    delay_seconds = int((retry_at - datetime.now(timezone.utc)).total_seconds())
    return max(0, delay_seconds)


def _retry_delay_seconds(attempt_index: int, retry_after_seconds: int | None) -> float:
    if retry_after_seconds is not None:
        return float(min(retry_after_seconds, _MAX_RETRY_AFTER_SECONDS))
    return min(_BASE_BACKOFF_SECONDS * (2 ** attempt_index), float(_MAX_RETRY_AFTER_SECONDS))


async def fetch_pagespeed(url: str) -> PageSpeedResult:
    settings = get_settings()

    params: dict[str, object] = {
        "url": url,
        "strategy": "mobile",
        "category": ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"],
    }
    if settings.pagespeed_api_key:
        params["key"] = settings.pagespeed_api_key

    async with httpx.AsyncClient(timeout=60.0) as client:
        for attempt_index in range(_MAX_RETRIES + 1):
            try:
                response = await client.get(PAGESPEED_URL, params=params)
                response.raise_for_status()
                data = response.json()
                break
            except httpx.HTTPStatusError as exc:
                response = exc.response
                status_code = response.status_code
                retry_after_seconds = _parse_retry_after_seconds(response.headers.get("Retry-After"))
                should_retry = status_code == 429 or 500 <= status_code < 600

                logger.warning(
                    "PageSpeed API returned status=%s for %s on attempt %s/%s (retry_after=%s, has_api_key=%s)",
                    status_code,
                    url,
                    attempt_index + 1,
                    _MAX_RETRIES + 1,
                    retry_after_seconds,
                    bool(settings.pagespeed_api_key),
                )

                if should_retry and attempt_index < _MAX_RETRIES:
                    await asyncio.sleep(_retry_delay_seconds(attempt_index, retry_after_seconds))
                    continue

                if status_code == 429:
                    return _degraded(
                        reason="quota_limited",
                        warning=(
                            "PageSpeed data was unavailable because Google rate-limited the request. "
                            "The scan completed with partial results."
                        ),
                        retry_after_seconds=retry_after_seconds,
                    )

                if 500 <= status_code < 600:
                    return _degraded(
                        reason="service_unavailable",
                        warning=(
                            "PageSpeed data was temporarily unavailable from Google. "
                            "The scan completed with partial results."
                        ),
                        retry_after_seconds=retry_after_seconds,
                    )

                return _degraded(
                    reason="request_failed",
                    warning=(
                        "PageSpeed data could not be fetched from Google for this URL. "
                        "The scan completed with partial results."
                    ),
                    retry_after_seconds=retry_after_seconds,
                )
            except httpx.RequestError as exc:
                logger.warning("PageSpeed API request failed for %s: %s", url, exc)
                return _degraded(
                    reason="request_error",
                    warning=(
                        "PageSpeed data could not be fetched because the Google request failed. "
                        "The scan completed with partial results."
                    ),
                )
            except Exception as exc:
                logger.warning("PageSpeed API failed for %s: %s", url, exc)
                return _degraded(
                    reason="unexpected_error",
                    warning=(
                        "PageSpeed data could not be processed. The scan completed with partial results."
                    ),
                )
        else:
            return _degraded(
                reason="request_failed",
                warning=(
                    "PageSpeed data could not be fetched from Google. "
                    "The scan completed with partial results."
                ),
            )

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
                audit = audits[audit_id]
                detail[audit_id] = {
                    "score": audit.get("score"),
                    "display_value": audit.get("displayValue"),
                    "numeric_value": audit.get("numericValue"),
                }

        return PageSpeedResult(scores=scores, cwv=cwv, audits=detail)
    except Exception as exc:
        logger.warning("Failed to parse PageSpeed response for %s: %s", url, exc)
        return _degraded(
            reason="parse_failed",
            warning=(
                "PageSpeed returned an unexpected response. The scan completed with partial results."
            ),
        )
