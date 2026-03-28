from __future__ import annotations

import json
from uuid import UUID

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import get_settings
from app.models.schemas import AuditSection, ScanMetadata, ScanResult

_pool: AsyncConnectionPool | None = None

_CREATE_TABLE = """
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
)
"""

_CREATE_INDEX = """
CREATE INDEX IF NOT EXISTS idx_scans_client_ip_created
    ON scans(client_ip, created_at)
"""


async def init_pool() -> None:
    global _pool
    settings = get_settings()
    _pool = AsyncConnectionPool(conninfo=settings.database_url, min_size=1, max_size=10, open=False)
    await _pool.open(wait=True)
    async with _pool.connection() as conn:
        await conn.execute(_CREATE_TABLE)
        await conn.execute(_CREATE_INDEX)


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def _get_pool() -> AsyncConnectionPool:
    if _pool is None:
        raise RuntimeError("Database pool not initialized — call init_pool() first")
    return _pool


async def save_scan(scan: ScanResult, client_ip: str) -> None:
    pool = _get_pool()
    sections_json = json.dumps([s.model_dump() for s in scan.sections])
    metadata_json = json.dumps(scan.metadata.model_dump()) if scan.metadata else None
    async with pool.connection() as conn:
        await conn.execute(
            """
            INSERT INTO scans
                (id, url, client_ip, screenshot_url, overall_score,
                 sections, roast_summary, metadata, created_at)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (
                str(scan.id),
                scan.url,
                client_ip,
                scan.screenshot_url,
                scan.overall_score,
                sections_json,
                scan.roast_summary,
                metadata_json,
                scan.created_at,
            ),
        )


async def get_scan(scan_id: str) -> ScanResult | None:
    pool = _get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT * FROM scans WHERE id = %s", (scan_id,))
            row = await cur.fetchone()

    if row is None:
        return None

    sections = [AuditSection(**s) for s in row["sections"]]
    metadata = ScanMetadata(**row["metadata"]) if row["metadata"] else None
    return ScanResult(
        id=row["id"],
        url=row["url"],
        screenshot_url=row["screenshot_url"],
        overall_score=row["overall_score"],
        sections=sections,
        roast_summary=row["roast_summary"],
        metadata=metadata,
        created_at=row["created_at"],
    )


async def check_usage(client_ip: str) -> bool:
    """Return True if client_ip is under the 3 scans/month limit."""
    pool = _get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT COUNT(*) FROM scans
                WHERE client_ip = %s
                  AND created_at >= date_trunc('month', NOW())
                """,
                (client_ip,),
            )
            row = await cur.fetchone()
    count = row[0] if row else 0
    return count < 3
