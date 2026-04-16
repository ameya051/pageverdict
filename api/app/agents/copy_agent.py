from __future__ import annotations

import re
from typing import Any

from bs4 import BeautifulSoup
from google.genai import types

from app.agents.base import BaseAgent
from app.models.schemas import AuditSection, ScrapedPage

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
    return await CopyAgent().analyze(page=page)


class CopyAgent(BaseAgent):
    category = "copy"
    name = "Copy & Messaging"

    def _build_prompt(self, **kwargs: Any) -> tuple[str, list]:
        page: ScrapedPage = kwargs["page"]
        page_text = _extract_text(page.html)
        contents = [
            f"Here is the extracted page text:\n\n{page_text}\n\nPlease also analyse the screenshot.",
            types.Part.from_bytes(data=page.screenshot_bytes, mime_type="image/png"),
        ]
        return _SYSTEM_PROMPT, contents

    def _fallback_result(self) -> AuditSection:
        section = super()._fallback_result()
        section.summary = "Copy analysis unavailable."
        return section
