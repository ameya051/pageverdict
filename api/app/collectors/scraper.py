from __future__ import annotations

import asyncio
import ipaddress
import logging
import re
import socket
from dataclasses import dataclass
from functools import partial
from typing import Any
from urllib.parse import urlparse

import cloudinary
import cloudinary.uploader
from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright

from app.config import get_settings
from app.models.schemas import ScrapedPage

logger = logging.getLogger(__name__)

_playwright_ctx: Playwright | None = None
_browser: Browser | None = None

_TECH_PATTERNS: dict[str, list[str]] = {
    "Next.js": ["__NEXT_DATA__", "_next/static", "next/dist"],
    "React": ["react.development.js", "react.production.min.js", "__reactFiber", "data-reactroot"],
    "Vue.js": ["vue.min.js", "__vue__", "data-v-"],
    "Angular": ["ng-version", "angular.min.js", "ng-app"],
    "WordPress": ["wp-content", "wp-includes", "WordPress"],
    "Shopify": ["shopify.com/s/files", "Shopify.theme"],
    "Wix": ["wixstatic.com"],
    "Squarespace": ["squarespace-cdn.com"],
    "Webflow": ["js.webflow.com"],
    "Gatsby": ["__gatsby"],
    "Nuxt.js": ["__nuxt", "_nuxt/"],
    "Bootstrap": ["bootstrap.min.css", "bootstrap.css"],
    "Tailwind CSS": ["tailwind"],
    "jQuery": ["jquery.min.js", "jquery.js"],
    "Cloudflare": ["__cf_bm", "__cfduid", "cf-ray"],
    "Vercel": ["x-vercel-id", "_vercel"],
    "Netlify": ["netlify.app", "netlify.com"],
    "Google Analytics": ["google-analytics.com", "gtag("],
    "Google Tag Manager": ["googletagmanager.com"],
}


async def init_browser() -> None:
    global _playwright_ctx, _browser
    _playwright_ctx = await async_playwright().start()
    _browser = await _playwright_ctx.chromium.launch(headless=True)
    logger.info("Playwright browser started")


async def close_browser() -> None:
    global _playwright_ctx, _browser
    if _browser:
        await _browser.close()
        _browser = None
    if _playwright_ctx:
        await _playwright_ctx.stop()
        _playwright_ctx = None
    logger.info("Playwright browser closed")


def _detect_technologies(html: str, headers: dict[str, str]) -> list[str]:
    combined = html + " ".join(f"{k}: {v}" for k, v in headers.items())
    return [tech for tech, patterns in _TECH_PATTERNS.items() if any(p in combined for p in patterns)]


def _extract_meta(html: str) -> dict[str, str | None]:
    meta: dict[str, str | None] = {
        "title": None,
        "description": None,
        "favicon": None,
        "og:title": None,
        "og:description": None,
        "og:image": None,
        "twitter:title": None,
        "twitter:description": None,
        "twitter:card": None,
        "canonical": None,
    }

    title_m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if title_m:
        meta["title"] = title_m.group(1).strip()

    # Meta: name/property before content
    for m in re.finditer(
        r'<meta\s[^>]*?(?:name|property)=["\']([^"\']+)["\'][^>]*?content=["\']([^"\']*)["\']',
        html,
        re.IGNORECASE,
    ):
        _apply_meta(meta, m.group(1).lower(), m.group(2))

    # Meta: content before name/property
    for m in re.finditer(
        r'<meta\s[^>]*?content=["\']([^"\']*)["\'][^>]*?(?:name|property)=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    ):
        _apply_meta(meta, m.group(2).lower(), m.group(1))

    # Favicon (rel before href)
    fav = re.search(
        r'<link\s[^>]*?rel=["\'](?:shortcut )?icon["\'][^>]*?href=["\']([^"\']+)["\']',
        html, re.IGNORECASE,
    ) or re.search(
        r'<link\s[^>]*?href=["\']([^"\']+)["\'][^>]*?rel=["\'](?:shortcut )?icon["\']',
        html, re.IGNORECASE,
    )
    if fav:
        meta["favicon"] = fav.group(1)

    # Canonical
    can = re.search(
        r'<link\s[^>]*?rel=["\']canonical["\'][^>]*?href=["\']([^"\']+)["\']',
        html, re.IGNORECASE,
    )
    if can:
        meta["canonical"] = can.group(1)

    return meta


def _apply_meta(meta: dict[str, str | None], key: str, val: str) -> None:
    if key in meta and meta[key] is None:
        meta[key] = val


@dataclass
class _ConsoleErrorCounter:
    count: int = 0


def _count_console_errors(msg: Any, counter: _ConsoleErrorCounter) -> None:
    if msg.type == "error":
        counter.count += 1


async def _check_ssrf(url: str) -> None:
    """Resolve the hostname and reject private/reserved IPs to prevent SSRF."""
    hostname = urlparse(url).hostname
    if not hostname:
        raise ValueError("URL has no hostname")
    try:
        results = await asyncio.to_thread(socket.getaddrinfo, hostname, None)
    except socket.gaierror as exc:
        raise ValueError(f"DNS resolution failed for {hostname}") from exc
    for family, _type, _proto, _canonname, sockaddr in results:
        addr = ipaddress.ip_address(sockaddr[0])
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            raise ValueError(f"URL resolves to a private/reserved IP address ({addr})")


async def capture_page(url: str) -> ScrapedPage:
    if _browser is None:
        raise RuntimeError("Browser not initialised — call init_browser() first")

    await _check_ssrf(url)

    context: BrowserContext | None = None
    console_error_counter = _ConsoleErrorCounter()

    try:
        context = await _browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page: Page = await context.new_page()
        page.on("console", partial(_count_console_errors, counter=console_error_counter))

        # Navigate: networkidle → fallback domcontentloaded
        response = None
        try:
            response = await page.goto(url, wait_until="networkidle", timeout=30_000)
        except Exception:
            logger.warning("networkidle timed out for %s, retrying with domcontentloaded", url)
            response = await page.goto(url, wait_until="domcontentloaded", timeout=30_000)

        headers: dict[str, str] = dict(response.headers) if response else {}
        html = await page.content()

        # Cap screenshot height at 3000px
        page_height: int = await page.evaluate("document.documentElement.scrollHeight")
        clip_height = min(page_height, 3000)

        screenshot_bytes = await page.screenshot(
            full_page=True,
            clip={"x": 0, "y": 0, "width": 1280, "height": clip_height},
            type="png",
        )

        return ScrapedPage(
            screenshot_bytes=screenshot_bytes,
            html=html,
            headers=headers,
            meta=_extract_meta(html),
            console_errors=console_error_counter.count,
            technologies=_detect_technologies(html, headers),
        )

    finally:
        if context:
            await context.close()


async def upload_screenshot(screenshot_bytes: bytes, scan_id: str) -> str:
    """Upload screenshot bytes to Cloudinary and return the secure CDN URL."""
    settings = get_settings()

    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
    )

    result: dict = await asyncio.to_thread(
        cloudinary.uploader.upload,
        screenshot_bytes,
        public_id=f"scans/{scan_id}",
        resource_type="image",
        overwrite=True,
        format="webp",
        transformation=[{"quality": "auto", "fetch_format": "auto"}],
    )
    return result["secure_url"]
