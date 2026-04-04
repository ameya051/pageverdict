from __future__ import annotations

from app.models.schemas import AuditSection, Issue, PageSpeedResult, ScrapedPage

_SECURITY_HEADERS: list[tuple[str, str, str]] = [
    ("content-security-policy", "Content Security Policy (CSP)", "Prevents XSS and injection attacks"),
    ("strict-transport-security", "HTTP Strict Transport Security (HSTS)", "Enforces HTTPS connections"),
    ("x-content-type-options", "X-Content-Type-Options", "Prevents MIME type sniffing"),
    ("x-frame-options", "X-Frame-Options", "Prevents clickjacking attacks"),
    ("referrer-policy", "Referrer-Policy", "Controls referrer information leakage"),
    ("permissions-policy", "Permissions-Policy", "Controls browser feature access"),
]


def analyze_tech_health(page: ScrapedPage, pagespeed: PageSpeedResult) -> AuditSection:
    issues: list[Issue] = []
    strengths: list[str] = []
    score = 10.0

    lower_headers = {key.lower(): value for key, value in page.headers.items()}

    for header_key, header_name, benefit in _SECURITY_HEADERS:
        if header_key in lower_headers:
            strengths.append(f"{header_name} is set")
        else:
            score -= 1.0
            issues.append(
                Issue(
                    id=f"missing-{header_key}",
                    title=f"Missing {header_name}",
                    description=f"The {header_name} header is not present in the response.",
                    severity="warning",
                    impact=f"{benefit}; without this header the site is more exposed.",
                    recommendation=f"Add the {header_name} header in your server or CDN configuration.",
                )
            )

    if page.console_errors > 0:
        deduction = min(2.0, page.console_errors * 0.5)
        score -= deduction
        severity = "critical" if page.console_errors >= 3 else "warning"
        issues.append(
            Issue(
                id="console-errors",
                title=f"{page.console_errors} console error(s) detected",
                description=f"The page produced {page.console_errors} JavaScript console error(s) on load.",
                severity=severity,
                impact="Console errors can break functionality and usually signal poor runtime quality.",
                recommendation="Open browser DevTools and fix the console errors before launch.",
            )
        )

    if pagespeed.available:
        accessibility = pagespeed.scores.get("accessibility", 0.0)
        if accessibility < 0.5:
            score -= 1.5
            issues.append(
                Issue(
                    id="low-accessibility",
                    title="Poor accessibility score",
                    description=f"Lighthouse accessibility score is {int(accessibility * 100)}/100.",
                    severity="critical",
                    impact="Users with disabilities may struggle to use the page, creating UX and legal risk.",
                    recommendation="Fix missing alt text, low contrast, and missing ARIA labeling.",
                )
            )
        elif accessibility < 0.9:
            score -= 0.5
            issues.append(
                Issue(
                    id="accessibility-improvements",
                    title="Accessibility could be improved",
                    description=f"Lighthouse accessibility score is {int(accessibility * 100)}/100.",
                    severity="info",
                    impact="Some visitors may still encounter avoidable usability friction.",
                    recommendation="Review the Lighthouse accessibility audit for targeted fixes.",
                )
            )
        else:
            strengths.append(f"Good accessibility score ({int(accessibility * 100)}/100)")

        best_practices = pagespeed.scores.get("best-practices", 0.0)
        if best_practices < 0.5:
            score -= 1.0
            issues.append(
                Issue(
                    id="low-best-practices",
                    title="Poor best-practices score",
                    description=f"Lighthouse best practices score is {int(best_practices * 100)}/100.",
                    severity="warning",
                    impact="The page may have outdated APIs, unsafe patterns, or avoidable browser issues.",
                    recommendation="Review the Lighthouse best-practices audit for the exact failures.",
                )
            )
        elif best_practices >= 0.9:
            strengths.append(f"Strong best practices score ({int(best_practices * 100)}/100)")
    else:
        issues.append(
            Issue(
                id="pagespeed-techhealth-unavailable",
                title="Lighthouse technical audit unavailable",
                description=pagespeed.warning or "Lighthouse-backed technical checks were unavailable for this scan.",
                severity="info",
                impact="Technical health is based on headers and console behavior without PageSpeed audit signals.",
                recommendation="Configure a PageSpeed API key and re-run the scan for a full Lighthouse-backed audit.",
            )
        )

    score = max(0.0, min(10.0, score))
    issues = issues[:5]
    strengths = strengths[:3]

    if not pagespeed.available:
        summary = "Technical checks completed, but Lighthouse-backed accessibility and best-practices data were unavailable."
    elif score >= 8:
        summary = "Solid technical foundation with good security posture and few issues."
    elif score >= 5:
        summary = "Some technical improvements are needed, especially around missing security headers."
    else:
        summary = "Significant technical issues were detected, including weak headers or runtime errors."

    return AuditSection(
        category="tech_health",
        name="Technical Health",
        score=score,
        issues=issues,
        strengths=strengths,
        summary=summary,
    )
