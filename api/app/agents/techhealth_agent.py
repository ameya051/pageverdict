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

    lower_headers = {k.lower(): v for k, v in page.headers.items()}

    # Security headers
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
                    impact=f"{benefit} — without this header your site is more vulnerable.",
                    recommendation=f"Add the {header_name} header to your server or CDN configuration.",
                )
            )

    # Console errors
    if page.console_errors > 0:
        deduction = min(2.0, page.console_errors * 0.5)
        score -= deduction
        severity = "critical" if page.console_errors >= 3 else "warning"
        issues.append(
            Issue(
                id="console-errors",
                title=f"{page.console_errors} Console Error(s) Detected",
                description=f"The page produced {page.console_errors} JavaScript console error(s) on load.",
                severity=severity,
                impact="Console errors can break functionality and signal poor code quality to developers.",
                recommendation="Open browser DevTools and fix all console errors before launch.",
            )
        )

    # Accessibility score from PageSpeed
    accessibility = pagespeed.scores.get("accessibility", 0.0)
    if accessibility < 0.5:
        score -= 1.5
        issues.append(
            Issue(
                id="low-accessibility",
                title="Poor Accessibility Score",
                description=f"Lighthouse accessibility score is {int(accessibility * 100)}/100.",
                severity="critical",
                impact="Users with disabilities cannot use your site — and you may be legally exposed.",
                recommendation="Fix missing alt text, insufficient colour contrast, and missing ARIA labels.",
            )
        )
    elif accessibility < 0.9:
        score -= 0.5
        issues.append(
            Issue(
                id="accessibility-improvements",
                title="Accessibility Could Be Improved",
                description=f"Lighthouse accessibility score is {int(accessibility * 100)}/100.",
                severity="info",
                impact="Some users with disabilities may have difficulty using your site.",
                recommendation="Review the Lighthouse accessibility audit for specific improvements.",
            )
        )
    else:
        strengths.append(f"Good accessibility score ({int(accessibility * 100)}/100)")

    # Best practices score from PageSpeed
    best_practices = pagespeed.scores.get("best-practices", 0.0)
    if best_practices < 0.5:
        score -= 1.0
        issues.append(
            Issue(
                id="low-best-practices",
                title="Poor Best Practices Score",
                description=f"Lighthouse best practices score is {int(best_practices * 100)}/100.",
                severity="warning",
                impact="Site may have security vulnerabilities or outdated API usage.",
                recommendation="Review the Lighthouse best practices audit for specific issues.",
            )
        )
    elif best_practices >= 0.9:
        strengths.append(f"Strong best practices score ({int(best_practices * 100)}/100)")

    score = max(0.0, min(10.0, score))
    issues = issues[:5]
    strengths = strengths[:3]

    if score >= 8:
        summary = "Solid technical foundation with good security posture and few issues."
    elif score >= 5:
        summary = "Some technical improvements needed — particularly around missing security headers."
    else:
        summary = "Significant technical issues detected — security headers are absent and errors are present."

    return AuditSection(
        category="tech_health",
        name="Technical Health",
        score=score,
        issues=issues,
        strengths=strengths,
        summary=summary,
    )
