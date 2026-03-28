from __future__ import annotations

import logging

from app.llm import generate_text
from app.models.schemas import AuditSection

logger = logging.getLogger(__name__)

_WEIGHTS: dict[str, float] = {
    "performance": 0.30,
    "copy": 0.35,
    "seo": 0.20,
    "tech_health": 0.15,
}

_ROAST_SYSTEM = (
    "You are a ruthlessly honest product critic with a sharp wit. "
    "Write a 3–4 sentence roast verdict for a landing page audit. "
    "Reference specific findings by name. Be entertaining but constructive. "
    "Do NOT use lists or bullet points — flowing prose only."
)


def _weighted_score(sections: list[AuditSection]) -> float:
    total_weight = 0.0
    weighted_sum = 0.0
    for section in sections:
        weight = _WEIGHTS.get(section.category, 0.0)
        weighted_sum += section.score * weight
        total_weight += weight
    if total_weight == 0:
        return 5.0
    return weighted_sum / total_weight


async def synthesize(sections: list[AuditSection]) -> tuple[int, str]:
    """Return (overall_score 0–10, roast_summary)."""
    overall = _weighted_score(sections)
    roast = await _llm_roast(sections, overall)
    return round(overall), roast


async def _llm_roast(sections: list[AuditSection], overall: float) -> str:
    section_lines = "\n".join(
        f"- {s.name} ({s.score:.1f}/10): {s.summary}" for s in sections
    )
    top_issues = [
        issue.title
        for s in sections
        for issue in s.issues[:2]
    ]
    issues_text = "; ".join(top_issues[:6]) if top_issues else "no major issues found"

    prompt = (
        f"Overall score: {overall:.1f}/10\n\n"
        f"Section scores:\n{section_lines}\n\n"
        f"Key issues: {issues_text}\n\n"
        "Write the 3–4 sentence roast verdict."
    )

    try:
        result = await generate_text(
            prompt=prompt,
            system_instruction=_ROAST_SYSTEM,
            temperature=0.8,
            max_output_tokens=200,
        )
        return result or _template_roast(overall)
    except Exception as exc:
        logger.warning("Synthesizer LLM call failed: %s", exc)
        return _template_roast(overall)


def _template_roast(overall: float) -> str:
    if overall >= 8:
        return (
            "This landing page is well-crafted with strong fundamentals across performance, "
            "copy, and SEO. A few minor tweaks and it'll be firing on all cylinders."
        )
    if overall >= 5:
        return (
            "This landing page has potential but several issues are holding it back from converting. "
            "Address the critical findings above to unlock meaningfully better results."
        )
    return (
        "This landing page needs significant work before it's ready to convert visitors into customers. "
        "The issues identified above are costing real revenue — prioritise the critical ones first."
    )
