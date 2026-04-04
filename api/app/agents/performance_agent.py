from __future__ import annotations

import logging

from app.llm import generate_text
from app.models.schemas import AuditSection, Issue, PageSpeedResult

logger = logging.getLogger(__name__)


def _score_lcp(lcp_ms: float) -> float:
    if lcp_ms <= 0:
        return 5.0
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
        return 5.0
    if tti_ms < 3800:
        return 10.0
    if tti_ms < 7300:
        return 6.0
    if tti_ms < 12000:
        return 3.0
    return 1.0


def _compute_score(cwv: dict[str, float]) -> float:
    return (
        _score_lcp(cwv.get("lcp_ms", 0.0)) * 0.4
        + _score_cls(cwv.get("cls", 0.0)) * 0.3
        + _score_tti(cwv.get("tti_ms", 0.0)) * 0.3
    )


def _build_issues(cwv: dict[str, float], audits: dict[str, dict]) -> list[Issue]:
    issues: list[Issue] = []

    lcp_ms = cwv.get("lcp_ms", 0.0)
    if lcp_ms >= 4000:
        issues.append(
            Issue(
                id="slow-lcp",
                title=f"Slow Largest Contentful Paint ({lcp_ms / 1000:.1f}s)",
                description=f"LCP is {lcp_ms / 1000:.1f}s and users wait too long for the main content.",
                severity="critical",
                impact="High bounce risk and weaker Core Web Vitals performance.",
                recommendation="Preload the hero asset, reduce render-blocking work, and improve TTFB.",
            )
        )
    elif lcp_ms >= 2500:
        issues.append(
            Issue(
                id="needs-improvement-lcp",
                title=f"LCP Needs Improvement ({lcp_ms / 1000:.1f}s)",
                description="Largest Contentful Paint missed Google's under-2.5s target.",
                severity="warning",
                impact="Perceived load feels slower, which hurts conversion and SEO.",
                recommendation="Lazy-load below-the-fold content and prioritize the above-the-fold hero.",
            )
        )

    cls = cwv.get("cls", 0.0)
    if cls >= 0.25:
        issues.append(
            Issue(
                id="high-cls",
                title=f"High Cumulative Layout Shift (CLS: {cls:.3f})",
                description="Elements shift visibly while the page is loading.",
                severity="critical",
                impact="Users can misclick and lose trust in the page.",
                recommendation="Reserve space for media, embeds, and any injected content.",
            )
        )
    elif cls >= 0.1:
        issues.append(
            Issue(
                id="moderate-cls",
                title=f"Moderate Layout Shift (CLS: {cls:.3f})",
                description="Layout instability is in the needs-improvement range.",
                severity="warning",
                impact="The page feels less polished, especially on slower devices.",
                recommendation="Set explicit dimensions and avoid content popping in above existing elements.",
            )
        )

    tti_ms = cwv.get("tti_ms", 0.0)
    if tti_ms >= 7300:
        issues.append(
            Issue(
                id="slow-tti",
                title=f"Slow Time to Interactive ({tti_ms / 1000:.1f}s)",
                description="The page becomes interactive too late after initial render.",
                severity="critical",
                impact="Buttons and links can appear before they actually work.",
                recommendation="Reduce JavaScript cost, split bundles, and defer non-critical scripts.",
            )
        )
    elif tti_ms >= 3800:
        issues.append(
            Issue(
                id="moderate-tti",
                title=f"Moderate Time to Interactive ({tti_ms / 1000:.1f}s)",
                description="Interactivity is slower than ideal.",
                severity="warning",
                impact="Visitors on lower-end devices may experience sluggish interaction.",
                recommendation="Audit third-party scripts and defer anything non-essential.",
            )
        )

    blocking = audits.get("render-blocking-resources", {})
    if blocking.get("score") is not None and (blocking["score"] or 1.0) < 0.9:
        issues.append(
            Issue(
                id="render-blocking",
                title="Render-blocking resources",
                description=blocking.get("display_value") or "CSS or JS files are delaying first paint.",
                severity="warning",
                impact="Users stare at a blank screen for longer than necessary.",
                recommendation="Inline critical CSS and defer non-critical scripts and styles.",
            )
        )

    return issues[:5]


def _build_strengths(cwv: dict[str, float]) -> list[str]:
    strengths: list[str] = []
    if 0 < cwv.get("lcp_ms", 0.0) < 2500:
        strengths.append(f"Fast LCP ({cwv['lcp_ms'] / 1000:.1f}s) gets content on screen quickly")
    if cwv.get("cls", 1.0) < 0.1:
        strengths.append(f"Stable layout (CLS {cwv.get('cls', 0.0):.3f}) avoids jarring movement")
    if 0 < cwv.get("tti_ms", 0.0) < 3800:
        strengths.append(f"Quick interactivity (TTI {cwv['tti_ms'] / 1000:.1f}s)")
    return strengths[:3]


def _pagespeed_unavailable_issue(pagespeed: PageSpeedResult) -> Issue:
    retry_hint = ""
    if pagespeed.retry_after_seconds:
        retry_hint = f" Retry after about {pagespeed.retry_after_seconds} seconds."

    return Issue(
        id="pagespeed-unavailable",
        title="PageSpeed data unavailable",
        description=pagespeed.warning or "Google PageSpeed metrics were unavailable for this scan.",
        severity="info",
        impact="This performance section is using a neutral placeholder score instead of live Lighthouse metrics.",
        recommendation=(
            "Configure a PageSpeed API key and re-run the scan for live Core Web Vitals data."
            f"{retry_hint}"
        ),
    )


async def _llm_summary(cwv: dict[str, float], score: float, issues: list[Issue]) -> str:
    issue_text = "; ".join(issue.title for issue in issues) if issues else "no major issues"
    prompt = (
        f"Performance score: {score:.1f}/10. "
        f"LCP: {cwv.get('lcp_ms', 0.0) / 1000:.1f}s, "
        f"CLS: {cwv.get('cls', 0.0):.3f}, "
        f"TTI: {cwv.get('tti_ms', 0.0) / 1000:.1f}s. "
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


async def analyze_performance(pagespeed: PageSpeedResult) -> AuditSection:
    if not pagespeed.available:
        return AuditSection(
            category="performance",
            name="Performance",
            score=5.0,
            issues=[_pagespeed_unavailable_issue(pagespeed)],
            strengths=[],
            summary="Performance data is temporarily unavailable, so this section is using a neutral placeholder score.",
        )

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
