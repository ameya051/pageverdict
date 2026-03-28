from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request ID middleware
# ---------------------------------------------------------------------------


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique X-Request-ID to every request/response."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


def _request_id(request: Request) -> str:
    return getattr(getattr(request, "state", None), "request_id", "unknown")


async def _validation_error_handler(request: Request, exc: RequestValidationError):
    logger.warning(
        "Validation error [%s %s] request_id=%s: %s",
        request.method,
        request.url.path,
        _request_id(request),
        exc.errors(),
    )
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Validation error",
            "errors": exc.errors(),
            "request_id": _request_id(request),
        },
    )


async def _timeout_error_handler(request: Request, exc: Exception):
    logger.error(
        "Timeout [%s %s] request_id=%s: %s",
        request.method,
        request.url.path,
        _request_id(request),
        str(exc),
    )
    return JSONResponse(
        status_code=504,
        content={
            "detail": "The request timed out while processing. Please try again.",
            "request_id": _request_id(request),
        },
    )


async def _generic_error_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled error [%s %s] request_id=%s",
        request.method,
        request.url.path,
        _request_id(request),
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal error occurred.",
            "request_id": _request_id(request),
        },
    )


# ---------------------------------------------------------------------------
# Register all middleware and handlers on the app
# ---------------------------------------------------------------------------


def install_middleware(app: FastAPI) -> None:
    """Register request-ID middleware and global exception handlers."""
    import httpx
    from playwright.async_api import TimeoutError as PlaywrightTimeout

    app.add_middleware(RequestIDMiddleware)

    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(httpx.TimeoutException, _timeout_error_handler)
    app.add_exception_handler(PlaywrightTimeout, _timeout_error_handler)
    app.add_exception_handler(Exception, _generic_error_handler)
