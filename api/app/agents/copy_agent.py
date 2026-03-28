from __future__ import annotations

import json
import logging
import re

from bs4 import BeautifulSoup
from google.genai import types

from app.llm import generate_json
from app.models.schemas import AuditSection, Issue, ScrapedPage

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a brutally honest conversion-rate optimisation (CRO) expert auditing a landing page.

Analyse the page copy and visual layout. Return a JSON object with these exact fields:
{
  "score": <number 0-10>,
  "issues": [
    {
      "id": "<kebab-case-id>",
      "title": "<short title>",
      "description": "<specific, quotable critique — reference actual words or elements from the page>",
      "severity": "<critical|warning|info>",
      "impact": "<business impact>",
      "recommendation": "<concrete, actionable fix>"
    }
  ],
  "strengths": ["<specific strength referencing actual page content>"],
  "summary": "<2-sentence witty roast verdict referencing specific copy from the page>"
}

Evaluate:
1. Headline clarity — does the headline immediately convey what the product/service does?
2. Value proposition — is the unique benefit crystal clear above the fold?
3. CTA wording and prominence — are CTAs specific (not "Click here") and visually prominent?
4. Trust signals — testimonials, logos, guarantees, social proof numbers?
5. Benefit vs feature language — do they sell outcomes or just list features?
6. Tone consistency — is the tone professional, approachable, and consistent throughout?

Rules:
- Be specific. Quote actual text from the page. Do not give generic advice.
- Max 5 issues, max 3 strengths.
- Score 0–10 where 10 = exceptional copy that clearly converts."""


def _extract_text(html: str, max_chars: int = 8000) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "head"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text[:max_chars]


async def analyze_copy(page: ScrapedPage) -> AuditSection:
    page_text = _extract_text(page.html)

    contents = [
        f"Here is the extracted page text:\n\n{page_text}\n\nPlease also analyse the screenshot.",
        types.Part.from_bytes(data=page.screenshot_bytes, mime_type="image/png"),
    ]

    for attempt in range(3):
        try:
            raw = await generate_json(
                contents=contents,
                system_instruction=_SYSTEM_PROMPT,
                temperature=0.4,
                max_output_tokens=1200,
            )
            data = json.loads(raw or "{}")

            score = max(0.0, min(10.0, float(data.get("score", 5.0))))
            issues: list[Issue] = [
                Issue(
                    id=item.get("id", f"copy-issue-{i}"),
                    title=item.get("title", "Issue"),
                    description=item.get("description", ""),
                    severity=item.get("severity", "warning"),
                    impact=item.get("impact", ""),
                    recommendation=item.get("recommendation", ""),
                )
                for i, item in enumerate(data.get("issues", [])[:5])
            ]

            return AuditSection(
                category="copy",
                name="Copy & Messaging",
                score=score,
                issues=issues,
                strengths=data.get("strengths", [])[:3],
                summary=data.get("summary", ""),
            )
        except Exception as exc:
            logger.warning("Copy agent attempt %d/3 failed: %s", attempt + 1, exc)

    return AuditSection(
        category="copy",
        name="Copy & Messaging",
        score=5.0,
        issues=[],
        strengths=[],
        summary="Copy analysis unavailable.",
    )
