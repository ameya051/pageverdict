from __future__ import annotations

import ipaddress
from datetime import datetime
from typing import Literal
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl, field_validator


# ---------------------------------------------------------------------------
# Public-facing models
# ---------------------------------------------------------------------------


class ScanRequest(BaseModel):
    url: HttpUrl

    @field_validator("url", mode="before")
    @classmethod
    def validate_url(cls, v: object) -> object:
        raw = str(v)
        if len(raw) > 2048:
            raise ValueError("URL exceeds 2048 characters")
        if not raw.lower().startswith(("http://", "https://")):
            raise ValueError("Only http/https URLs are allowed")
        parsed = urlparse(raw)
        if "@" in (parsed.netloc or ""):
            raise ValueError("URLs with credentials are not allowed")
        hostname = parsed.hostname or ""
        if hostname:
            try:
                addr = ipaddress.ip_address(hostname)
            except ValueError:
                pass  # Not a raw IP; domain name. DNS-level SSRF check is in the scraper.
            else:
                if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
                    raise ValueError("Private/reserved IP addresses are not allowed")
        return v


class Issue(BaseModel):
    id: str
    title: str
    description: str
    severity: Literal["critical", "warning", "info"]
    impact: str
    recommendation: str


class AuditSection(BaseModel):
    category: str
    name: str
    score: float = Field(ge=0, le=10)
    max_score: float = 10.0
    issues: list[Issue] = Field(default_factory=list, max_length=5)
    strengths: list[str] = Field(default_factory=list, max_length=3)
    summary: str


class ScanMetadata(BaseModel):
    page_title: str | None = None
    page_description: str | None = None
    favicon_url: str | None = None
    technologies: list[str] = Field(default_factory=list)
    scan_duration_ms: int | None = None
    warnings: list[str] = Field(default_factory=list)


class ScanResult(BaseModel):
    id: UUID
    url: str
    screenshot_url: str
    overall_score: int = Field(ge=0, le=10)
    sections: list[AuditSection]
    roast_summary: str
    metadata: ScanMetadata | None = None
    created_at: datetime


class ScanProgress(BaseModel):
    step: str
    message: str
    progress: int = Field(ge=0, le=100)


# ---------------------------------------------------------------------------
# Internal collector models (not persisted directly)
# ---------------------------------------------------------------------------


class ScrapedPage(BaseModel):
    screenshot_bytes: bytes
    html: str
    headers: dict[str, str]
    meta: dict[str, str | None]
    console_errors: int
    technologies: list[str]


class PageSpeedResult(BaseModel):
    available: bool = True
    degraded_reason: str | None = None
    retry_after_seconds: int | None = None
    warning: str | None = None
    scores: dict[str, float]
    cwv: dict[str, float]
    audits: dict[str, dict]
