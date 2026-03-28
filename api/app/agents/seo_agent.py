from __future__ import annotations

import logging

from bs4 import BeautifulSoup

from app.llm import generate_text
from app.models.schemas import AuditSection, Issue, PageSpeedResult, ScrapedPage

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Deterministic SEO checks
# ---------------------------------------------------------------------------

def _analyze_seo_data(
    soup: BeautifulSoup,
    page: ScrapedPage,
    pagespeed: PageSpeedResult,
) -> tuple[float, list[Issue], list[str]]:
    issues: list[Issue] = []
    strengths: list[str] = []
    score = 10.0

    # Meta title
    title_tag = soup.find("title")
    title_text = title_tag.get_text(strip=True) if title_tag else ""
    if not title_text:
        score -= 2.0
        issues.append(Issue(
            id="missing-title",
            title="Missing Page Title",
            description="No <title> tag found on the page.",
            severity="critical",
            impact="Search engines don't know what this page is about — rankings will suffer.",
            recommendation="Add a descriptive <title> tag between 50–60 characters.",
        ))
    elif len(title_text) < 30:
        score -= 0.5
        issues.append(Issue(
            id="short-title",
            title="Page Title Too Short",
            description=f"Title is only {len(title_text)} characters: '{title_text}'",
            severity="warning",
            impact="Short titles miss opportunities to rank for relevant keywords.",
            recommendation="Expand the title to 50–60 characters including primary keywords.",
        ))
    elif len(title_text) > 60:
        score -= 0.5
        issues.append(Issue(
            id="long-title",
            title="Page Title Too Long",
            description=f"Title is {len(title_text)} characters — gets truncated in SERPs at ~60.",
            severity="info",
            impact="The title will be cut off in Google search results.",
            recommendation="Shorten the title to under 60 characters.",
        ))
    else:
        strengths.append(f"Well-sized title tag ({len(title_text)} chars)")

    # Meta description
    meta_desc = page.meta.get("description") or ""
    if not meta_desc:
        score -= 1.5
        issues.append(Issue(
            id="missing-meta-description",
            title="Missing Meta Description",
            description="No meta description tag found.",
            severity="critical",
            impact="Google will auto-generate a snippet — usually poorly.",
            recommendation="Add a meta description of 120–160 characters with a clear value proposition.",
        ))
    elif len(meta_desc) < 70:
        score -= 0.5
        issues.append(Issue(
            id="short-meta-description",
            title="Meta Description Too Short",
            description=f"Description is only {len(meta_desc)} characters.",
            severity="info",
            impact="Misses the opportunity to improve click-through rate from search results.",
            recommendation="Expand to 120–160 characters.",
        ))
    else:
        strengths.append("Meta description is present and well-sized")

    # H1
    h1_tags = soup.find_all("h1")
    if not h1_tags:
        score -= 1.5
        issues.append(Issue(
            id="missing-h1",
            title="Missing H1 Heading",
            description="No H1 heading found on the page.",
            severity="critical",
            impact="Search engines use H1 as a primary relevance signal.",
            recommendation="Add exactly one H1 heading containing your primary keyword.",
        ))
    elif len(h1_tags) > 1:
        score -= 0.5
        issues.append(Issue(
            id="multiple-h1",
            title=f"Multiple H1 Tags ({len(h1_tags)})",
            description=f"Found {len(h1_tags)} H1 tags — only one is recommended.",
            severity="warning",
            impact="Dilutes the SEO relevance signal and confuses the page hierarchy.",
            recommendation="Use a single H1 for the main heading; use H2–H6 for subheadings.",
        ))
    else:
        strengths.append("Single H1 heading present")

    # Open Graph tags
    og_fields = {
        "og:title": page.meta.get("og:title"),
        "og:description": page.meta.get("og:description"),
        "og:image": page.meta.get("og:image"),
    }
    missing_og = [k for k, v in og_fields.items() if not v]
    if missing_og:
        score -= 0.5
        issues.append(Issue(
            id="missing-og-tags",
            title=f"Missing Open Graph Tags: {', '.join(missing_og)}",
            description="Some OG meta tags needed for social sharing previews are absent.",
            severity="info",
            impact="Links shared on social media will look plain and may not get clicked.",
            recommendation=f"Add: {', '.join(missing_og)}.",
        ))
    else:
        strengths.append("Open Graph tags complete for social sharing")

    # Alt text coverage
    images = soup.find_all("img")
    if images:
        missing_alt = [img for img in images if not img.get("alt")]
        if len(missing_alt) > 0:
            ratio = len(missing_alt) / len(images)
            if ratio >= 0.2:
                score -= 1.0
                issues.append(Issue(
                    id="missing-alt-text",
                    title=f"Missing Alt Text ({len(missing_alt)}/{len(images)} images)",
                    description=f"{len(missing_alt)} out of {len(images)} images have no alt attribute.",
                    severity="warning",
                    impact="Search engines can't index image content; screen reader users are excluded.",
                    recommendation="Add descriptive alt text to all meaningful images.",
                ))

    # Canonical
    canonical = soup.find("link", rel="canonical")
    if not canonical:
        score -= 0.5
        issues.append(Issue(
            id="missing-canonical",
            title="Missing Canonical Tag",
            description="No canonical link element found.",
            severity="info",
            impact="Duplicate content issues can arise if the page is accessible via multiple URLs.",
            recommendation="Add <link rel='canonical' href='...'> to declare the preferred URL.",
        ))

    # PageSpeed SEO score
    ps_seo = pagespeed.scores.get("seo", 0.0)
    if ps_seo >= 0.9:
        strengths.append(f"Strong Lighthouse SEO score ({int(ps_seo * 100)}/100)")
    elif 0 < ps_seo < 0.5:
        score -= 0.5
        issues.append(Issue(
            id="low-lighthouse-seo",
            title=f"Low Lighthouse SEO Score ({int(ps_seo * 100)}/100)",
            description="Lighthouse flagged multiple SEO issues beyond what's checked here.",
            severity="warning",
            impact="Search visibility is significantly impaired.",
            recommendation="Run the full Lighthouse SEO audit for a complete fix list.",
        ))

    return max(0.0, min(10.0, score)), issues[:5], strengths[:3]


# ---------------------------------------------------------------------------
# LLM summary
# ---------------------------------------------------------------------------

async def _llm_summary(score: float, issues: list[Issue], meta: dict[str, str | None]) -> str:
    issue_text = "; ".join(i.title for i in issues) if issues else "no major issues"
    title = meta.get("title") or meta.get("og:title") or "this page"
    prompt = (
        f"SEO score: {score:.1f}/10 for '{title}'. "
        f"Issues: {issue_text}. "
        "Write a witty 1-sentence SEO verdict referencing the specific impact on search rankings."
    )
    try:
        result = await generate_text(
            prompt=prompt,
            system_instruction="You are a sharp SEO consultant who doesn't sugarcoat results.",
            temperature=0.7,
            max_output_tokens=80,
        )
        return result or f"SEO score: {score:.1f}/10."
    except Exception as exc:
        logger.warning("SEO LLM summary failed: %s", exc)
        return f"SEO score: {score:.1f}/10."


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def analyze_seo(page: ScrapedPage, pagespeed: PageSpeedResult) -> AuditSection:
    soup = BeautifulSoup(page.html, "html.parser")
    score, issues, strengths = _analyze_seo_data(soup, page, pagespeed)
    summary = await _llm_summary(score, issues, page.meta)

    return AuditSection(
        category="seo",
        name="SEO",
        score=score,
        issues=issues,
        strengths=strengths,
        summary=summary,
    )
