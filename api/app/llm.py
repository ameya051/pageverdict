from __future__ import annotations

import re

from google import genai
from google.genai import types

from app.config import get_settings

_client: genai.Client | None = None

MODEL = "gemini-2.5-flash"


def get_client() -> genai.Client:
    global _client
    if _client is None:
        settings = get_settings()
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def _strip_fences(text: str) -> str:
    """Remove markdown code fences that Gemini sometimes wraps around JSON."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```\w*\n?", "", stripped)
        stripped = re.sub(r"\n?```$", "", stripped)
    return stripped.strip()


async def generate_text(
    *,
    prompt: str,
    system_instruction: str | None = None,
    temperature: float = 0.7,
    max_output_tokens: int = 200,
) -> str | None:
    """Simple text generation. Returns response text or None."""
    client = get_client()
    config = types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    if system_instruction:
        config.system_instruction = system_instruction

    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=config,
    )
    return response.text


async def generate_json(
    *,
    contents: str | list,
    system_instruction: str | None = None,
    temperature: float = 0.4,
    max_output_tokens: int = 1200,
) -> str | None:
    """JSON-mode generation. Returns raw JSON string or None."""
    client = get_client()
    config = types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        response_mime_type="application/json",
    )
    if system_instruction:
        config.system_instruction = system_instruction

    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=contents,
        config=config,
    )
    text = response.text
    if text:
        text = _strip_fences(text)
    return text
