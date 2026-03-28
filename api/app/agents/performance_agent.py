from __future__ import annotations

import logging

from app.llm import generate_text
from app.models.schemas import AuditSection, Issue, PageSpeedResult

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# CWV scoring rubric
# ---------------------------------------------------------------------------

def _score_lcp(lcp_ms: float) -> float:
    if lcp_ms <= 0:
        return 5.0  # unknown
    if lcp_ms < 2500:
        return 10.0
    if lcp_ms < 4000:
        return 6.0
    if lcp_ms < 6000:
        return 3.0
    return 1.0


def _score_cls(cls: float) -> float:
    if cls < 0.1:
        return 10.0
    if cls < 0.25:
        return 6.0
    return 2.0


def _score_tti(tti_ms: float) -> float:
    if tti_ms <= 0:
        return 5.0  # unknown
    if tti_ms < 3800:
        return 10.0
    if tti_ms < 7300:
        return 6.0
    if tti_ms < 12000:
        return 3.0
    return 1.0


def _compute_score(cwv: dict[str, float]) -> float:
    """Weighted average: LCP 40%, CLS 30%, TTI 30%."""
    return (
        _score_lcp(cwv.get("lcp_ms", 0.0)) * 0.4
        + _score_cls(cwv.get("cls", 0.0)) * 0.3
        + _score_tti(cwv.get("tti_ms", 0.0)) * 0.3
    )


# ---------------------------------------------------------------------------
# Programmatic issue detection
# ---------------------------------------------------------------------------

def _build_issues(cwv: dict[str, float], audits: dict[str, dict]) -> list[Issue]:
    issues: list[Issue] = []

    lcp_ms = cwv.get("lcp_ms", 0.0)
    if lcp_ms >= 4000:
        issues.append(Issue(
            id="slow-lcp",
            title=f"Slow Largest Contentful Paint ({lcp_ms / 1000:.1f}s)",
            description=f"LCP is {lcp_ms / 1000:.1f}s — users are staring at nothing for too long.",
            severity="critical",
            impact="High bounce rate. Google Core Web Vitals penalty. Users leave before seeing your offer.",
            recommendation="Preload hero images, eliminate render-blocking resources, improve TTFB.",
        ))
    elif lcp_ms >= 2500:
        issues.append(Issue(
            id="needs-improvement-lcp",
            title=f"LCP Needs Improvement ({lcp_ms / 1000:.1f}s)",
            description=f"LCP is {lcp_ms / 1000:.1f}s — Google's 'good' threshold is under 2.5s.",
            severity="warning",
            impact="Slightly slower perceived load affects user experience and SEO rankings.",
            recommendation="Consider lazy-loading below-fold images and preloading the hero image.",
        ))

    cls = cwv.get("cls", 0.0)
    if cls >= 0.25:
        issues.append(Issue(
            id="high-cls",
            title=f"High Cumulative Layout Shift (CLS: {cls:.3f})",
            description=f"CLS of {cls:.3f} means elements visibly jump around as the page loads.",
            severity="critical",
            impact="Users accidentally tap the wrong elements. Google penalises this in rankings.",
            recommendation="Set explicit width/height on images; avoid inserting content above existing content.",
        ))
    elif cls >= 0.1:
        issues.append(Issue(
            id="moderate-cls",
            title=f"Moderate Layout Shift (CLS: {cls:.3f})",
            description=f"CLS of {cls:.3f} is in the 'needs improvement' range.",
            severity="warning",
            impact="Layout instability may frustrate users on slower connections.",
            recommendation="Reserve space for ads, embeds, and dynamically injected content.",
        ))

    tti_ms = cwv.get("tti_ms", 0.0)
    if tti_ms >= 7300:
        issues.append(Issue(
            id="slow-tti",
            title=f"Slow Time to Interactive ({tti_ms / 1000:.1f}s)",
            description=f"The page takes {tti_ms / 1000:.1f}s before it's fully interactive.",
            severity="critical",
            impact="Buttons and links appear before they work, frustrating users who click too early.",
            recommendation="Reduce JavaScript bundle size, split code, and defer non-critical scripts.",
        ))
    elif tti_ms >= 3800:
        issues.append(Issue(
            id="moderate-tti",
            title=f"Moderate Time to Interactive ({tti_ms / 1000:.1f}s)",
            description=f"TTI of {tti_ms / 1000:.1f}s could be faster.",
            severity="warning",
            impact="Users on slower devices may experience delayed interactivity.",
            recommendation="Audit and defer third-party scripts that block the main thread.",
        ))

    blocking = audits.get("render-blocking-resources", {})
    if blocking.get("score") is not None and (blocking["score"] or 1.0) < 0.9:
        issues.append(Issue(
            id="render-blocking",
            title="Render-Blocking Resources",
            description=blocking.get("display_value") or "CSS/JS files are delaying first paint.",
            severity="warning",
            impact="Users see a blank page while render-blocking resources load.",
            recommendation="Defer non-critical CSS/JS and inline critical CSS above the fold.",
        ))

    return issues[:5]


def _build_strengths(cwv: dict[str, float]) -> list[str]:
    strengths: list[str] = []
    if 0 < cwv.get("lcp_ms", 0) < 2500:
        strengths.append(f"Fast LCP ({cwv['lcp_ms'] / 1000:.1f}s) — content appears quickly")
    if cwv.get("cls", 1.0) < 0.1:
        strengths.append(f"Stable layout (CLS {cwv.get('cls', 0):.3f}) — no jarring shifts")
    if 0 < cwv.get("tti_ms", 0) < 3800:
        strengths.append(f"Quick interactivity (TTI {cwv['tti_ms'] / 1000:.1f}s)")
    return strengths[:3]


# ---------------------------------------------------------------------------
# LLM summary (witty one-liner only)
# ---------------------------------------------------------------------------

async def _llm_summary(cwv: dict[str, float], score: float, issues: list[Issue]) -> str:
    issue_text = "; ".join(i.title for i in issues) if issues else "no major issues"
    prompt = (
        f"Performance score: {score:.1f}/10. "
        f"LCP: {cwv.get('lcp_ms', 0) / 1000:.1f}s, "
        f"CLS: {cwv.get('cls', 0):.3f}, "
        f"TTI: {cwv.get('tti_ms', 0) / 1000:.1f}s. "
        f"Issues: {issue_text}. "
        "Write a witty 1-sentence performance verdict. Be specific, not generic."
    )
    try:
        result = await generate_text(
            prompt=prompt,
            system_instruction="You are a blunt performance engineer with a sharp wit.",
            temperature=0.7,
            max_output_tokens=80,
        )
        return result or f"Performance score: {score:.1f}/10."
    except Exception as exc:
        logger.warning("Performance LLM summary failed: %s", exc)
        return f"Performance score: {score:.1f}/10."


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def analyze_performance(pagespeed: PageSpeedResult) -> AuditSection:
    cwv = pagespeed.cwv
    score = _compute_score(cwv)
    issues = _build_issues(cwv, pagespeed.audits)
    strengths = _build_strengths(cwv)
    summary = await _llm_summary(cwv, score, issues)

    return AuditSection(
        category="performance",
        name="Performance",
        score=score,
        issues=issues,
        strengths=strengths,
        summary=summary,
    )
